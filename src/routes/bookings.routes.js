const express = require("express");
const { ObjectId } = require("mongodb");
const Stripe = require("stripe");
const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyRole,
  blockRestricted,
} = require("../middlewares/verifyToken");

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// GET /bookings/mine — the logged-in user's booked classes.
router.get("/bookings/mine", verifyToken, async (req, res, next) => {
  try {
    const db = await getDB();
    const bookings = await db
      .collection("bookings")
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
});

// GET /bookings/:classId/status — has the current user already booked this
// specific class? Drives the Class Details "Already Booked" state.
router.get("/bookings/:classId/status", verifyToken, async (req, res, next) => {
  try {
    const classId = toObjectId(req.params.classId);
    if (!classId) {
      return res.status(400).json({ success: false, message: "Invalid class id" });
    }

    const db = await getDB();
    const booking = await db
      .collection("bookings")
      .findOne({ userEmail: req.user.email, classId });

    res.json({ success: true, booked: Boolean(booking) });
  } catch (error) {
    next(error);
  }
});

// POST /create-payment-intent — the charge amount always comes from the
// class record on the server, never from the client, so a tampered
// request can't pay less than the listed price.
router.post(
  "/create-payment-intent",
  verifyToken,
  blockRestricted,
  async (req, res, next) => {
    try {
      const classId = toObjectId(req.body.classId);
      if (!classId) {
        return res.status(400).json({ success: false, message: "Invalid class id" });
      }

      const db = await getDB();
      const gymClass = await db
        .collection("classes")
        .findOne({ _id: classId, status: "Approved" });
      if (!gymClass) {
        return res.status(404).json({ success: false, message: "Class not found" });
      }

      const existingBooking = await db
        .collection("bookings")
        .findOne({ userEmail: req.user.email, classId });
      if (existingBooking) {
        return res
          .status(409)
          .json({ success: false, message: "You have already booked this class" });
      }

      // Locked to card only (no automatic payment methods / redirects):
      // the frontend uses Stripe's embedded CardElement + confirmCardPayment,
      // which can't follow the redirect-based methods (Cash App, Link, etc.)
      // Stripe would otherwise enable automatically.
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(gymClass.price * 100),
        currency: "usd",
        payment_method_types: ["card"],
        metadata: {
          classId: gymClass._id.toString(),
          userEmail: req.user.email,
        },
      });

      res.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (error) {
      next(error);
    }
  }
);

// POST /bookings — finalizes a booking after Stripe confirms payment
// client-side. Re-verifies the PaymentIntent server-side (status, amount
// via Stripe's own record, metadata match) instead of trusting the
// client's "it worked" claim.
router.post("/bookings", verifyToken, blockRestricted, async (req, res, next) => {
  try {
    const classId = toObjectId(req.body.classId);
    const { paymentIntentId } = req.body;
    if (!classId || !paymentIntentId) {
      return res
        .status(400)
        .json({ success: false, message: "classId and paymentIntentId are required" });
    }

    const db = await getDB();
    const gymClass = await db.collection("classes").findOne({ _id: classId });
    if (!gymClass) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    const existingBooking = await db
      .collection("bookings")
      .findOne({ userEmail: req.user.email, classId });
    if (existingBooking) {
      return res
        .status(409)
        .json({ success: false, message: "You have already booked this class" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(402).json({ success: false, message: "Payment has not completed" });
    }
    if (
      paymentIntent.metadata.classId !== classId.toString() ||
      paymentIntent.metadata.userEmail !== req.user.email
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Payment does not match this booking request" });
    }

    const now = new Date();
    const booking = {
      classId,
      className: gymClass.name,
      classImage: gymClass.image,
      trainerName: gymClass.trainerName,
      trainerEmail: gymClass.trainerEmail,
      schedule: gymClass.schedule,
      userEmail: req.user.email,
      userName: req.user.name,
      amount: paymentIntent.amount / 100,
      paymentIntentId,
      createdAt: now,
    };

    await db.collection("bookings").insertOne(booking);
    await db.collection("classes").updateOne({ _id: classId }, { $inc: { bookingCount: 1 } });
    await db.collection("transactions").insertOne({
      userEmail: req.user.email,
      amount: booking.amount,
      classId,
      className: gymClass.name,
      transactionId: paymentIntentId,
      createdAt: now,
    });

    res.status(201).json({ success: true, message: "Booking confirmed", data: booking });
  } catch (error) {
    next(error);
  }
});

// GET /classes/:id/students — trainer (own class) or admin. Feeds the
// trainer dashboard's "View Students" modal (Stage 7).
router.get(
  "/classes/:id/students",
  verifyToken,
  verifyRole("trainer", "admin"),
  async (req, res, next) => {
    try {
      const classId = toObjectId(req.params.id);
      if (!classId) {
        return res.status(400).json({ success: false, message: "Invalid class id" });
      }

      const db = await getDB();
      const gymClass = await db.collection("classes").findOne({ _id: classId });
      if (!gymClass) {
        return res.status(404).json({ success: false, message: "Class not found" });
      }

      if (req.user.role !== "admin" && gymClass.trainerEmail !== req.user.email) {
        return res
          .status(403)
          .json({ success: false, message: "You can only view your own class's students" });
      }

      const students = await db
        .collection("bookings")
        .find({ classId })
        .project({ userName: 1, userEmail: 1, createdAt: 1 })
        .toArray();

      res.json({ success: true, data: students });
    } catch (error) {
      next(error);
    }
  }
);

// GET /transactions — admin-only, read-only payment ledger (Stage 7 page).
router.get("/transactions", verifyToken, verifyRole("admin"), async (req, res, next) => {
  try {
    const db = await getDB();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    const collection = db.collection("transactions");
    const [transactions, total] = await Promise.all([
      collection
        .find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments({}),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
