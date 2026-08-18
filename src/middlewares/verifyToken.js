const { COOKIE_NAME, verifyAppToken } = require("../utils/jwt");
const { getDB } = require("../config/db");

// Better Auth's Mongo adapter doesn't guarantee an index on email; every
// request through verifyToken looks the user up by email, so this index
// matters for real performance, not just correctness.
getDB()
  .then((db) => db.collection("user").createIndex({ email: 1 }, { unique: true }))
  .catch((error) => console.error("Failed to ensure user email index:", error));

// Protects a route: requires a valid app JWT cookie (issued by POST /jwt
// after the frontend verifies its Better Auth session). The JWT only
// vouches for identity (email) — role and status are re-read from the
// database on every request, so an admin's block/promote/demote action
// takes effect on the very next request instead of waiting for the
// affected user's token to expire and refresh.
async function verifyToken(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: no token provided" });
  }

  try {
    const decoded = verifyAppToken(token);
    const db = await getDB();
    const user = await db.collection("user").findOne({ email: decoded.email });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: user not found" });
    }

    req.user = {
      email: user.email,
      name: user.name,
      role: user.role || "user",
      status: user.status || "active",
    };
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
// but must be rejected from any state-changing action.
function blockRestricted(req, res, next) {
  if (req.user?.status === "blocked") {
    return res
      .status(403)
      .json({ success: false, message: "Action restricted by Admin" });
  }
  next();
}

module.exports = { verifyToken, verifyRole, blockRestricted };
