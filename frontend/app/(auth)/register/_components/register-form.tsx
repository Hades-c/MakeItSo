"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { GENERIC_ERROR, NETWORK_ERROR } from "@/app/(auth)/_lib/messages";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountApi, RegisterBodySchema } from "@/lib/api/account";
import { ApiClientError, callApi } from "@/lib/api/client";
import { routes } from "@/lib/routes";

export interface ClassYearOption {
  label: string;
  graduationYear: number;
}

export interface RegisterFormProps {
  /** First-year first (the default). */
  classYears: readonly ClassYearOption[];
  /** A mail provider is configured: new accounts continue to /verify. */
  mailAvailable: boolean;
}

type FieldName = "name" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_NAMES: readonly FieldName[] = ["name", "email", "password"];

function fieldErrorsFrom(issues: readonly { path: string; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = FIELD_NAMES.find(
      (name) => issue.path === name || issue.path.startsWith(`${name}.`),
    );
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function RegisterForm({ classYears, mailAvailable }: RegisterFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [graduationYear, setGraduationYear] = useState(String(classYears[0]?.graduationYear ?? ""));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** The server's "check your inbox" message once the form was accepted but signing in did not follow. */
  const [checkInbox, setCheckInbox] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const body = { name, email, password, graduationYear: Number(graduationYear) };
    const parsed = RegisterBodySchema.safeParse(body);
    if (!parsed.success) {
      setFieldErrors(
        fieldErrorsFrom(
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        ),
      );
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      const accepted = await callApi(accountApi.register, { body });
      // A new account can sign in straight away (unverified accounts use the catalog and the plan).
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result && !result.error) {
        router.replace(mailAvailable ? routes.verify() : routes.today());
        router.refresh();
        return;
      }
      setCheckInbox(accepted.message);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const errors = fieldErrorsFrom(caught.issues ?? []);
        setFieldErrors(errors);
        setError(Object.keys(errors).length > 0 ? null : caught.message || GENERIC_ERROR);
      } else {
        setError(NETWORK_ERROR);
      }
    }
    setLoading(false);
  }

  if (checkInbox) {
    return (
      <AuthCard
        title="Check your Davidson inbox"
        description={
          <>
            We received your sign-up for <b className="font-semibold text-fg">{email}</b>.
          </>
        }
        footer={
          <>
            Already have an account?{" "}
            <Link href={routes.login()} className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FormAlert tone="info" title="What happens next">
            {checkInbox}
          </FormAlert>
          <p className="flex items-start gap-2.5 text-sm text-fg-2">
            <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Nothing there after a few minutes? Check your spam folder. Messages come from
              MakeItSo, never from Davidson.
            </span>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Plan your courses, your four years and what comes after."
      footer={
        <>
          Already have an account?{" "}
          <Link href={routes.login()} className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="name" label="Full name" error={fieldErrors.name}>
          <Input
            placeholder="Alex Johnson"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            maxLength={100}
          />
        </Field>
        <Field
          id="email"
          label="Email"
          hint="Your @davidson.edu address. We send it a code to confirm it is yours."
          error={fieldErrors.email}
        >
          <Input
            type="email"
            placeholder="you@davidson.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
          />
        </Field>
        <Field
          id="password"
          label="Password"
          hint="At least 10 characters. Not your Davidson password, and nothing common."
          error={fieldErrors.password}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            autoComplete="new-password"
          />
        </Field>
        <Select value={graduationYear} onValueChange={setGraduationYear}>
          <Field id="class-year" label="Class year">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
          </Field>
          <SelectContent>
            {classYears.map((year) => (
              <SelectItem key={year.graduationYear} value={String(year.graduationYear)}>
                {year.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-xs text-fg-3">
          MakeItSo is an independent student project, not a Davidson College service. See{" "}
          <Link href={routes.privacy()} className="font-semibold text-primary hover:underline">
            what we store and why
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
