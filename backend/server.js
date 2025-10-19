const express = require('express');
const http2 = require('http2');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http2.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Store active rooms and their participants
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a room
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(userId);

        // Notify others in the room
        socket.to(roomId).emit('user-joined', userId);

        // Send list of existing users in the room
        const usersInRoom = Array.from(rooms.get(roomId)).filter(id => id !== userId);
        socket.emit('existing-users', usersInRoom);

        console.log(`User ${userId} joined room ${roomId}`);
        console.log(`Room ${roomId} now has ${rooms.get(roomId).size} users`);
    });

    // Handle WebRTC offer
    socket.on('offer', (data) => {
        console.log(`Relaying offer from ${data.from} to ${data.to}`);
        io.to(data.to).emit('offer', {
            offer: data.offer,
            from: data.from
        });
    });

    // Handle WebRTC answer
    socket.on('answer', (data) => {
        console.log(`Relaying answer from ${data.from} to ${data.to}`);
        io.to(data.to).emit('answer', {
            answer: data.answer,
            from: data.from
        });
    });

    // Handle ICE candidates
    socket.on('ice-candidate', (data) => {
        console.log(`Relaying ICE candidate from ${data.from} to ${data.to}`);
        io.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: data.from
        });
    });

    // Handle user leaving
    socket.on('leave-room', (roomId, userId) => {
        socket.leave(roomId);

        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(userId);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }

        socket.to(roomId).emit('user-left', userId);
        console.log(`User ${userId} left room ${roomId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove user from all rooms
        rooms.forEach((users, roomId) => {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                socket.to(roomId).emit('user-left', socket.id);

                if (users.size === 0) {
                    rooms.delete(roomId);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 5010;

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});