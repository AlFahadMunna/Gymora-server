const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { verifyToken } = require("../middlewares/verifyToken");

const router = express.Router();

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// GET /notifications/mine — the current user's most recent notifications.
router.get("/notifications/mine", verifyToken, async (req, res, next) => {
  try {
    const db = await getDB();
    const notifications = await db
      .collection("notifications")
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const unreadCount = await db
      .collection("notifications")
      .countDocuments({ userEmail: req.user.email, read: false });

    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) {
    next(error);
  }
});

// PATCH /notifications/:id/read — mark a single notification read.
router.patch("/notifications/:id/read", verifyToken, async (req, res, next) => {
  try {
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }

    const db = await getDB();
    const result = await db
      .collection("notifications")
      .updateOne({ _id: objectId, userEmail: req.user.email }, { $set: { read: true } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.json({ success: true, message: "Marked as read" });
  } catch (error) {
    next(error);
  }
});

// PATCH /notifications/read-all — mark every notification of the current
// user as read (e.g. when they open the notifications dropdown).
router.patch("/notifications/read-all", verifyToken, async (req, res, next) => {
  try {
    const db = await getDB();
    await db
      .collection("notifications")
      .updateMany({ userEmail: req.user.email, read: false }, { $set: { read: true } });

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
