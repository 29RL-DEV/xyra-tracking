import { Compass } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/public/site-header";
import { TrackingNotFound } from "@/components/public/tracking-not-found";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <TrackingNotFound>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-20">
          <div className="max-w-md text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-brand-700">
              <Compass className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-6 text-sm font-semibold text-brand-700">Page not found</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-display-sm">
              We could not find that page
            </h1>
            <p className="mt-3 text-ink-muted">
              The link may be out of date. You can track a shipment from the home page.
            </p>
            <div className="mt-8 flex justify-center">
              <ButtonLink href="/">Track a shipment</ButtonLink>
            </div>
          </div>
        </main>
      </TrackingNotFound>

      <SiteFooter />
    </div>
  );
}
