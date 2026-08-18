const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { verifyToken, blockRestricted } = require("../middlewares/verifyToken");

const router = express.Router();

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// A user can only favorite a given class once — this is the DB-level
// backstop behind the findOne-then-insert check below.
getDB()
  .then((db) =>
    db.collection("favorites").createIndex({ userEmail: 1, classId: 1 }, { unique: true })
  )
  .catch((error) => console.error("Failed to ensure favorites index:", error));

// GET /favorites/mine — the logged-in user's favorited classes, joined
// with current class data (not a snapshot) so price/status stay fresh.
router.get("/favorites/mine", verifyToken, async (req, res, next) => {
  try {
    const db = await getDB();
    const favorites = await db
      .collection("favorites")
      .aggregate([
        { $match: { userEmail: req.user.email } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "classes",
            localField: "classId",
            foreignField: "_id",
            as: "class",
          },
        },
        { $unwind: "$class" },
      ])
      .toArray();

    res.json({
      success: true,
      data: favorites.map((f) => ({ favoriteId: f._id, ...f.class })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /favorites/:classId/status — whether the current user has already
// favorited this class (drives the Class Details button state).
router.get("/favorites/:classId/status", verifyToken, async (req, res, next) => {
  try {
    const classId = toObjectId(req.params.classId);
    if (!classId) {
      return res.status(400).json({ success: false, message: "Invalid class id" });
    }

    const db = await getDB();
    const favorite = await db
      .collection("favorites")
      .findOne({ userEmail: req.user.email, classId });

    res.json({ success: true, favorited: Boolean(favorite) });
  } catch (error) {
    next(error);
  }
});

router.post("/favorites", verifyToken, blockRestricted, async (req, res, next) => {
  try {
    const classId = toObjectId(req.body.classId);
    if (!classId) {
      return res.status(400).json({ success: false, message: "Invalid class id" });
    }

    const db = await getDB();
    const gymClass = await db.collection("classes").findOne({ _id: classId });
    if (!gymClass) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    const existing = await db
      .collection("favorites")
      .findOne({ userEmail: req.user.email, classId });
    if (existing) {
      return res.status(409).json({ success: false, message: "Already in your favorites" });
    }

    await db.collection("favorites").insertOne({
      userEmail: req.user.email,
      classId,
      createdAt: new Date(),
    });

    res.status(201).json({ success: true, message: "Added to favorites" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Already in your favorites" });
    }
    next(error);
  }
});

router.delete("/favorites/:classId", verifyToken, blockRestricted, async (req, res, next) => {
  try {
    const classId = toObjectId(req.params.classId);
    if (!classId) {
      return res.status(400).json({ success: false, message: "Invalid class id" });
    }

    const db = await getDB();
    const result = await db
      .collection("favorites")
      .deleteOne({ userEmail: req.user.email, classId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Not in your favorites" });
    }

    res.json({ success: true, message: "Removed from favorites" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
