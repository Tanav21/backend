const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, requireRole } = require('../middleware/auth');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Consultation = require('../models/Consultation');
const crypto = require('crypto');

// @route   POST /api/appointments
// @desc    Create a new appointment
// @access  Private (Patient)
router.post(
  '/',
  auth,
  requireRole('patient'),
  [
    body('doctorId').notEmpty(),
    body('specialty').notEmpty(),
    body('appointmentDate').isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { doctorId, specialty, appointmentDate } = req.body;

      // Verify doctor exists
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found' });
      }

      // Get patient
      const patient = await Patient.findOne({ userId: req.user.userId });
      if (!patient) {
        return res.status(404).json({ message: 'Patient profile not found' });
      }

      // Create appointment
      const appointment = new Appointment({
        patientId: patient._id,
        doctorId: doctor._id,
        specialty,
        appointmentDate: new Date(appointmentDate),
        amount: doctor.consultationFee,
      });
      await appointment.save();

      // Create consultation room
      const roomId = crypto.randomBytes(16).toString('hex');
      const consultation = new Consultation({
        appointmentId: appointment._id,
        roomId,
      });
      await consultation.save();

      // Populate appointment details
      await appointment.populate('patientId', 'firstName lastName');
      await appointment.populate('doctorId', 'firstName lastName specialization');

      res.status(201).json({
        appointment,
        consultation: {
          roomId: consultation.roomId,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   GET /api/appointments
// @desc    Get appointments (filtered by role)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    let appointments;
    const { status } = req.query;

    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.userId });
      if (!patient) {
        return res.status(404).json({ message: 'Patient profile not found' });
      }

      const query = { patientId: patient._id };
      if (status) query.status = status;

      appointments = await Appointment.find(query)
        .populate('doctorId', 'firstName lastName specialization consultationFee')
        .sort({ appointmentDate: -1 });
    } else if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user.userId });
      if (!doctor) {
        return res.status(404).json({ message: 'Doctor profile not found' });
      }

      const query = { doctorId: doctor._id };
      if (status) query.status = status;

      appointments = await Appointment.find(query)
        .populate('patientId', 'firstName lastName')
        .sort({ appointmentDate: -1 });
    } else {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/appointments/:id
// @desc    Get appointment by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.userId });
      if (appointment.patientId.toString() !== patient._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
    } else if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user.userId });
      if (appointment.doctorId.toString() !== doctor._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
    }

    await appointment.populate('patientId');
    await appointment.populate('doctorId');

    const consultation = await Consultation.findOne({ appointmentId: appointment._id });

    res.json({
      appointment,
      consultation,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PATCH /api/appointments/:id/status
// @desc    Update appointment status
// @access  Private (Doctor)
router.patch('/:id/status', auth, requireRole('doctor'), async (req, res) => {
  try {
    const { status } = req.body;
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const doctor = await Doctor.findOne({ userId: req.user.userId });
    if (appointment.doctorId.toString() !== doctor._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    appointment.status = status;
    appointment.updatedAt = new Date();
    await appointment.save();

    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
