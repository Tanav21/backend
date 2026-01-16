require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173';

// ✅ CONNECT DB
connectDB();

// ✅ EXPRESS CORS (STRICT & CORRECT)
app.use(
  cors({
    origin: FRONTEND_URL, // ❌ NO TRAILING SLASH
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ SOCKET.IO CORS (MATCHES EXPRESS)
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL, // ❌ NO TRAILING SLASH
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ✅ FIX SOCKET.IO POLLING HEADERS (IMPORTANT)
io.engine.on('headers', (headers) => {
  headers['Access-Control-Allow-Origin'] = FRONTEND_URL;
  headers['Access-Control-Allow-Credentials'] = 'true';
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/consultations', require('./routes/consultations'));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Telehealth API Server is running' });
});

// ================= SOCKET LOGIC =================

const roomParticipants = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);

    const participants = roomParticipants.get(roomId) || new Set();
    const existing = Array.from(participants);

    participants.add(socket.id);
    roomParticipants.set(roomId, participants);

    existing.forEach((existingUserId) => {
      io.to(existingUserId).emit('user-joined', {
        userId: socket.id,
        isInitiator: true,
      });

      socket.emit('user-joined', {
        userId: existingUserId,
        isInitiator: false,
      });
    });

    if (existing.length === 0) {
      socket.emit('room-ready', { roomId });
    }
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);

    const participants = roomParticipants.get(roomId);
    if (participants) {
      participants.delete(socket.id);
      if (participants.size === 0) {
        roomParticipants.delete(roomId);
      }
    }

    socket.to(roomId).emit('user-left', { userId: socket.id });
  });

  socket.on('webrtc-offer', ({ roomId, offer, to }) => {
    if (to) io.to(to).emit('webrtc-offer', { offer, from: socket.id });
    else socket.to(roomId).emit('webrtc-offer', { offer, from: socket.id });
  });

  socket.on('webrtc-answer', ({ roomId, answer, to }) => {
    if (to) io.to(to).emit('webrtc-answer', { answer, from: socket.id });
    else socket.to(roomId).emit('webrtc-answer', { answer, from: socket.id });
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate, to }) => {
    if (to)
      io.to(to).emit('webrtc-ice-candidate', { candidate, from: socket.id });
    else
      socket
        .to(roomId)
        .emit('webrtc-ice-candidate', { candidate, from: socket.id });
  });

  socket.on('chat-message', async ({ roomId, senderId, senderRole, message }) => {
    io.to(roomId).emit('chat-message', {
      senderId,
      senderRole,
      message,
      timestamp: new Date(),
    });

    try {
      const Consultation = require('./models/Consultation');
      const consultation = await Consultation.findOne({ roomId });
      if (consultation) {
        consultation.chatMessages.push({
          senderId,
          senderRole,
          message,
          timestamp: new Date(),
        });
        await consultation.save();
      }
    } catch (err) {
      console.error('Chat save error:', err);
    }
  });

  socket.on('disconnect', () => {
    roomParticipants.forEach((participants, roomId) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        socket.to(roomId).emit('user-left', { userId: socket.id });
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
