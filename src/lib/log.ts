/**
 * Server-side error logging: one JSON line per event, so the host's runtime
 * log view can be searched by event name or error id.
 *
 * Only what is needed to diagnose a fault is written — the error's class, code
 * and stack, plus whatever context the caller passes (never request bodies).
 * A database error's message is left out, because Prisma messages can quote
 * the values of the failing query, and those can include the customer-written
 * text of an enquiry.
 */
export function logError(
  event: string,
  error: unknown,
  context: Record<string, string> = {},
): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      time: new Date().toISOString(),
      ...context,
      error: describeError(error),
    }),
  );
}

function describeError(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) {
    return { name: typeof error };
  }

  const isDatabaseError = error.name.startsWith("PrismaClient");
  const code = (error as { code?: unknown }).code;
  // Only the call frames. A stack starts by repeating the message, and a
  // Prisma message runs over several lines, so dropping just the first line
  // would still log the rest of it.
  const frames = error.stack
    ?.split("\n")
    .filter((line) => /^\s+at /.test(line))
    .join("\n");

  return {
    name: error.name,
    ...(typeof code === "string" ? { code } : {}),
    ...(isDatabaseError ? {} : { message: error.message }),
    ...(frames ? { stack: frames } : {}),
  };
}
