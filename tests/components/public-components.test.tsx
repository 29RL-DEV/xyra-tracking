// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/ui/status-badge";
import { TrackingTimeline } from "@/components/public/tracking-timeline";
import { ShipmentSummary } from "@/components/public/shipment-summary";
import { JourneyRail } from "@/components/public/journey-rail";
import { SHIPMENT_STATUSES } from "@/lib/domain/status";
import type { PublicEvent } from "@/lib/dto/event";
import type { PublicShipment } from "@/lib/dto/shipment";

const baseShipment: PublicShipment = {
  trackingNumber: "TRK-TEST-001",
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
};

// Explicit rather than relying on automatic cleanup, so a leftover render can
// never make one test's assertions depend on another's.
afterEach(cleanup);

const events: PublicEvent[] = [
  {
    occurredAt: "2026-09-20T09:00:00Z",
    location: "Gralebridge hub",
    type: "IN_TRANSIT",
    message: "Arrived at the regional hub.",
  },
  {
    occurredAt: "2026-09-18T09:00:00Z",
    location: "Ashmarket depot",
    type: "COLLECTED",
    message: "Collected from the sender.",
  },
];

describe("StatusBadge", () => {
  it("renders every status as readable text, not colour alone", () => {
    for (const status of SHIPMENT_STATUSES) {
      const { unmount, container } = render(<StatusBadge status={status} />);

      const badge = container.querySelector(`[data-status="${status}"]`);
      expect(badge).toBeInTheDocument();
      // There is always a word, so the state survives greyscale and a screen reader.
      expect(badge?.textContent?.trim().length).toBeGreaterThan(2);

      unmount();
    }
  });

  it("uses plain language rather than the raw enum value", () => {
    render(<StatusBadge status="OUT_FOR_DELIVERY" />);

    expect(screen.getByText("Out for delivery")).toBeInTheDocument();
    expect(screen.queryByText("OUT_FOR_DELIVERY")).not.toBeInTheDocument();
  });
});

describe("TrackingTimeline", () => {
  it("renders events as an ordered list, newest first", () => {
    render(<TrackingTimeline events={events} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Arrived at the regional hub.")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Collected from the sender.")).toBeInTheDocument();
  });

  it("marks the newest event with a text label, not only styling", () => {
    render(<TrackingTimeline events={events} />);

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Latest update")).toBeInTheDocument();
    expect(within(items[1]!).queryByText("Latest update")).not.toBeInTheDocument();
  });

  it("shows a helpful empty state instead of a blank section", () => {
    render(<TrackingTimeline events={[]} />);

    expect(screen.getByText("No tracking updates yet")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tracking history" }),
    ).toBeInTheDocument();
  });

  it("renders timestamps in readable form, never as a raw ISO string", () => {
    render(<TrackingTimeline events={events} />);

    expect(screen.queryByText(/2026-09-20T09:00:00Z/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Sept? 2026/).length).toBeGreaterThan(0);
  });
});

describe("JourneyRail", () => {
  const step = (label: string) =>
    within(screen.getByRole("list", { name: "Delivery progress" }))
      .getByText(label, { exact: false })
      .closest("li");

  it("never shows a delayed shipment as delivered, whatever its history holds", () => {
    render(
      <JourneyRail
        shipment={{ ...baseShipment, status: "DELAYED" }}
        events={[
          {
            occurredAt: "2026-09-21T09:00:00Z",
            location: "Marsden Vale",
            type: "DELAYED",
            message: "Held by a route closure.",
          },
          {
            occurredAt: "2026-09-20T09:00:00Z",
            location: "Thornbeck",
            type: "DELIVERED",
            message: "A delivered event recorded in error.",
          },
          ...events,
        ]}
        currentLocation="Marsden Vale"
      />,
    );

    expect(step("Delivered")).toHaveTextContent("not yet reached");
    expect(step("Out for delivery")).toHaveAttribute("aria-current", "step");
  });

  it("places a delayed shipment at the furthest step its history shows", () => {
    render(
      <JourneyRail
        shipment={{ ...baseShipment, status: "DELAYED" }}
        events={events}
        currentLocation="Gralebridge hub"
      />,
    );

    expect(step("In transit")).toHaveAttribute("aria-current", "step");
    expect(step("Collected")).toHaveTextContent("completed");
  });
});

describe("ShipmentSummary", () => {
  it("shows the shipment's key details", () => {
    render(<ShipmentSummary shipment={baseShipment} latestEvent={events[0]!} />);

    expect(screen.getByText("TRK-TEST-001")).toBeInTheDocument();
    expect(screen.getByText(/Ashmarket/)).toBeInTheDocument();
    expect(screen.getByText(/Westmoor Quay/)).toBeInTheDocument();
    expect(screen.getByText("2 packages")).toBeInTheDocument();
    expect(screen.getByText("4.5 kg")).toBeInTheDocument();
  });

  it("omits optional details entirely rather than rendering empty rows", () => {
    render(
      <ShipmentSummary
        shipment={{
          ...baseShipment,
          weightKg: null,
          customerReference: null,
          shipmentType: null,
        }}
        latestEvent={null}
      />,
    );

    expect(screen.queryByText("Weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Reference")).not.toBeInTheDocument();
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });

  it("explains a delayed shipment and shows both estimates", () => {
    render(
      <ShipmentSummary
        shipment={{
          ...baseShipment,
          status: "DELAYED",
          estimatedDelivery: "2026-10-06",
          originalEstimatedDelivery: "2026-10-02",
        }}
        latestEvent={{
          occurredAt: "2026-09-20T09:00:00Z",
          location: "Marsden Vale",
          type: "DELAYED",
          message: "A route closure has held this shipment overnight.",
        }}
      />,
    );

    expect(screen.getByText("This shipment is delayed")).toBeInTheDocument();
    expect(screen.getByText(/route closure/)).toBeInTheDocument();
    // Both the revised and the original promise are visible.
    expect(screen.getAllByText(/6 Oct 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 Oct 2026/).length).toBeGreaterThan(0);
  });

  it("warns clearly on an exception and quotes the latest update", () => {
    render(
      <ShipmentSummary
        shipment={{ ...baseShipment, status: "EXCEPTION" }}
        latestEvent={{
          occurredAt: "2026-09-20T09:00:00Z",
          location: "Inglestead depot",
          type: "EXCEPTION",
          message: "The delivery address is incomplete.",
        }}
      />,
    );

    expect(screen.getByText("This shipment needs attention")).toBeInTheDocument();
    expect(screen.getByText("The delivery address is incomplete.")).toBeInTheDocument();
  });

  it("confirms delivery and shows the delivered event", () => {
    render(
      <ShipmentSummary
        shipment={{ ...baseShipment, status: "DELIVERED" }}
        latestEvent={{
          occurredAt: "2026-09-20T09:00:00Z",
          location: "Westmoor Quay",
          type: "DELIVERED",
          message: "Delivered and signed for.",
        }}
      />,
    );

    expect(
      screen.getByText("This shipment has been delivered"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Delivered and signed for/)).toBeInTheDocument();
  });
});
