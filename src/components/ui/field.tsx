"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Form field primitives.
 *
 * Every control gets a visible label, and an error message is tied to its input
 * by aria-describedby with aria-invalid set — so the message is announced, not
 * merely shown.
 */

interface FieldContextValue {
  id: string;
  errorId: string;
  hintId: string;
  hasError: boolean;
  hasHint: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useField(): FieldContextValue {
  const context = useContext(FieldContext);
  if (!context) {
    throw new Error("Field controls must be rendered inside <Field>");
  }
  return context;
}

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
  labelAction,
  tone = "default",
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /**
   * `true` marks the field required, `false` marks it optional, and omitting it
   * shows neither. Search boxes and filters are not form fields a person can
   * leave blank incorrectly, so labelling them "(optional)" is noise.
   */
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** Something small aligned with the label, such as a character count. */
  labelAction?: ReactNode;
  /**
   * `inverse` for a field placed directly on a dark brand surface: the label,
   * hint and error switch to light colours. The control itself is unchanged.
   */
  tone?: "default" | "inverse";
}) {
  const id = useId();
  const value: FieldContextValue = {
    id,
    errorId: `${id}-error`,
    hintId: `${id}-hint`,
    hasError: Boolean(error),
    hasHint: Boolean(hint),
  };
  const inverse = tone === "inverse";

  return (
    <FieldContext.Provider value={value}>
      <div className={cn("min-w-0", className)}>
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor={id}
            className={cn("block text-sm font-medium", inverse ? "text-white" : "text-ink")}
          >
            {label}
            {required === true ? (
              <>
                <span
                  aria-hidden="true"
                  className={cn("ml-0.5 font-semibold", inverse ? "text-red-200" : "text-red-600")}
                >
                  *
                </span>
                {/* The star is visual only; a screen reader still hears "required". */}
                <span className="sr-only"> (required)</span>
              </>
            ) : null}
            {required === false ? (
              <span className={cn("ml-1.5 text-xs font-normal", inverse ? "text-brand-200" : "text-ink-subtle")}>
                (optional)
              </span>
            ) : null}
          </label>
          {labelAction}
        </div>

        {hint ? (
          <p id={value.hintId} className={cn("mt-1 text-sm", inverse ? "text-brand-100" : "text-ink-muted")}>
            {hint}
          </p>
        ) : null}

        <div className="mt-1.5">{children}</div>

        {error ? (
          <p
            id={value.errorId}
            className={cn(
              "mt-1.5 flex items-start gap-1.5 text-sm font-medium",
              inverse ? "text-red-200" : "text-red-700",
            )}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function describedBy(field: FieldContextValue): string | undefined {
  const ids = [
    field.hasHint ? field.hintId : null,
    field.hasError ? field.errorId : null,
  ].filter(Boolean);

  return ids.length > 0 ? ids.join(" ") : undefined;
}

/*
 * Controls draw their own focus treatment — border plus a soft glow — in place
 * of the global offset ring, which looks detached on a bordered input.
 */
const controlBase =
  "block w-full min-w-0 rounded-lg border bg-white text-sm text-ink shadow-inset-field " +
  "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-subtle " +
  "focus:outline-none focus:ring-[3px] focus:ring-offset-0 " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600";

function stateClasses(hasError: boolean): string {
  return hasError
    ? "border-red-500 focus:border-red-600 focus:ring-red-600/20"
    : "border-edge hover:border-edge-strong focus:border-brand-600 focus:ring-brand-600/20";
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { leadingIcon?: ReactNode }
>(function Input({ className, leadingIcon, ...props }, ref) {
  const field = useField();

  const input = (
    <input
      ref={ref}
      id={field.id}
      aria-invalid={field.hasError || undefined}
      aria-describedby={describedBy(field)}
      className={cn(
        controlBase,
        stateClasses(field.hasError),
        "h-11 px-3 sm:h-10",
        leadingIcon ? "pl-10" : null,
        className,
      )}
      {...props}
    />
  );

  if (!leadingIcon) return input;

  return (
    <div className="relative w-full min-w-0 flex-1">
      <span
        className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-slate-500"
        aria-hidden="true"
      >
        {leadingIcon}
      </span>
      {input}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  const field = useField();

  return (
    <textarea
      ref={ref}
      id={field.id}
      aria-invalid={field.hasError || undefined}
      aria-describedby={describedBy(field)}
      className={cn(
        controlBase,
        stateClasses(field.hasError),
        // A message box growing to fit its content is fine; the browser's
        // own drag handle for reshaping it is not something this form offers.
        "min-h-[7.5rem] resize-none px-3 py-2.5 leading-6",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  const field = useField();

  return (
    <div className="relative">
      <select
        ref={ref}
        id={field.id}
        aria-invalid={field.hasError || undefined}
        aria-describedby={describedBy(field)}
        className={cn(
          controlBase,
          stateClasses(field.hasError),
          "h-11 cursor-pointer appearance-none pl-3 pr-10 sm:h-10",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        aria-hidden="true"
      />
    </div>
  );
});
