import { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as submitEnquiry } from "@/app/api/enquiries/route";
import { prisma } from "@/lib/db";
import {
  countSharedHit,
  ENQUIRY_CLIENT_LIMIT,
  ENQUIRY_GLOBAL_KEY,
  ENQUIRY_GLOBAL_LIMIT,
  ENQUIRY_TRACKING_NUMBER_LIMIT,
  enquiryClientKey,
} from "@/lib/services/shared-rate-limit";
import { readJson, send, type ErrorBody } from "../helpers/request";
import { resetDatabase, seedFixtures, signOut } from "../helpers/fixtures";

let sequence = 0;

/**
 * One submission from one client address. Every message is different, so no
 * request is collapsed into another as a duplicate.
 */
function submit(address: string, trackingNumber = "TRK-TEST-001") {
  sequence += 1;

  return submitEnquiry(
    send(
      "/api/enquiries",
      "POST",
      {
        trackingNumber,
        category: "OTHER",
        message: `Rate limit check number ${sequence}, please ignore.`,
      },
      { "x-forwarded-for": address },
    ),
  );
}

function countStatuses(responses: Response[]): Record<number, number> {
  const counts: Record<number, number> = {};

  for (const response of responses) {
    counts[response.status] = (counts[response.status] ?? 0) + 1;
  }

  return counts;
}

/**
 * The windows are fixed and follow the database clock, so a burst sent in the
 * last moments of one could be split across two and let more through. In that
 * rare case the test waits for the next window to begin rather than flaking.
 */
async function clearOfWindowEdge(windowSeconds: number): Promise<void> {
  const [row] = await prisma.$queryRaw<Array<{ remaining: number }>>`
    SELECT (
      ${windowSeconds}::integer
        - mod(extract(epoch FROM clock_timestamp())::numeric, ${windowSeconds}::integer)
    )::float8 AS "remaining"
  `;
  const remaining = row?.remaining ?? 0;

  if (remaining < 5) {
    await new Promise((resolve) => setTimeout(resolve, remaining * 1000 + 250));
  }
}

describe("shared enquiry rate limits", () => {
  beforeEach(async () => {
    // Clears the counters as well as the enquiries.
    await resetDatabase();
    await seedFixtures();
    signOut();
  });

  it("accepts exactly ten of thirty simultaneous submissions from one address", async () => {
    await clearOfWindowEdge(ENQUIRY_CLIENT_LIMIT.windowSeconds);
    const before = await prisma.enquiry.count();

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => submit("203.0.113.7")),
    );

    expect(countStatuses(responses)).toEqual({ 201: 10, 429: 20 });

    const limited = responses.find((response) => response.status === 429)!;
    expect((await readJson<ErrorBody>(limited)).error.code).toBe("RATE_LIMITED");
    expect(await prisma.enquiry.count()).toBe(before + 10);
  });

  it("limits each tracking number, and all enquiries together, whatever address they come from", async () => {
    await clearOfWindowEdge(ENQUIRY_TRACKING_NUMBER_LIMIT.windowSeconds);

    // One submission from each of 21 addresses about one shipment, its number
    // written two ways that normalise to the same thing.
    const known = await Promise.all(
      Array.from({ length: 21 }, (_, i) =>
        submit(`198.51.100.${i}`, i % 2 === 0 ? "TRK-TEST-001" : " trk-test-001 "),
      ),
    );
    expect(countStatuses(known)).toEqual({ 201: 20, 429: 1 });

    // A number no shipment has is counted and turned away in exactly the same
    // way, so the limit cannot be used to find out which numbers exist.
    const unknown = await Promise.all(
      Array.from({ length: 21 }, (_, i) => submit(`198.51.100.${100 + i}`, "TRK-NOPE-999")),
    );
    expect(countStatuses(unknown)).toEqual({ 404: 20, 429: 1 });
    expect(
      await readJson<ErrorBody>(unknown.find((response) => response.status === 429)!),
    ).toEqual(
      await readJson<ErrorBody>(known.find((response) => response.status === 429)!),
    );

    // Bring the count across all enquiries to one short of the ceiling rather
    // than sending hundreds of requests to get there.
    await prisma.rateLimitCounter.updateMany({
      where: { key: ENQUIRY_GLOBAL_KEY },
      data: { count: ENQUIRY_GLOBAL_LIMIT.limit - 1 },
    });

    // Fresh addresses and fresh tracking numbers: only the ceiling applies.
    expect((await submit("203.0.113.200", "TRK-TEST-002")).status).toBe(201);
    expect((await submit("203.0.113.201", "TRK-TEST-003")).status).toBe(429);
  });

  it("stops counting a window once it has ended", async () => {
    await clearOfWindowEdge(ENQUIRY_CLIENT_LIMIT.windowSeconds);
    const address = "192.0.2.44";
    const key = enquiryClientKey(address);

    for (let i = 0; i < ENQUIRY_CLIENT_LIMIT.limit; i += 1) {
      expect(await countSharedHit(key, ENQUIRY_CLIENT_LIMIT)).toBe(true);
    }
    expect((await submit(address)).status).toBe(429);

    // Rather than wait ten minutes, move the stored window back by its own
    // length. It is then the previous window, which has ended.
    const window = await prisma.rateLimitCounter.findFirstOrThrow({ where: { key } });
    await prisma.rateLimitCounter.updateMany({
      where: { key },
      data: {
        windowStart: new Date(
          window.windowStart.getTime() - ENQUIRY_CLIENT_LIMIT.windowSeconds * 1000,
        ),
      },
    });

    expect((await submit(address)).status).toBe(201);
  });

  it("shares counts between application instances with their own database clients", async () => {
    await clearOfWindowEdge(ENQUIRY_CLIENT_LIMIT.windowSeconds);
    const address = "192.0.2.80";
    const otherInstance = new PrismaClient();

    try {
      // Ten submissions through the route, counted by this instance's client,
      // and ten more at the same moment counted by the other instance's.
      const [here, elsewhere] = await Promise.all([
        Promise.all(Array.from({ length: 10 }, () => submit(address))),
        Promise.all(
          Array.from({ length: 10 }, () =>
            countSharedHit(enquiryClientKey(address), ENQUIRY_CLIENT_LIMIT, otherInstance),
          ),
        ),
      ]);

      const acceptedHere = here.filter((response) => response.status === 201).length;
      const refusedHere = here.filter((response) => response.status === 429).length;
      const acceptedElsewhere = elsewhere.filter((allowed) => allowed).length;

      expect(acceptedHere + refusedHere).toBe(10);
      expect(acceptedHere + acceptedElsewhere).toBe(10);
    } finally {
      await otherInstance.$disconnect();
    }
  });
});
