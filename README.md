# Vertex Fitness — Backend API

Express + MongoDB REST API for [Vertex Fitness](../frontend), a full-stack fitness & gym management platform. Handles all business data (classes, bookings, forum, favorites, trainer applications, user/role management, Stripe payments) behind role-based JWT authentication; Better Auth itself (email/password + Google login) runs in the frontend and shares this same MongoDB database.

- **Live API:** https://backend-xi-opal-94.vercel.app
- **Live site (frontend):** https://vertex-fitness-frontend.vercel.app
- **Frontend repo:** https://github.com/AlFahadMunna/Gymora-client

## How Authentication Works Here

The frontend verifies a user's Better Auth session and hands this API a short-lived Better Auth JWT. `POST /jwt` verifies that token against Better Auth's own JWKS endpoint (no shared secret between the two services), looks up the user's current `role`/`status` in the shared `user` collection, and issues this API's own JWT in an httpOnly cookie. Every protected route re-reads `role`/`status` from the database on each request (not from the JWT payload), so an admin's block/promote/demote action takes effect immediately instead of waiting for the affected user's token to expire.

## Key Features

- **Classes** — search (`$regex`) + category filter (`$in`) + pagination, trainer CRUD, admin moderation (approve/reject/delete), featured-by-bookings aggregation.
- **Community Forum** — posts, nested comments, and a unique-per-user vote (like/dislike) enforced by a DB index.
- **Bookings & Stripe** — PaymentIntents created server-side from the class's own price (never trusts a client-supplied amount), and a booking is only persisted after independently re-verifying the PaymentIntent with Stripe.
- **Favorites**, **trainer applications** (apply/approve/reject with feedback), **admin user management** (block/unblock/promote/demote — block is enforced on every state-changing route via middleware), and a read-only **transactions** ledger.

## Tech Stack / npm Packages Used

| Package | Purpose |
|---|---|
| `express` | HTTP server / routing |
| `mongodb` | Native MongoDB driver |
| `jsonwebtoken` | Signs/verifies this API's own app JWT |
| `jose` | Verifies Better Auth's JWT against its remote JWKS |
| `stripe` | PaymentIntents + server-side payment verification |
| `cors` | Cross-origin requests from the frontend, with credentials |
| `cookie-parser` | Reads the httpOnly app-JWT cookie |
| `morgan` | Request logging (dev only) |
| `dotenv` | Environment variable loading |
| `nodemon` | Dev-only autoreload |

## Getting Started

```bash
npm install
cp .env.example .env   # fill in the values below
npm run dev
```

The API runs at [http://localhost:5000](http://localhost:5000). The [frontend](../frontend) must be running separately (default `http://localhost:3000`) — Better Auth's JWKS endpoint, which this API depends on for auth, is served *by the frontend*.

### Environment Variables

See `.env.example` — you'll need a MongoDB connection string, a JWT signing secret, the frontend's URL (for JWKS + CORS), and a Stripe secret key. None of these are committed; `.env` is gitignored.

### Seed Scripts (optional, for local demo data)

```bash
npm run seed:classes   # 10 sample Approved classes across every category
npm run seed:forum     # 5 sample forum posts with starter comments
```

Both skip silently if data already exists; pass `--force` to wipe and reseed.

### Promoting an Admin

Registration always creates a standard "user" account by design. To designate the platform's admin, register normally through the site, then run:

```bash
npm run promote:admin -- someone@example.com
```

## Project Structure

```
src/
  app.js               Express app: middleware + route mounting
  config/db.js         Cached MongoDB connection (safe for serverless reuse)
  middlewares/          Auth (verifyToken/verifyRole/blockRestricted), error handling
  routes/               One file per resource (classes, forum, bookings, users, admin, ...)
  utils/                JWT signing, Better Auth token verification
scripts/                Local dev seed scripts
api/index.js            Vercel serverless entrypoint (Stage 10)
server.js               Local dev entrypoint
```
