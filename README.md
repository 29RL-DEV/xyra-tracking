# Shipment Tracking Dashboard

A logistics web application with two audiences: customers who want a clear answer to *"Where is
my shipment?"*, and operations staff who need a secure way to maintain shipment records and
delivery updates.

Built for the Software Developer take-home task. **All data is fictional** — invented towns,
invented references, invented enquiries. No real names, addresses or customer information appear
anywhere in this repository.

---

## Live demo

| | |
| --- | --- |
| **Live URL** | <https://xyra-tracking.vercel.app> |
| **Staff login** | `staff@demo.test` / `DemoStaff2026!` at <https://xyra-tracking.vercel.app/staff/login> |
| **Health check** | <https://xyra-tracking.vercel.app/api/health> |

The staff login is a **fictional demo account**, published on purpose because the brief asks for
reviewer credentials; the sign-in page also offers to fill it in. It is not a secret. The real
secrets — `SESSION_SECRET` and the database connection string — exist only as environment
variables in Vercel and in each developer's local `.env`, and are never committed.

### Demo tracking numbers

Each one demonstrates a different state. Try them on the public tracking page.

| Tracking number | What it shows |
| --- | --- |
| `TRK-DEMO-001` | Normal shipment in transit, with several timeline events |
| `TRK-DEMO-002` | Delivered, with a final delivered event and date |
| `TRK-DEMO-003` | Delayed, with a revised ETA shown alongside the original and an explanatory event |
| `TRK-DEMO-004` | Exception, with a clear warning and the reason |
| `TRK-DEMO-005` | Newly collected, with only one event |

The seed also creates around twenty further shipments spread across every status, so search,
filtering and pagination all have something real to show.

---

## What it does

### Public — no account needed

- Enter a tracking number and see the shipment's current state.
- Validation catches an empty or malformed entry before a request is sent.
- A shipment summary: status in plain language, route, estimated delivery, current location,
  service level, package count, weight and reference.
- A chronological timeline, newest first, with the latest update clearly marked.
- Distinct treatment for delayed, exception and delivered shipments, each explained in words.
- Submit an enquiry about a shipment without giving any personal details, and get a reference.
- Every result has a shareable URL (`/track/TRK-DEMO-001`). Tracking pages are marked `noindex`.
- A privacy notice (`/privacy`) saying what the site processes, why, and for how long.

### Staff — behind a login

- Sign in, sign out, and a session that expires after eight hours. Repeated failed sign-ins are
  throttled, without ever locking out an operator who then gets their password right.
- A shipment list — the view staff land on after signing in — with search by tracking number,
  filtering by status, and pagination.
- An operations overview (`/staff`, one click from any staff page): active, delayed or held,
  out-for-delivery and open-enquiry counts, the shipments that need attention, recent activity, and
  a per-status breakdown that links straight into the filtered list.
- Create a shipment, with a generated or supplied tracking number.
- Edit details, change status, update the current location.
- Append tracking events — history is never overwritten.
- Add internal notes that the customer never sees.
- A change history on each shipment: who created it, and who changed which field from what to
  what — through the edit form, the status control, or an event applied to the shipment.
- Review customer enquiries — open, resolved or all, a page at a time — and mark them resolved or
  reopen them. Each shows the reference its customer was given, and each shipment's page lists
  the enquiries raised against it.
- Permanently delete an enquiry, for example when the person who sent it asks.

---

## Technology

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) + React 19 | One deployable unit for the UI and the API. No second service, no CORS, one set of environment variables. |
| Language | TypeScript, `strict` | The public/staff data boundary is enforced by the type system, not by review. |
| Styling | Tailwind CSS | Design tokens (brand colour scale, type scale, shadows) live in `tailwind.config.ts`; every screen is built from the same components in `src/components/ui`. Inter and JetBrains Mono are self-hosted by `next/font` at build time, so no page makes a third-party font request. |
| Icons | lucide-react | Every status badge pairs an icon with text, so state never depends on colour. |
| Database | PostgreSQL (Supabase in production) | Genuinely persistent, and the same engine locally and deployed. |
| ORM | Prisma | Typed queries, explicit `select` lists, and a migration workflow that is reviewable in the repo. |
| Validation | Zod | One schema per endpoint, shared with the forms, enforced on the server. |
| Forms | React Hook Form | Field-level errors next to the input, with server errors mapped onto the same fields. |
| Auth | `jose` (JWT) + `bcryptjs` | A signed token in an `httpOnly` cookie. `bcryptjs` avoids a native build step on a serverless host. |
| Tests | Vitest + Testing Library, Playwright | Unit, service, API and component tests, plus end-to-end journeys in a real browser. |

