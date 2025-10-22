const express = require('express');
const https = require("https");
const fs = require("fs");
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

const app = express();
app.use(cors());
app.use(express.json());

// Load SSL certificates
const httpsOptions = {
    key: fs.readFileSync("./key.pem"),
    cert: fs.readFileSync("./cert.pem"),
    ca: fs.readFileSync("./cert.pem"),
};

const server = https.createServer(httpsOptions, app);
const io = new Server(server, {
    cors: {
        origin: ["https://localhost:3000", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Redis configuration for horizontal scaling
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Create Redis clients for pub/sub
const pubClient = createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();

// Redis client for state management
const redisClient = createClient({ url: REDIS_URL });

// Error handlers
pubClient.on('error', (err) => console.error('Redis Pub Client Error:', err));
subClient.on('error', (err) => console.error('Redis Sub Client Error:', err));
redisClient.on('error', (err) => console.error('Redis State Client Error:', err));

// Connect Redis clients
Promise.all([
    pubClient.connect(),
    subClient.connect(),
    redisClient.connect()
]).then(() => {
    console.log('Redis clients connected successfully');
    // Attach Redis adapter to Socket.IO for horizontal scaling
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.IO Redis adapter configured');
}).catch((err) => {
    console.error('Redis connection failed:', err);
    console.log('Running without Redis - horizontal scaling disabled');
});

// Store socket to user mapping (local to this instance)
const socketToUser = new Map();

// Helper functions for Redis-based room state management
async function getRoomFromRedis(roomId) {
    try {
        const data = await redisClient.get(`room:${roomId}`);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error('Error getting room from Redis:', err);
        return null;
    }
}

async function setRoomInRedis(roomId, roomData) {
    try {
        await redisClient.set(`room:${roomId}`, JSON.stringify(roomData));
        await redisClient.expire(`room:${roomId}`, 86400); // 24 hour expiry
    } catch (err) {
        console.error('Error setting room in Redis:', err);
    }
}

async function deleteRoomFromRedis(roomId) {
    try {
        await redisClient.del(`room:${roomId}`);
    } catch (err) {
        console.error('Error deleting room from Redis:', err);
    }
}

async function addUserToRoom(roomId, socketId, userId) {
    const room = await getRoomFromRedis(roomId) || { users: {}, sharing: null };
    room.users[socketId] = {
        userId: userId,
        socketId: socketId,
        isSharing: false,
        joinedAt: new Date().toISOString()
    };
    await setRoomInRedis(roomId, room);
    return room;
}

async function removeUserFromRoom(roomId, socketId) {
    const room = await getRoomFromRedis(roomId);
    if (!room) return null;

    delete room.users[socketId];
    if (room.sharing === socketId) {
        room.sharing = null;
    }

    if (Object.keys(room.users).length === 0) {
        await deleteRoomFromRedis(roomId);
        return null;
    }

    await setRoomInRedis(roomId, room);
    return room;
}

async function setUserSharing(roomId, socketId, isSharing) {
    const room = await getRoomFromRedis(roomId);
    if (!room || !room.users[socketId]) return null;

    room.users[socketId].isSharing = isSharing;
    room.sharing = isSharing ? socketId : null;
    await setRoomInRedis(roomId, room);
    return room;
}

// Helper function to get room statistics
async function getRoomStats(roomId) {
    const room = await getRoomFromRedis(roomId);
    if (!room) {
        return { userCount: 0, users: [], sharingUser: null };
    }

    const users = Object.values(room.users).map(user => ({
        id: user.userId,
        socketId: user.socketId,
        isSharing: user.isSharing,
        joinedAt: user.joinedAt
    }));

    const sharingUser = room.sharing && room.users[room.sharing]?.userId || null;

    return {
        userCount: Object.keys(room.users).length,
        users: users,
        sharingUser: sharingUser
    };
}

// API endpoint to get room statistics
app.get('/api/room/:roomId/stats', async (req, res) => {
    const { roomId } = req.params;
    const stats = await getRoomStats(roomId);
    res.json(stats);
});

// API endpoint to get all active rooms
app.get('/api/rooms', async (req, res) => {
    try {
        const keys = await redisClient.keys('room:*');
        const activeRooms = await Promise.all(
            keys.map(async (key) => {
                const roomId = key.replace('room:', '');
                const stats = await getRoomStats(roomId);
                return { roomId, ...stats };
            })
        );
        res.json(activeRooms);
    } catch (err) {
        console.error('Error getting rooms:', err);
        res.json([]);
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a room
    socket.on('join-room', async (roomId, userId) => {
        console.log(`User ${userId} (${socket.id}) attempting to join room ${roomId}`);

        socket.join(roomId);

        // Add user to room in Redis
        const room = await addUserToRoom(roomId, socket.id, userId);

        // Store socket to user mapping (local)
        socketToUser.set(socket.id, { roomId, userId });

        // Get list of existing users (excluding the current user)
        const existingUsers = Object.values(room.users)
            .filter(user => user.socketId !== socket.id)
            .map(user => user.userId);

        // Send existing users to the new user
        socket.emit('existing-users', existingUsers);

        // Notify others in the room about the new user
        socket.to(roomId).emit('user-joined', userId);

        // Send room info to all users in the room
        const allUsers = Object.values(room.users).map(user => ({
            id: user.userId,
            socketId: user.socketId,
            isSharing: user.isSharing
        }));

        io.to(roomId).emit('room-users-updated', allUsers);

        // Send room statistics to all users
        const roomStats = await getRoomStats(roomId);
        io.to(roomId).emit('room-stats-updated', roomStats);

        console.log(`User ${userId} joined room ${roomId}`);
        console.log(`Room ${roomId} now has ${Object.keys(room.users).length} users:`,
            Object.values(room.users).map(u => u.userId));
    });

    // Handle WebRTC offer
    socket.on('offer', (data) => {
        console.log(`Relaying offer from ${data.from} to ${data.to}`);

        // Find the target socket by userId
        const targetSocket = findSocketByUserId(data.to);
        if (targetSocket) {
            io.to(targetSocket).emit('offer', {
                offer: data.offer,
                from: data.from
            });
        } else {
            console.log(`Target user ${data.to} not found`);
        }
    });

    // Handle WebRTC answer
    socket.on('answer', (data) => {
        console.log(`Relaying answer from ${data.from} to ${data.to}`);

        // Find the target socket by userId
        const targetSocket = findSocketByUserId(data.to);
        if (targetSocket) {
            io.to(targetSocket).emit('answer', {
                answer: data.answer,
                from: data.from
            });
        } else {
            console.log(`Target user ${data.to} not found`);
        }
    });

    // Handle ICE candidates
    socket.on('ice-candidate', (data) => {
        console.log(`Relaying ICE candidate from ${data.from} to ${data.to}`);

        // Find the target socket by userId
        const targetSocket = findSocketByUserId(data.to);
        if (targetSocket) {
            io.to(targetSocket).emit('ice-candidate', {
                candidate: data.candidate,
                from: data.from
            });
        } else {
            console.log(`Target user ${data.to} not found`);
        }
    });

    // Handle user starting screen share
    socket.on("start-sharing", async (roomId, userId) => {
        console.log(`${userId} started sharing in room ${roomId}`);

        const room = await setUserSharing(roomId, socket.id, true);
        if (room) {
            // Notify others in the room
            socket.to(roomId).emit("user-started-sharing", userId);

            // Update room users info
            const allUsers = Object.values(room.users).map(user => ({
                id: user.userId,
                socketId: user.socketId,
                isSharing: user.isSharing
            }));

            io.to(roomId).emit('room-users-updated', allUsers);

            // Send updated room statistics
            const roomStats = await getRoomStats(roomId);
            io.to(roomId).emit('room-stats-updated', roomStats);
        }
    });

    // Handle user stopping screen share
    socket.on("stop-sharing", async (roomId, userId) => {
        console.log(`${userId} stopped sharing in room ${roomId}`);

        const room = await setUserSharing(roomId, socket.id, false);
        if (room) {
            // Notify others in the room
            socket.to(roomId).emit("user-stopped-sharing", userId);

            // Update room users info
            const allUsers = Object.values(room.users).map(user => ({
                id: user.userId,
                socketId: user.socketId,
                isSharing: user.isSharing
            }));

            io.to(roomId).emit('room-users-updated', allUsers);

            // Send updated room statistics
            const roomStats = await getRoomStats(roomId);
            io.to(roomId).emit('room-stats-updated', roomStats);
        }
    });

    // Handle user leaving
    socket.on('leave-room', async (roomId, userId) => {
        console.log(`User ${userId} leaving room ${roomId}`);
        await handleUserLeaving(socket, roomId, userId);
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);

        const userInfo = socketToUser.get(socket.id);
        if (userInfo) {
            await handleUserLeaving(socket, userInfo.roomId, userInfo.userId);
        }
    });

    // Helper function to handle user leaving
    async function handleUserLeaving(socket, roomId, userId) {
        socket.leave(roomId);

        // Remove user from room in Redis
        const room = await removeUserFromRoom(roomId, socket.id);

        // Remove from socket mapping (local)
        socketToUser.delete(socket.id);

        if (room === null) {
            console.log(`Room ${roomId} deleted (empty)`);
        } else {
            // Notify others in the room
            socket.to(roomId).emit('user-left', userId);

            // Update room users info
            const allUsers = Object.values(room.users).map(user => ({
                id: user.userId,
                socketId: user.socketId,
                isSharing: user.isSharing
            }));

            io.to(roomId).emit('room-users-updated', allUsers);

            // Send updated room statistics
            const roomStats = await getRoomStats(roomId);
            io.to(roomId).emit('room-stats-updated', roomStats);

            console.log(`User ${userId} left room ${roomId}. Remaining users: ${Object.keys(room.users).length}`);
        }
    }

    // Helper function to find socket by userId
    function findSocketByUserId(userId) {
        for (const [socketId, userInfo] of socketToUser.entries()) {
            if (userInfo.userId === userId) {
                return socketId;
            }
        }
        return null;
    }
});

const PORT = 5010;

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
    console.log('Server ready to accept connections');
});