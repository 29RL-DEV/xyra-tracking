"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EnquiryCategory } from "@prisma/client";
import {
  CheckCircle2,
  CircleDot,
  Clock3,
  Inbox,
  Layers,
  MapPinOff,
  MessageSquareText,
  PackageX,
  RotateCcw,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { ApiError, apiGet, apiSend } from "@/lib/api-client";
import type { StaffEnquiry } from "@/lib/dto/enquiry";
import { enquiryReference } from "@/lib/domain/enquiry-reference";
import { ENQUIRY_CATEGORY_LABEL } from "@/lib/domain/status";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateTime } from "@/components/ui/date-time";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

type Filter = "OPEN" | "RESOLVED" | "ALL";

interface EnquiryPage {
  enquiries: StaffEnquiry[];
  total: number;
  page: number;
  pageSize: number;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: EnquiryPage }
  | { kind: "error"; message: string };

const CATEGORY_ICON: Record<EnquiryCategory, LucideIcon> = {
  DELIVERY_DELAY: Clock3,
  WRONG_ADDRESS: MapPinOff,
  DAMAGED_OR_MISSING: PackageX,
  COLLECTION_ISSUE: Truck,
  OTHER: MessageSquareText,
};

/**
 * Which enquiries to show, from the URL.
 *
 * "All" needs its own value: with no parameter the queue opens on Open, so
 * removing the parameter cannot also mean "everything".
 */
export function filterFromParam(value: string | null): Filter {
  if (value === "RESOLVED") return "RESOLVED";
  if (value === "ALL") return "ALL";
  return "OPEN";
}

/**
 * The enquiry work queue. Defaults to Open, because that is the work.
 *
 * Rendered as inbox rows at every width: enquiry messages are long-form and do
 * not belong in a table cell.
 */
