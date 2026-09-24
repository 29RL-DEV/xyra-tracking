"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { normaliseTrackingNumber } from "@/lib/domain/tracking-number";
import { TrackingExperience } from "./tracking-experience";

const TRACKING_PATH = /^\/track\/([^/]+)\/?$/;

/**
 * The not-found page's body. For a tracking link to a number that does not
 * exist it shows the tracking screen in its "not found" state, so the customer
 * can correct the number in place; for any other missing page it shows
 * `children`.
 *
 * A not-found page receives no route params, so the number is read from the
 * URL. Keeping this in the app's single not-found page means there is one
 * place that decides what a 404 looks like.
 */
export function TrackingNotFound({ children }: { children: ReactNode }) {
  const match = TRACKING_PATH.exec(usePathname() ?? "");

  if (!match) return children;

  return (
    <main id="main" className="flex-1">
      <TrackingExperience
        initialTrackingNumber={normaliseTrackingNumber(decode(match[1] ?? ""))}
        initialNotFound
      />
    </main>
  );
}

/** A malformed escape in a hand-edited URL shows the raw text rather than crashing. */
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
