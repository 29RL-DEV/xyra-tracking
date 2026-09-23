import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/api/errors";
import { requireStaffPage } from "@/lib/auth/require-staff";
import { getStaffShipmentDetail } from "@/lib/services/shipment-service";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ShipmentForm } from "@/components/staff/shipment-form";

export const metadata: Metadata = { title: "Edit shipment" };
export const dynamic = "force-dynamic";

export default async function EditShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireStaffPage(`/staff/shipments/${id}/edit`);

  let detail;

  try {
    detail = await getStaffShipmentDetail(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "SHIPMENT_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const { shipment } = detail;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { label: "Shipments", href: "/staff/shipments" },
          { label: shipment.trackingNumber, href: `/staff/shipments/${id}` },
          { label: "Edit" },
        ]}
        title="Edit shipment"
        meta={<StatusBadge status={shipment.status} size="md" />}
        description={
          <>
            Update the details of <span className="font-mono font-semibold text-ink">{shipment.trackingNumber}</span>.
            Changing these details never affects the tracking history the customer has already seen.
          </>
        }
      />
      <ShipmentForm shipment={shipment} />
    </div>
  );
}
