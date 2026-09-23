"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError, apiSend } from "@/lib/api-client";
import { KeyRound, Mail, Wand2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const formSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * The one seeded account, matching what `npm run db:seed` creates and what
 * the README documents. Shown here so a reviewer can sign in without leaving
 * the page — the credential itself is already public in the README, so
 * displaying it again exposes nothing new.
 */
const DEMO_STAFF_EMAIL = "staff@demo.test";
const DEMO_STAFF_PASSWORD = "DemoStaff2026!";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const reason = searchParams.get("reason");

  const [formError, setFormError] = useState<string | null>(
    reason === "expired"
      ? "Your session has expired. Please sign in again."
      : reason === "signed-out"
        ? "You have been signed out. Please sign in again."
        : null,
  );
  const errorRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const fillDemoCredentials = () => {
    // Fills the fields for review; it does not submit. Signing in is still a
    // deliberate, visible action.
    setValue("email", DEMO_STAFF_EMAIL, { shouldValidate: true });
    setValue("password", DEMO_STAFF_PASSWORD, { shouldValidate: true });
    setFormError(null);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiSend("/api/auth/login", "POST", values);
      // Return to the page they originally asked for, when there was one.
      // `next` comes from the URL, so it is limited to staff paths: accepting
      // any value would let a crafted link send someone to another site after
      // they sign in.
      router.replace(next && next.startsWith("/staff") ? next : "/staff/shipments");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            if (field === "email" || field === "password") {
              setError(field, { message });
            }
          }
          if (Object.keys(error.fields).length > 0) return;
        }

        setFormError(error.message);
        return;
      }

      setFormError("We could not sign you in. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      {formError ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="focus:outline-none">
          <Alert tone="error" title="We could not sign you in">
            {formError}
          </Alert>
        </div>
      ) : null}

      <Field label="Email address" required error={errors.email?.message}>
        <Input
          {...register("email")}
          type="email"
          autoComplete="username"
          autoFocus
          leadingIcon={<Mail className="h-4 w-4" />}
        />
      </Field>

      <Field label="Password" required error={errors.password?.message}>
        <div className="relative">
          <Input
            {...register("password")}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            leadingIcon={<KeyRound className="h-4 w-4" />}
            className="pr-16"
          />
          {/* After the input in the tab order, so Tab from email lands on the
              password field, not on this toggle. */}
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-pressed={showPassword}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-xs font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            {showPassword ? "Hide" : "Show"}
            <span className="sr-only"> password</span>
          </button>
        </div>
      </Field>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={isSubmitting}
        loadingLabel="Signing in..."
      >
        Sign in
      </Button>

      <div className="rounded-lg bg-canvas px-4 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Demo credentials
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-sm text-ink">
          <span>{DEMO_STAFF_EMAIL}</span>
          <span aria-hidden="true" className="text-ink-subtle">
            /
          </span>
          <span>{DEMO_STAFF_PASSWORD}</span>
        </p>
        <button
          type="button"
          onClick={fillDemoCredentials}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
          Use this
          <span className="sr-only"> to fill in the form above</span>
        </button>
      </div>
    </form>
  );
}
