const { createRemoteJWKSet, jwtVerify } = require("jose");

// Better Auth (running inside the Next.js frontend) signs short-lived
// session JWTs and publishes the matching public keys at its JWKS endpoint.
// We verify against that JWKS remotely instead of sharing a secret between
// the two services — jose caches/refreshes the key set for us.
let jwks;

function getJWKS() {
  if (!jwks) {
    const baseUrl = process.env.BETTER_AUTH_URL;
    if (!baseUrl) {
      throw new Error("Missing BETTER_AUTH_URL environment variable");
    }
    jwks = createRemoteJWKSet(new URL("/api/auth/jwks", baseUrl));
  }
  return jwks;
}

async function verifyBetterAuthToken(token) {
  const { payload } = await jwtVerify(token, getJWKS());
  return payload;
}

module.exports = { verifyBetterAuthToken };
