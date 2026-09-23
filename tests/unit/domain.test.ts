import { describe, expect, it } from "vitest";
import {
  latestEvent,
  orderEventsNewestFirst,
} from "@/lib/domain/ordering";
import {
  generateTrackingNumber,
  isValidTrackingNumber,
  normaliseTrackingNumber,
  TRACKING_NUMBER_PATTERN,
} from "@/lib/domain/tracking-number";
import { formatDate, formatDateTime, toDateOnlyString } from "@/lib/format/date";
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

  it("generates valid, unambiguous tracking numbers", () => {
    // 0/O, 1/I, L and U are excluded on purpose: they get misread aloud.
    for (let i = 0; i < 200; i += 1) {
      const generated = generateTrackingNumber();
      expect(generated).toMatch(/^TRK-[A-Z0-9]{6}$/);
      expect(TRACKING_NUMBER_PATTERN.test(generated)).toBe(true);
      expect(generated.slice(4)).not.toMatch(/[01ILOU]/);
    }
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
