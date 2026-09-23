"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarClock,
  MessageSquareText,
  PackageSearch,
  Search,
  SearchX,
} from "lucide-react";
import { ApiError, apiGet } from "@/lib/api-client";
import type { PublicTrackingResult } from "@/lib/dto/shipment";
import {
  normaliseTrackingNumber,
  TRACKING_NUMBER_PATTERN,
} from "@/lib/domain/tracking-number";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { EnquiryForm } from "./enquiry-form";
import { ShipmentSummary } from "./shipment-summary";
import { TrackingTimeline } from "./tracking-timeline";

/**
 * The public tracking journey, as an explicit state machine.
 *
 * "Not found" is a product state with its own treatment, separate from a server
 * error — a customer needs to tell "we could not find it" apart from "we could
 * not reach the system".
 */
type ViewState =
  | { kind: "idle" }
  | { kind: "loading"; trackingNumber: string }
  | { kind: "found"; trackingNumber: string; result: PublicTrackingResult }
  | { kind: "notFound"; trackingNumber: string }
  | { kind: "error"; trackingNumber: string; message: string };

/** Demo shipments seeded for reviewers, one per scenario. */
const DEMO_NUMBERS = [
  { number: "TRK-DEMO-001", scenario: "In transit" },
  { number: "TRK-DEMO-002", scenario: "Delivered" },
  { number: "TRK-DEMO-003", scenario: "Delayed" },
  { number: "TRK-DEMO-004", scenario: "Needs attention" },
  { number: "TRK-DEMO-005", scenario: "Collected" },
];

