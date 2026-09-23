"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary.
 *
 * `error.tsx` cannot catch a failure in the root layout itself, so this renders
 * its own document. It shows nothing technical — the underlying error is logged
 * on the server.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] root error", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#f1f4f8",
          color: "#0f172a",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#475569", marginBottom: "1.5rem" }}>
            We hit a problem on our side. Nothing you did caused this. Please try
            again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: "2.75rem",
              padding: "0 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#1a37b5",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
