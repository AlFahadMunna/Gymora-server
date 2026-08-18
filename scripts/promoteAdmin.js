// Dev/ops utility: promotes an already-registered account to "admin".
// Better Auth's registration flow always creates standard "user" accounts
// by design (see rubric: "All users register as standard users by
// default") — this is the one intentional, direct-DB exception, used once
// to designate the platform's initial admin.
//
// Usage: node scripts/promoteAdmin.js user@example.com
require("dotenv").config();
const { getDB, clientPromise } = require("../src/config/db");

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/promoteAdmin.js <email>");
  process.exit(1);
}

(async () => {
  const db = await getDB();
  const result = await db
    .collection("user")
    .updateOne({ email }, { $set: { role: "admin", status: "active" } });

  if (result.matchedCount === 0) {
    console.error(
      `No user found with email "${email}". Register the account first (they must sign up through the app), then rerun this script.`
    );
    process.exit(1);
  }

  console.log(`"${email}" is now an admin.`);

  const client = await clientPromise;
  await client.close();
})().catch((error) => {
  console.error("Failed to promote user:", error);
  process.exit(1);
});
