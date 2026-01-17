require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');

const app = express();
const server = http.createServer(app);

// Parse multiple frontend URLs if provided (comma-separated)
// Production-safe: no localhost assumptions, supports HTTPS
const frontendUrls = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim()).filter(url => url)
  : process.env.NODE_ENV === 'production' 
    ? [] // Production should always set FRONTEND_URL
    : ['http://localhost:5173']; // Only default to localhost in development

const io = socketIo(server, {
  cors: {
    origin: frontendUrls,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware - Support multiple frontend URLs
app.use(cors({
  origin: frontendUrls,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// app.use(
//   cors({
//     origin: (origin, callback) => {
//       // Allow server-to-server, Postman, curl
//       if (!origin) return callback(null, true);

//       if (frontendUrls.includes(origin)) {
//         return callback(null, true);
//       }

//       console.error('Blocked by CORS:', origin);
//       return callback(new Error('Not allowed by CORS'));
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
//   })
// );

// 🔥 REQUIRED for preflight
// app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/consultations', require('./routes/consultations'));
app.use('/uploads', express.static('uploads'));
app.use('/api/upload', require('./routes/upload'));


// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Telehealth API Server is running' });
});

// Track room participants for initiator assignment
const roomParticipants = new Map(); // roomId -> Set of socketIds

// Socket.io for real-time chat and WebRTC signaling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`[${roomId}] User ${socket.id} joined room`);
    
    // Get existing participants in the room
    const participants = roomParticipants.get(roomId) || new Set();
    const existingParticipants = Array.from(participants);
    
    // Add current user to participants
    participants.add(socket.id);
    roomParticipants.set(roomId, participants);
    
    // Determine initiator: first user in room becomes initiator for all subsequent connections
    // For each existing participant, the new user will be the initiator
    // For the new user, existing participants will initiate
    existingParticipants.forEach((existingUserId) => {
      // Existing user initiates connection to new user
      io.to(existingUserId).emit('user-joined', { 
        userId: socket.id,
        isInitiator: true // Existing user should initiate
      });
      
      // New user receives connection from existing user (not initiator)
      socket.emit('user-joined', { 
        userId: existingUserId,
        isInitiator: false // New user should wait for offer
      });
    });
    
    // If this is the first user, just acknowledge
    if (existingParticipants.length === 0) {
      socket.emit('room-ready', { roomId });
    }
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`[${roomId}] User ${socket.id} left room`);
    
    // Remove from participants
    const participants = roomParticipants.get(roomId);
    if (participants) {
      participants.delete(socket.id);
      if (participants.size === 0) {
        roomParticipants.delete(roomId);
      } else {
        roomParticipants.set(roomId, participants);
      }
    }
    
    socket.to(roomId).emit('user-left', { userId: socket.id });
  });

  // WebRTC signaling handlers
  socket.on('webrtc-offer', (data) => {
    const { roomId, offer, to } = data;
    // Send offer to specific user if 'to' is provided, otherwise broadcast to room
    if (to) {
      io.to(to).emit('webrtc-offer', {
        offer,
        from: socket.id,
      });
    } else {
      socket.to(roomId).emit('webrtc-offer', {
        offer,
        from: socket.id,
      });
    }
  });

  socket.on('webrtc-answer', (data) => {
    const { roomId, answer, to } = data;
    // Send answer to specific user if 'to' is provided, otherwise broadcast to room
    if (to) {
      io.to(to).emit('webrtc-answer', {
        answer,
        from: socket.id,
      });
    } else {
      socket.to(roomId).emit('webrtc-answer', {
        answer,
        from: socket.id,
      });
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const { roomId, candidate, to } = data;
    // Send ICE candidate to specific user if 'to' is provided, otherwise broadcast to room
    if (to) {
      io.to(to).emit('webrtc-ice-candidate', {
        candidate,
        from: socket.id,
      });
    } else {
      socket.to(roomId).emit('webrtc-ice-candidate', {
        candidate,
        from: socket.id,
      });
    }
  });

  socket.on('chat-message', async (data) => {
    const { roomId, senderId, senderRole, message,file } = data;
    
    // Broadcast message to all users in the room
    io.to(roomId).emit('chat-message', {
      senderId,
      senderRole,
      message,
      file,
      timestamp: new Date(),
    });

    // Save message to database
    try {
      const Consultation = require('./models/Consultation');
      const consultation = await Consultation.findOne({ roomId });
      if (consultation) {
        consultation.chatMessages.push({
          senderId,
          senderRole,
          message,
          file,
          timestamp: new Date(),
        });
        await consultation.save();
      }
    } catch (error) {
      console.error('Error saving chat message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up from all rooms
    roomParticipants.forEach((participants, roomId) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          roomParticipants.delete(roomId);
        }
        socket.to(roomId).emit('user-left', { userId: socket.id });
      }
    });
  });
});

// Bind to 0.0.0.0 to allow connections from other devices on the network
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Access from other devices: http://<YOUR_LAN_IP>:${PORT}`);
  console.log(`Frontend should use: http://<YOUR_LAN_IP>:${PORT}/api`);
});
