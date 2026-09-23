import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/public/site-header";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What this demonstration tracking site processes, why, and for how long.",
};

/**
 * What the application actually does with information, in plain language.
 *
 * Every statement here describes behaviour in the code or the deployment; if
 * either changes, this page has to change with it.
 */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <p className="eyebrow">Last updated 23 September 2026</p>
          <h1 className="mt-2 text-display-sm text-ink sm:text-display-md">Privacy notice</h1>
          <p className="mt-4 text-lg leading-8 text-ink-muted">
            This site is a demonstration built for a software developer take-home task.
            Northgate Freight is a fictional company, and every shipment, location and enquiry
            shown here is invented. Please do not enter real personal information.
          </p>

          <div className="mt-12 space-y-10">
            <Section title="What this site processes, and why">
              <ul className="list-disc space-y-3 pl-5">
                <li>
                  <strong className="font-semibold text-ink">Tracking lookups.</strong> The
                  tracking number you enter is used to find and show that shipment. Lookups are
                  not stored.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Enquiries.</strong> When you send an
                  enquiry, the tracking number, the category you chose and your message are
                  stored so the operations team can look into the shipment. The form does not ask
                  for your name or contact details, and asks you not to include personal or
                  payment information.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Your IP address.</strong> It is used
                  in server memory to limit how many tracking lookups, enquiries and sign-in
                  attempts one connection can make in a short time, to protect the service from
                  abuse. It is never written to the database, and each limit expires after at most
                  15 minutes.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Hosting logs.</strong> The hosting
                  provider records standard request information, including IP addresses, to run
                  and secure the service.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Staff accounts.</strong> Staff sign
                  in with an email address and password. Passwords are stored only as one-way
                  hashes.
                </li>
              </ul>
              <p>
                In a live service this processing would rest on legitimate interests: answering
                questions about shipments, and keeping the service secure.
              </p>
            </Section>

            <Section title="Cookies">
              <p>
                Public pages set no cookies. Staff sign-in sets one cookie,{" "}
                <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-sm text-ink">
                  sid
                </code>
                , which keeps a member of staff signed in for up to eight hours and is strictly
                necessary for the staff area to work. There are no analytics, advertising or
                tracking cookies, so there is nothing to consent to and no cookie banner.
              </p>
            </Section>

            <Section title="Where it is kept">
              <p>
                Shipments and enquiries are stored in a PostgreSQL database hosted by Supabase in
                London. The application is hosted by Vercel, with its server functions running in
                London.
              </p>
            </Section>

            <Section title="How long it is kept">
              <p>
                Enquiries are kept while they are needed to deal with the question. Staff can
                permanently delete an enquiry at any time — for example, when the person who sent
                it asks them to. Because this is a demonstration, the database may also be reset
                to its fictional sample data at any time, which removes every submitted enquiry.
              </p>
            </Section>

            <Section title="Asking for an enquiry to be deleted">
              <p>
                Send a new enquiry about the same tracking number, quote the reference you were
                given, and ask for the earlier one to be deleted. Staff can see each enquiry&rsquo;s
                reference and remove it.
              </p>
            </Section>
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 text-base leading-7 text-ink-muted">
      <h2 className="text-title text-ink">{title}</h2>
      {children}
    </section>
  );
}
