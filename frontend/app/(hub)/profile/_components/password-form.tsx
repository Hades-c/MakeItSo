"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  FieldErrorSummary,
  useFocusFirstInvalid,
  type FieldSpecs,
} from "@/app/(auth)/_components/field-errors";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { accountApi, PasswordSchema } from "@/lib/api/account";
import { callApi } from "@/lib/api/client";
import { routes } from "@/lib/routes";
import { describeFailure } from "../_lib/errors";
import { hardNavigate } from "../_lib/navigate";
import { fieldErrorsFromIssues } from "../_lib/options";

/**
 * Change password (W3: POST /api/account/password). The change ends every session, this one included, so on
 * success the form signs this browser in again with the new password (next-auth credentials) and every other
 * device has to sign in again. If that sign-in fails, the student is sent to /login.
 */

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

const FIELDS: FieldSpecs<PasswordField> = {
  currentPassword: { id: "current-password", label: "Current password" },
  newPassword: { id: "new-password", label: "New password" },
  confirmPassword: { id: "confirm-password", label: "Confirm new password" },
};
const FIELD_NAMES = Object.keys(FIELDS) as PasswordField[];

export interface PasswordFormProps {
  email: string;
}

export function PasswordForm({ email }: PasswordFormProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useFocusFirstInvalid(fieldErrors, FIELDS);

  function validate(): Partial<Record<PasswordField, string>> {
    const errors: Partial<Record<PasswordField, string>> = {};
    if (!currentPassword) errors.currentPassword = "Enter your current password.";
    const policy = PasswordSchema.safeParse(newPassword);
    if (!policy.success)
      errors.newPassword = policy.error.issues[0]?.message ?? "Choose another password.";
    else if (newPassword === currentPassword)
      errors.newPassword = "Choose a password different from your current one.";
    if (!errors.newPassword && confirmPassword !== newPassword)
      errors.confirmPassword = "The two new passwords do not match.";
    return errors;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setStatus("");
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      await callApi(accountApi.changePassword, { body: { currentPassword, newPassword } });
    } catch (caught) {
      const failure = describeFailure(caught);
      const byField = fieldErrorsFromIssues(failure.issues, FIELD_NAMES);
      setFieldErrors(byField);
      setError(Object.keys(byField).length > 0 ? null : failure.message);
      setSaving(false);
      return;
    }
    // Every session ended with the change: sign this browser back in with the new password.
    try {
      const result = await signIn("credentials", { email, password: newPassword, redirect: false });
      if (!result || result.error) throw new Error(result?.error ?? "sign-in failed");
    } catch {
      hardNavigate(routes.login(routes.profile()));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSaving(false);
    setStatus("Password changed. Every other device was signed out; this one is still signed in.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FieldErrorSummary errors={fieldErrors} fields={FIELDS} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      {/* For password managers: the account the new password belongs to. */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <Field
        id={FIELDS.currentPassword.id}
        label="Current password"
        error={fieldErrors.currentPassword}
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id={FIELDS.newPassword.id}
          label="New password"
          hint="At least 10 characters. A few unrelated words work well."
          error={fieldErrors.newPassword}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field
          id={FIELDS.confirmPassword.id}
          label="Confirm new password"
          error={fieldErrors.confirmPassword}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p role="status" className="text-sm font-medium text-success">
          {status}
        </p>
        {/* aria-disabled, not disabled: focus stays on the button while the change is in flight. */}
        <Button
          type="submit"
          variant="secondary"
          aria-disabled={saving ? true : undefined}
          className="md:ml-auto"
        >
          {saving ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
