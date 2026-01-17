const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const generateToken = require('../utils/generateToken');
const { auth } = require('../middleware/auth');

// Initialize Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

// @route   POST /api/auth/google
// @desc    Authenticate user with Google OAuth
// @access  Public
router.post('/google', async (req, res) => {
  try {
    const { token, role } = req.body;

    console.log('Google auth request received:', {
      hasToken: !!token,
      tokenType: typeof token,
      tokenLength: token ? String(token).length : 0,
      role,
    });

    if (!token) {
      return res.status(400).json({ message: 'Google token is required' });
    }

    // Convert to string if it's not already
    let tokenString = token;
    if (typeof token !== 'string') {
      console.warn('Token is not a string, converting:', typeof token);
      tokenString = String(token);
    }

    // Validate token looks like a JWT (has 3 parts separated by dots)
    if (!tokenString.includes('.') || tokenString.split('.').length !== 3) {
      console.error('Invalid token format:', {
        hasDots: tokenString.includes('.'),
        parts: tokenString.split('.').length,
        firstChars: tokenString.substring(0, 50),
      });
      return res.status(400).json({ 
        message: 'Invalid token format. Expected a JWT ID token from Google Sign-In.',
        hint: 'Make sure you are sending the credential (ID token) from Google Sign-In, not an access token.'
      });
    }

    if (!role || !['patient', 'doctor'].includes(role)) {
      return res.status(400).json({ message: 'Valid role (patient or doctor) is required' });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ message: 'Google OAuth is not configured on the server' });
    }

    // Verify Google token
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: tokenString,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (verifyError) {
      console.error('Google token verification error:', verifyError);
      return res.status(401).json({ 
        message: 'Invalid or expired Google token',
        error: verifyError.message 
      });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists by Google ID or email
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (user) {
      // Update user if they logged in with Google before but don't have googleId
      if (!user.googleId && user.email === email) {
        user.googleId = googleId;
        await user.save();
      }

      // Check if role matches
      if (user.role !== role) {
        return res.status(400).json({ 
          message: `This account is registered as a ${user.role}. Please select the correct role.` 
        });
      }
    } else {
      // Create new user
      user = new User({
        email,
        googleId,
        role,
        password: `google_${googleId}_${Date.now()}`, // Placeholder password for Google users
        isVerified: true, // Google accounts are pre-verified
      });
      await user.save();

      // Create profile based on role
      if (role === 'patient') {
        const nameParts = name ? name.split(' ') : ['', ''];
        const patient = new Patient({
          userId: user._id,
          firstName: nameParts[0] || 'User',
          lastName: nameParts.slice(1).join(' ') || '',
          phone: '',
          address: {},
          medicalHistory: [],
        });
        await patient.save();
      } else if (role === 'doctor') {
        const nameParts = name ? name.split(' ') : ['', ''];
        const doctor = new Doctor({
          userId: user._id,
          firstName: nameParts[0] || 'Doctor',
          lastName: nameParts.slice(1).join(' ') || '',
          specialization: 'General',
          licenseNumber: `GOOGLE_${googleId}`,
          phone: '',
          consultationFee: 0,
          availability: {},
        });
        await doctor.save();
      }
    }

    const token_jwt = generateToken(user._id);

    // Get profile
    let profile = null;
    if (user.role === 'patient') {
      profile = await Patient.findOne({ userId: user._id });
    } else if (user.role === 'doctor') {
      profile = await Doctor.findOne({ userId: user._id });
    }

    res.json({
      token: token_jwt,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      profile,
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ 
      message: 'Google authentication failed', 
      error: error.message 
    });
  }
});

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
