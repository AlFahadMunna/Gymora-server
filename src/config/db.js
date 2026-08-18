const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Cache the connection promise on the global object so warm serverless
// invocations (and repeated `require`s during local dev) reuse the same
// connection instead of opening a new one every request.
let clientPromise = global._mongoClientPromise;

if (!clientPromise) {
  clientPromise = client.connect();
  global._mongoClientPromise = clientPromise;
}

async function getDB() {
  const connectedClient = await clientPromise;
  return connectedClient.db(process.env.DB_NAME || "vertex-fitness");
}

module.exports = { getDB, clientPromise };
