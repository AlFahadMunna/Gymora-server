const express = require("express");
const { getDB } = require("../config/db");

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Vertex Fitness API is running");
});

router.get("/health", async (req, res, next) => {
  try {
    const db = await getDB();
    await db.command({ ping: 1 });
    res.json({ success: true, status: "ok", db: "connected" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
