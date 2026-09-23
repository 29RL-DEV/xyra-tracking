"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ExternalLink,
  Inbox,
  LayoutDashboard,
  LogOut,
  Package,
  type LucideIcon,
} from "lucide-react";
import { apiSend } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { BrandLink } from "@/components/brand";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only, so Overview is not active on every staff page. */
  exact?: boolean;
  badge?: number;
}

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * The operations console frame.
 *
 * A fixed navy sidebar on large screens; on smaller ones a compact navy top
 * bar with the same three destinations as tabs beneath it, so navigation never
 * hides behind a menu. Exactly one navigation and one sign-out control is
 * visible at any width.
 */
export function StaffShell({
  userName,
  openEnquiries,
  children,
}: {
  userName: string;
  openEnquiries: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const nav: NavItem[] = [
    { href: "/staff", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/staff/shipments", label: "Shipments", icon: Package },
    { href: "/staff/enquiries", label: "Enquiries", icon: Inbox, badge: openEnquiries },
  ];

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiSend("/api/auth/logout", "POST");
    } finally {
      // A full page load rather than a client navigation. Calling
      // router.replace() and router.refresh() back to back races: the refresh
      // targets the page being left and can swallow the navigation, leaving the
      // person on a staff page after signing out. A full load also discards the
      // client router cache, so no protected page can be restored from memory.
      // replace() keeps Back from returning to the page that was left.
      window.location.replace("/staff/login");
    }
  };

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Sidebar — large screens */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-brand-950 text-brand-100 lg:flex">
        <div className="flex h-16 items-center px-5">
          <BrandLink
            href="/staff/shipments"
            subtitle="Operations console"
            tone="light"
            className="focus-visible:ring-offset-brand-950"
          />
        </div>

        <nav aria-label="Staff sections" className="flex-1 space-y-0.5 px-3 pt-6">
          <p className="px-3 pb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-brand-300/80">
            Workspace
          </p>
          {nav.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-offset-brand-950",
                  active
                    ? "bg-white/10 text-white"
                    : "text-brand-100/85 hover:bg-white/5 hover:text-white",
                )}
              >
                {active ? (
                  <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-300" />
                ) : null}
                <Icon
                  className={cn(
                    "h-[1.125rem] w-[1.125rem]",
                    active ? "text-brand-200" : "text-brand-300/70 group-hover:text-brand-200",
                  )}
                  aria-hidden="true"
                />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                      active ? "bg-white text-brand-900" : "bg-white/10 text-white",
                    )}
                  >
                    {item.badge}
                    <span className="sr-only"> open</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-4 px-3 pb-5">
          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-brand-200 hover:bg-white/5 hover:text-white focus-visible:ring-offset-brand-950"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Customer tracking site
          </Link>

          <div className="flex items-center gap-3 rounded-lg px-3 pt-4 shadow-[0_-1px_0_0_rgb(255_255_255/0.08)]">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white"
            >
              {initials(userName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{userName}</p>
              <p className="text-xs text-brand-300">Signed in</p>
            </div>
            <Button
              variant="inverse"
              size="sm"
              className="w-9 px-0 focus-visible:ring-offset-brand-950"
              onClick={signOut}
              loading={signingOut}
              loadingLabel=""
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Top bar and tabs — small and medium screens */}
      <header className="sticky top-0 z-30 lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 bg-brand-950 px-4 sm:px-6">
          <BrandLink
            href="/staff/shipments"
            subtitle="Operations"
            tone="light"
            className="focus-visible:ring-offset-brand-950"
          />
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="hidden h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white sm:flex"
            >
              {initials(userName)}
            </span>
            <Button
              variant="inverse"
              size="sm"
              className="focus-visible:ring-offset-brand-950"
              onClick={signOut}
              loading={signingOut}
              loadingLabel="Signing out..."
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>

        <nav
          aria-label="Staff sections"
          className="grid grid-cols-3 bg-white shadow-[0_1px_0_0_#e2e8f0]"
        >
          {nav.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center justify-center gap-1.5 px-1 py-3 text-xs font-semibold sm:text-sm",
                  active ? "text-brand-800" : "text-ink-muted hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="rounded-full bg-surface-sunken px-1.5 text-[0.6875rem] font-semibold tabular-nums text-ink">
                    {item.badge}
                    <span className="sr-only"> open</span>
                  </span>
                ) : null}
                {active ? (
                  <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-700" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="lg:pl-60">
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
