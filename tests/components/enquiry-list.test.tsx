// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnquiryList, filterFromParam } from "@/components/staff/enquiry-list";
import { ToastProvider } from "@/components/ui/toast";

const push = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/staff/enquiries",
}));

function mockEnquiries() {
  const spy = vi.fn(async () =>
    // The list endpoint answers with a page, not a bare array.
    new Response(JSON.stringify({ enquiries: [], total: 0, page: 1, pageSize: 20 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

function renderList() {
  return render(
    <ToastProvider>
      <EnquiryList />
    </ToastProvider>,
  );
}

describe("enquiry queue filter", () => {
  beforeEach(() => {
    push.mockClear();
    search = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reads the filter from the URL, defaulting to open", () => {
    expect(filterFromParam(null)).toBe("OPEN");
    expect(filterFromParam("OPEN")).toBe("OPEN");
    expect(filterFromParam("RESOLVED")).toBe("RESOLVED");
    expect(filterFromParam("ALL")).toBe("ALL");
    expect(filterFromParam("nonsense")).toBe("OPEN");
  });

  it("loads open enquiries by default", async () => {
    const fetchSpy = mockEnquiries();
    renderList();

    await screen.findByText("No open enquiries");
    expect(fetchSpy).toHaveBeenCalledWith("/api/staff/enquiries?status=OPEN", expect.anything());
  });

  it("loads every enquiry when the All filter is in the URL", async () => {
    // Regression: choosing All used to remove the parameter, and a missing
    // parameter means Open, so All could never actually be shown.
    search = new URLSearchParams("status=ALL");
    const fetchSpy = mockEnquiries();
    renderList();

    await screen.findByText("No enquiries yet");
    expect(fetchSpy).toHaveBeenCalledWith("/api/staff/enquiries", expect.anything());
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("puts All into the URL rather than dropping the filter", async () => {
    mockEnquiries();
    const user = userEvent.setup();
    renderList();

    await screen.findByText("No open enquiries");
    await user.click(screen.getByRole("button", { name: "All" }));

    expect(push).toHaveBeenCalledWith("/staff/enquiries?status=ALL");
  });

  it("returns to the plain URL for the default Open view", async () => {
    search = new URLSearchParams("status=RESOLVED");
    mockEnquiries();
    const user = userEvent.setup();
    renderList();

    await screen.findByText("No resolved enquiries yet");
    await user.click(screen.getByRole("button", { name: /Open/ }));

    expect(push).toHaveBeenCalledWith("/staff/enquiries");
  });
});
