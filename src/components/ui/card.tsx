import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A surface: a white plane over the canvas, separated by a soft shadow rather
 * than an outline. Use one where content genuinely needs grouping — a result,
 * a table, a form — not around every section. Sections that only need a title
 * use <Section> and sit directly on the page.
 */
export function Card({
  as: Component = "section",
  className,
  children,
  ...props
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <Component
      className={cn("min-w-0 rounded-xl bg-surface shadow-surface", className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  titleId,
  description,
  icon,
  actions,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pb-2 pt-5 sm:px-6 sm:pt-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <span aria-hidden="true" className="mt-1 shrink-0 text-ink-subtle">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <Heading id={titleId} className="text-base font-semibold text-ink">
            {title}
          </Heading>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}

/** A quiet band closing a surface — for a summary line and its actions. */
export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-b-xl bg-surface-muted px-5 py-3 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
