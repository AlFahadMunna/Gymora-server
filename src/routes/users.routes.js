const express = require("express");
const { getDB } = require("../config/db");
const { verifyToken, verifyRole } = require("../middlewares/verifyToken");

const router = express.Router();

// GET /users?role=trainer — admin only. Powers both Manage Users (no
// filter) and Manage Trainers (role=trainer).
router.get("/users", verifyToken, verifyRole("admin"), async (req, res, next) => {
  try {
    const db = await getDB();
    const filter = {};
    if (req.query.role) filter.role = req.query.role;

    const users = await db
      .collection("user")
      .find(filter)
      .project({ name: 1, email: 1, role: 1, status: 1, image: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:email/block", verifyToken, verifyRole("admin"), async (req, res, next) => {
  try {
    const email = decodeURIComponent(req.params.email);
    if (email === req.user.email) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot block your own account" });
    }

    const db = await getDB();
    const result = await db
      .collection("user")
      .updateOne({ email }, { $set: { status: "blocked" } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "User blocked" });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/users/:email/unblock",
  verifyToken,
  verifyRole("admin"),
  async (req, res, next) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const db = await getDB();
      const result = await db
        .collection("user")
        .updateOne({ email }, { $set: { status: "active" } });
      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      res.json({ success: true, message: "User unblocked" });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/users/:email/make-admin",
  verifyToken,
  verifyRole("admin"),
  async (req, res, next) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const db = await getDB();
      const result = await db
        .collection("user")
        .updateOne({ email }, { $set: { role: "admin" } });
      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      res.json({ success: true, message: "User promoted to admin" });
    } catch (error) {
      next(error);
    }
  }
);

router.patch("/users/:email/demote", verifyToken, verifyRole("admin"), async (req, res, next) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const db = await getDB();
    const result = await db
      .collection("user")
      .updateOne({ email, role: "trainer" }, { $set: { role: "user" } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    res.json({ success: true, message: "Trainer demoted to user" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
