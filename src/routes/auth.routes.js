const express = require("express");
const { getDB } = require("../config/db");
const { verifyBetterAuthToken } = require("../utils/verifyBetterAuthToken");
const {
  COOKIE_NAME,
  signAppToken,
  cookieOptions,
  clearCookieOptions,
} = require("../utils/jwt");
const { verifyToken } = require("../middlewares/verifyToken");

const router = express.Router();

// Called by the frontend right after a Better Auth login/session becomes
// available. Body-less; the Better Auth session JWT travels as a Bearer
// token so this route can verify it statelessly against Better Auth's JWKS.
router.post("/jwt", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!bearerToken) {
      return res
        .status(401)
        .json({ success: false, message: "Missing Better Auth token" });
    }

    const payload = await verifyBetterAuthToken(bearerToken);
    const email = payload.email;

    if (!email) {
      return res
        .status(401)
        .json({ success: false, message: "Token is missing an email claim" });
    }

    const db = await getDB();
    // Better Auth's Mongo adapter owns this collection ("user"); we only
    // read it here to pick up the authoritative, current role/status.
    const user = await db.collection("user").findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const appToken = signAppToken({
      email: user.email,
      name: user.name,
      role: user.role || "user",
      status: user.status || "active",
    });

    res.cookie(COOKIE_NAME, appToken, cookieOptions());
    res.json({
      success: true,
      role: user.role || "user",
      status: user.status || "active",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, clearCookieOptions());
  res.json({ success: true, message: "Logged out" });
});

// Lightweight route to confirm the whole bridge end-to-end during
// development. Superseded by real role-scoped routes in later stages.
router.get("/me", verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
