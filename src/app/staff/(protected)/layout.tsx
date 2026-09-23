import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { countOpenEnquiries } from "@/lib/services/enquiry-service";
import { StaffShell } from "@/components/staff/staff-shell";

export const dynamic = "force-dynamic";

/** The staff area is never meant to appear in search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Wraps the authenticated staff pages. The login screen sits outside this route
 * group so it is reachable without a session.
 *
 * The redirect below backs up the middleware on a full page load and supplies
 * the operator's name to the shell. It is not the gate for these pages on its
 * own: a layout is not re-run on client-side navigation between its pages, so
 * the middleware, which runs on every request, is what protects them.
 */
export default async function ProtectedStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await readSession();

  if (result.state !== "valid") {
    redirect("/staff/login");
  }

  const openEnquiries = await countOpenEnquiries();

  return (
    <StaffShell userName={result.session.name} openEnquiries={openEnquiries}>
      {children}
    </StaffShell>
  );
}
