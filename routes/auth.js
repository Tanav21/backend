const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const generateToken = require('../utils/generateToken');
const { auth } = require('../middleware/auth');

// @route   POST /api/auth/register/patient
// @desc    Register a new patient
// @access  Public
router.post(
  '/register/patient',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('dateOfBirth').isISO8601(),
    body('phone').notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, dateOfBirth, phone, address, medicalHistory } = req.body;
      const medical = medicalHistory.split(",");
      console.log(medical)
      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create user
      user = new User({
        email,
        password,
        role: 'patient',
      });
      await user.save();

      // Create patient profile
      const patient = new Patient({
        userId: user._id,
        firstName,
        lastName,
        dateOfBirth,
        phone,
        address: address || {},
        medicalHistory: medical || [],
      });
      await patient.save();

      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
        },
        patient: {
          id: patient._id,
          firstName: patient.firstName,
          lastName: patient.lastName,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   POST /api/auth/register/doctor
// @desc    Register a new doctor
// @access  Public
router.post(
  '/register/doctor',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty().trim(),
    body('lastName').notEmpty().trim(),
    body('specialization').notEmpty(),
    body('licenseNumber').notEmpty(),
    body('phone').notEmpty(),
    body('consultationFee').isNumeric(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        email,
        password,
        firstName,
        lastName,
        specialization,
        licenseNumber,
        phone,
        bio,
        experience,
        consultationFee,
        availability,
      } = req.body;

      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Check if license number already exists
      const existingDoctor = await Doctor.findOne({ licenseNumber });
      if (existingDoctor) {
        return res.status(400).json({ message: 'License number already registered' });
      }

      // Create user
      user = new User({
        email,
        password,
        role: 'doctor',
      });
      await user.save();

      // Create doctor profile
      const doctor = new Doctor({
        userId: user._id,
        firstName,
        lastName,
        specialization,
        licenseNumber,
        phone,
        bio,
        experience,
        consultationFee,
        availability: availability || {},
      });
      await doctor.save();

      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
        },
        doctor: {
          id: doctor._id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          specialization: doctor.specialization,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = generateToken(user._id);

      // Get profile based on role
      let profile = null;
      if (user.role === 'patient') {
        profile = await Patient.findOne({ userId: user._id });
      } else if (user.role === 'doctor') {
        profile = await Doctor.findOne({ userId: user._id });
      }

      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
        },
        profile,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let profile = null;
    if (user.role === 'patient') {
      profile = await Patient.findOne({ userId: user._id });
    } else if (user.role === 'doctor') {
      profile = await Doctor.findOne({ userId: user._id });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      profile,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
