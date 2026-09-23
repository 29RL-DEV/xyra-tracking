import { beforeEach, describe, expect, it } from "vitest";
import { GET as listEnquiries } from "@/app/api/staff/enquiries/route";
import { ENQUIRY_PAGE_SIZE } from "@/lib/services/enquiry-service";
import { prisma } from "@/lib/db";
import type { StaffEnquiry } from "@/lib/dto/enquiry";
import { get, readJson } from "../helpers/request";
import { resetDatabase, seedFixtures, signIn, type Fixtures } from "../helpers/fixtures";

interface EnquiryPage {
  enquiries: StaffEnquiry[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Enquiries arrive from a public form and are never deleted, so the queue only
 * grows. These tests exist to make sure it is read a page at a time rather
 * than whole — a property that is invisible with demo-sized data and expensive
 * in service.
 */
describe("enquiry queue paging", () => {
  let fixtures: Fixtures;
  const extra = 5;

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await seedFixtures();
    await signIn(fixtures.staffId);

    // Enough to fill one page and spill onto a second. Distinct timestamps
    // keep the order deterministic.
    const base = Date.now();
    await prisma.enquiry.createMany({
      data: Array.from({ length: ENQUIRY_PAGE_SIZE + extra }, (_, index) => ({
        shipmentId: fixtures.inTransitId,
        trackingNumber: "TRK-TEST-001",
        category: "OTHER" as const,
        message: `Bulk enquiry number ${index} for paging coverage.`,
        createdAt: new Date(base - index * 1000),
      })),
    });
  });

  async function page(query = ""): Promise<EnquiryPage> {
    const response = await listEnquiries(get(`/api/staff/enquiries${query}`));
    expect(response.status).toBe(200);
    return readJson<EnquiryPage>(response);
  }

  it("returns one bounded page, and says how many there are in total", async () => {
    const first = await page();
    const seeded = await prisma.enquiry.count();

    expect(first.enquiries).toHaveLength(ENQUIRY_PAGE_SIZE);
    expect(first.total).toBe(seeded);
    expect(first.page).toBe(1);
    expect(first.pageSize).toBe(ENQUIRY_PAGE_SIZE);
  });

  it("never returns the whole table, however many enquiries exist", async () => {
    const before = await prisma.enquiry.count();
    await prisma.enquiry.createMany({
      data: Array.from({ length: 40 }, (_, index) => ({
        shipmentId: fixtures.inTransitId,
        trackingNumber: "TRK-TEST-001",
        category: "OTHER" as const,
        message: `Another bulk enquiry ${index}.`,
      })),
    });

    const first = await page();

    expect(await prisma.enquiry.count()).toBe(before + 40);
    expect(first.enquiries.length).toBeLessThanOrEqual(ENQUIRY_PAGE_SIZE);
  });

  it("serves the remainder on the next page, repeating and skipping nothing", async () => {
    const first = await page();
    const second = await page("?page=2");

    const firstIds = first.enquiries.map((enquiry) => enquiry.id);
    const secondIds = second.enquiries.map((enquiry) => enquiry.id);

    expect(second.page).toBe(2);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(
      firstIds.length + secondIds.length,
    );
    expect(firstIds.length + secondIds.length).toBe(first.total);
  });

  it("returns an empty page rather than an error past the end", async () => {
    const far = await page("?page=99");

    expect(far.enquiries).toEqual([]);
    expect(far.total).toBeGreaterThan(0);
  });

  it("applies the filter and the page together", async () => {
    await prisma.enquiry.updateMany({ data: { status: "RESOLVED" } });
    await prisma.enquiry.create({
      data: {
        shipmentId: fixtures.inTransitId,
        trackingNumber: "TRK-TEST-001",
        category: "OTHER",
        message: "The one enquiry still open for this filter test.",
      },
    });

    const open = await page("?status=OPEN");

    expect(open.total).toBe(1);
    expect(open.enquiries).toHaveLength(1);
    expect(open.enquiries[0]?.status).toBe("OPEN");
  });

  it("rejects a page that is not a positive whole number", async () => {
    for (const value of ["0", "-1", "abc", "1.5"]) {
      const response = await listEnquiries(get(`/api/staff/enquiries?page=${value}`));
      expect(response.status, `page=${value}`).toBe(400);
    }
  });

  it("keeps the newest enquiry first on the first page", async () => {
    const first = await page();
    const newest = await prisma.enquiry.findFirstOrThrow({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    expect(first.enquiries[0]?.id).toBe(newest.id);
  });
});
