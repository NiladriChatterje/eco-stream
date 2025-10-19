const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Store active rooms and their participants
// Structure: { roomId: { users: Map(socketId -> userInfo), sharing: null | socketId, userCount: number } }
const rooms = new Map();

// Store socket to user mapping
const socketToUser = new Map();

// Helper function to get room statistics
function getRoomStats(roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        return { userCount: 0, users: [], sharingUser: null };
    }

    const users = Array.from(room.users.values()).map(user => ({
        id: user.userId,
        socketId: user.socketId,
        isSharing: user.isSharing,
        joinedAt: user.joinedAt
    }));

    const sharingUser = room.sharing ?
        room.users.get(room.sharing)?.userId || null : null;

    return {
        userCount: room.users.size,
        users: users,
        sharingUser: sharingUser
    };
}

// API endpoint to get room statistics
app.get('/api/room/:roomId/stats', (req, res) => {
    const { roomId } = req.params;
    const stats = getRoomStats(roomId);
    res.json(stats);
});

// API endpoint to get all active rooms
app.get('/api/rooms', (req, res) => {
    const activeRooms = Array.from(rooms.keys()).map(roomId => ({
        roomId,
        ...getRoomStats(roomId)
    }));
    res.json(activeRooms);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a room
    socket.on('join-room', (roomId, userId) => {
        console.log(rooms)
        console.log(`User ${userId} (${socket.id}) attempting to join room ${roomId}`);

        socket.join(roomId);

        // Initialize room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                users: new Map(),
                sharing: null,
                userCount: 0
            });
        }

        const room = rooms.get(roomId);

        // Add user to room with timestamp
        room.users.set(socket.id, {
            userId: userId,
            socketId: socket.id,
            isSharing: false,
            joinedAt: new Date().toISOString()
        });

        // Update user count
        room.userCount = room.users.size;

        // Store socket to user mapping
        socketToUser.set(socket.id, { roomId, userId });

        // Get list of existing users (excluding the current user)
        const existingUsers = Array.from(room.users.values())
            .filter(user => user.socketId !== socket.id)
            .map(user => user.userId);

        // Send existing users to the new user
        socket.emit('existing-users', existingUsers);

        // Notify others in the room about the new user
        socket.to(roomId).emit('user-joined', userId);

        // Send room info to all users in the room
        const allUsers = Array.from(room.users.values()).map(user => ({
            id: user.userId,
            socketId: user.socketId,
            isSharing: user.isSharing
        }));

        io.to(roomId).emit('room-users-updated', allUsers);

        // Send room statistics to all users
        const roomStats = getRoomStats(roomId);
        io.to(roomId).emit('room-stats-updated', roomStats);

        console.log(`User ${userId} joined room ${roomId}`);
        console.log(`Room ${roomId} now has ${room.users.size} users:`,
            Array.from(room.users.values()).map(u => u.userId));
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
    socket.on("start-sharing", (roomId, userId) => {
        console.log(`${userId} started sharing in room ${roomId}`);

        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const user = room.users.get(socket.id);

            if (user) {
                user.isSharing = true;
                room.sharing = socket.id;

                // Notify others in the room
                socket.to(roomId).emit("user-started-sharing", userId);

                // Update room users info
                const allUsers = Array.from(room.users.values()).map(user => ({
                    id: user.userId,
                    socketId: user.socketId,
                    isSharing: user.isSharing
                }));

                io.to(roomId).emit('room-users-updated', allUsers);

                // Send updated room statistics
                const roomStats = getRoomStats(roomId);
                io.to(roomId).emit('room-stats-updated', roomStats);
            }
        }
    });

    // Handle user stopping screen share
    socket.on("stop-sharing", (roomId, userId) => {
        console.log(`${userId} stopped sharing in room ${roomId}`);

        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const user = room.users.get(socket.id);

            if (user) {
                user.isSharing = false;
                room.sharing = null;

                // Notify others in the room
                socket.to(roomId).emit("user-stopped-sharing", userId);

                // Update room users info
                const allUsers = Array.from(room.users.values()).map(user => ({
                    id: user.userId,
                    socketId: user.socketId,
                    isSharing: user.isSharing
                }));

                io.to(roomId).emit('room-users-updated', allUsers);

                // Send updated room statistics
                const roomStats = getRoomStats(roomId);
                io.to(roomId).emit('room-stats-updated', roomStats);
            }
        }
    });

    // Handle user leaving
    socket.on('leave-room', (roomId, userId) => {
        console.log(`User ${userId} leaving room ${roomId}`);
        handleUserLeaving(socket, roomId, userId);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        const userInfo = socketToUser.get(socket.id);
        if (userInfo) {
            handleUserLeaving(socket, userInfo.roomId, userInfo.userId);
        }
    });

    // Helper function to handle user leaving
    function handleUserLeaving(socket, roomId, userId) {
        socket.leave(roomId);

        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);

            // Remove user from room
            room.users.delete(socket.id);

            // If this user was sharing, clear the sharing state
            if (room.sharing === socket.id) {
                room.sharing = null;
            }

            // Remove from socket mapping
            socketToUser.delete(socket.id);

            // If room is empty, delete it
            if (room.users.size === 0) {
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            } else {
                // Notify others in the room
                socket.to(roomId).emit('user-left', userId);

                // Update room users info
                const allUsers = Array.from(room.users.values()).map(user => ({
                    id: user.userId,
                    socketId: user.socketId,
                    isSharing: user.isSharing
                }));

                io.to(roomId).emit('room-users-updated', allUsers);

                // Send updated room statistics
                const roomStats = getRoomStats(roomId);
                io.to(roomId).emit('room-stats-updated', roomStats);

                console.log(`User ${userId} left room ${roomId}. Remaining users: ${room.users.size}`);
            }
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