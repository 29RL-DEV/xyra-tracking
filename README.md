# Shipment Tracking Dashboard

A small logistics app with two sides. Customers type in a tracking number and see where their shipment is. Staff sign in to create shipments, add tracking events, leave internal notes and deal with customer enquiries.

I built it for a take-home task. All the data is made up.

**Live:** https://xyra-tracking.vercel.app

## Try it

Staff login: `staff@demo.test` / `DemoStaff2026!` at `/staff/login`. It's a fictional demo account, published on purpose so reviewers can get in. The real secrets are only in environment variables.

Demo tracking numbers, one per state:

| Number | State |
| --- | --- |
| `TRK-DEMO-001` | In transit |
| `TRK-DEMO-002` | Delivered |
| `TRK-DEMO-003` | Delayed (shows the original and revised ETA) |
| `TRK-DEMO-004` | Exception (address problem) |
| `TRK-DEMO-005` | Just collected |

The seed also adds about twenty more shipments so search, filters and pagination have something to work with.

## What it does

**Customers (no account)**
- Look up a shipment: status, route, ETA, current location and a timeline with the newest event first.
- Empty or badly formatted numbers are caught before any request is sent. An unknown number shows a "not found" message and the page returns a 404.
- Send an enquiry about a shipment. It asks for no personal details, so staff can't reply directly (email and SMS were out of scope).
- Every result has its own URL, like `/track/TRK-DEMO-001`.

**Staff (login)**
- Overview page with counts and the shipments that need attention.
- Shipment list with search, status filter and pagination.
- Create and edit shipments, or generate a tracking number.
- Add tracking events. History is append-only, nothing is edited or deleted.
- Internal notes the customer never sees.
- A change history on each shipment showing who changed what.
- Enquiries: view, resolve, reopen, delete.

## Stack

Next.js 15 (App Router) and React 19, TypeScript in strict mode, Tailwind CSS, PostgreSQL with Prisma, Zod for validation, React Hook Form, `jose` and `bcryptjs` for auth. Tests use Vitest, Testing Library and Playwright. It runs on Vercel with Supabase for the database.

It's one Next.js app for both the UI and the API, so there's only one thing to deploy.

## How it's organised

```
src/app/api        route handlers: parse, validate, call a service, respond
src/lib/services   business rules, no HTTP in here
src/lib/validation Zod schemas, shared by the forms and the server
src/lib/dto        the mappers that turn database rows into public or staff data
src/lib/auth       password hashing, sessions, requireStaff()
prisma/            schema, migrations, seed
tests/ and e2e/    Vitest and Playwright
```

The part I care most about is keeping public and staff data apart. There are two separate mappers, so internal notes and staff-only fields can't end up in a public response. Every staff endpoint also checks the session on the server, not just in the UI.

## Business rules

- The newest event decides the shipment's status and location. An event dated earlier is only added to the history, so back-filling a gap can't move the shipment backwards.
- A shipment can't be marked delivered without a delivered event, and a delivered event must be the latest one.
- Events dated in the future are rejected.
- The original ETA is saved the first time the date changes and never overwritten.
- Tracking numbers can't be changed after creation.

## Security

- Passwords are hashed with bcrypt. The session is a signed token in an `httpOnly` cookie that expires after 8 hours.
- Sign-in, tracking lookups and enquiries are rate limited.
- Zod validates every endpoint on the server. Prisma queries are parameterised.
- Security headers are set, including a Content Security Policy.

## Run it locally

You need Node 20 or newer. You don't need Docker or a Postgres install, because the project bundles a real PostgreSQL server for local use.

```bash
npm install
cp .env.example .env
```

In `.env`, set `DATABASE_URL` to `postgresql://postgres:postgres@127.0.0.1:5433/postgres` and `SESSION_SECRET` to any random string of at least 32 characters.

Start the local database and leave it running:

```bash
npm run db:local
```

In a second terminal:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Then open http://localhost:3000.

## Tests

```bash
npm run test       # Vitest: unit, service, API (real PostgreSQL) and component tests
npm run test:e2e   # Playwright: full journeys, desktop and mobile
npm run lint
npm run typecheck
```

GitHub Actions runs lint, typecheck, the Vitest tests, a production build and the Playwright suite.

## Deploying

Vercel runs the app and Supabase hosts the database. Set `DATABASE_URL` and `SESSION_SECRET` as environment variables in Vercel.

Migrations and seeding are run separately from your machine, not on deploy. The seed deletes every row first, so on a non-local database it only runs when `ALLOW_DESTRUCTIVE_SEED=yes` is set explicitly.

## Known limitations

- The rate limiter is in memory. On a serverless host each instance keeps its own counters, so it stops casual abuse but isn't a real global limit.
- Sessions can't be revoked before they expire. Signing out only clears the cookie.
- There's a single seeded staff account, with no registration or password change.
- Only enquiries can be deleted. Shipments, events and notes can't.

With more time I'd add a shared rate limiter, server-side session revocation and an automated accessibility check.
