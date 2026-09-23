import { Suspense } from "react";
import type { Metadata } from "next";
import { ShipmentList } from "@/components/staff/shipment-list";
import { Card } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/states";

export const metadata: Metadata = { title: "Shipments" };
export const dynamic = "force-dynamic";

export default function StaffShipmentsPage() {
  return (
    <Suspense
      fallback={
        <Card as="div" className="px-5 sm:px-6">
          <SkeletonRows rows={5} />
        </Card>
      }
    >
      <ShipmentList />
    </Suspense>
  );
}
