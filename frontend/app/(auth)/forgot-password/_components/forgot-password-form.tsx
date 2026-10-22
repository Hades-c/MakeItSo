"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import {
  FieldErrorSummary,
  useFocusFirstInvalid,
  type FieldSpecs,
} from "@/app/(auth)/_components/field-errors";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { GENERIC_ERROR, NETWORK_ERROR } from "@/app/(auth)/_lib/messages";
import { STANDALONE_LINK } from "@/app/(auth)/_lib/styles";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmailSchema, PasswordSchema, VerificationCodeSchema } from "@/lib/api/account";
import { ApiClientError, callApi } from "@/lib/api/client";
import { accountEndpoints } from "@/lib/api/endpoints";
import { resetTokenFromHash, routes } from "@/lib/routes";

type Errors = Partial<Record<"email" | "code" | "newPassword" | "token" | "form", string>>;

const EMAIL_FIELDS: FieldSpecs<"email"> = { email: { id: "email", label: "Email" } };
const RESET_FIELDS: FieldSpecs<"code" | "newPassword"> = {
  code: { id: "code", label: "Reset code" },
  newPassword: { id: "new-password", label: "New password" },
};
const LINK_FIELDS: FieldSpecs<"newPassword"> = {
  newPassword: { id: "link-new-password", label: "New password" },
};
const ALL_FIELDS: FieldSpecs<"email" | "code" | "newPassword"> = {
  ...EMAIL_FIELDS,
  ...RESET_FIELDS,
};

function errorsFrom(caught: unknown): Errors {
  if (!(caught instanceof ApiClientError)) return { form: GENERIC_ERROR };
  if (caught.code === "network") return { form: NETWORK_ERROR };
  const errors: Errors = {};
  for (const issue of caught.issues ?? []) {
    if (
      issue.path === "email" ||
      issue.path === "code" ||
      issue.path === "newPassword" ||
      issue.path === "token"
    ) {
      errors[issue.path] ??= issue.message;
    }
  }
  if (Object.keys(errors).length === 0) errors.form = caught.message || GENERIC_ERROR;
  return errors;
}

/**
 * Step 1: the address → an e-mail with a reset link and a code. Step 2: code + new password → signed in. Opened
 * from the e-mailed link (/forgot-password#token=…), it asks only for the new password; the token is read from the
 * fragment and removed from the address bar at once (kept out of the history).
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset" | "link">("email");
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useFocusFirstInvalid(errors, ALL_FIELDS);

  useEffect(() => {
    const fromLink = resetTokenFromHash(window.location.hash);
    if (!fromLink) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    // The fragment is only readable in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(fromLink);
    setStep("link");
  }, []);

  async function resetWithLink(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    const passwordCheck = PasswordSchema.safeParse(newPassword);
    if (!passwordCheck.success) {
      setErrors({ newPassword: passwordCheck.error.issues[0]?.message });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { email: account } = await callApi(accountEndpoints.confirmPasswordResetLink, {
        body: { token, newPassword },
      });
      const result = await signIn("credentials", {
        email: account,
        password: newPassword,
        redirect: false,
      });
      router.replace(result && !result.error ? routes.today() : routes.login());
      router.refresh();
      return;
    } catch (caught) {
      setErrors(errorsFrom(caught));
    }
    setLoading(false);
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message ?? "Enter a valid email address" });
      return;
    }
    setLoading(true);
    try {
      const result = await callApi(accountEndpoints.requestPasswordReset, {
        body: { email: parsed.data },
      });
      setNotice(result.message);
      setStep("reset");
    } catch (caught) {
      setErrors(errorsFrom(caught));
    }
    setLoading(false);
  }

  async function reset(event: React.FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    const codeCheck = VerificationCodeSchema.safeParse(code.replace(/\s+/g, ""));
    if (!codeCheck.success) next.code = codeCheck.error.issues[0]?.message;
    const passwordCheck = PasswordSchema.safeParse(newPassword);
    if (!passwordCheck.success) next.newPassword = passwordCheck.error.issues[0]?.message;
    setErrors(next);
    if (!codeCheck.success || !passwordCheck.success) return;
    setLoading(true);
    try {
      await callApi(accountEndpoints.confirmPasswordReset, {
        body: { email, code: codeCheck.data, newPassword },
      });
      const result = await signIn("credentials", { email, password: newPassword, redirect: false });
      router.replace(result && !result.error ? routes.today() : routes.login());
      router.refresh();
      return;
    } catch (caught) {
      setErrors(errorsFrom(caught));
    }
    setLoading(false);
  }

  const footer = (
    <Link href={routes.login()} className={STANDALONE_LINK}>
      Back to sign in
    </Link>
  );

  if (step === "link") {
    return (
      <AuthCard
        title="Choose a new password"
        description="From the link in your reset e-mail."
        footer={footer}
      >
        <form onSubmit={resetWithLink} className="flex flex-col gap-4" noValidate>
          {errors.token || errors.form ? (
            <FormAlert>
              <p>{errors.token ?? errors.form}</p>
            </FormAlert>
          ) : null}
          <FieldErrorSummary errors={errors} fields={LINK_FIELDS} />
          <Field
            id={LINK_FIELDS.newPassword.id}
            label={LINK_FIELDS.newPassword.label}
            hint="At least 10 characters. Not your Davidson password, and nothing common."
            error={errors.newPassword}
          >
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Saving…" : "Set new password"}
          </Button>
          {errors.token ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setStep("email");
                setToken(null);
                setErrors({});
              }}
            >
              Ask for a new link
            </Button>
          ) : null}
        </form>
      </AuthCard>
    );
  }

  if (step === "email") {
    return (
      <AuthCard
        title="Forgot your password?"
        description="Enter your account's email address and we'll send you a reset link and code."
        footer={footer}
      >
        <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
          {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
          <FieldErrorSummary errors={errors} fields={EMAIL_FIELDS} />
          <Field id={EMAIL_FIELDS.email.id} label={EMAIL_FIELDS.email.label} error={errors.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@davidson.edu"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              required
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset e-mail"}
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description={
        <>
          For <b className="font-semibold text-fg">{email}</b>.
        </>
      }
      footer={footer}
    >
      <form onSubmit={reset} className="flex flex-col gap-4" noValidate>
        {notice ? <FormAlert tone="info">{notice}</FormAlert> : null}
        {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
        <FieldErrorSummary errors={errors} fields={RESET_FIELDS} />
        <Field id={RESET_FIELDS.code.id} label={RESET_FIELDS.code.label} error={errors.code}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={7}
            placeholder="123456"
            className="font-mono tracking-label"
            required
          />
        </Field>
        <Field
          id={RESET_FIELDS.newPassword.id}
          label={RESET_FIELDS.newPassword.label}
          hint="At least 10 characters. Not your Davidson password, and nothing common."
          error={errors.newPassword}
        >
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Saving…" : "Set new password"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setStep("email");
            setErrors({});
            setNotice(null);
          }}
        >
          Use a different email
        </Button>
      </form>
    </AuthCard>
  );
}
