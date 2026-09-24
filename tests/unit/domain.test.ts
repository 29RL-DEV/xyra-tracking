import { describe, expect, it } from "vitest";
import {
  latestEvent,
  orderEventsNewestFirst,
} from "@/lib/domain/ordering";
import {
  isValidTrackingNumber,
  nextTrackingNumber,
  normaliseTrackingNumber,
} from "@/lib/domain/tracking-number";
import {
  formatDate,
  formatDateTime,
  formatRelative,
  toDateOnlyString,
} from "@/lib/format/date";
import {
  ATTENTION_STATUSES,
  isAttentionStatus,
  SHIPMENT_STATUSES,
} from "@/lib/domain/status";

describe("event ordering", () => {
  const base = new Date("2026-09-20T10:00:00Z");

  it("orders newest first by occurredAt", () => {
    const events = [
      { id: "a", occurredAt: new Date("2026-09-18T10:00:00Z"), createdAt: base },
      { id: "b", occurredAt: new Date("2026-09-20T10:00:00Z"), createdAt: base },
      { id: "c", occurredAt: new Date("2026-09-19T10:00:00Z"), createdAt: base },
    ];

    expect(orderEventsNewestFirst(events).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties deterministically when occurredAt is identical", () => {
    const sameMoment = new Date("2026-09-20T10:00:00Z");
    const events = [
      { id: "a", occurredAt: sameMoment, createdAt: new Date("2026-09-20T10:00:01Z") },
      { id: "b", occurredAt: sameMoment, createdAt: new Date("2026-09-20T10:00:02Z") },
      { id: "c", occurredAt: sameMoment, createdAt: new Date("2026-09-20T10:00:03Z") },
    ];

    const first = orderEventsNewestFirst(events).map((e) => e.id);
    const second = orderEventsNewestFirst([...events].reverse()).map((e) => e.id);

    expect(first).toEqual(["c", "b", "a"]);
    // Same input set, different insertion order, same result.
    expect(second).toEqual(first);
  });

  it("latestEvent returns the first ordered element, or null when empty", () => {
    const events = [
      { id: "a", occurredAt: new Date("2026-09-18T10:00:00Z"), createdAt: base },
      { id: "b", occurredAt: new Date("2026-09-20T10:00:00Z"), createdAt: base },
    ];

    expect(latestEvent(events)?.id).toBe("b");
    expect(latestEvent([])).toBeNull();
  });
});

describe("tracking numbers", () => {
  it("accepts the documented format", () => {
    expect(isValidTrackingNumber("TRK-DEMO-001")).toBe(true);
    expect(isValidTrackingNumber("trk-demo-001")).toBe(true);
    expect(isValidTrackingNumber("ABC123")).toBe(true);
  });

  it("rejects values that are too short, too long or wrongly shaped", () => {
    expect(isValidTrackingNumber("AB12")).toBe(false);
    expect(isValidTrackingNumber("hello world")).toBe(false);
    expect(isValidTrackingNumber("TRK_DEMO_001")).toBe(false);
    expect(isValidTrackingNumber("A".repeat(41))).toBe(false);
  });

  it("normalises case and surrounding whitespace", () => {
    expect(normaliseTrackingNumber("  trk-demo-001 ")).toBe("TRK-DEMO-001");
  });

  it("gives a new shipment the number after the highest one issued", () => {
    expect(nextTrackingNumber([])).toBe("TRK-DEMO-001");
    expect(nextTrackingNumber(["TRK-DEMO-001", "TRK-DEMO-022", "TRK-DEMO-008"])).toBe(
      "TRK-DEMO-023",
    );
    // Numbers in another format do not affect the sequence.
    expect(nextTrackingNumber(["TRK-DEMO-005", "TRK-4KP2M9", "TRK-TEST-900"])).toBe(
      "TRK-DEMO-006",
    );
    expect(isValidTrackingNumber(nextTrackingNumber(["TRK-DEMO-999"]))).toBe(true);
  });
});

describe("date formatting", () => {
  it("renders a calendar date without a timezone shift", () => {
    expect(toDateOnlyString(new Date("2026-09-24T00:00:00Z"))).toBe("2026-09-24");
    // The month abbreviation varies between ICU versions ("Sep" / "Sept"), so
    // the assertion checks the parts that matter rather than the exact string.
    expect(formatDate("2026-09-24")).toMatch(/^24 Sept? 2026$/);
  });

  it("renders a timestamp with an explicit timezone and never a raw ISO string", () => {
    const rendered = formatDateTime("2026-09-21T14:03:00Z");

    expect(rendered).toMatch(/21 Sept? 2026/);
    expect(rendered).toMatch(/GMT/);
    expect(rendered).not.toContain("T14:03");
  });
});

describe("relative times", () => {
  // Built from local date parts, so the calendar-day rule is checked in
  // whatever timezone the suite runs in.
  const now = new Date(2026, 8, 23, 22, 0);

  it("gives every time on one date the same phrase", () => {
    // 54 and 62 hours ago: rounding hours would call these 2 and 3 days.
    expect(formatRelative(new Date(2026, 8, 21, 16, 0), now)).toBe("2 days ago");
    expect(formatRelative(new Date(2026, 8, 21, 8, 0), now)).toBe("2 days ago");
  });

  it("calls the previous date yesterday, however few hours ago it was", () => {
    expect(formatRelative(new Date(2026, 8, 22, 21, 0), now)).toBe("yesterday");
    expect(formatRelative(new Date(2026, 8, 22, 1, 0), now)).toBe("yesterday");
  });

  it("counts hours and minutes within the same day", () => {
    expect(formatRelative(new Date(2026, 8, 23, 19, 0), now)).toBe("3 hours ago");
    expect(formatRelative(new Date(2026, 8, 23, 21, 45), now)).toBe("15 minutes ago");
    expect(formatRelative(new Date(2026, 8, 23, 21, 59, 50), now)).toBe("just now");
  });

  it("counts minutes across midnight rather than jumping to yesterday", () => {
    const justAfterMidnight = new Date(2026, 8, 24, 0, 10);
    expect(formatRelative(new Date(2026, 8, 23, 23, 40), justAfterMidnight)).toBe(
      "30 minutes ago",
    );
  });
});

describe("server-safe timestamps", () => {
  it("formats an instant identically wherever it runs when a timezone is given", () => {
    // The server renders with "UTC" so its markup cannot depend on the host's
    // timezone; the browser then switches to local time after hydrating.
    const rendered = formatDateTime("2026-09-21T14:03:00Z", "UTC");

    expect(rendered).toMatch(/21 Sept? 2026, 14:03/);
    expect(rendered).toMatch(/GMT|UTC/);
  });
});

describe("statuses that need attention", () => {
  it("defines the attention queue once, and every status agrees with it", () => {
    expect([...ATTENTION_STATUSES].sort()).toEqual(["DELAYED", "EXCEPTION"]);

    for (const status of SHIPMENT_STATUSES) {
      expect(isAttentionStatus(status), status).toBe(ATTENTION_STATUSES.includes(status));
    }
  });
});