export function EnquiryList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const filter = filterFromParam(searchParams.get("status"));
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [state, setState] = useState<State>({ kind: "loading" });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<EnquiryPage | null> => {
      setState({ kind: "loading" });

      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("status", filter);
      if (page > 1) params.set("page", String(page));

      try {
        const data = await apiGet<EnquiryPage>(
          `/api/staff/enquiries${params.size > 0 ? `?${params}` : ""}`,
          signal,
        );
        setState({ kind: "ready", data });
        return data;
      } catch (error) {
        // An aborted request was replaced by a newer one; its failure is not
        // something to show anybody.
        if (signal?.aborted) return null;

        setState({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "We could not load enquiries. Please try again.",
        });
        return null;
      }
    },
    [filter, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    // Changing the filter or page abandons the previous request, so a slow
    // earlier response cannot overwrite the newer one.
    return () => controller.abort();
  }, [load]);

  const goToPage = (next: number) => {
    const params = new URLSearchParams();
    if (filter !== "OPEN") params.set("status", filter);
    if (next > 1) params.set("page", String(next));

    router.push(`/staff/enquiries${params.size > 0 ? `?${params}` : ""}`);
  };

  const changeFilter = (value: Filter) => {
    // A new filter starts at the first page: page 3 of the old filter rarely
    // means anything in the new one.
    router.push(value === "OPEN" ? "/staff/enquiries" : `/staff/enquiries?status=${value}`);
  };

  const changeEnquiryStatus = async (
    enquiry: StaffEnquiry,
    next: "OPEN" | "RESOLVED",
  ) => {
    setUpdatingId(enquiry.id);

    try {
      await apiSend(`/api/staff/enquiries/${enquiry.id}`, "PATCH", {
        status: next,
      });

      toast.success(
        next === "RESOLVED"
          ? `Enquiry for ${enquiry.trackingNumber} marked resolved`
          : `Enquiry for ${enquiry.trackingNumber} reopened`,
      );

      const reloaded = await load();

      // Resolving the last enquiry on a page would otherwise leave the
      // operator looking at an empty page that still has pages before it.
      if (reloaded && reloaded.enquiries.length === 0 && page > 1) {
        goToPage(page - 1);
      }

      // Keeps the open count in the navigation in step with the queue.
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "We could not update this enquiry. Please try again.",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const removeEnquiry = async (enquiry: StaffEnquiry) => {
    setUpdatingId(enquiry.id);

    try {
      await apiSend(`/api/staff/enquiries/${enquiry.id}`, "DELETE");
      toast.success(`Enquiry ${enquiryReference(enquiry.id)} deleted`);

      const reloaded = await load();
      if (reloaded && reloaded.enquiries.length === 0 && page > 1) {
        goToPage(page - 1);
      }

      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "We could not delete this enquiry. Please try again.",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customer enquiries"
        description="Questions customers have raised against a tracking number, newest first."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Filter>
          label="Filter enquiries by status"
          value={filter}
          onChange={changeFilter}
          options={[
            { value: "OPEN", label: "Open", icon: <CircleDot className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: "RESOLVED", label: "Resolved", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: "ALL", label: "All", icon: <Layers className="h-3.5 w-3.5" aria-hidden="true" /> },
          ]}
        />

        {state.kind === "ready" ? (
          <p aria-live="polite" className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">
              {state.data.total === 1 ? "1 enquiry" : `${state.data.total} enquiries`}
            </span>
          </p>
        ) : null}
      </div>

      <Card as="div" className="overflow-hidden">
        {state.kind === "loading" ? (
          <div className="px-5 sm:px-6">
            <SkeletonRows rows={3} />
          </div>
        ) : null}

        {state.kind === "error" ? (
          <ErrorState description={state.message} onRetry={() => void load()} />
        ) : null}

        {state.kind === "ready" ? (
          state.data.enquiries.length === 0 ? (
            <EmptyState
              bare
              icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
              title={
                filter === "OPEN"
                  ? "No open enquiries"
                  : filter === "RESOLVED"
                    ? "No resolved enquiries yet"
                    : "No enquiries yet"
              }
              description={
                filter === "OPEN"
                  ? "Everything customers have asked about has been dealt with."
                  : "Enquiries customers submit from the tracking page appear here."
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-line-strong/60">
                {state.data.enquiries.map((enquiry) => (
                  <li key={enquiry.id}>
                    <EnquiryRow
                      enquiry={enquiry}
                      updating={updatingId === enquiry.id}
                      onChange={(next) => void changeEnquiryStatus(enquiry, next)}
                      onDelete={() => void removeEnquiry(enquiry)}
                    />
                  </li>
                ))}
              </ul>

              {state.data.total > state.data.pageSize ? (
                <Pagination
                  page={state.data.page}
                  total={state.data.total}
                  pageSize={state.data.pageSize}
                  label="Enquiry pages"
                  onChange={goToPage}
                />
              ) : null}
            </>
          )
        ) : null}
      </Card>
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "3 days", "5 hours" — how long an open enquiry has gone without an answer. */
function waitingFor(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "under an hour";
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * One enquiry as an inbox row.
 *
 * Emphasis comes only from data the enquiry already carries: a delayed or
 * held shipment already shows as such in the shipment-context chip, and an
 * open enquiry that has waited more than a day says so in amber. There is no
 * priority field.
 */
function EnquiryRow({
  enquiry,
  updating,
  onChange,
  onDelete,
}: {
  enquiry: StaffEnquiry;
  updating: boolean;
  onChange: (next: "OPEN" | "RESOLVED") => void;
  onDelete: () => void;
}) {
  // Rows only render in the browser, after the queue has loaded, so reading
  // the clock here cannot cause a hydration mismatch.
  const [now] = useState(() => Date.now());

  const Icon = CATEGORY_ICON[enquiry.category];
  const open = enquiry.status === "OPEN";
  const waitedMs = now - new Date(enquiry.createdAt).getTime();
  const overdue = open && waitedMs > DAY_MS;
  const reference = enquiryReference(enquiry.id);

  // Deletion is permanent, so it takes a second, deliberate click. Focus moves
  // to the confirming button so a keyboard user lands on the choice.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) confirmRef.current?.focus();
  }, [confirmingDelete]);

  return (
    <article
      aria-labelledby={`enquiry-${enquiry.id}`}
      className={cn(
        "grid gap-x-8 gap-y-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_15rem]",
        !open && "bg-canvas/80",
      )}
    >
      <div className="min-w-0">
        {/* Identity: the enquiry type stands alone, so it reads as the row's
            heading rather than competing with the badges beside it. */}
        <div className="flex items-center gap-2">
          <Icon
            className={cn("h-4 w-4 shrink-0", open ? "text-brand-700" : "text-ink-subtle")}
            aria-hidden="true"
          />
          <h2
            id={`enquiry-${enquiry.id}`}
            className={cn("truncate text-base font-semibold", open ? "text-ink" : "text-ink-muted")}
          >
            {ENQUIRY_CATEGORY_LABEL[enquiry.category] ?? enquiry.category}
          </h2>
        </div>

        {/* Metadata: status, reference and the attention flag — quieter, and
            separate from the heading above and the message below. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              open ? "bg-brand-100 text-brand-800" : "bg-emerald-100 text-emerald-800",
            )}
          >
            {open ? (
              <CircleDot className="h-3 w-3" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            )}
            {open ? "Open" : "Resolved"}
          </span>
          <span className="font-mono text-xs text-ink-subtle">Ref {reference}</span>
        </div>

        {/* The customer's own words, kept as plain prose so it never reads as
            another row of metadata. */}
        <p
          className={cn(
            "mt-3 max-w-3xl whitespace-pre-wrap break-words text-[0.9375rem] leading-7",
            open ? "text-ink" : "text-ink-muted",
          )}
        >
          {enquiry.message}
        </p>

        {/* Shipment context, grouped as one unit rather than three loose
            pieces of inline text. */}
        <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-canvas px-3 py-2 text-sm">
          {enquiry.shipment ? (
            <Link
              href={`/staff/shipments/${enquiry.shipment.id}`}
              className="font-mono font-semibold text-brand-800 hover:underline"
            >
              {enquiry.trackingNumber}
            </Link>
          ) : (
            <span className="font-mono text-ink-muted">{enquiry.trackingNumber}</span>
          )}
          {enquiry.shipment ? (
            <>
              <StatusBadge status={enquiry.shipment.status} />
              <span className="text-ink-muted">to {enquiry.shipment.destinationCity}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-col lg:items-end lg:justify-start lg:text-right">
        <div className="min-w-0 text-sm">
          {open ? (
            <p
              className={cn(
                "inline-flex items-center gap-1.5",
                overdue ? "font-semibold text-amber-800" : "font-medium text-ink",
              )}
            >
              <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Waiting {waitingFor(waitedMs)}
            </p>
          ) : enquiry.resolvedAt && enquiry.resolvedBy ? (
            <p className="text-ink-muted">
              Resolved by <span className="font-semibold text-ink">{enquiry.resolvedBy.name}</span>
              <span className="block text-xs">
                <DateTime value={enquiry.resolvedAt} />
              </span>
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-ink-subtle">
            Received <DateTime value={enquiry.createdAt} />
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {open ? (
            <Button
              size="sm"
              loading={updating}
              loadingLabel="Saving..."
              onClick={() => onChange("RESOLVED")}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>
                Mark resolved
                <span className="sr-only"> — enquiry for {enquiry.trackingNumber}</span>
              </span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={updating}
              loadingLabel="Saving..."
              onClick={() => onChange("OPEN")}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>
                Reopen
                <span className="sr-only"> — enquiry for {enquiry.trackingNumber}</span>
              </span>
            </Button>
          )}

          {confirmingDelete ? (
            <div className="flex basis-full flex-wrap items-center gap-2 lg:justify-end">
              <span className="text-sm font-medium text-ink">Delete permanently?</span>
              <Button
                ref={confirmRef}
                size="sm"
                variant="danger"
                loading={updating}
                loadingLabel="Deleting..."
                onClick={onDelete}
              >
                Delete
                <span className="sr-only"> enquiry {reference}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={updating}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={updating}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>
                Delete
                <span className="sr-only"> — enquiry for {enquiry.trackingNumber}</span>
              </span>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
