import { cn } from "@/lib/cn";

/**
 * Written out in full so Tailwind can see every class. None of these are the
 * status colours, so an operator's badge is never mistaken for a status.
 */
const TONES = [
  "bg-indigo-100 text-indigo-800 ring-indigo-200",
  "bg-teal-100 text-teal-800 ring-teal-200",
  "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
  "bg-orange-100 text-orange-800 ring-orange-200",
  "bg-cyan-100 text-cyan-800 ring-cyan-200",
  "bg-lime-100 text-lime-800 ring-lime-200",
] as const;

/** The same name always gets the same colour, so no setting is stored anywhere. */
function toneFor(name: string): string {
  let hash = 5381;
  for (const character of name) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }
  return TONES[hash % TONES.length]!;
}

/** A staff member's name as a badge, coloured per person so different people stand apart. */
export function StaffBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        toneFor(name),
        className,
      )}
    >
      {name}
    </span>
  );
}
