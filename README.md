# Shipment Tracking Dashboard

A small logistics app with two sides. Customers type in a tracking number and see where their shipment is. Staff sign in to create shipments, add tracking events, leave internal notes and deal with customer enquiries.

I built it for a take-home task. All the data is made up.

**Live:** https://xyra-tracking.vercel.app

## Try it

Staff login at `/staff/login`, with either of two demo accounts (same password): `staff@demo.test` or `staff2@demo.test`, password `DemoStaff2026!`. The second one is there so you can see the change history attribute edits to different people. The login page has a "Use this" button that fills in the form. These are fictional accounts, published on purpose so reviewers can get in. The real secrets are only in environment variables.

Demo tracking numbers, one per state:

| Number | State |
| --- | --- |
| `TRK-DEMO-001` | In transit |
| `TRK-DEMO-002` | Delivered |
| `TRK-DEMO-003` | Delayed (shows the original and revised ETA) |
| `TRK-DEMO-004` | Exception (address problem) |
| `TRK-DEMO-005` | Just collected |

The seed also adds about twenty more shipments (TRK-DEMO-006 onwards) so search, filters and pagination have something to work with.

## What it does

**Customers (no account)**
- Look up a shipment: status, route, ETA, current location and a timeline with the newest event first.
- Empty or badly formatted numbers are caught before any request is sent. An unknown number shows a "not found" message and the page returns a 404.
- Send an enquiry about a shipment. It asks for no personal details, so staff can't reply directly (email and SMS were out of scope).
- Every result has its own URL, like `/track/TRK-DEMO-001`.

**Staff (login)**
- Overview page with counts and the shipments that need attention.
- Shipment list with search, status filter and pagination.
- Create and edit shipments. Each new shipment gets a random tracking number (TRK- plus 16 characters, 80 bits from a secure random source), so no number can be worked out from another.
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

One thing I paid particular attention to is keeping public and staff data separate. There are two separate mappers, so internal notes and staff-only fields can't end up in a public response. Every staff endpoint also checks the session on the server, not just in the UI.

## Business rules

- Status changes only through tracking events. The newest event sets the shipment's status and location; there is no separate status control, and the API rejects a status sent with a shipment edit.
- Shipments move through the defined lifecycle: Created → Collected → In transit → Out for delivery → Delivered. Events can also record Delayed or Exception states without skipping the normal lifecycle.
- Earlier-dated events can be added to history but cannot move the shipment backwards. The whole history is checked with the new event in place, not just its neighbours, so a back-dated event can't leave a later one out of sequence either. Invalid transitions are rejected by the server with 422.
- Delivered is final, and a shipment cannot be marked Delivered without a matching latest Delivered event.
- Customer messages are optional for normal events and required for Delayed and Exception events. Future-dated events are rejected. A time up to five minutes ahead is treated as clock skew and recorded as now, so it can't hold up the next event.
- Every write to a shipment locks its row first, so two events sent at the same moment are checked one after the other and can't both get past the rules.
- Creating a shipment accepts an `Idempotency-Key` header: a retry with the same key returns the shipment already created instead of making a second one. The staff form sends one automatically.
- The original ETA is preserved when it changes, and tracking numbers cannot be changed after creation.

## Security

- Passwords are hashed with bcrypt. The session is a signed token in an `httpOnly` cookie that expires after 8 hours, and each sign-in is also recorded in the database. Signing out ends that session on the server, so a copied token stops working, while other people signed in to the same account stay signed in. If the staff account behind a session is deleted, the API and the staff pages both refuse it.
- Sign-in, tracking lookups and enquiries are rate limited.
- Zod validates every endpoint on the server. Endpoints that take a body only accept `Content-Type: application/json`. Prisma queries are parameterised.
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

Migrations and seeding are run separately from your machine, not on deploy. Apply migrations before deploying a version that uses them, since the app doesn't migrate on start. The seed deletes every row first, so on a non-local database it only runs when `ALLOW_DESTRUCTIVE_SEED=yes` is set explicitly.

## Known limitations

- The limits on tracking lookups and sign-in are kept in memory. On a serverless host each instance keeps its own counters, so they stop casual abuse but aren't a real global limit. Enquiries, the only public write, are limited in PostgreSQL instead: per address, per tracking number and overall, shared by every instance.
- Staff accounts are only created by the seed (two, with the same single role). There's no registration or password change.
- Staff can't reply to an enquiry from the app. It collects no contact details, as the brief asks, so there is nowhere to send an answer. Staff mark an enquiry resolved or reopen it, and leave an internal note on the shipment.
- Only enquiries can be deleted. Shipments, events and notes can't.
- Weight and package count are only capped at what the database columns hold, and the estimated delivery date isn't checked against today, since an overdue shipment keeps its date. The brief sets no business limits for these, so I didn't make any up.
- Current location can be edited directly, even after delivery, because the brief lists it as an editable detail. A later tracking event, if there is one, replaces it.
- The demo shipments keep their sequential TRK-DEMO- numbers so the links in this README keep working, which means those can be guessed. Every shipment created in the app gets a random number.

With more time I'd move the lookup and sign-in limits to the database too, add an automated accessibility check, and build a way for staff to answer an enquiry, for example a reply shown on the tracking page next to the customer's reference.
