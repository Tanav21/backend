const express = require("express");
const router = express.Router();
const { Client, Environment } = require("square");
const { auth, requireRole } = require("../middleware/auth");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");

/* ---------------------------------------
   Square Client Initialization
---------------------------------------- */
const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment:
    process.env.SQUARE_ENVIRONMENT === "production"
      ? Environment.Production
      : Environment.Sandbox,
});

/* ---------------------------------------
   Helper: Safe Number Conversion
---------------------------------------- */
const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  return Number(value.toString());
};

/* ---------------------------------------
   POST /api/payments/process-payment
---------------------------------------- */
router.post(
  "/process-payment",
  auth,
  requireRole("patient"),
  async (req, res) => {
    try {
      const { appointmentId, cardData } = req.body;

      if (!appointmentId || !cardData?.sourceId) {
        return res.status(400).json({
          success: false,
          message: "Missing required payment information",
        });
      }

      /* ---------------------------------------
         Fetch Appointment & Patient
      ---------------------------------------- */
      const appointment = await Appointment.findById(appointmentId).populate(
        "doctorId",
        "firstName lastName"
      );

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      const patient = await Patient.findOne({ userId: req.user.userId });
      if (!patient) {
        return res.status(404).json({
          success: false,
          message: "Patient profile not found",
        });
      }

      if (appointment.patientId.toString() !== patient._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized appointment access",
        });
      }

      if (appointment.paymentStatus === "paid") {
        return res.status(400).json({
          success: false,
          message: "Payment already completed",
        });
      }

      if (
        !process.env.SQUARE_ACCESS_TOKEN ||
        !process.env.SQUARE_LOCATION_ID
      ) {
        return res.status(500).json({
          success: false,
          message: "Square payment gateway not configured",
        });
      }

      /* ---------------------------------------
         Amount Conversion (BigInt Safe)
      ---------------------------------------- */
      const amountInDollars = toNumber(appointment.amount);

      if (!amountInDollars || amountInDollars <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment amount",
        });
      }

      // Square requires amount in cents (NUMBER)
      const amountInCents = Math.round(amountInDollars * 100);

      /* ---------------------------------------
         Create Square Payment
      ---------------------------------------- */
      const paymentRequest = {
        sourceId: cardData.sourceId,
        locationId: process.env.SQUARE_LOCATION_ID,
        amountMoney: {
          amount: amountInCents,
          currency: "USD",
        },
        idempotencyKey: `${appointmentId}-${Date.now()}`,
        note: `Telehealth Appointment - ${appointmentId}`,
      };

      if (cardData.verificationToken) {
        paymentRequest.verificationToken = cardData.verificationToken;
      }

      const { result, statusCode } =
        await squareClient.paymentsApi.createPayment(paymentRequest);

      if (statusCode !== 200 || result.errors) {
        const errors = result.errors || [];
        return res.status(400).json({
          success: false,
          message: "Payment failed",
          error: errors.map((e) => e.detail || e.code).join(", "),
        });
      }

      if (!result.payment) {
        return res.status(400).json({
          success: false,
          message: "No payment returned from Square",
        });
      }

      /* ---------------------------------------
         Save Payment Result
      ---------------------------------------- */
      appointment.paymentIntentId = result.payment.id;

      if (result.payment.status === "COMPLETED") {
        appointment.paymentStatus = "paid";
        appointment.status = "confirmed";
        await appointment.save();

        return res.json({
          success: true,
          message: "Payment completed successfully",
          payment: {
            id: result.payment.id,
            status: result.payment.status,
            amount:
              toNumber(result.payment.amountMoney.amount) / 100,
            currency: result.payment.amountMoney.currency,
          },
          appointment: {
            id: appointment._id,
            status: appointment.status,
            paymentStatus: appointment.paymentStatus,
          },
        });
      }

      if (result.payment.status === "APPROVED") {
        appointment.paymentStatus = "pending";
        await appointment.save();

        return res.json({
          success: true,
          message: "Payment approved and processing",
          payment: {
            id: result.payment.id,
            status: result.payment.status,
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: "Payment not completed",
        status: result.payment.status,
      });
    } catch (error) {
      console.error("Payment Error:", error);

      let errorMessage = "Payment processing failed";

      if (error.response?.body?.errors) {
        errorMessage = error.response.body.errors
          .map((e) => e.detail || e.code)
          .join(", ");
      } else if (error.message) {
        errorMessage = error.message;
      }

      return res.status(500).json({
        success: false,
        message: "Server error during payment processing",
        error: errorMessage,
      });
    }
  }
);

/* ---------------------------------------
   GET /api/payments/appointment/:id
---------------------------------------- */
router.get(
  "/appointment/:appointmentId",
  auth,
  requireRole("patient"),
  async (req, res) => {
    try {
      const appointment = await Appointment.findById(
        req.params.appointmentId
      );

      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      const patient = await Patient.findOne({ userId: req.user.userId });

      if (appointment.patientId.toString() !== patient._id.toString()) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      res.json({
        amount: toNumber(appointment.amount),
        paymentStatus: appointment.paymentStatus,
        paymentIntentId: appointment.paymentIntentId,
      });
    } catch (error) {
      res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  }
);

/* ---------------------------------------
   POST /api/payments/webhook
---------------------------------------- */
router.post("/webhook", express.json(), async (req, res) => {
  try {
    const event = req.body;

    if (
      event.type === "payment.updated" &&
      event.data?.object?.payment
    ) {
      const payment = event.data.object.payment;

      if (payment.status === "COMPLETED") {
        const appointment = await Appointment.findOne({
          paymentIntentId: payment.id,
        });

        if (appointment) {
          appointment.paymentStatus = "paid";
          appointment.status = "confirmed";
          await appointment.save();
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