export function TrackingExperience({
  initialTrackingNumber,
  initialResult,
  initialNotFound = false,
  initialError,
}: {
  initialTrackingNumber?: string;
  initialResult?: PublicTrackingResult;
  initialNotFound?: boolean;
  /** Set when the server could not look the number up, e.g. when rate limited. */
  initialError?: string;
}) {
  const router = useRouter();

  const [query, setQuery] = useState(initialTrackingNumber ?? "");
  const [inputError, setInputError] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>(() => {
    if (initialResult && initialTrackingNumber) {
      return {
        kind: "found",
        trackingNumber: initialTrackingNumber,
        result: initialResult,
      };
    }
    if (initialNotFound && initialTrackingNumber) {
      return { kind: "notFound", trackingNumber: initialTrackingNumber };
    }
    if (initialError && initialTrackingNumber) {
      return { kind: "error", trackingNumber: initialTrackingNumber, message: initialError };
    }
    return { kind: "idle" };
  });

  const resultHeadingRef = useRef<HTMLDivElement>(null);
  // Abandons an in-flight lookup when a newer one starts, so a slow earlier
  // response can never replace a newer result.
  const inFlight = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldMoveFocus = useRef(false);

  // Focus follows the outcome, so a screen-reader user learns what happened.
  useEffect(() => {
    if (!shouldMoveFocus.current) return;
    if (state.kind === "loading" || state.kind === "idle") return;

    resultHeadingRef.current?.focus();
    shouldMoveFocus.current = false;
  }, [state]);

  const lookup = useCallback(
    async (rawValue: string) => {
      const trackingNumber = normaliseTrackingNumber(rawValue);
      shouldMoveFocus.current = true;
      setState({ kind: "loading", trackingNumber });

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      try {
        const result = await apiGet<PublicTrackingResult>(
          `/api/shipments/${encodeURIComponent(trackingNumber)}`,
          controller.signal,
        );

        setState({ kind: "found", trackingNumber, result });
        // Shareable, refreshable URL without a full page load.
        router.replace(`/track/${encodeURIComponent(trackingNumber)}`, {
          scroll: false,
        });
      } catch (error) {
        // Superseded by a newer search: leave the newer state alone.
        if (controller.signal.aborted) return;

        if (error instanceof ApiError && error.code === "SHIPMENT_NOT_FOUND") {
          setState({ kind: "notFound", trackingNumber });
          router.replace(`/track/${encodeURIComponent(trackingNumber)}`, {
            scroll: false,
          });
          return;
        }

        setState({
          kind: "error",
          trackingNumber,
          message:
            error instanceof ApiError
              ? error.message
              : "We could not reach the tracking system. Please try again.",
        });
      }
    },
    [router],
  );

  const submit = (value: string) => {
    const normalised = normaliseTrackingNumber(value);

    if (normalised === "") {
      setInputError("Enter a tracking number");
      inputRef.current?.focus();
      return;
    }

    if (!TRACKING_NUMBER_PATTERN.test(normalised)) {
      setInputError(
        "That does not look like a tracking number. They look like TRK-DEMO-001.",
      );
      inputRef.current?.focus();
      return;
    }

    setInputError(null);
    void lookup(normalised);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(query);
  };

  const isLoading = state.kind === "loading";
  const compact = state.kind !== "idle";

  return (
    // A shipment result sits on a slightly deeper page tone so its white
    // panels stand clear of the background. The landing state keeps the default.
    <div className={cn(state.kind === "found" && "bg-surface-sunken")}>
      {/* Search */}
      <section aria-labelledby="tracking-title" className="bg-brand-950 text-white">
        <div
          className={cn(
            "mx-auto max-w-6xl px-4 transition-[padding] sm:px-6 lg:px-8",
            compact ? "py-8 sm:py-10" : "pb-12 pt-9 sm:pb-14 sm:pt-11 lg:pb-16 lg:pt-12",
          )}
        >
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-300">Shipment tracking</p>
            <h1
              id="tracking-title"
              className={cn(
                "mt-2 text-white",
                compact
                  ? "text-2xl font-bold tracking-tight sm:text-display-sm"
                  : "text-display-sm sm:text-display-md lg:text-display-lg",
              )}
            >
              Track your shipment
            </h1>
            {!compact ? (
              <p className="mt-3 text-[1.0625rem] leading-7 text-brand-100 sm:text-lg">
                See where your shipment is, when it should arrive, and everything that has
                happened along the way. No account needed.
              </p>
            ) : null}
          </div>

          <form
            onSubmit={onSubmit}
            noValidate
            className={cn("max-w-2xl", compact ? "mt-6" : "mt-7")}
          >
            <Field
              label="Tracking number"
              required
              tone="inverse"
              hint="You will find this on your confirmation email or shipping label."
              error={inputError ?? undefined}
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. TRK-DEMO-001"
                  autoComplete="off"
                  spellCheck={false}
                  leadingIcon={<Search className="h-5 w-5" />}
                  className="h-14 font-mono text-lg uppercase placeholder:font-sans placeholder:text-base placeholder:normal-case sm:h-14"
                />
                <Button
                  type="submit"
                  size="lg"
                  loading={isLoading}
                  loadingLabel="Searching..."
                  className="h-14 sm:px-8"
                >
                  Track shipment
                </Button>
              </div>
            </Field>
          </form>

          {!compact ? (
            <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-1.5 text-[0.8125rem]">
              <span className="font-medium text-brand-200">Try a demo shipment:</span>
              {DEMO_NUMBERS.map((demo) => (
                <button
                  key={demo.number}
                  type="button"
                  onClick={() => {
                    setQuery(demo.number);
                    submit(demo.number);
                  }}
                  className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium text-white transition-colors hover:bg-white/20 focus-visible:ring-offset-brand-950"
                >
                  <span className="font-mono">{demo.number}</span>
                  <span className="text-brand-200"> · {demo.scenario}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Result */}
      <div
        ref={resultHeadingRef}
        tabIndex={-1}
        aria-busy={isLoading || undefined}
        className="mx-auto max-w-6xl px-4 py-10 focus:outline-none sm:px-6 sm:py-14 lg:px-8"
      >
        {state.kind === "idle" ? <IdleIntro /> : null}

        {state.kind === "loading" ? (
          <LoadingState label={`Looking up ${state.trackingNumber}...`} className="py-24" />
        ) : null}

        {state.kind === "notFound" ? (
          <EmptyState
            icon={<SearchX className="h-5 w-5" aria-hidden="true" />}
            title={`We could not find ${state.trackingNumber}`}
            description="Check the number for typing mistakes. Very recently booked shipments can take a short while to appear. You can search for a different tracking number above."
            className="py-20"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  inputRef.current?.focus();
                  inputRef.current?.select();
                }}
              >
                Edit the tracking number
              </Button>
            }
          />
        ) : null}

        {state.kind === "error" ? (
          <ErrorState
            description={state.message}
            onRetry={() => void lookup(state.trackingNumber)}
            className="py-20"
          />
        ) : null}

        {state.kind === "found" ? (
          <div className="animate-fade-in space-y-8 sm:space-y-10">
            <ShipmentSummary
              shipment={state.result.shipment}
              latestEvent={state.result.events[0] ?? null}
              events={state.result.events}
            />

            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-10">
              <TrackingTimeline events={state.result.events} />
              {/* Recessed rather than raised: a support action, secondary to the shipment itself. */}
              <div className="min-w-0 rounded-xl bg-surface-muted p-5 ring-1 ring-inset ring-line-strong/60 sm:p-6 lg:sticky lg:top-24">
                <EnquiryForm trackingNumber={state.trackingNumber} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** What a customer gets from tracking, shown before the first search. */
function IdleIntro() {
  const points = [
    {
      icon: PackageSearch,
      title: "Live status",
      text: "The current state of your shipment in plain language, with every step recorded.",
    },
    {
      icon: CalendarClock,
      title: "Delivery estimate",
      text: "When to expect it — and, if that changes, both the new and the original date.",
    },
    {
      icon: BellRing,
      title: "Clear warnings",
      text: "Delays and problems are explained, not just flagged, so you know what happens next.",
    },
    {
      icon: MessageSquareText,
      title: "Help when you need it",
      text: "Send our team a question about the shipment without creating an account.",
    },
  ];

  return (
    <div>
      <h2 className="text-title text-ink">Enter a tracking number to begin</h2>
      <p className="mt-1 text-base text-ink-muted">
        Type it into the search above and select Track shipment.
      </p>

      <ul className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {points.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <Icon className="h-6 w-6 text-brand-700" aria-hidden="true" />
            <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-ink-muted">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