Deliberately **not** used: GraphQL, WebSockets, Redis, a separate backend service, a state
management library, or a role/permission system. The brief asks for one authenticated staff role
and warns against unnecessary complexity.

---

## Architecture

```
src/
  app/
    api/                    HTTP only: parse, validate, delegate, respond
      shipments/[trackingNumber]/   public tracking
      enquiries/                    public enquiry submission
      auth/                         login, logout, session
      health/                       liveness and database check for uptime monitoring
      staff/                        everything behind requireStaff()
    (public pages)          /,  /track/[trackingNumber]  and  /privacy
    robots.ts, icon.svg     crawler rules and favicon
    staff/
      login/                outside the protected route group
      (protected)/          layout verifies the session before rendering
  lib/
    domain/                 status vocabulary, event ordering, tracking numbers
    validation/             Zod schemas, shared by client and server
    dto/                    toPublicShipment / toStaffShipment — the data boundary
    services/               business rules, testable without HTTP
    auth/                   password hashing, session signing, requireStaff
    api/                    error taxonomy, response envelope, rate limiting,
                            staff route registry
    log.ts                  structured server-side error logging
  components/
    ui/                     button, field, card, page header, alert, status badge,
                            timeline, date/time, segmented control, pagination,
                            states, toast
    public/                 tracking search, summary, timeline, enquiry form
    staff/                  shell, list, detail, forms, notes, enquiries,
                            change history
prisma/
  schema.prisma, migrations/   the data model and its committed migrations
  seed.ts                      demo data
  seed-guard.ts                refuses to seed a non-local database by accident
vercel.json                    pins server functions to London (lhr1)
```

**Three decisions worth knowing before reading the code.**

**1. The data boundary lives in `src/lib/dto`.** `PublicShipment` and `StaffShipment` are separate
declared types. The public mapper takes a narrowed input type with no `notes` member, and the
public service never selects internal notes in the first place — so a note is not filtered out of
the response, it is never in memory to leak. A test asserts the serialised public payload against
an allow-list of keys and string-searches it for seeded note text.

**2. Authentication is enforced on the server, twice.** `middleware.ts` redirects unauthenticated
page requests, and every `/api/staff/*` handler independently calls `requireStaff()` before
parsing anything. The middleware is user experience; the API guard is the control. The guard
checks the token's signature and expiry, and that the account it names still exists. A
table-driven test calls all nine staff endpoints with no session and asserts `401` for each, and
asserts the table covers every declared staff route — so an endpoint added without a guard breaks
an existing test rather than going uncovered.

**3. Tracking events are append-only by construction.** There is no update or delete route and no
update or delete function in the event service — nothing to call even from inside the codebase. A
test asserts existing events are byte-identical after a full edit-status-note sequence.

---

## Running it locally

### Prerequisites

- Node.js 20 or newer (developed on Node 22+)
- npm
- **No Docker and no PostgreSQL installation required.** The project bundles a real PostgreSQL
  server via `embedded-postgres` for local development and tests.

