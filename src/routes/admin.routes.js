const express = require("express");
const { getDB } = require("../config/db");
const { verifyToken, verifyRole } = require("../middlewares/verifyToken");

const router = express.Router();

// GET /admin/stats — platform-wide counts for the Admin Overview page.
router.get("/admin/stats", verifyToken, verifyRole("admin"), async (req, res, next) => {
  try {
    const db = await getDB();
    const [totalUsers, totalClasses, totalBookings] = await Promise.all([
      db.collection("user").countDocuments({}),
      db.collection("classes").countDocuments({}),
      db.collection("bookings").countDocuments({}),
    ]);

    res.json({ success: true, data: { totalUsers, totalClasses, totalBookings } });
  } catch (error) {
    next(error);
  }
});

// GET /admin/classes — every class regardless of status, for the Manage
// Classes moderation page.
router.get("/admin/classes", verifyToken, verifyRole("admin"), async (req, res, next) => {
  try {
    const db = await getDB();
    const classes = await db
      .collection("classes")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, data: classes });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
