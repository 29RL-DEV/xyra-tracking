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
 * The seeded accounts, matching what `npm run db:seed` creates and what the
 * README documents. "Use this" fills the form in so a reviewer can sign in
 * without leaving the page; the password itself is not shown here, since it is
 * already public in the README.
 */
const DEMO_ACCOUNTS = [
  { name: "Demo Operator", email: "staff@demo.test" },
  { name: "Demo Operator 2", email: "staff2@demo.test" },
] as const;
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

  const fillDemoCredentials = (email: string) => {
    // Fills the fields for review; it does not submit. Signing in is still a
    // deliberate, visible action.
    setValue("email", email, { shouldValidate: true });
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
      router.replace(next && next.startsWith("/staff") ? next : "/staff");
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
        <ul className="mt-2 divide-y divide-line-strong/60">
          {DEMO_ACCOUNTS.map((account) => (
            <li
              key={account.email}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{account.name}</p>
                <p className="truncate font-mono text-sm text-ink-muted">{account.email}</p>
              </div>
              <button
                type="button"
                onClick={() => fillDemoCredentials(account.email)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                Use this
                <span className="sr-only"> account to fill in the form above</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
