const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  specialization: {
    type: String,
    required: true,
    enum: [
      'General Practice',
      'Cardiology',
      'Dermatology',
      'Pediatrics',
      'Psychiatry',
      'Orthopedics',
      'Neurology',
      'Oncology',
      'Endocrinology',
      'Gastroenterology',
      'Pulmonology',
      'Urology',
      'Gynecology',
      'Ophthalmology',
      'ENT',
      'Emergency Medicine',
    ],
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    required: true,
  },
  bio: String,
  experience: Number, // years
  consultationFee: {
    type: Number,
    required: true,
    default: 50,
  },
  availability: {
    days: [String], // ['Monday', 'Tuesday', etc.]
    startTime: String, // '09:00'
    endTime: String, // '17:00'
    timezone: String,
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  totalReviews: {
    type: Number,
    default: 0,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

doctorSchema.index({ userId: 1 });
doctorSchema.index({ specialization: 1 });
doctorSchema.index({ isAvailable: 1 });

module.exports = mongoose.model('Doctor', doctorSchema);
