const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Consultation = require('../models/Consultation');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');

// @route   GET /api/consultations/room/:roomId
// @desc    Get consultation by room ID
// @access  Private
router.get('/room/:roomId', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findOne({ roomId: req.params.roomId });
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    const appointment = await Appointment.findById(consultation.appointmentId);
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

    res.json({
      consultation,
      appointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/consultations/:roomId/start
// @desc    Start consultation
// @access  Private
router.post('/:roomId/start', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findOne({ roomId: req.params.roomId });
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    if (consultation.status === 'active') {
      return res.json({ message: 'Consultation already active', consultation });
    }

    consultation.status = 'active';
    consultation.startTime = new Date();
    await consultation.save();

    res.json({ message: 'Consultation started', consultation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/consultations/:roomId/end
// @desc    End consultation
// @access  Private
router.post('/:roomId/end', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findOne({ roomId: req.params.roomId });
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    consultation.status = 'ended';
    consultation.endTime = new Date();
    if (consultation.startTime) {
      consultation.duration = Math.round(
        (consultation.endTime - consultation.startTime) / 60000
      ); // in minutes
    }
    await consultation.save();

    // Update appointment status
    const appointment = await Appointment.findById(consultation.appointmentId);
    if (appointment) {
      appointment.status = 'completed';
      await appointment.save();
    }

    res.json({ message: 'Consultation ended', consultation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/consultations/:roomId/transcription
// @desc    Add transcription entry
// @access  Private
// router.post('/:roomId/transcription', auth, async (req, res) => {
//   try {
//     const { speaker, text } = req.body;
//     const consultation = await Consultation.findOne({ roomId: req.params.roomId });

//     if (!consultation) {
//       return res.status(404).json({ message: 'Consultation not found' });
//     }

//     consultation.transcription.push({
//       speaker,
//       text,
//       timestamp: new Date(),
//     });
//     await consultation.save();

//     res.json({ message: 'Transcription added', consultation });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });


// @route   GET /api/consultations/appointment/:appointmentId
// @desc    Get consultation by appointment ID
// @access  Private
router.get('/appointment/:appointmentId', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findOne({
      appointmentId: req.params.appointmentId,
    });

    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    const appointment = await Appointment.findById(consultation.appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Authorization check
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user.userId });
      if (!patient || appointment.patientId.toString() !== patient._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
    } else if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user.userId });
      if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
    }

    res.json({
      consultation,
      appointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


module.exports = router;
