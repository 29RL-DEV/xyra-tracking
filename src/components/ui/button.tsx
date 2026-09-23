import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link, { type LinkProps } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

/*
 * Disabled colours double as the busy state ("Searching..."), so they keep
 * WCAG AA contrast rather than fading the label out.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-500 disabled:shadow-none",
  // A button is identified by its label, so it needs no high-contrast
  // outline; the hairline and shadow only give it a shape on a white surface.
  secondary:
    "border border-line-strong bg-white text-ink shadow-sm hover:border-edge hover:bg-surface-muted " +
    "active:bg-surface-sunken disabled:bg-surface-muted disabled:text-ink-subtle disabled:shadow-none",
  ghost:
    "text-ink-muted hover:bg-surface-sunken hover:text-ink active:bg-line disabled:text-ink-subtle",
  danger:
    "bg-red-700 text-white shadow-sm hover:bg-red-800 active:bg-red-900 disabled:bg-red-600",
  // For the navy surfaces (staff sidebar and top bar).
  inverse:
    "bg-white/10 text-white hover:bg-white/15 active:bg-white/20 disabled:bg-white/10 disabled:text-white/80",
};

// Medium buttons are 44px tall on touch-sized screens, 40px from `sm` up.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm sm:h-10",
  lg: "h-12 px-5 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string | undefined;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks repeat submissions while a request is in flight. */
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      loadingLabel,
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonClasses({ variant, size, className })}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {loadingLabel ?? children}
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

/** A link that looks like a button — for navigation, never for actions. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
}) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
