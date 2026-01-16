const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');

// @route   GET /api/doctors
// @desc    Get all doctors (with optional filters)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { specialization, isAvailable } = req.query;
    const query = {};

    if (specialization) {
      query.specialization = specialization;
    }

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === 'true';
    }

    const doctors = await Doctor.find(query)
      .select('-licenseNumber')
      .sort({ rating: -1, totalReviews: -1 });

    res.json(doctors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/doctors/specializations
// @desc    Get all available specializations
// @access  Public
router.get('/specializations', async (req, res) => {
  try {
    const specializations = await Doctor.distinct('specialization');
    res.json(specializations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/doctors/:id
// @desc    Get doctor by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).select('-licenseNumber');
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    res.json(doctor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