### 1. Install

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. For the bundled local server use `postgresql://postgres:postgres@127.0.0.1:5433/postgres` |
| `SESSION_SECRET` | Signs staff session tokens. At least 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SEED_STAFF_PASSWORD` | Password given to the seeded demo account. Defaults to `DemoStaff2026!` |

The application fails at startup with a named error if a required variable is missing, rather than
falling back to an insecure default.

### 3. Start the database

In its own terminal, and leave it running:

```bash
npm run db:local
```

This starts PostgreSQL on port 5433 with its data in `.postgres/` (gitignored).

### 4. Create the schema and seed the demo data

```bash
npm run db:migrate    # applies prisma/migrations
npm run db:seed       # idempotent: safe to run repeatedly against a local database
```

### 5. Run the application

```bash
npm run dev
```

Open <http://localhost:3000>, try `TRK-DEMO-001`, then sign in at `/staff/login`.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Generates the Prisma client and builds for production |
| `npm start` | Runs the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run test` | Vitest: unit, service, API and component tests |
| `npm run test:e2e` | Playwright end-to-end journeys |
| `npm run test:all` | Both suites |
| `npm run db:local` | Starts the bundled local PostgreSQL |
| `npm run db:migrate` | Applies migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seeds demo data |

---

## Tests

```bash
npm run test
```

The Vitest suite starts its own PostgreSQL server for the run, applies the committed migration and
tears it down afterwards. Nothing needs to be running first.

```bash
npm run test:e2e
```

Playwright drives a real browser at desktop and mobile widths. It needs the application running
against seeded data, so complete steps 3–5 above first. Install the browser once with
`npx playwright install chromium`. Before the suite starts, every route is requested once so the
development server has compiled it; no single test absorbs that cold-start cost. Some journeys add
events and notes to the demo shipments, so run `npm run db:seed` afterwards to restore the
documented demo state.

The most reliable way to run it is against a production build — `npm run build && npm run start`
in one terminal, then `npm run test:e2e` — because the development server recompiles routes on
demand (see Troubleshooting). CI does exactly that: `.github/workflows/ci.yml` runs a dependency
audit (failing on any critical advisory in a runtime dependency), lint, typecheck, the Vitest
suite and a build, then a second job seeds a fresh database, starts the production server and runs
the full Playwright suite. The mobile project runs only a small, representative subset of the
same journeys — tagged `@mobile` at the point each is defined — rather than the entire desktop
suite a second time at a different viewport; the suite's own responsive test already checks
layout at 320px, 768px and 1024px on both public and staff pages.

The suite is deliberately a small, focused one rather than an exhaustive one — the brief itself
asks for exactly that. It is sized for this one-week take-home: every behaviour the brief names is
covered once, at the layer best suited to prove it, rather than re-proven at every layer.

**What is covered**

