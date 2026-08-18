// Vercel serverless entrypoint. Kept as a thin wrapper around the same
// Express app used for local dev (server.js), so the two never drift.
// Finalized alongside vercel.json in the deployment-prep stage.
require("dotenv").config();

const app = require("../src/app");

module.exports = app;
