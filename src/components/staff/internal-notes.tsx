"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, StickyNote } from "lucide-react";
import { ApiError, apiSend } from "@/lib/api-client";
import type { StaffNote } from "@/lib/dto/shipment";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { StaffBadge } from "@/components/ui/staff-badge";
import { useToast } from "@/components/ui/toast";

/**
 * Internal notes.
 *
 * A different surface from the customer-visible events — amber rather than
 * white, a lock, and "staff only" stated at the point of entry as well as in
 * the heading — because the most likely way a note reaches a customer is an
 * operator typing it into the wrong box.
 */
export function InternalNotes({
  shipmentId,
  notes,
}: {
  shipmentId: string;
  notes: StaffNote[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();

    if (trimmed.length === 0) {
      setError("Write a note before saving");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await apiSend(`/api/staff/shipments/${shipmentId}/notes`, "POST", {
        body: trimmed,
      });

      setBody("");
      toast.success("Internal note added");
      router.refresh();
    } catch (apiError) {
      setError(
        apiError instanceof ApiError
          ? (apiError.fields?.body ?? apiError.message)
          : "We could not save this note. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="notes-heading"
      className="min-w-0 overflow-hidden rounded-xl bg-surface shadow-surface ring-1 ring-amber-300/70"
    >
      <div className="flex items-start gap-3 bg-amber-50 px-5 py-4">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800"
        >
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 id="notes-heading" className="text-base font-semibold text-ink">
            Internal notes
          </h2>
          <p className="mt-0.5 text-sm text-amber-900">
            Staff only. Never shown on the tracking page or returned by the public API.
          </p>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="space-y-3 px-5 py-5">
        <Field label="Add a note" error={error ?? undefined}>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="What should the next person on this shipment know?"
            className="min-h-[5.5rem]"
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" variant="secondary" size="sm" loading={saving} loadingLabel="Saving...">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Save note
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <EmptyState
          bare
          className="border-t border-line-strong/60"
          icon={<StickyNote className="h-5 w-5" aria-hidden="true" />}
          title="No internal notes yet"
          description="Notes you add here stay inside the operations team."
        />
      ) : (
        <ul className="divide-y divide-line-strong/60 border-t border-line-strong/60">
          {notes.map((note) => (
            <li key={note.id} className="px-5 py-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                {note.body}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                <StaffBadge name={note.author.name} />
                <span aria-hidden="true">·</span>
                <DateTime value={note.createdAt} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
