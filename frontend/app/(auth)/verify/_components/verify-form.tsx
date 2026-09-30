"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { CodeSchema } from "@/app/(auth)/_lib/contracts";
import { GENERIC_ERROR, NETWORK_ERROR } from "@/app/(auth)/_lib/messages";
import { STANDALONE_LINK } from "@/app/(auth)/_lib/styles";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { accountApi } from "@/lib/api/account";
import { ApiClientError, callApi } from "@/lib/api/client";
import { routes } from "@/lib/routes";

export interface VerifyFormProps {
  email: string;
  /** Where to go once verified (same-origin, checked on the server). */
  next: string;
  /**
   * A live code exists (sent, unused, unexpired). When false, nothing claims a code was sent: the primary action
   * is "Email me a code" and the code field appears once one is on its way.
   */
  codeSent: boolean;
  /** Shown above the form, e.g. why a page sent the student here. */
  notice?: string | null;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "network") return NETWORK_ERROR;
    return error.issues?.[0]?.message ?? error.message ?? GENERIC_ERROR;
  }
  return GENERIC_ERROR;
}

export function VerifyForm({ email, next, codeSent, notice = null }: VerifyFormProps) {
  const router = useRouter();
  const codeInput = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState(codeSent);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    const parsed = CodeSchema.safeParse(code.replace(/\s+/g, ""));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code");
      codeInput.current?.focus();
      return;
    }
    setVerifying(true);
    try {
      await callApi(accountApi.verify, { body: { code: parsed.data } });
      router.replace(next);
      router.refresh();
    } catch (caught) {
      setError(messageOf(caught));
      setVerifying(false);
      codeInput.current?.focus();
    }
  }

  async function handleSend() {
    setError(null);
    setStatus(null);
    setSending(true);
    try {
      const result = await callApi(accountApi.resendVerification);
      if (result.sent) {
        setStatus(`We sent a 6-digit code to ${email}. It works for 15 minutes.`);
        setSent(true);
      } else {
        setStatus("Your email is already verified.");
      }
    } catch (caught) {
      setError(messageOf(caught));
    }
    setSending(false);
  }

  const alerts = (
    <>
      {notice ? <FormAlert tone="info">{notice}</FormAlert> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      {status ? <FormAlert tone="success">{status}</FormAlert> : null}
    </>
  );

  return (
    <AuthCard
      title="Verify your email"
      description={
        sent ? (
          <>
            Enter the 6-digit code we sent to <b className="font-semibold text-fg">{email}</b>. A
            code works for 15 minutes.
          </>
        ) : (
          <>
            We&apos;ll email a 6-digit code to <b className="font-semibold text-fg">{email}</b> to
            confirm that the address is yours.
          </>
        )
      }
      footer={
        <>
          Not now?{" "}
          <Link href={routes.today()} className={STANDALONE_LINK}>
            Continue to MakeItSo
          </Link>
          <span className="mt-1 block text-xs text-fg-3">
            You can use the catalog and your plan without verifying.
          </span>
        </>
      }
    >
      {sent ? (
        <form onSubmit={handleVerify} className="flex flex-col gap-4" noValidate>
          {alerts}
          <Field id="code" label="Verification code">
            <Input
              ref={codeInput}
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
          <Button type="submit" size="lg" className="w-full" disabled={verifying}>
            {verifying ? "Verifying…" : "Verify"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => void handleSend()}
            disabled={sending}
          >
            {sending ? "Sending…" : "Send a new code"}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          {alerts}
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => void handleSend()}
            disabled={sending}
          >
            {sending ? "Sending…" : "Email me a code"}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
