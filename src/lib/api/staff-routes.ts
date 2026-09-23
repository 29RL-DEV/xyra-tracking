/**
 * Every staff-only API operation, in one list.
 *
 * The authorisation test asserts a 401 for each entry, and also reads the
 * route files under src/app/api/staff from disk and requires this list to
 * match them exactly. A new endpoint therefore fails a test until it is
 * declared here — at which point it must also be given a rejection test.
 */
export const STAFF_API_ROUTES = [
  { method: "GET", path: "/api/staff/shipments" },
  { method: "POST", path: "/api/staff/shipments" },
  { method: "GET", path: "/api/staff/shipments/:id" },
  { method: "PATCH", path: "/api/staff/shipments/:id" },
  { method: "POST", path: "/api/staff/shipments/:id/events" },
  { method: "POST", path: "/api/staff/shipments/:id/notes" },
  { method: "GET", path: "/api/staff/enquiries" },
  { method: "PATCH", path: "/api/staff/enquiries/:id" },
  { method: "DELETE", path: "/api/staff/enquiries/:id" },
] as const;

export type StaffApiRoute = (typeof STAFF_API_ROUTES)[number];
