const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyRole,
  blockRestricted,
} = require("../middlewares/verifyToken");

const router = express.Router();

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 50;
const REQUIRED_POST_FIELDS = ["title", "image", "description"];

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// Ensures a user can only vote once per post (the DB-level backstop behind
// the app-level toggle logic below). Cheap to call repeatedly — createIndex
// is a no-op once the index already exists — so it's fired once per cold
// start rather than gated behind extra bookkeeping.
getDB()
  .then((db) =>
    db.collection("votes").createIndex({ postId: 1, userEmail: 1 }, { unique: true })
  )
  .catch((error) => console.error("Failed to ensure votes index:", error));

// ---- Forum posts -----------------------------------------------------

// GET /forum-posts?page=&limit= — public, paginated, newest first.
router.get("/forum-posts", async (req, res, next) => {
  try {
    const db = await getDB();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(
      1,
      Math.min(MAX_LIMIT, parseInt(req.query.limit, 10) || DEFAULT_LIMIT)
    );

    const collection = db.collection("forumPosts");
    const [posts, total] = await Promise.all([
      collection
        .find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments({}),
    ]);

    res.json({
      success: true,
      data: posts,
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

// GET /forum-posts/latest — public, for the Home page preview section.
router.get("/forum-posts/latest", async (req, res, next) => {
  try {
    const db = await getDB();
    const limit = Math.max(1, Math.min(4, parseInt(req.query.limit, 10) || 4));
    const posts = await db
      .collection("forumPosts")
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    res.json({ success: true, data: posts });
  } catch (error) {
    next(error);
  }
});

// GET /forum-posts/mine — the logged-in trainer/admin's own posts.
router.get(
  "/forum-posts/mine",
  verifyToken,
  verifyRole("trainer", "admin"),
  async (req, res, next) => {
    try {
      const db = await getDB();
      const posts = await db
        .collection("forumPosts")
        .find({ authorEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ success: true, data: posts });
    } catch (error) {
      next(error);
    }
  }
);

// GET /forum-posts/:id — public. Full post plus its comments.
router.get("/forum-posts/:id", async (req, res, next) => {
  try {
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ success: false, message: "Invalid post id" });
    }

    const db = await getDB();
    const post = await db.collection("forumPosts").findOne({ _id: objectId });
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const comments = await db
      .collection("comments")
      .find({ postId: objectId })
      .sort({ createdAt: 1 })
      .toArray();

    res.json({ success: true, data: { post, comments } });
  } catch (error) {
    next(error);
  }
});

// POST /forum-posts — trainer or admin. Goes live immediately (forum posts
// aren't moderated pre-publish like classes — admins moderate after the
// fact via Forum Post Manage).
router.post(
  "/forum-posts",
  verifyToken,
  verifyRole("trainer", "admin"),
  blockRestricted,
  async (req, res, next) => {
    try {
      const missing = REQUIRED_POST_FIELDS.filter(
        (field) => !req.body[field] || String(req.body[field]).trim() === ""
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
        title: req.body.title,
        image: req.body.image,
        description: req.body.description,
        authorEmail: req.user.email,
        authorName: req.user.name,
        authorRole: req.user.role,
        likeCount: 0,
        dislikeCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.collection("forumPosts").insertOne(doc);
      res.status(201).json({ success: true, data: { _id: result.insertedId, ...doc } });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /forum-posts/:id — owning author or admin (moderation).
router.delete(
  "/forum-posts/:id",
  verifyToken,
  verifyRole("trainer", "admin"),
  blockRestricted,
  async (req, res, next) => {
    try {
      const objectId = toObjectId(req.params.id);
      if (!objectId) {
        return res.status(400).json({ success: false, message: "Invalid post id" });
      }

      const db = await getDB();
      const existing = await db.collection("forumPosts").findOne({ _id: objectId });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Post not found" });
      }

      const isAdmin = req.user.role === "admin";
      if (!isAdmin && existing.authorEmail !== req.user.email) {
        return res
          .status(403)
          .json({ success: false, message: "You can only delete your own posts" });
      }

      await db.collection("forumPosts").deleteOne({ _id: objectId });
      await db.collection("comments").deleteMany({ postId: objectId });
      await db.collection("votes").deleteMany({ postId: objectId });

      res.json({ success: true, message: "Post deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ---- Votes -------------------------------------------------------------

// GET /forum-posts/:id/vote — the current user's vote on this post, if any.
router.get("/forum-posts/:id/vote", verifyToken, async (req, res, next) => {
  try {
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ success: false, message: "Invalid post id" });
    }

    const db = await getDB();
    const vote = await db
      .collection("votes")
      .findOne({ postId: objectId, userEmail: req.user.email });

    res.json({ success: true, myVote: vote?.type ?? null });
  } catch (error) {
    next(error);
  }
});

// POST /forum-posts/:id/vote — toggles like/dislike. Voting the same type
// again removes the vote; voting the other type switches it. Each user can
// only ever hold one vote per post (enforced by the unique index above).
router.post(
  "/forum-posts/:id/vote",
  verifyToken,
  blockRestricted,
  async (req, res, next) => {
    try {
      const objectId = toObjectId(req.params.id);
      if (!objectId) {
        return res.status(400).json({ success: false, message: "Invalid post id" });
      }

      const { type } = req.body;
      if (!["like", "dislike"].includes(type)) {
        return res
          .status(400)
          .json({ success: false, message: "type must be 'like' or 'dislike'" });
      }

      const db = await getDB();
      const posts = db.collection("forumPosts");
      const votes = db.collection("votes");

      const post = await posts.findOne({ _id: objectId });
      if (!post) {
        return res.status(404).json({ success: false, message: "Post not found" });
      }

      const existing = await votes.findOne({
        postId: objectId,
        userEmail: req.user.email,
      });

      let likeDelta = 0;
      let dislikeDelta = 0;
      let myVote = type;

      if (existing && existing.type === type) {
        await votes.deleteOne({ _id: existing._id });
        likeDelta = type === "like" ? -1 : 0;
        dislikeDelta = type === "dislike" ? -1 : 0;
        myVote = null;
      } else if (existing) {
        await votes.updateOne(
          { _id: existing._id },
          { $set: { type, updatedAt: new Date() } }
        );
        likeDelta = type === "like" ? 1 : -1;
        dislikeDelta = type === "dislike" ? 1 : -1;
      } else {
        await votes.insertOne({
          postId: objectId,
          userEmail: req.user.email,
          type,
          createdAt: new Date(),
        });
        likeDelta = type === "like" ? 1 : 0;
        dislikeDelta = type === "dislike" ? 1 : 0;
      }

      await posts.updateOne(
        { _id: objectId },
        { $inc: { likeCount: likeDelta, dislikeCount: dislikeDelta } }
      );
      const updated = await posts.findOne(
        { _id: objectId },
        { projection: { likeCount: 1, dislikeCount: 1 } }
      );

      res.json({
        success: true,
        myVote,
        likeCount: updated.likeCount,
        dislikeCount: updated.dislikeCount,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---- Comments ------------------------------------------------------------

// POST /forum-posts/:id/comments — post a comment or a reply (parentId).
router.post(
  "/forum-posts/:id/comments",
  verifyToken,
  blockRestricted,
  async (req, res, next) => {
    try {
      const objectId = toObjectId(req.params.id);
      if (!objectId) {
        return res.status(400).json({ success: false, message: "Invalid post id" });
      }

      const text = (req.body.text || "").trim();
      if (!text) {
        return res.status(400).json({ success: false, message: "Comment text is required" });
      }

      const parentId = req.body.parentId ? toObjectId(req.body.parentId) : null;
      if (req.body.parentId && !parentId) {
        return res.status(400).json({ success: false, message: "Invalid parent comment id" });
      }

      const db = await getDB();
      const post = await db.collection("forumPosts").findOne({ _id: objectId });
      if (!post) {
        return res.status(404).json({ success: false, message: "Post not found" });
      }

      const now = new Date();
      const doc = {
        postId: objectId,
        parentId,
        authorEmail: req.user.email,
        authorName: req.user.name,
        text,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.collection("comments").insertOne(doc);
      await db
        .collection("forumPosts")
        .updateOne({ _id: objectId }, { $inc: { commentCount: 1 } });

      res.status(201).json({ success: true, data: { _id: result.insertedId, ...doc } });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /comments/:commentId — author only.
router.patch("/comments/:commentId", verifyToken, blockRestricted, async (req, res, next) => {
  try {
    const objectId = toObjectId(req.params.commentId);
    if (!objectId) {
      return res.status(400).json({ success: false, message: "Invalid comment id" });
    }

    const text = (req.body.text || "").trim();
    if (!text) {
      return res.status(400).json({ success: false, message: "Comment text is required" });
    }

    const db = await getDB();
    const comment = await db.collection("comments").findOne({ _id: objectId });
    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }
    if (comment.authorEmail !== req.user.email) {
      return res
        .status(403)
        .json({ success: false, message: "You can only edit your own comments" });
    }

    await db
      .collection("comments")
      .updateOne({ _id: objectId }, { $set: { text, updatedAt: new Date() } });

    res.json({ success: true, message: "Comment updated" });
  } catch (error) {
    next(error);
  }
});

// DELETE /comments/:commentId — author only.
router.delete("/comments/:commentId", verifyToken, blockRestricted, async (req, res, next) => {
  try {
    const objectId = toObjectId(req.params.commentId);
    if (!objectId) {
      return res.status(400).json({ success: false, message: "Invalid comment id" });
    }

    const db = await getDB();
    const comment = await db.collection("comments").findOne({ _id: objectId });
    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }
    if (comment.authorEmail !== req.user.email) {
      return res
        .status(403)
        .json({ success: false, message: "You can only delete your own comments" });
    }

    await db.collection("comments").deleteOne({ _id: objectId });
    // Replies to a deleted comment are orphaned but kept — same behavior
    // as most forum software, avoids cascading deletes of others' replies.
    await db
      .collection("forumPosts")
      .updateOne({ _id: comment.postId }, { $inc: { commentCount: -1 } });

    res.json({ success: true, message: "Comment deleted" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
