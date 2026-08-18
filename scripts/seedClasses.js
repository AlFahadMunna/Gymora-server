// Dev utility: seeds the classes collection with sample Approved classes so
// the Home/All Classes pages have real data before the Add Class flow
// (Stage 7) exists. Safe to re-run — skips if classes already exist unless
// --force is passed.
require("dotenv").config();
const { getDB, clientPromise } = require("../src/config/db");

const sampleClasses = [
  {
    name: "Sunrise Power Yoga",
    image: "https://picsum.photos/seed/vertex-yoga-1/700/500",
    category: "Yoga",
    difficulty: "Beginner",
    duration: "60 mins",
    schedule: "Mon, Wed, Fri · 6:00 AM",
    price: 25,
    description:
      "Start your day with an energizing flow that builds strength, balance, and flexibility from the ground up.",
    trainerName: "Amara Reyes",
    trainerEmail: "amara.reyes@vertex.dev",
    bookingCount: 58,
  },
  {
    name: "HIIT Ignite",
    image: "https://picsum.photos/seed/vertex-hiit-1/700/500",
    category: "HIIT",
    difficulty: "Advanced",
    duration: "45 mins",
    schedule: "Tue, Thu · 6:30 PM",
    price: 30,
    description:
      "High-intensity interval circuits designed to torch calories and build explosive power in under an hour.",
    trainerName: "Daniel Osei",
    trainerEmail: "daniel.osei@vertex.dev",
    bookingCount: 74,
  },
  {
    name: "Strength Foundations",
    image: "https://picsum.photos/seed/vertex-weights-1/700/500",
    category: "Weights",
    difficulty: "Beginner",
    duration: "50 mins",
    schedule: "Mon, Wed, Fri · 5:00 PM",
    price: 28,
    description:
      "Learn proper form on the big compound lifts — squat, deadlift, bench — with a certified strength coach.",
    trainerName: "Priya Nair",
    trainerEmail: "priya.nair@vertex.dev",
    bookingCount: 41,
  },
  {
    name: "CrossFit WOD",
    image: "https://picsum.photos/seed/vertex-crossfit-1/700/500",
    category: "CrossFit",
    difficulty: "Advanced",
    duration: "60 mins",
    schedule: "Mon–Fri · 7:00 AM",
    price: 35,
    description:
      "Constantly varied functional movements performed at high intensity. New workout of the day, every day.",
    trainerName: "Marcus Bell",
    trainerEmail: "marcus.bell@vertex.dev",
    bookingCount: 89,
  },
  {
    name: "Rhythm Zumba",
    image: "https://picsum.photos/seed/vertex-zumba-1/700/500",
    category: "Zumba",
    difficulty: "Beginner",
    duration: "45 mins",
    schedule: "Tue, Sat · 10:00 AM",
    price: 20,
    description:
      "Dance-fueled cardio to Latin and global rhythms — no dance experience needed, just bring your energy.",
    trainerName: "Sofia Mendes",
    trainerEmail: "sofia.mendes@vertex.dev",
    bookingCount: 63,
  },
  {
    name: "Endurance Cardio Circuit",
    image: "https://picsum.photos/seed/vertex-cardio-1/700/500",
    category: "Cardio",
    difficulty: "Intermediate",
    duration: "40 mins",
    schedule: "Mon, Thu · 6:00 AM",
    price: 22,
    description:
      "A rotating circuit of rowing, cycling, and running intervals built to steadily grow your cardio base.",
    trainerName: "Amara Reyes",
    trainerEmail: "amara.reyes@vertex.dev",
    bookingCount: 37,
  },
  {
    name: "Core & Control Pilates",
    image: "https://picsum.photos/seed/vertex-pilates-1/700/500",
    category: "Pilates",
    difficulty: "Intermediate",
    duration: "50 mins",
    schedule: "Wed, Fri · 9:00 AM",
    price: 26,
    description:
      "Mat-based Pilates focused on core control, posture, and long, lean muscle engagement.",
    trainerName: "Priya Nair",
    trainerEmail: "priya.nair@vertex.dev",
    bookingCount: 29,
  },
  {
    name: "Boxing Fundamentals",
    image: "https://picsum.photos/seed/vertex-boxing-1/700/500",
    category: "Boxing",
    difficulty: "Beginner",
    duration: "50 mins",
    schedule: "Tue, Thu, Sat · 5:30 PM",
    price: 32,
    description:
      "Learn footwork, combinations, and pad work in a beginner-friendly boxing class that doubles as a serious workout.",
    trainerName: "Marcus Bell",
    trainerEmail: "marcus.bell@vertex.dev",
    bookingCount: 52,
  },
  {
    name: "Restorative Yin Yoga",
    image: "https://picsum.photos/seed/vertex-yoga-2/700/500",
    category: "Yoga",
    difficulty: "Beginner",
    duration: "55 mins",
    schedule: "Sun · 5:00 PM",
    price: 24,
    description:
      "Slow, deep stretches held for several minutes each to release tension and calm the nervous system.",
    trainerName: "Sofia Mendes",
    trainerEmail: "sofia.mendes@vertex.dev",
    bookingCount: 18,
  },
  {
    name: "Total Body Weights",
    image: "https://picsum.photos/seed/vertex-weights-2/700/500",
    category: "Weights",
    difficulty: "Intermediate",
    duration: "55 mins",
    schedule: "Sat · 8:00 AM",
    price: 28,
    description:
      "A full-body hypertrophy session covering every major muscle group with progressive overload in mind.",
    trainerName: "Daniel Osei",
    trainerEmail: "daniel.osei@vertex.dev",
    bookingCount: 45,
  },
];

(async () => {
  const db = await getDB();
  const collection = db.collection("classes");

  const existingCount = await collection.countDocuments();
  const force = process.argv.includes("--force");

  if (existingCount > 0 && !force) {
    console.log(
      `classes collection already has ${existingCount} document(s) — skipping. Pass --force to wipe and reseed.`
    );
    process.exit(0);
  }

  if (existingCount > 0 && force) {
    await collection.deleteMany({});
  }

  const now = new Date();
  const docs = sampleClasses.map((c) => ({
    ...c,
    status: "Approved",
    createdAt: now,
    updatedAt: now,
  }));

  const result = await collection.insertMany(docs);
  console.log(`Inserted ${result.insertedCount} sample classes.`);

  const client = await clientPromise;
  await client.close();
})().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
