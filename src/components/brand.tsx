import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The fictional Northgate Freight brand mark. The repository defines no real
 * brand, and the brief asks for invented data throughout.
 */
export function BrandMark({
  className,
  tone = "brand",
}: {
  className?: string;
  tone?: "brand" | "light";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        tone === "brand" ? "bg-brand-700 text-white" : "bg-white text-brand-800",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        {/* A stylised N: two uprights joined by a rising diagonal. */}
        <path d="M6.5 18.5v-13l11 13v-13" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function BrandLink({
  href = "/",
  subtitle,
  tone = "dark",
  className,
}: {
  href?: string;
  subtitle?: string;
  /** Text colour: dark on light surfaces, light on the brand surface. */
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 rounded-lg", className)}>
      <BrandMark tone={tone === "light" ? "light" : "brand"} />
      <span className="leading-tight">
        <span className={cn("block text-[0.9375rem] font-bold tracking-tight", tone === "light" ? "text-white" : "text-slate-900")}>
          Northgate Freight
        </span>
        {subtitle ? (
          <span className={cn("block text-xs font-medium", tone === "light" ? "text-brand-200" : "text-slate-600")}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
