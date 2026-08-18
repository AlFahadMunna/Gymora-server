const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyRole,
  blockRestricted,
} = require("../middlewares/verifyToken");

const router = express.Router();

const DEFAULT_LIMIT = 9;
const MAX_LIMIT = 50;
const REQUIRED_FIELDS = [
  "name",
  "image",
  "category",
  "difficulty",
  "duration",
  "schedule",
  "price",
  "description",
];
const EDITABLE_FIELDS = REQUIRED_FIELDS;

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// GET /classes?search=&category=Yoga,Cardio&page=1&limit=9
// Public listing — only Approved classes are ever returned here.
router.get("/classes", async (req, res, next) => {
  try {
    const db = await getDB();
    const { search = "", category = "" } = req.query;

    const filter = { status: "Approved" };
    if (search) {
      filter.name = { $regex: String(search), $options: "i" };
    }
    if (category) {
      const categories = String(category)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      if (categories.length) filter.category = { $in: categories };
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(
      1,
      Math.min(MAX_LIMIT, parseInt(req.query.limit, 10) || DEFAULT_LIMIT)
    );

    const collection = db.collection("classes");
    const [classes, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: classes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /classes/featured — top classes by booking count, for the Home page.
router.get("/classes/featured", async (req, res, next) => {
  try {
    const db = await getDB();
    const classes = await db
      .collection("classes")
      .find({ status: "Approved" })
      .sort({ bookingCount: -1, createdAt: -1 })
      .limit(6)
      .toArray();
    res.json({ success: true, data: classes });
  } catch (error) {
    next(error);
  }
});

// GET /classes/mine — the logged-in trainer's own classes, any status.
router.get("/classes/mine", verifyToken, verifyRole("trainer"), async (req, res, next) => {
  try {
    const db = await getDB();
    const classes = await db
      .collection("classes")
      .find({ trainerEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, data: classes });
  } catch (error) {
    next(error);
  }
});

// GET /classes/:id — public, but only ever exposes an Approved class.
// Trainer/admin management views (pending/rejected classes) go through
// authenticated routes (GET /classes/mine, GET /admin/classes) instead.
router.get("/classes/:id", async (req, res, next) => {
  try {
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ success: false, message: "Invalid class id" });
    }

    const db = await getDB();
    const gymClass = await db
      .collection("classes")
      .findOne({ _id: objectId, status: "Approved" });

    if (!gymClass) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    res.json({ success: true, data: gymClass });
  } catch (error) {
    next(error);
  }
});

// POST /classes — trainer or admin. Always starts out Pending.
router.post(
  "/classes",
  verifyToken,
  verifyRole("trainer", "admin"),
  blockRestricted,
  async (req, res, next) => {
    try {
      const missing = REQUIRED_FIELDS.filter(
        (field) => req.body[field] === undefined || req.body[field] === ""
      );
      if (missing.length) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missing.join(", ")}`,
        });
      }

      const db = await getDB();
      const now = new Date();
      const doc = {
        name: req.body.name,
        image: req.body.image,
        category: req.body.category,
        difficulty: req.body.difficulty,
        duration: req.body.duration,
        schedule: req.body.schedule,
        price: Number(req.body.price),
        description: req.body.description,
        trainerEmail: req.user.email,
        trainerName: req.user.name,
        status: "Pending",
        bookingCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.collection("classes").insertOne(doc);
      res.status(201).json({ success: true, data: { _id: result.insertedId, ...doc } });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /classes/:id — owning trainer (own class only) or admin (any class,
// including moderation status). A trainer's content edit resets status back
// to Pending so it goes through review again.
router.patch(
  "/classes/:id",
  verifyToken,
  verifyRole("trainer", "admin"),
  blockRestricted,
  async (req, res, next) => {
    try {
      const objectId = toObjectId(req.params.id);
      if (!objectId) {
        return res.status(400).json({ success: false, message: "Invalid class id" });
      }

      const db = await getDB();
      const existing = await db.collection("classes").findOne({ _id: objectId });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Class not found" });
      }

      const isAdmin = req.user.role === "admin";
      if (!isAdmin && existing.trainerEmail !== req.user.email) {
        return res
          .status(403)
          .json({ success: false, message: "You can only edit your own classes" });
      }

      const updates = {};
      for (const field of EDITABLE_FIELDS) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }
      if (updates.price !== undefined) updates.price = Number(updates.price);

      if (isAdmin && typeof req.body.status === "string") {
        updates.status = req.body.status;
      } else if (!isAdmin && Object.keys(updates).length > 0) {
        updates.status = "Pending";
      }

      updates.updatedAt = new Date();

      await db.collection("classes").updateOne({ _id: objectId }, { $set: updates });
      res.json({ success: true, message: "Class updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /classes/:id — owning trainer or admin.
router.delete(
  "/classes/:id",
  verifyToken,
  verifyRole("trainer", "admin"),
  blockRestricted,
  async (req, res, next) => {
    try {
      const objectId = toObjectId(req.params.id);
      if (!objectId) {
        return res.status(400).json({ success: false, message: "Invalid class id" });
      }

      const db = await getDB();
      const existing = await db.collection("classes").findOne({ _id: objectId });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Class not found" });
      }

      const isAdmin = req.user.role === "admin";
      if (!isAdmin && existing.trainerEmail !== req.user.email) {
        return res
          .status(403)
          .json({ success: false, message: "You can only delete your own classes" });
      }

      await db.collection("classes").deleteOne({ _id: objectId });
      res.json({ success: true, message: "Class deleted" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
