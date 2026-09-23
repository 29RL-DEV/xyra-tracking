import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A titled region of a page with no container of its own.
 *
 * Most page regions need a heading and some space, not a box. The heading
 * names the region for assistive technology (aria-labelledby), and the content
 * decides for itself whether it needs a surface — a table does, a paragraph
 * does not.
 */
export function Section({
  titleId,
  title,
  description,
  actions,
  as: Heading = "h2",
  className,
  children,
}: {
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className={cn("min-w-0", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Heading id={titleId} className="text-title text-ink">
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