| Area | Examples |
| --- | --- |
| Public tracking | Known, unknown and malformed tracking numbers; delayed, exception and empty-timeline shipments; event ordering with tied timestamps |
| Data leakage | Public payload asserted against a key allow-list; serialised response string-searched for seeded note text |
| Authentication | Valid and invalid sign-in; identical response for unknown email and wrong password; expired and tampered tokens; cookie hardening; logout; sign-in throttling — blocked after repeated failures, the correct password refused while blocked, no session issued, the same response for real and unknown accounts, no lockout for an operator who mistypes then succeeds, per-client isolation |
| Authorisation | All nine staff endpoints rejected without a session; the declared route list checked against the route files actually on disk, so an undeclared endpoint fails a test; a session for an account that no longer exists refused, with its cookie cleared |
| Production hardening | Health endpoint; tracking lookups rate limited per client, counting unknown and malformed numbers too; audit entries for creation, status changes, field edits and applied events, with nothing recorded for a no-op and nothing reaching the public response; a shipment's enquiries and references on its staff detail; permanent enquiry deletion; unexpected errors logged as one structured line with an id matching the response, without database messages that could quote customer text |
| Validation | Missing fields, invalid status, duplicate tracking number, unexpected fields, short messages, future-dated events |
| Business rules | Append-only history, opt-in status propagation inside one transaction, write-once original ETA, the delivered-event guard; a rejected update writes nothing at all |
| Bounded reads | Enquiries paged 20 at a time with a stable order that neither repeats nor skips rows, page validation, filter and page combined; shipment history capped at the newest 200 events and 100 notes |
| Data integrity | Identical enquiries submitted concurrently — including at the same instant — collapse into one row, guarded by the advisory lock behind `enquiryLockKey` |
| Seed safety | Refuses a non-local database without `ALLOW_DESTRUCTIVE_SEED=yes`, refuses accidental override values, refuses a missing URL, and refuses to use the published password off-localhost |
| Enquiries | Submission, validation, unknown tracking number, duplicate collapsing, rate limiting, staff listing and resolution; the Open / Resolved / All filter read from and written to the URL |
| Staff overview | Counts for every status including empty ones, only delayed and held shipments listed as needing attention, recent activity ordered by last update, no note text or staff fields in the payload, the open-enquiry count |
| Frontend | Status badges readable without colour, timeline ordering and empty state, the full search flow, enquiry validation and confirmation, form labelling and error association, redirect to sign-in when a session runs out |
| Caching | Every API response, public and staff, carries `Cache-Control: no-store, private` |
| End to end | The customer and staff journeys the brief asks to see; an event added by staff reflected on the public page; Back after sign-out not restoring a protected page; enquiry markup shown as text rather than executed |
| Security headers | CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` on one page route and one API route, checked on real HTTP responses; the staff area confirmed not framable; no framework banner |
| Accessibility and layout | No horizontal overflow at 320px, 768px and 1024px on public and staff pages; keyboard-only sign-in and search; visible focus on the first few tab stops; focus moved to the result after a lookup; no console errors or hydration warnings on load |

### Troubleshooting

- **A test run was interrupted with Ctrl+C.** The test database is started and stopped with
  `pg_ctl`, so a normal run leaves nothing behind. A run killed part-way through can leave its server
  running; the next run uses a fresh data directory and still works, and the stray server can be
  stopped with `taskkill /IM postgres.exe /F` on Windows or `pkill postgres` elsewhere.
- **`npm run build` fails with `EPERM ... query_engine-windows.dll.node` on Windows.** The
  development server holds the Prisma engine open. Stop `npm run dev` first.
- **Every request fails after restarting the local database.** The development server caches a
  Prisma client bound to the old instance. Restart `npm run dev` as well.
- **End-to-end tests time out waiting for a page that looks half-loaded.** The development server
  keeps only a few routes compiled and recompiles the rest on demand, which can take longer than a
  test waits on a slower machine. Run the suite against a production build instead — stop
  `npm run dev`, then `npm run build && npm run start`; Playwright reuses the server on port 3000.

---

## API

All responses share one error envelope:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Check the highlighted fields.",
             "fields": { "destinationCity": "Destination city is required" } } }
```

`fields` appears only for validation failures. `message` is always safe to show a user — stack
traces, database errors and environment values never reach a client.

### Public

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/shipments/:trackingNumber` | Case-insensitive. `404` when unknown, `400` when malformed. Never returns internal notes, the change history, enquiries or the internal id. `429` after 30 lookups a minute from one client — a budget shared with the `/track` pages. |
| `POST` | `/api/enquiries` | `{ trackingNumber, category, message }`. Returns a receipt only. Rate limited. |
| `GET` | `/api/health` | `200 { status: "ok", database: "ok" }`, or `503` when the database does not answer. For uptime monitoring. |

### Authentication

| Method | Route | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sets an `httpOnly` session cookie. One generic `401` for both wrong password and unknown email. `429` `TOO_MANY_ATTEMPTS` after repeated failures (see Security notes). |
| `POST` | `/api/auth/logout` | `204`. Idempotent. |
| `GET` | `/api/auth/me` | Current staff identity, or `401`. |

### Staff — all require a session

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/staff/shipments` | `?q=` partial tracking number, `?status=`, `?page=` |
| `POST` | `/api/staff/shipments` | `409` on a duplicate tracking number |
| `GET` | `/api/staff/shipments/:id` | Shipment, its newest 200 events and 100 internal notes, and its newest 20 enquiries and 20 change-history entries |
| `PATCH` | `/api/staff/shipments/:id` | Partial update. `400` if the tracking number is supplied. `422` for delivered without a delivered event. |
| `POST` | `/api/staff/shipments/:id/events` | `updateShipment: true` also applies the status and location |
| `POST` | `/api/staff/shipments/:id/notes` | Author taken from the session |
| `GET` | `/api/staff/enquiries` | `?status=OPEN\|RESOLVED`, `?page=`. Returns `{ enquiries, total, page, pageSize }`, 20 per page, newest first. |
| `PATCH` | `/api/staff/enquiries/:id` | Resolve or reopen |
| `DELETE` | `/api/staff/enquiries/:id` | Permanent deletion, e.g. on request. `204`, or `404` if already gone. |

