// Dev utility: seeds forumPosts (and a couple of comments) so the
// Community Forum has real content before the Add Forum Post flow exists
// in the UI. Safe to re-run — skips if posts already exist unless --force.
require("dotenv").config();
const { getDB, clientPromise } = require("../src/config/db");

const samplePosts = [
  {
    title: "5 Recovery Habits Every Athlete Should Build",
    image: "https://picsum.photos/seed/vertex-forum-1/900/560",
    description:
      "Recovery is where the real gains happen. Sleep at least 7-8 hours, hydrate before you're thirsty, " +
      "walk on rest days instead of sitting all day, stretch for 10 minutes after every session, and track " +
      "how you feel each morning so you catch overtraining before it catches you. None of this is glamorous, " +
      "but it's the difference between steady progress and a nagging injury that sidelines you for a month.",
    authorName: "Amara Reyes",
    authorEmail: "amara.reyes@vertex.dev",
    authorRole: "trainer",
  },
  {
    title: "Building a Workout Routine You'll Actually Stick To",
    image: "https://picsum.photos/seed/vertex-forum-2/900/560",
    description:
      "Consistency beats intensity, every time. Start with three sessions a week you can realistically keep, " +
      "anchor them to something already in your schedule, and only add volume once the habit feels automatic. " +
      "A 'perfect' six-day split you abandon in three weeks will always lose to a boring three-day split you " +
      "run for a year.",
    authorName: "Daniel Osei",
    authorEmail: "daniel.osei@vertex.dev",
    authorRole: "trainer",
  },
  {
    title: "Nutrition Basics for Strength Training",
    image: "https://picsum.photos/seed/vertex-forum-3/900/560",
    description:
      "You don't need a complicated meal plan to build strength — you need enough protein (roughly 1.6-2.2g " +
      "per kg of bodyweight), consistent overall calories, and carbs around your training to fuel the work. " +
      "Get those three things right for a few months before you worry about anything more advanced.",
    authorName: "Priya Nair",
    authorEmail: "priya.nair@vertex.dev",
    authorRole: "trainer",
  },
  {
    title: "Welcome to the Vertex Fitness Community Forum",
    image: "https://picsum.photos/seed/vertex-forum-4/900/560",
    description:
      "This forum is a space for members and trainers to swap tips, ask questions, and keep each other " +
      "accountable. Please keep discussions respectful and on-topic — posts that don't meet our community " +
      "guidelines will be removed. Looking forward to seeing what you all share!",
    authorName: "Vertex Admin",
    authorEmail: "admin@vertexfitness.app",
    authorRole: "admin",
  },
  {
    title: "How to Warm Up Properly Before Any Workout",
    image: "https://picsum.photos/seed/vertex-forum-5/900/560",
    description:
      "A good warm-up isn't a few token stretches — it's 5-10 minutes of light cardio to raise your heart " +
      "rate, followed by dynamic movements that mimic what you're about to do. Squatting today? Do bodyweight " +
      "squats and leg swings first. Your first working set should never be the first time your joints move " +
      "through that range that day.",
    authorName: "Marcus Bell",
    authorEmail: "marcus.bell@vertex.dev",
    authorRole: "trainer",
  },
];

const sampleComments = [
  { text: "This is exactly what I needed to hear — I've been skipping sleep for extra gym time.", authorName: "Farhana Kabir", authorEmail: "farhana.kabir@example.com" },
  { text: "Great breakdown, thank you! Do you have a recommended stretching routine to go with this?", authorName: "Rakibul Hasan", authorEmail: "rakibul.hasan@example.com" },
];

(async () => {
  const db = await getDB();
  const posts = db.collection("forumPosts");
  const comments = db.collection("comments");

  const existingCount = await posts.countDocuments();
  const force = process.argv.includes("--force");

  if (existingCount > 0 && !force) {
    console.log(
      `forumPosts collection already has ${existingCount} document(s) — skipping. Pass --force to wipe and reseed.`
    );
    process.exit(0);
  }

  if (existingCount > 0 && force) {
    await posts.deleteMany({});
    await comments.deleteMany({});
    await db.collection("votes").deleteMany({});
  }

  const now = new Date();
  const postDocs = samplePosts.map((p, i) => ({
    ...p,
    likeCount: 0,
    dislikeCount: 0,
    commentCount: 0,
    // Stagger creation times so "latest" ordering is meaningful.
    createdAt: new Date(now.getTime() - i * 1000 * 60 * 60),
    updatedAt: now,
  }));

  const result = await posts.insertMany(postDocs);
  console.log(`Inserted ${result.insertedCount} sample forum posts.`);

  const firstPostId = result.insertedIds[0];
  const commentDocs = sampleComments.map((c) => ({
    ...c,
    postId: firstPostId,
    parentId: null,
    createdAt: now,
    updatedAt: now,
  }));
  await comments.insertMany(commentDocs);
  await posts.updateOne({ _id: firstPostId }, { $inc: { commentCount: commentDocs.length } });
  console.log(`Inserted ${commentDocs.length} sample comments on the first post.`);

  const client = await clientPromise;
  await client.close();
})().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
