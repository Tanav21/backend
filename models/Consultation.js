const mongoose = require('mongoose');

const consultationSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
    unique: true,
  },
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  duration: {
    type: Number, // in minutes
  },
  // transcription: [{
  //   speaker: String, // 'patient' or 'doctor'
  //   text: String,
  //   timestamp: Date,
  // }],
  transcription: [
  {
    senderId: String,
    senderRole: String,
    text: String,
    timestamp: Date,
  },
],

  chatMessages: [{
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderRole: {
      type: String,
      enum: ['patient', 'doctor'],
      required: true,
    },
     file: {
      fileName: { type: String },
      fileUrl: { type: String },
      fileType: { type: String },
      fileSize: { type: Number },
    },
    message: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended'],
    default: 'scheduled',
  },
  aiReport: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

consultationSchema.index({ appointmentId: 1 });
consultationSchema.index({ roomId: 1 });

module.exports = mongoose.model('Consultation', consultationSchema);
