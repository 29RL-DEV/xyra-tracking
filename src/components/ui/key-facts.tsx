import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A row of labelled values separated by space, not by boxes.
 *
 * A definition list, so each value is announced with its label. It wraps onto
 * as many lines as the width needs; nothing is truncated.
 *
 * "grid" pairs the facts into two even columns on a phone, for rows of long
 * values that would otherwise stack one per line, and flows them in a row from
 * tablet width up.
 */
export function KeyFacts({
  layout = "wrap",
  className,
  children,
}: {
  layout?: "wrap" | "grid";
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl
      className={cn(
        layout === "grid"
          ? "grid grid-cols-2 gap-x-5 gap-y-5 sm:flex sm:flex-wrap sm:gap-x-12"
          : "flex flex-wrap gap-x-10 gap-y-5",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function KeyFact({
  label,
  icon,
  emphasis = false,
  className,
  children,
}: {
  label: string;
  icon?: ReactNode;
  /** The one fact on a row that matters most, drawn larger. */
  emphasis?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="flex items-center gap-1.5 text-sm text-ink-subtle">
        {icon ? (
          <span aria-hidden="true" className="shrink-0">
            {icon}
          </span>
        ) : null}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words text-ink",
          emphasis ? "text-base font-semibold sm:text-lg" : "font-semibold",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
