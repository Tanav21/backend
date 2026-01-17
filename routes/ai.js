const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/consultation-report', auth, async (req, res) => {
  try {
    const { consultation, appointment } = req.body;

    // 🔐 Fetch consultation from DB
    const dbConsultation = await Consultation.findById(consultation._id);
    if (!dbConsultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }

    // ✅ If report already exists → return it
    if (dbConsultation.aiReport) {
      return res.json({
        report: dbConsultation.aiReport,
        fromCache: true,
      });
    }

    // 👤 Fetch patient details
    const patient = await Patient.findById(appointment.patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // 🧑‍⚕️ Fetch doctor details
    const doctor = await Doctor.findById(appointment.doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // 🧠 Build Gemini prompt
    const prompt = `
You are a professional medical assistant AI.
Generate a structured medical consultation report.

PATIENT DETAILS
Name: ${patient.firstName} ${patient.lastName}
Date of Birth: ${patient.dateOfBirth}
Phone: ${patient.phone}
Medical History: ${patient.medicalHistory?.join(', ') || 'None'}

DOCTOR DETAILS
Name: ${doctor.firstName} ${doctor.lastName}
Specialty: ${appointment.specialty}

CONSULTATION DETAILS
Status: ${consultation.status}
Appointment Date: ${appointment.appointmentDate}

CHAT MESSAGES
${consultation.chatMessages.map(
  m => `- ${m.senderRole}: ${m.message}`
).join('\n')}

TRANSCRIPTION
${consultation.transcription.map(
  t => `${t.speaker}: ${t.text}`
).join('\n')}

Generate the report with the following sections:
1. Consultation Summary
2. Key Symptoms
3. Doctor Observations
4. Advice / Treatment
5. Follow-up Recommendation
`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const result = await model.generateContent(prompt);
    const reportText = result.response.text();

    // 💾 Save report (ONLY ONCE)
    dbConsultation.aiReport = reportText;
    await dbConsultation.save();

    res.json({
      report: reportText,
      fromCache: false,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'AI report generation failed',
      error: error.message,
    });
  }
});

module.exports = router;
