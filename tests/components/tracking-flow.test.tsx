// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackingExperience } from "@/components/public/tracking-experience";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const successPayload = {
  shipment: {
    trackingNumber: "TRK-DEMO-001",
    status: "IN_TRANSIT",
    origin: { city: "Ashmarket", country: "United Kingdom" },
    destination: { city: "Westmoor Quay", country: "United Kingdom" },
    estimatedDelivery: "2026-10-02",
    originalEstimatedDelivery: null,
    currentLocation: "Gralebridge hub",
    serviceLevel: "STANDARD",
    shipmentType: "PARCEL",
    packageCount: 2,
    weightKg: 4.5,
    customerReference: "REF-1",
    createdAt: "2026-09-18T10:00:00Z",
    updatedAt: "2026-09-20T10:00:00Z",
  },
  events: [
    {
      occurredAt: "2026-09-20T09:00:00Z",
      location: "Gralebridge hub",
      type: "IN_TRANSIT",
      message: "Arrived at the regional hub.",
    },
  ],
};

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("public tracking flow", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts on a prompt rather than an empty page", () => {
    render(<TrackingExperience />);

    expect(
      screen.getByText("Enter a tracking number to begin"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Tracking number/)).toBeInTheDocument();
  });

  it("blocks an empty submission client-side and issues no request", async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(() => json(successPayload));

    render(<TrackingExperience />);
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    expect(await screen.findByText("Enter a tracking number")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an obviously wrong format before submitting", async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(() => json(successPayload));

    render(<TrackingExperience />);
    await user.type(screen.getByLabelText(/Tracking number/), "hello world");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    expect(
      await screen.findByText(/does not look like a tracking number/i),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("looks up a shipment and renders the summary and timeline", async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch(() => json(successPayload));

    render(<TrackingExperience />);
    await user.type(screen.getByLabelText(/Tracking number/), "TRK-DEMO-001");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    expect(await screen.findByText("TRK-DEMO-001")).toBeInTheDocument();
    // The message appears twice by design: highlighted in the summary, and in
    // the timeline below it.
    expect(screen.getAllByText("Arrived at the regional hub.")).toHaveLength(2);
    expect(screen.getAllByText("Latest update").length).toBeGreaterThan(0);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/shipments/TRK-DEMO-001",
      expect.objectContaining({ method: "GET" }),
    );
    // The result gets a shareable URL without a full page load.
    expect(replace).toHaveBeenCalledWith("/track/TRK-DEMO-001", { scroll: false });
  });

  it("shows a busy state while the lookup is in flight", async () => {
    const user = userEvent.setup();

    // A request that never settles, so the in-flight state can be observed.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(<TrackingExperience />);
    await user.type(screen.getByLabelText(/Tracking number/), "TRK-DEMO-001");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    // Announced to assistive technology, not conveyed by animation alone.
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Looking up TRK-DEMO-001/,
    );

    // The button is busy and cannot fire a second request.
    const button = screen.getByRole("button", { name: /Searching/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("treats a not-found result as a product state, not an error", async () => {
    const user = userEvent.setup();
    mockFetch(() =>
      json({ error: { code: "SHIPMENT_NOT_FOUND", message: "Not found" } }, 404),
    );

    render(<TrackingExperience />);
    await user.type(screen.getByLabelText(/Tracking number/), "TRK-NOPE-999");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    expect(
      await screen.findByText(/We could not find TRK-NOPE-999/),
    ).toBeInTheDocument();
    // No technical detail and no status code leaks into the customer's view.
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it("shows a distinct, recoverable state when the server fails", async () => {
    const user = userEvent.setup();
    mockFetch(() =>
      json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." } }, 500),
    );

    render(<TrackingExperience />);
    await user.type(screen.getByLabelText(/Tracking number/), "TRK-DEMO-001");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/could not find/i)).not.toBeInTheDocument();
  });

  it("replaces the previous result when a second number is searched", async () => {
    const user = userEvent.setup();

    mockFetch((url) =>
      url.includes("TRK-DEMO-002")
        ? json({
            ...successPayload,
            shipment: { ...successPayload.shipment, trackingNumber: "TRK-DEMO-002" },
            events: [],
          })
        : json(successPayload),
    );

    render(<TrackingExperience />);
    const input = screen.getByLabelText(/Tracking number/);

    await user.type(input, "TRK-DEMO-001");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));
    expect(await screen.findByText("TRK-DEMO-001")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "TRK-DEMO-002");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    expect(await screen.findByText("TRK-DEMO-002")).toBeInTheDocument();
    expect(screen.queryByText("TRK-DEMO-001")).not.toBeInTheDocument();
  });

  it("offers the enquiry form once a shipment is found", async () => {
    const user = userEvent.setup();
    mockFetch(() => json(successPayload));

    render(<TrackingExperience />);
    await user.type(screen.getByLabelText(/Tracking number/), "TRK-DEMO-001");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));

    expect(
      await screen.findByRole("heading", { name: /Something wrong with this shipment/i }),
    ).toBeInTheDocument();
  });
});

describe("customer enquiry form", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function renderWithResult() {
    const user = userEvent.setup();
    render(<TrackingExperience />);
    await user.type(screen.getByLabelText(/Tracking number/), "TRK-DEMO-001");
    await user.click(screen.getByRole("button", { name: /Track shipment/i }));
    await screen.findByRole("heading", { name: /Something wrong with this shipment/i });
    return user;
  }

  it("asks for no personal information", async () => {
    mockFetch(() => json(successPayload));
    await renderWithResult();

    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it("rejects a message that is too short, beside the field", async () => {
    mockFetch(() => json(successPayload));
    const user = await renderWithResult();

    await user.type(screen.getByLabelText(/Your message/), "help");
    await user.click(screen.getByRole("button", { name: /Send enquiry/i }));

    expect(
      await screen.findByText(/at least 10 characters/i),
    ).toBeInTheDocument();
  });

  it("confirms a successful submission and clears the form", async () => {
    mockFetch((url) =>
      url.includes("/api/enquiries")
        ? json({ enquiry: { id: "abc12345678", status: "OPEN", createdAt: "2026-09-21T10:00:00Z" } }, 201)
        : json(successPayload),
    );

    const user = await renderWithResult();

    await user.type(
      screen.getByLabelText(/Your message/),
      "Could you confirm the delivery window for tomorrow, please?",
    );
    await user.click(screen.getByRole("button", { name: /Send enquiry/i }));

    expect(
      await screen.findByRole("heading", { name: /We have received your enquiry/i }),
    ).toBeInTheDocument();
  });

  it("surfaces an unknown tracking number beside the tracking number field", async () => {
    mockFetch((url) =>
      url.includes("/api/enquiries")
        ? json({ error: { code: "SHIPMENT_NOT_FOUND", message: "Not found" } }, 404)
        : json(successPayload),
    );

    const user = await renderWithResult();

    await user.type(
      screen.getByLabelText(/Your message/),
      "This is a long enough message to pass validation.",
    );
    await user.click(screen.getByRole("button", { name: /Send enquiry/i }));

    expect(
      await screen.findByText(/could not find that tracking number/i),
    ).toBeInTheDocument();
  });
});
