import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb trail. The last crumb is the current page and is not a link. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded font-medium text-ink-muted hover:text-ink hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="font-medium text-ink">
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The top of every staff page: where you are, what this page is for, and the
 * one or two things you are most likely to do next.
 *
 * "compact" is for dense operational pages such as the overview, where the
 * header should give way to the data below it.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  titleClassName,
  size = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Small inline content next to the title, such as a status badge. */
  meta?: ReactNode;
  titleClassName?: string;
  size?: "default" | "compact";
}) {
  const compact = size === "compact";

  return (
    <div className={cn("space-y-3", compact ? "mb-6 sm:mb-7" : "mb-8 sm:mb-10")}>
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              className={cn(
                "text-display-sm text-ink",
                compact ? "lg:text-[2.0625rem] lg:leading-10" : "lg:text-display-md",
                titleClassName,
              )}
            >
              {title}
            </h1>
            {meta}
          </div>
          {description ? (
            <div className={cn("max-w-3xl text-base text-ink-muted", compact ? "mt-1" : "mt-2")}>
              {description}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
