import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger" | "error";

const TONES: Record<AlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "bg-brand-50 text-brand-900", icon: "text-brand-700", Icon: Info },
  success: { box: "bg-emerald-50 text-emerald-900", icon: "text-emerald-700", Icon: CheckCircle2 },
  warning: { box: "bg-amber-50 text-amber-900", icon: "text-amber-700", Icon: Clock3 },
  danger: { box: "bg-red-50 text-red-900", icon: "text-red-700", Icon: AlertTriangle },
  error: { box: "bg-red-50 text-red-900", icon: "text-red-700", Icon: XCircle },
};

/**
 * A message block with a tone, an icon and a title. The title always states the
 * situation in words, so the tone colour is never the only signal.
 */
export function Alert({
  tone,
  title,
  children,
  icon,
  role,
  className,
  id,
  tabIndex,
}: {
  tone: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  role?: "alert" | "status";
  className?: string;
  id?: string;
  tabIndex?: number;
}) {
  const { box, icon: iconClass, Icon } = TONES[tone];

  return (
    <div
      id={id}
      role={role}
      tabIndex={tabIndex}
      className={cn("flex gap-3 rounded-lg px-4 py-3.5 focus:outline-none", box, className)}
    >
      <span className={cn("mt-0.5 shrink-0", iconClass)} aria-hidden="true">
        {icon ?? <Icon className="h-5 w-5" />}
      </span>
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-1" : null, "leading-6")}>{children}</div> : null}
      </div>
    </div>
  );
}
