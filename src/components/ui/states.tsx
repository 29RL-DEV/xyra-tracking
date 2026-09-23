import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Loading, empty and error are product states, not afterthoughts. They are
 * built once here so every list and result region treats them consistently.
 *
 * None of them draws a box: they sit on whatever the region already is — the
 * canvas or a surface — and speak through an icon and a sentence.
 */

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}
    >
      <Loader2 className="h-7 w-7 animate-spin text-brand-700" aria-hidden="true" />
      <p className="text-base font-medium text-ink-muted">{label}</p>
    </div>
  );
}

/** A grey placeholder block. Decorative: pair it with a status message. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-surface-sunken", className)}
    />
  );
}

/** Placeholder rows shaped like the list that is about to appear. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading results</span>
      <div aria-hidden="true" className="divide-y divide-line">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  bare = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  /** Tighter spacing, for an empty region inside a larger surface. */
  bare?: boolean;
}) {
  return (
    <div className={cn("px-6 text-center", bare ? "py-10" : "py-16", className)}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-ink-muted">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("px-6 py-16 text-center", className)}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-ink-muted">{description}</p>
      {onRetry ? (
        <div className="mt-6">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
