const jwt = require("jsonwebtoken");

// Name of the httpOnly cookie holding this backend's own application JWT.
// Deliberately distinct from Better Auth's own session cookie name.
const COOKIE_NAME = "vertex_token";

function signAppToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

function verifyAppToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // Two different Vercel domains in production are cross-site, so the
    // cookie needs SameSite=None (which in turn requires Secure). Locally,
    // frontend/backend are same-site (both "localhost", different ports),
    // so Lax is enough and avoids needing HTTPS in dev.
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  };
}

// clearCookie must be called with matching attributes (minus maxAge/expires)
// to actually remove the cookie the browser holds.
function clearCookieOptions() {
  const { maxAge, ...rest } = cookieOptions();
  return rest;
}

module.exports = {
  COOKIE_NAME,
  signAppToken,
  verifyAppToken,
  cookieOptions,
  clearCookieOptions,
};
