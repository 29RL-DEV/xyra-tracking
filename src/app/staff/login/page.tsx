import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, History, Lock, Search, type LucideIcon } from "lucide-react";
import { BrandLink } from "@/components/brand";
import { LoginForm } from "@/components/staff/login-form";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const POINTS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Search,
    title: "Every shipment in one place",
    text: "Search, filter and open any record in seconds.",
  },
  {
    icon: History,
    title: "History that cannot be rewritten",
    text: "Tracking events are append-only — what customers have seen stays.",
  },
  {
    icon: Lock,
    title: "Notes that stay internal",
    text: "Staff notes never reach the customer-facing tracking page.",
  },
];

export default function StaffLoginPage() {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white lg:flex xl:p-16">
        <BrandLink tone="light" subtitle="Operations console" />

        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            The operations console for every Northgate shipment.
          </h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-white">{title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-brand-100">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-brand-200">
          Demonstration environment. Every record is fictional.
        </p>
      </aside>

      <main id="main" className="flex min-h-screen flex-col px-4 py-8 sm:px-8 lg:min-h-0 lg:justify-center lg:py-12">
        <div className="lg:hidden">
          <BrandLink subtitle="Operations console" />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 lg:flex-none">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-display-sm">
            Staff sign in
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            For operations staff. Customers can track a shipment without an account.
          </p>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to shipment tracking
          </Link>
        </div>
      </main>
    </div>
  );
}
