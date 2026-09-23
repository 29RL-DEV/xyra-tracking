import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { STAFF_API_ROUTES } from "@/lib/api/staff-routes";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { GET as listShipments, POST as createShipment } from "@/app/api/staff/shipments/route";
import { GET as getShipment, PATCH as patchShipment } from "@/app/api/staff/shipments/[id]/route";
import { POST as addEvent } from "@/app/api/staff/shipments/[id]/events/route";
import { POST as addNote } from "@/app/api/staff/shipments/[id]/notes/route";
import { GET as listEnquiries } from "@/app/api/staff/enquiries/route";
import { DELETE as deleteEnquiry, PATCH as patchEnquiry } from "@/app/api/staff/enquiries/[id]/route";
import { GET as me } from "@/app/api/auth/me/route";
import { get, params, readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signOut } from "../helpers/fixtures";
import { setTestCookie } from "../setup/test-env";

/**
 * The application's principal access control.
 *
 * Every staff operation is called with no session and asserted to reject. The
 * table is also checked against the declared route list, so an endpoint added
 * later without a guard breaks this test rather than going uncovered.
 */
const CALLS = [
  {
    method: "GET",
    path: "/api/staff/shipments",
    call: () => listShipments(get("/api/staff/shipments")),
  },
  {
    method: "POST",
    path: "/api/staff/shipments",
    call: () => createShipment(send("/api/staff/shipments", "POST", {})),
  },
  {
    method: "GET",
    path: "/api/staff/shipments/:id",
    call: () => getShipment(get("/api/staff/shipments/x"), params({ id: "x" })),
  },
  {
    method: "PATCH",
    path: "/api/staff/shipments/:id",
    call: () => patchShipment(send("/api/staff/shipments/x", "PATCH", {}), params({ id: "x" })),
  },
  {
    method: "POST",
    path: "/api/staff/shipments/:id/events",
    call: () => addEvent(send("/api/staff/shipments/x/events", "POST", {}), params({ id: "x" })),
  },
  {
    method: "POST",
    path: "/api/staff/shipments/:id/notes",
    call: () => addNote(send("/api/staff/shipments/x/notes", "POST", {}), params({ id: "x" })),
  },
  {
    method: "GET",
    path: "/api/staff/enquiries",
    call: () => listEnquiries(get("/api/staff/enquiries")),
  },
  {
    method: "PATCH",
    path: "/api/staff/enquiries/:id",
    call: () => patchEnquiry(send("/api/staff/enquiries/x", "PATCH", { status: "RESOLVED" }), params({ id: "x" })),
  },
  {
    method: "DELETE",
    path: "/api/staff/enquiries/:id",
    call: () => deleteEnquiry(send("/api/staff/enquiries/x", "DELETE"), params({ id: "x" })),
  },
] as const;

const STAFF_API_DIR = path.join(process.cwd(), "src", "app", "api", "staff");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every route.ts under src/app/api/staff, found on disk rather than listed. */
function staffRouteFiles(): string[] {
  return (readdirSync(STAFF_API_DIR, { recursive: true }) as string[])
    .filter((entry) => path.basename(entry) === "route.ts")
    .map((entry) => path.join(STAFF_API_DIR, entry));
}

/** The HTTP handlers a route file exports, e.g. ["GET", "PATCH"]. */
function exportedMethods(source: string): string[] {
  return HTTP_METHODS.filter((method) =>
    new RegExp(`export\\s+(const|async\\s+function|function)\\s+${method}\\b`).test(source),
  );
}

/**
 * "METHOD /api/staff/..." for every handler on disk, in the same shape as
 * STAFF_API_ROUTES. A dynamic segment such as [id] becomes :id.
 */
function discoverStaffRoutes(): string[] {
  return staffRouteFiles()
    .flatMap((file) => {
      const relative = path
        .relative(path.join(process.cwd(), "src", "app"), path.dirname(file))
        .split(path.sep)
        .map((segment) => segment.replace(/^\[(.+)\]$/, ":$1"))
        .join("/");

      return exportedMethods(readFileSync(file, "utf8")).map(
        (method) => `${method} /${relative}`,
      );
    })
    .sort();
}

describe("staff API authorisation", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures();
    signOut();
  });

  it("covers every declared staff route", () => {
    expect(CALLS).toHaveLength(STAFF_API_ROUTES.length);

    const declared = STAFF_API_ROUTES.map((r) => `${r.method} ${r.path}`).sort();
    const covered = CALLS.map((c) => `${c.method} ${c.path}`).sort();

    expect(covered).toEqual(declared);
  });

  it("declares every handler that actually exists under /api/staff", () => {
    // The two lists above are both written by hand, so on their own they only
    // prove they agree with each other. This reads the route files from disk:
    // a new endpoint added without being declared — and therefore without a
    // rejection test above — fails here instead of shipping unchecked.
    const onDisk = discoverStaffRoutes();
    const declared = STAFF_API_ROUTES.map((r) => `${r.method} ${r.path}`).sort();

    expect(onDisk.length).toBeGreaterThan(0);
    expect(onDisk).toEqual(declared);
  });

  for (const { method, path, call } of CALLS) {
    it(`rejects ${method} ${path} without a session`, async () => {
      const response = await call();

      expect(response.status).toBe(401);

      const body = await readJson<ErrorBody>(response);
      expect(body.error.code).toBe("UNAUTHENTICATED");
      // The rejection carries no data of any kind.
      expect(body).not.toHaveProperty("shipments");
      expect(body).not.toHaveProperty("enquiries");
    });
  }

  it("rejects a token signed with the wrong secret", async () => {
    // A token whose payload looks right but whose signature does not verify.
    const valid = await signSession({ userId: "x", email: "a@b.test", name: "A" });
    const tampered = `${valid.slice(0, -4)}AAAA`;
    setTestCookie(SESSION_COOKIE, tampered);

    const response = await listShipments(get("/api/staff/shipments"));
    expect(response.status).toBe(401);
  });

  it("reports an expired session distinctly from a missing one", async () => {
    const expired = await signSession(
      { userId: "x", email: "a@b.test", name: "A" },
      -60,
    );
    setTestCookie(SESSION_COOKIE, expired);

    const response = await me(get("/api/auth/me"));
    expect(response.status).toBe(401);

    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("SESSION_EXPIRED");
  });

  it("creates nothing when an unauthenticated write is rejected", async () => {
    const before = await prisma.shipment.count();

    await createShipment(
      send("/api/staff/shipments", "POST", {
        originCity: "A",
        originCountry: "B",
        destinationCity: "C",
        destinationCountry: "D",
        estimatedDelivery: "2026-12-01",
        serviceLevel: "STANDARD",
        packageCount: 1,
      }),
    );

    expect(await prisma.shipment.count()).toBe(before);
  });
});
