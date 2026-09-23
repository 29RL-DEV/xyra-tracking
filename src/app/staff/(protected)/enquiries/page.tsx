import { Suspense } from "react";
import type { Metadata } from "next";
import { EnquiryList } from "@/components/staff/enquiry-list";
import { Card } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/states";

export const metadata: Metadata = { title: "Enquiries" };
export const dynamic = "force-dynamic";

export default function StaffEnquiriesPage() {
  return (
    <Suspense
      fallback={
        <Card as="div" className="px-5 sm:px-6">
          <SkeletonRows rows={3} />
        </Card>
      }
    >
      <EnquiryList />
    </Suspense>
  );
}