Status codes: `200` read/update · `201` created · `204` no content · `400` validation ·
`401` no or invalid session · `404` not found · `409` uniqueness conflict · `422` business rule ·
`429` rate limited · `500` unexpected, with a safe body and an `X-Error-Id` header matching the
server log entry · `503` health check failing.

### Try it with curl

```bash
curl http://localhost:3000/api/shipments/TRK-DEMO-001

curl -i -X POST http://localhost:3000/api/staff/shipments \
  -H 'Content-Type: application/json' -d '{}'          # 401, no session

curl -c jar.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"staff@demo.test","password":"DemoStaff2026!"}'

curl -b jar.txt 'http://localhost:3000/api/staff/shipments?status=DELAYED'
```

---

## Deployment

Live at **<https://xyra-tracking.vercel.app>**. **Vercel** runs the application and **Supabase**
hosts PostgreSQL in London (`eu-west-2`). `vercel.json` pins the server functions to London
(`lhr1`), so each database query stays in one region; the middleware still runs at Vercel's edge.
Vercel deploys `main` on every push.

### Setting it up from scratch

1. **Create a Supabase project**, then open **Project Settings → Database → Connection string**.
   Supabase gives two connection strings for the same database: a **pooled** one, routed through
   Supavisor (host contains `pooler.supabase.com`, port `6543`), and a **direct** one (host starts
   with `db.`, port `5432`). The running application uses the pooled string; migrations and the
   seed use the direct one.
2. **Import the repository into Vercel.** The framework is detected automatically; the build
   command already runs `prisma generate`, and `postinstall` runs it after `npm ci`. The function
   region comes from `vercel.json`.
3. **Set the environment variables** in Vercel (Production and Preview):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The Supabase **pooled** connection string |
   | `SESSION_SECRET` | A fresh 32+ character random string — not the local one |

   Neither `SEED_STAFF_PASSWORD` nor `ALLOW_DESTRUCTIVE_SEED` belongs in Vercel: seeding runs from
   your machine, never on deploy.

4. **Apply the schema** from your machine, using the **direct** string. Prisma Migrate takes an
   advisory lock for the duration of a migration, which a transaction-mode pooler cannot hold:

   ```bash
   DATABASE_URL="<supabase-direct-connection-string>" npx prisma migrate deploy
   ```

5. **Seed the demo data**, once, also with the **direct** string:

   ```bash
   DATABASE_URL="<supabase-direct-connection-string>" \
   ALLOW_DESTRUCTIVE_SEED=yes \
   SEED_STAFF_PASSWORD="DemoStaff2026!" \
   npm run db:seed
   ```

   Seeding deletes every row before writing, so against anything other than `localhost` it
   **refuses to run** unless `ALLOW_DESTRUCTIVE_SEED=yes` is set for that one command. It also
   refuses to fall back to the published demo password on a non-local database: the password must
   be supplied. Here the documented demo password is supplied deliberately, because the brief asks
   for working reviewer credentials in this README; sign-in throttling protects it. The deletes run
   in one transaction, so a failure leaves the database as it was.

6. **Verify in a private browser window**: open the live URL, try every tracking number in the
   table above, sign in with the documented credentials, and check `/api/health` returns `200`.

### Releasing a change that includes a migration

Migrations are reviewed and applied by hand, **before** the code that needs them is pushed —
otherwise the new code would briefly run against the old schema:

1. Read the new `prisma/migrations/<name>/migration.sql`.
2. Apply it with the **direct** string, as in step 4 above.
3. Push to `main`.

