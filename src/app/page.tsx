import { SiteFooter, SiteHeader } from "@/components/public/site-header";
import { TrackingExperience } from "@/components/public/tracking-experience";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        <TrackingExperience />
      </main>

      <SiteFooter />
    </div>
  );
}
