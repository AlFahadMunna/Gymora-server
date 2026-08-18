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

// GET /admin/analytics — chart data for the Admin Overview's Recharts
// panels: bookings/day over the last 14 days, classes by category, users
// by role.
router.get("/admin/analytics", verifyToken, verifyRole("admin"), async (req, res, next) => {
  try {
    const db = await getDB();

    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 13);
    rangeStart.setHours(0, 0, 0, 0);

    const [bookingsAgg, classesByCategoryAgg, usersByRoleAgg] = await Promise.all([
      db
        .collection("bookings")
        .aggregate([
          { $match: { createdAt: { $gte: rangeStart } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      db
        .collection("classes")
        .aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      db
        .collection("user")
        .aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }])
        .toArray(),
    ]);

    // Fill in the full 14-day range so the chart doesn't skip days with
    // zero bookings.
    const countsByDate = new Map(bookingsAgg.map((d) => [d._id, d.count]));
    const bookingsByDay = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(rangeStart);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      bookingsByDay.push({ date: key, count: countsByDate.get(key) || 0 });
    }

    res.json({
      success: true,
      data: {
        bookingsByDay,
        classesByCategory: classesByCategoryAgg.map((c) => ({
          category: c._id || "Uncategorized",
          count: c.count,
        })),
        usersByRole: usersByRoleAgg.map((u) => ({ role: u._id || "user", count: u.count })),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