`20260922234102_shipment_audit_trail` is the only migration after the initial one. It adds the
change-history table, and changes the internal-note author key from `CASCADE` to `RESTRICT`, so
removing a staff account can no longer delete the notes they wrote. It only adds; no existing row
changes.

### Monitoring

- **Uptime.** `GET /api/health` returns `200` when the application is serving and the database
  answers, and `503` when it does not. Point any external uptime monitor at it — for example a free
  HTTP check every five minutes that alerts on anything other than `200`. The repository cannot
  create that monitor itself; it needs an account with a monitoring service.
- **Errors.** An unexpected server error is written to Vercel's runtime logs as one JSON line —
  event name, an `errorId`, the method and path, and the error's class and stack — and the same
  `errorId` is returned to the caller in an `X-Error-Id` header. Database error messages are left
  out of the log, because they can quote the text of a customer's enquiry. Nothing is sent to a
  third-party error-tracking service.

### Connection pooling

Supabase's pooler (Supavisor) defaults to transaction mode. No extra connection parameters are set,
and the deployed application serves correctly through the pooled string. If requests ever fail
with *prepared statement … already exists*, append `?pgbouncer=true&connection_limit=1` to the
**pooled** `DATABASE_URL` only. The one advisory lock the application itself takes (enquiry
de-duplication) is transaction-scoped, so it is released at commit and is safe behind a
transaction-mode pooler.

In production the session cookie is marked `secure`, `Strict-Transport-Security` is sent, and the
development-only relaxations in the Content Security Policy are absent.

---

## Assumptions and product decisions

Where the brief left room, these are the choices made and why. Each is enforced in code and
covered by a test.

**Adding an event does not change the shipment by default.** The add-event form carries an
explicit checkbox to also apply the event's status and location. Automatic propagation would mean
that back-filling a missed historical event silently drags the shipment's present state backwards
— an operator correcting yesterday's record would undo today's. Opt-in keeps the common case one
click away and makes the destructive case impossible to trigger by accident. When the box is
ticked, the event insert and the shipment update share one transaction.

**Future-dated events are rejected**, with five minutes of tolerance for clock skew. An event
asserts something that has already happened; a future-dated one would sort above genuine updates
and mislead the customer.

**A shipment cannot be marked delivered without a delivered event.** The brief requires delivered
shipments to have a believable delivered event, so the inconsistent state is made unreachable
rather than merely discouraged. The API returns `422` and the UI explains what is missing.

**The original estimated delivery date is captured once**, the first time the ETA changes, and
never overwritten. The customer keeps seeing the original promise rather than the previous
revision.

**Tracking numbers are immutable after creation.** They are the customer's public handle and may
be printed on a label. Changing one would silently break every reference a customer holds.

**Generated tracking numbers exclude `0`, `1`, `I`, `L`, `O` and `U`.** Tracking numbers get read
aloud and retyped, and those collisions are a real support cost.

**Public routes address a shipment by tracking number; staff routes use an internal id.** Staff
need a stable handle; customers only ever hold the tracking number, and publishing an internal id
invites enumeration. The asymmetry is deliberate.

**Delayed and Exception are statuses, not flags.** The brief presents all seven values in one
status set, so `status` is a single field. The cost is that a delayed shipment no longer advertises
where it was in the journey — that context is carried by the timeline, which is where the brief
asks for the explanation anyway.

**An enquiry must name a real tracking number.** The staff view is required to show the related
shipment, and an enquiry pointing at nothing gives staff no way to act. Unknown numbers are
rejected with a message beside the field.

**The enquiry form collects no personal information.** No name, email or phone field exists, and
the form says so. The consequence — staff cannot reply directly — is accepted, since email and SMS
are explicitly out of scope.

**Event type reuses the shipment status vocabulary** rather than introducing a second taxonomy
that would need mapping rules.

**Generated tracking numbers keep the six-character `TRK-XXXXXX` format** the specification fixes.
They are drawn from the platform's cryptographic random source (Web Crypto, which also works in the
browser bundle that imports the format rules), so they cannot be predicted from earlier ones, and
lookups are rate limited so the space cannot be worked through quickly.

