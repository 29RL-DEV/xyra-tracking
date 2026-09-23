import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/api/errors";
import { requireStaffPage } from "@/lib/auth/require-staff";
import { getStaffShipmentDetail } from "@/lib/services/shipment-service";
import { ShipmentDetailView } from "@/components/staff/shipment-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  // Before the try/catch below: that catch is a fallback title for any
  // failure and must not also swallow this redirect.
  await requireStaffPage(`/staff/shipments/${id}`);

  try {
    const detail = await getStaffShipmentDetail(id);
    return { title: detail.shipment.trackingNumber };
  } catch {
    return { title: "Shipment" };
  }
}

export default async function StaffShipmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requireStaffPage(`/staff/shipments/${id}`);

  try {
    const detail = await getStaffShipmentDetail(id);
    return <ShipmentDetailView detail={detail} />;
  } catch (error) {
    if (error instanceof AppError && error.code === "SHIPMENT_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
