import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { BrandLink } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/95 shadow-[0_1px_0_0_#e2e8f0] backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLink subtitle="Shipment tracking" />

        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink sm:inline-flex"
          >
            Track a shipment
          </Link>
          <Link href="/staff/login" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            Staff sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-brand-950 text-brand-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="max-w-xl leading-6">
          <span className="font-semibold text-white">Northgate Freight</span> is a fictional
          company. Every shipment, location and enquiry here is invented for demonstration.
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <p className="text-brand-200">Tracking data updates as our team records each step.</p>
          <Link
            href="/privacy"
            className="self-start rounded font-semibold text-white underline-offset-4 hover:underline focus-visible:ring-offset-brand-950 sm:self-end"
          >
            Privacy notice
          </Link>
        </div>
      </div>
    </footer>
  );
}
