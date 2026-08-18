const { COOKIE_NAME, verifyAppToken } = require("../utils/jwt");

// Protects a route: requires a valid app JWT cookie (issued by POST /jwt
// after the frontend verifies its Better Auth session). Attaches the
// decoded payload ({ email, name, role, status }) to req.user.
function verifyToken(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: no token provided" });
  }

  try {
    req.user = verifyAppToken(token);
    next();
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: invalid or expired token" });
  }
}

// Restricts a route (already behind verifyToken) to specific roles.
// e.g. router.post("/classes", verifyToken, verifyRole("trainer", "admin"), ...)
function verifyRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: insufficient role" });
    }
    next();
  };
}

// Soft-block enforcement (Manage Users): blocked users may still browse,
// but must be rejected from any state-changing action. Used on top of
// verifyToken on write routes available to plain users (book, apply as
// trainer, comment, vote, etc.) starting in Stage 6.
function blockRestricted(req, res, next) {
  if (req.user?.status === "blocked") {
    return res
      .status(403)
      .json({ success: false, message: "Action restricted by Admin" });
  }
  next();
}

module.exports = { verifyToken, verifyRole, blockRestricted };
