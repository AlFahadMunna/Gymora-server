// jose v6 ships as an ESM-only package. A plain top-level require("jose")
// happens to work on newer local Node versions (their synchronous
// require(esm) interop) but fails hard with ERR_REQUIRE_ESM on Vercel's
// serverless Node runtime — so it's loaded lazily via dynamic import()
// instead, which works in a CommonJS file regardless of runtime.
let josePromise;
function loadJose() {
  if (!josePromise) josePromise = import("jose");
  return josePromise;
}

// Better Auth (running inside the Next.js frontend) signs short-lived
// session JWTs and publishes the matching public keys at its JWKS endpoint.
// We verify against that JWKS remotely instead of sharing a secret between
// the two services — jose caches/refreshes the key set for us.
let jwks;

async function getJWKS() {
  if (!jwks) {
    const baseUrl = process.env.BETTER_AUTH_URL;
    if (!baseUrl) {
      throw new Error("Missing BETTER_AUTH_URL environment variable");
    }
    const { createRemoteJWKSet } = await loadJose();
    jwks = createRemoteJWKSet(new URL("/api/auth/jwks", baseUrl));
  }
  return jwks;
}

async function verifyBetterAuthToken(token) {
  const { jwtVerify } = await loadJose();
  const { payload } = await jwtVerify(token, await getJWKS());
  return payload;
}

module.exports = { verifyBetterAuthToken };