**The customer reference is public.** The brief and specification list it among the fields the
customer sees, and its values are fictional; it stays in the public response.

**The change history covers the shipment's own fields.** Creation, field edits, status changes and
events applied to the shipment are recorded with who made them and each field's old and new value.
Tracking events and internal notes already carry their authors, so they are not duplicated.

**Enquiry deletion is permanent and needs a second click.** It is the erasure mechanism for the
only customer-written data the application stores. Resolving, not deleting, remains the normal way
to close an enquiry.

---

## Known limitations

Honest about what is not there.

- **No staff account management.** One seeded account. No registration, no password change, no
  second role — the brief asks for one authenticated role and each extra path is more surface to
  secure for no assessed benefit.
- **Only enquiries can be deleted.** No shipment, event or note delete exists anywhere. For events
  that is the point; for the others it simply was not required. Enquiries can be, because they are
  the only customer-written data the application stores.
- **No automatic retention job.** Enquiries stay until staff delete them or the demo database is
  re-seeded; nothing deletes old ones on a schedule. The privacy notice says exactly this.
- **The rate limiter is in-memory.** It throttles tracking lookups, sign-in and enquiry
  submission, but on a serverless host each warm instance keeps its own counters, so the effective
  limit is a multiple of the configured one. It stops casual abuse and raises the cost of guessing
  passwords or tracking numbers substantially; it is not the global control a shared store (Redis,
  or a database table) would provide, which would be more infrastructure than this brief calls for.
- **Rate limiting keys on `x-forwarded-for`**, which a caller can set. On Vercel the platform sets
  it; elsewhere, a client could rotate the value to reset its own counters.
- **Sessions cannot be revoked early.** A session is a signed token valid for eight hours. Signing
  out removes it from the browser, but a copy captured before sign-out would stay valid until it
  expires. (A session whose account no longer exists is refused by the staff API.) A server-side
  session store or token denylist would close that gap; with one shared demo account, a
  "sign out everywhere" would also sign out every other reviewer.
- **A session that runs out mid-task returns the person to sign-in, then to the shipment list**
  rather than the page they were on, and anything unsaved on that page is not kept.
- **The Content Security Policy allows inline scripts and styles.** Next.js inlines its hydration
  payload, so a strict policy would need a per-request nonce. The policy still blocks third-party
  script and connection origins, plugins, `<base>` hijacking, cross-origin form posts and all
  framing; defence against an injected inline script rests on React escaping every rendered value,
  with no `dangerouslySetInnerHTML` anywhere.
- **History on one page is capped.** The public page and staff detail read a shipment's newest 200
  events; staff see its newest 100 internal notes, 20 enquiries and 20 change-history entries.
  Nothing is deleted; older entries are simply not loaded. No demo shipment comes close.
- **The change history is not tamper-proof.** It is append-only in the application — there is no
  update or delete path — but it is an ordinary table, not a signed or external log. Seeded
  shipments start with an empty history, because the seed writes rows directly.
- **No real-time updates.** The customer sees a change on their next request; there is no push.
- **No map.** Current location is text, which the brief states is sufficient.
- **No uptime monitor is configured by the repository.** `/api/health` is ready for one; creating
  the monitor needs an account with a monitoring service. Errors go to Vercel's runtime logs, not
  to an error-tracking service.
- **Timestamps render in the viewer's timezone.** Clear for a customer, but two people in
  different timezones see different wall-clock times for the same event. The server renders them
  in UTC so its markup never depends on the host's timezone, and the browser switches to local time
  once the page is interactive — so the first paint can briefly show UTC.
- **Pagination is offset-based**, which is fine at this scale and would need revisiting at a much
  larger one.
- **Value rules live in the API, not the database.** Uniqueness, the status enum and foreign keys
  are database constraints; ranges such as "at least one package" or "positive weight" are enforced
  by the Zod schemas on the only write path. A `CHECK` constraint per rule would be defence in depth.
