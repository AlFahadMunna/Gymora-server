const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyRole,
  blockRestricted,
} = require("../middlewares/verifyToken");

const router = express.Router();

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// GET /trainer-applications/mine — the current user's own application, if any.
router.get("/trainer-applications/mine", verifyToken, async (req, res, next) => {
  try {
    const db = await getDB();
    const application = await db
      .collection("trainerApplications")
      .findOne({ userEmail: req.user.email });
    res.json({ success: true, data: application });
  } catch (error) {
    next(error);
  }
});

// POST /trainer-applications — apply, or reapply after a rejection.
router.post(
  "/trainer-applications",
  verifyToken,
  blockRestricted,
  async (req, res, next) => {
    try {
      if (req.user.role !== "user") {
        return res.status(400).json({
          success: false,
          message: "Only standard users can apply to become a trainer",
        });
      }

      const { experience, specialty } = req.body;
      if (experience === undefined || experience === "" || !specialty) {
        return res
          .status(400)
          .json({ success: false, message: "Experience and specialty are required" });
      }

      const db = await getDB();
      const existing = await db
        .collection("trainerApplications")
        .findOne({ userEmail: req.user.email });

      if (existing && existing.status === "Pending") {
        return res
          .status(409)
          .json({ success: false, message: "Your application is already pending review" });
      }

      const now = new Date();
      await db.collection("trainerApplications").updateOne(
        { userEmail: req.user.email },
        {
          $set: {
            userEmail: req.user.email,
            userName: req.user.name,
            experience: Number(experience),
            specialty,
            status: "Pending",
            feedback: null,
            appliedAt: now,
            reviewedAt: null,
          },
        },
        { upsert: true }
      );

      res.status(201).json({ success: true, message: "Application submitted" });
    } catch (error) {
      next(error);
    }
  }
);

// GET /trainer-applications?status=Pending — admin only.
router.get(
  "/trainer-applications",
  verifyToken,
  verifyRole("admin"),
  async (req, res, next) => {
    try {
      const db = await getDB();
      const status = req.query.status || "Pending";
      const applications = await db
        .collection("trainerApplications")
        .find({ status })
        .sort({ appliedAt: -1 })
        .toArray();
      res.json({ success: true, data: applications });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /trainer-applications/:id/approve — admin only. Promotes the
// applicant's role to trainer.
router.patch(
  "/trainer-applications/:id/approve",
  verifyToken,
  verifyRole("admin"),
  async (req, res, next) => {
    try {
      const objectId = toObjectId(req.params.id);
      if (!objectId) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid application id" });
      }

      const db = await getDB();
      const application = await db
        .collection("trainerApplications")
        .findOne({ _id: objectId });
      if (!application) {
        return res.status(404).json({ success: false, message: "Application not found" });
      }

      const now = new Date();
      await db.collection("trainerApplications").updateOne(
        { _id: objectId },
        { $set: { status: "Approved", feedback: req.body.feedback || null, reviewedAt: now } }
      );
      await db
        .collection("user")
        .updateOne({ email: application.userEmail }, { $set: { role: "trainer" } });

      res.json({ success: true, message: "Application approved" });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /trainer-applications/:id/reject — admin only. Keeps the applicant
// as a standard user and records why.
router.patch(
  "/trainer-applications/:id/reject",
  verifyToken,
  verifyRole("admin"),
  async (req, res, next) => {
    try {
      const objectId = toObjectId(req.params.id);
      if (!objectId) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid application id" });
      }

      const feedback = (req.body.feedback || "").trim();
      if (!feedback) {
        return res
          .status(400)
          .json({ success: false, message: "Feedback is required when rejecting" });
      }

      const db = await getDB();
      const application = await db
        .collection("trainerApplications")
        .findOne({ _id: objectId });
      if (!application) {
        return res.status(404).json({ success: false, message: "Application not found" });
      }

      await db.collection("trainerApplications").updateOne(
        { _id: objectId },
        { $set: { status: "Rejected", feedback, reviewedAt: new Date() } }
      );

      res.json({ success: true, message: "Application rejected" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
