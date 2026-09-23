"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Application error boundary.
 *
 * Shows a safe, recoverable screen. The underlying error is logged server-side
 * by the API layer; nothing technical is rendered here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    console.error("[app] unhandled error", error.digest ?? error.message);
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-2xl font-bold tracking-tight text-ink focus:outline-none sm:text-display-sm"
      >
        Something went wrong
      </h1>

      <p className="mt-3 text-ink-muted">
        We hit a problem on our side. Nothing you did caused this. Please try again in a
        moment.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to shipment tracking
        </ButtonLink>
      </div>
    </main>
  );
}
