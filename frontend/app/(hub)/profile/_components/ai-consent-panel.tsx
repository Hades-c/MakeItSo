"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { authExtraApi } from "@/app/(auth)/_lib/contracts";
import { AiChip } from "@/components/ui/ai-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UNVERIFIED_MESSAGE } from "@/lib/api/account";
import { callApi } from "@/lib/api/client";
import { formatMediumDate } from "@/lib/format";
import { queryString, routes } from "@/lib/routes";
import { describeFailure } from "../_lib/errors";

/**
 * AI features are opt-in per student (PLAN §1 "AI"): this panel is the consent notice (what is sent, that it goes
 * to Anthropic, what is never sent), the 18+ attestation (until the owner decides on minors) and the on/off switch,
 * through W3's dedicated endpoint (PUT/DELETE /api/profile/ai-consent). Nothing is optimistic here: the state
 * shown is the server's answer. Consent alone does not open AI: the feature must be on for MakeItSo and the
 * account a verified @davidson.edu one, and the panel says which is missing (with a link to /verify only while a
 * mail provider can send the code). After turning AI on or off, focus moves to the button that replaced the one
 * pressed.
 */

const ATTEST_ID = "ai-adult-attest";
const ATTEST_MESSAGE = "Confirm that you are 18 or older to turn on AI features.";

export interface AiConsentPanelProps {
  aiConsentAt: string | null;
  adultAttestedAt: string | null;
  /** AI_ENABLED for the whole app. */
  aiEnabled: boolean;
  verifiedDavidson: boolean;
  davidson: boolean;
  /** A mail provider is configured, so /verify can send a code. */
  mailAvailable: boolean;
  timeZone: string;
}

export function AiConsentPanel(props: AiConsentPanelProps) {
  const [consentAt, setConsentAt] = useState(props.aiConsentAt);
  const [attested, setAttested] = useState(props.adultAttestedAt !== null);
  const [attestError, setAttestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const attestBox = useRef<HTMLButtonElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const focusToggle = useRef(false);
  const on = consentAt !== null;

  // "Turn on" and "Turn off" are different buttons: after a switch, focus the one now shown.
  useEffect(() => {
    if (!focusToggle.current) return;
    focusToggle.current = false;
    toggle.current?.focus();
  }, [on]);

  async function turnOn() {
    if (busy) return;
    setError(null);
    setStatus("");
    if (!attested) {
      setAttestError(ATTEST_MESSAGE);
      attestBox.current?.focus();
      return;
    }
    setAttestError(null);
    setBusy(true);
    try {
      const { profile } = await callApi(authExtraApi.grantAiConsent, {
        body: { adultAttested: true },
      });
      focusToggle.current = profile.aiConsentAt !== null;
      setConsentAt(profile.aiConsentAt);
      setStatus("AI features are on.");
    } catch (caught) {
      const failure = describeFailure(caught);
      setError(failure.issues[0]?.message ?? failure.message);
    }
    setBusy(false);
  }

  async function turnOff() {
    if (busy) return;
    setError(null);
    setStatus("");
    setBusy(true);
    try {
      const { profile } = await callApi(authExtraApi.revokeAiConsent);
      focusToggle.current = profile.aiConsentAt === null;
      setConsentAt(profile.aiConsentAt);
      setAttested(profile.adultAttestedAt !== null);
      setStatus("AI features are off.");
    } catch (caught) {
      setError(describeFailure(caught).message);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" data-testid="ai-consent-state">
        {on ? (
          <Badge variant="success">
            <ShieldCheck aria-hidden />
            On
          </Badge>
        ) : (
          <Badge>Off</Badge>
        )}
        <span className="text-sm text-fg-2">
          {on && consentAt
            ? `You turned AI features on ${formatMediumDate(consentAt, props.timeZone)}.`
            : "AI features stay off until you turn them on."}
        </span>
      </div>

      {!props.aiEnabled ? (
        <FormAlert tone="info">
          MakeItSo&apos;s AI features are switched off for everyone right now. Your choice here
          applies when they return.
        </FormAlert>
      ) : null}
      {!props.verifiedDavidson ? (
        <FormAlert tone="info">
          {UNVERIFIED_MESSAGE}{" "}
          {!props.davidson ? null : props.mailAvailable ? (
            <Link
              href={`${routes.verify()}${queryString({ next: routes.profile() })}`}
              className="font-semibold text-primary underline"
            >
              Verify your email
            </Link>
          ) : (
            "Email verification is not available yet."
          )}
        </FormAlert>
      ) : null}

      <div className="rounded-lg border border-line bg-bg p-4 text-sm text-fg-2" id="ai-notice">
        <h3 className="flex flex-wrap items-center gap-2 text-base font-strong text-fg">
          What turning them on means <AiChip />
        </h3>
        <p className="mt-2">
          MakeItSo&apos;s AI features (course summaries, plan suggestions, career plans and
          cold-email drafts) use{" "}
          <b className="font-semibold text-fg">Claude, a model made by Anthropic</b>. When you use
          one, MakeItSo sends Anthropic only what that feature needs:
        </p>
        <ul className="mt-2 list-disc pl-5 [&>li+li]:mt-1">
          <li>course codes and public catalog information;</li>
          <li>
            the courses in your plan and the requirements they fill, your majors and minors,
            graduation year and career interests;
          </li>
          <li>the goal or question you type into that feature.</li>
        </ul>
        <p className="mt-2">
          It{" "}
          <b className="font-semibold text-fg">
            never sends your name, your email address, your account id or any grades
          </b>
          . AI answers are marked &quot;AI · verify with your advisor&quot;. You can turn AI
          features off again at any time.{" "}
          <Link href={`${routes.privacy()}#ai`} className="font-semibold text-primary underline">
            More in the privacy notice
          </Link>
        </p>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      {on ? (
        <div>
          <Button
            ref={toggle}
            variant="secondary"
            aria-disabled={busy ? true : undefined}
            onClick={turnOff}
          >
            {busy ? "Turning off…" : "Turn off AI features"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-3">
              <Checkbox
                ref={attestBox}
                id={ATTEST_ID}
                checked={attested}
                aria-invalid={attestError ? true : undefined}
                aria-describedby={attestError ? `${ATTEST_ID}-error` : undefined}
                onCheckedChange={(checked) => {
                  setAttested(checked === true);
                  if (checked === true) setAttestError(null);
                }}
                className="mt-0.5"
              />
              <Label htmlFor={ATTEST_ID} className="font-normal text-fg">
                I am 18 or older
              </Label>
            </div>
            {attestError ? (
              <p
                id={`${ATTEST_ID}-error`}
                role="alert"
                className="text-xs font-semibold text-danger"
              >
                {attestError}
              </p>
            ) : null}
          </div>
          <div>
            <Button ref={toggle} aria-disabled={busy ? true : undefined} onClick={turnOn}>
              {busy ? "Turning on…" : "Turn on AI features"}
            </Button>
          </div>
        </div>
      )}
      <p role="status" className="text-sm font-medium text-success">
        {status}
      </p>
    </div>
  );
}