- **The accessibility checks are targeted, not exhaustive.** The suite measures the contrast of the
  states most likely to fail (placeholder and busy-button text), checks labelling, headings,
  keyboard use and 320px layouts. A full automated audit such as axe is not included.
- **Dependency audit findings.** `npm audit` reports high-severity advisories in PostCSS as bundled
  inside Next.js and in a Prisma CLI dependency. Both are build-time tools that only ever process
  this repository's own files; clearing them needs a major Next.js upgrade, which is not worth the
  risk for this submission. CI fails on any critical advisory.

### With more time

1. Shared-store rate limiting, a nonce-based Content Security Policy, server-side session
   revocation, and CSRF defence in depth on the staff mutations (the `sameSite=lax` cookie covers
   the realistic cases today).
2. A scheduled job deleting resolved enquiries after a fixed retention period.
3. A full automated accessibility audit (axe) in the Playwright run.
4. Database `CHECK` constraints mirroring the API's value rules.

---

## Security notes

- Passwords are stored only as bcrypt hashes (cost 10). No response, log or view ever contains a
  hash, and a test asserts it.
- The session is a signed JWT in an `httpOnly`, `sameSite=lax` cookie, marked `secure` in
  production, expiring after eight hours. Expiry is verified server-side on every request. If it
  runs out mid-task, the next staff request returns the person to sign-in with an explanation.
- Signing out performs a full page load, which discards the client-side router cache, so the Back
  button cannot restore a protected page from memory.
- Every API response carries `Cache-Control: no-store, private`, so no shared cache can store an
  authenticated response and a staff change reaches the customer on their next request.
- Customer-supplied text is always rendered as text. Nothing in the application uses
  `dangerouslySetInnerHTML`, and a test submits markup through the enquiry form and asserts staff see
  it literally.
- Every staff API operation calls one shared `requireStaff()` guard before touching anything.
  A test reads the route files from disk and fails if an endpoint exists that is not declared and
  tested, or if any handler in a staff route file skips the guard.
- Failed sign-ins are throttled: five per account per client address and fifteen per client
  address, per fifteen minutes. Only failures count and a success clears both counters, so an
  operator who mistypes is never locked out. The block is checked before any password comparison,
  and its message is identical for real and unknown accounts. The counters are in-memory — see
  Known limitations.
- Responses carry a Content Security Policy, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy` and a restrictive
  `Permissions-Policy`; production adds HSTS. What the CSP does and does not stop is described
  under Known limitations.
- The seed refuses to run against a non-local database unless `ALLOW_DESTRUCTIVE_SEED=yes` is set,
  and never falls back to the published demo password there.
- All input is validated server-side with Zod. Unknown keys are rejected rather than ignored, so
  no unexpected field reaches the ORM.
- All database access is parameterised through Prisma. No SQL is built by string concatenation.
- Unexpected errors are logged on the server as one structured line with an `errorId`, and
  reported to the client as a generic `500` carrying the same id in `X-Error-Id`. Database error
  messages are kept out of the log, because they can quote customer-written enquiry text.
- Public tracking lookups are rate limited per client — 30 a minute, shared between the API and
  the `/track` pages so neither is a way round the other.
- The staff API refuses a session whose account no longer exists and clears its cookie, so a
  session issued before the database was re-seeded ends cleanly instead of failing mid-write.
- Generated tracking numbers come from a cryptographically secure random source.
- Secrets come from environment variables. `.env` is gitignored; `.env.example` documents the
  variable names with placeholder values only.
- The demo credentials are task-specific and non-sensitive.

---

## Privacy and cookies

`/privacy` describes, in plain language, what the site processes: tracking lookups (not stored),
enquiries (tracking number, category and message), IP addresses (held in memory only, for rate
limiting), hosting request logs, and staff accounts. Public pages set no cookies; staff sign-in
sets one strictly necessary session cookie. There are no analytics, advertising or tracking
cookies, so there is no cookie banner. Crawlers are kept out of the staff area and the API by
`robots.txt`, and tracking and staff pages carry `noindex`.

---
