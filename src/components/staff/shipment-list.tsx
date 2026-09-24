"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, PackageSearch, Plus, Search, X } from "lucide-react";
import { ApiError, apiGet } from "@/lib/api-client";
import type { StaffShipmentListItem } from "@/lib/dto/shipment";
import {
  isShipmentStatus,
  NEEDS_ATTENTION_FILTER,
  NEEDS_ATTENTION_FILTER_LABEL,
  SHIPMENT_STATUSES,
  STATUS_LABEL,
} from "@/lib/domain/status";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateOnly, DateTime, RelativeTime } from "@/components/ui/date-time";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

interface ListResponse {
  shipments: StaffShipmentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: ListResponse }
  | { kind: "error"; message: string };

/**
 * The operator's working list.
 *
 * Search, filter and page all live in the URL, so a view can be shared,
 * bookmarked and survives a refresh. Every fetch goes through the staff API,
 * which is the same endpoint a reviewer can call with curl.
 */
export function ShipmentList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const [queryInput, setQueryInput] = useState(q);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => setQueryInput(q), [q]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));

    try {
      const data = await apiGet<ListResponse>(
        `/api/staff/shipments${params.size > 0 ? `?${params}` : ""}`,
        signal,
      );
      setState({ kind: "ready", data });
    } catch (error) {
      // A superseded request: a newer search or page is already loading.
      if (signal?.aborted) return;

      setState({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "We could not load shipments. Please try again.",
      });
    }
  }, [q, status, page]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    // Abandon the in-flight request when the filters change, so a slow earlier
    // response cannot land after a newer one and contradict the URL.
    return () => controller.abort();
  }, [load]);

  const updateParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    // Any change to the filters returns to the first page.
    if (!("page" in changes)) params.delete("page");

    router.push(`/staff/shipments${params.size > 0 ? `?${params}` : ""}`);
  };

  const clearFilters = () => {
    setQueryInput("");
    router.push("/staff/shipments");
  };

  const hasFilters = q !== "" || status !== "";

  return (
    <div>
      <PageHeader
        title="Shipments"
        description="Search, filter and manage every shipment record."
        actions={
          <ButtonLink href="/staff/shipments/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New shipment
          </ButtonLink>
        }
      />

      {/* Toolbar: on the page itself, so the surface below holds only results. */}
      <form
        className="mb-6 flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({ q: queryInput.trim() });
        }}
      >
        <Field label="Search by tracking number" className="flex-1">
          <Input
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="e.g. TRK-DEMO or 4KP2"
            autoComplete="off"
            spellCheck={false}
            leadingIcon={<Search className="h-4 w-4" />}
            className="font-mono placeholder:font-sans"
          />
        </Field>

        <Field label="Status" className="md:w-56">
          <Select
            value={status}
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            <option value="">All statuses</option>
            <option value={NEEDS_ATTENTION_FILTER}>{NEEDS_ATTENTION_FILTER_LABEL}</option>
            {SHIPMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1 md:flex-none">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
          {hasFilters ? (
            <Button type="button" variant="ghost" onClick={clearFilters}>
              <X className="h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      <Card as="div" className="overflow-hidden">
        {state.kind === "loading" ? (
          <div className="px-5 sm:px-6">
            <SkeletonRows rows={5} />
          </div>
        ) : null}

        {state.kind === "error" ? (
          <ErrorState description={state.message} onRetry={() => void load()} />
        ) : null}

        {state.kind === "ready" ? (
          state.data.shipments.length === 0 ? (
            <EmptyState
              bare
              icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
              title={hasFilters ? "No shipments match your filters" : "No shipments yet"}
              description={
                hasFilters
                  ? "Try a different tracking number or clear the filters to see every shipment."
                  : "Create the first shipment to get started."
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-6">
                <p aria-live="polite" className="text-sm text-ink-muted">
                  <span className="font-semibold text-ink">
                    {state.data.total === 1 ? "1 shipment" : `${state.data.total} shipments`}
                  </span>
                  {hasFilters ? " matching your filters" : ""}
                </p>
                {isShipmentStatus(status) ? <StatusBadge status={status} /> : null}
              </div>

              <ShipmentTable shipments={state.data.shipments} />

              <Pagination
                page={state.data.page}
                total={state.data.total}
                pageSize={state.data.pageSize}
                label="Shipment pages"
                onChange={(next) => updateParams({ page: String(next) })}
              />
            </>
          )
        ) : null}
      </Card>
    </div>
  );
}

/**
 * A table on wide screens, cards on narrow ones. Same data, same order.
 *
 * Between md and xl the content column is only about 700px wide (the sidebar
 * takes the rest from lg), so the table drops to four columns there: status
 * sits under the tracking number and the last update shows relative time
 * only. The wrapper still scrolls as a last resort, so an unusually long city
 * name can never push the whole page sideways.
 */
function ShipmentTable({ shipments }: { shipments: StaffShipmentListItem[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto border-t border-line-strong/60 md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Shipments, most recently updated first</caption>
          <thead className="bg-canvas text-xs font-semibold uppercase tracking-[0.05em] text-ink-muted">
            <tr>
              <th scope="col" className="whitespace-nowrap px-6 py-3">
                Tracking number
                <span className="2xl:hidden"> / status</span>
              </th>
              <th scope="col" className="hidden whitespace-nowrap px-4 py-3 2xl:table-cell">Status</th>
              <th scope="col" className="px-4 py-3">Route</th>
              {/* Below 2xl the last update sits under the delivery date, as status
                  sits under the tracking number, so the route keeps its width. */}
              <th scope="col" className="whitespace-nowrap px-6 py-3 text-right 2xl:px-4 2xl:text-left">
                <span className="2xl:hidden">Delivery / update</span>
                <span className="hidden 2xl:inline">Estimated delivery</span>
              </th>
              <th scope="col" className="hidden whitespace-nowrap px-6 py-3 text-right 2xl:table-cell">Last update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-strong/60">
            {shipments.map((shipment) => (
              <tr key={shipment.id} className="transition-colors hover:bg-canvas">
                <td className="px-6 py-4 align-top 2xl:align-middle">
                  <Link
                    href={`/staff/shipments/${shipment.id}`}
                    className="whitespace-nowrap font-mono font-semibold text-brand-800 hover:underline"
                  >
                    {shipment.trackingNumber}
                  </Link>
                  <div className="mt-1.5 2xl:hidden">
                    <StatusBadge status={shipment.status} />
                  </div>
                </td>
                <td className="hidden px-4 py-4 2xl:table-cell">
                  <StatusBadge status={shipment.status} />
                </td>
                <td className="px-4 py-4 align-top 2xl:align-middle">
                  <span className="flex flex-wrap items-center gap-x-2 font-semibold text-ink">
                    {shipment.origin.city}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" /><span className="sr-only">to</span>
                    {shipment.destination.city}
                  </span>
                  {shipment.currentLocation ? (
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      Now at {shipment.currentLocation}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right align-top font-medium text-ink 2xl:px-4 2xl:text-left 2xl:align-middle">
                  <DateOnly value={shipment.estimatedDelivery} />
                  <span className="mt-1 block text-xs font-normal text-ink-muted 2xl:hidden">
                    Updated <RelativeTime value={shipment.updatedAt} />
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-6 py-4 text-right align-top text-ink-muted 2xl:table-cell 2xl:align-middle">
                  <RelativeTime value={shipment.updatedAt} className="block font-medium text-ink" />
                  <DateTime value={shipment.updatedAt} className="hidden text-xs tabular-nums 2xl:block" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line-strong/60 border-t border-line-strong/60 md:hidden">
        {shipments.map((shipment) => (
          <li key={shipment.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/staff/shipments/${shipment.id}`}
                className="font-mono text-[0.9375rem] font-semibold text-brand-800 hover:underline"
              >
                {shipment.trackingNumber}
              </Link>
              <StatusBadge status={shipment.status} />
            </div>

            <p className="mt-2 flex flex-wrap items-center gap-x-2 font-semibold text-ink">
              {shipment.origin.city}
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" /><span className="sr-only">to</span>
              {shipment.destination.city}
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-ink-subtle">Estimated delivery</dt>
                <dd className="font-medium text-ink">
                  <DateOnly value={shipment.estimatedDelivery} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-subtle">Last update</dt>
                <dd className="font-medium text-ink">
                  <RelativeTime value={shipment.updatedAt} />
                </dd>
              </div>
              {shipment.currentLocation ? (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-ink-subtle">Current location</dt>
                  <dd className="break-words text-ink">{shipment.currentLocation}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

