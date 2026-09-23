import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ShipmentForm } from "@/components/staff/shipment-form";

export const metadata: Metadata = { title: "New shipment" };
export const dynamic = "force-dynamic";

export default function NewShipmentPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumbs={[{ label: "Shipments", href: "/staff/shipments" }, { label: "New shipment" }]}
        title="New shipment"
        description="Create a shipment record. A tracking number is generated automatically unless you supply one."
      />
      <ShipmentForm />
    </div>
  );
}
