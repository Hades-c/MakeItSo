"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, Link2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CourseCode } from "@/components/ui/course-code";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { notify } from "@/components/ui/notify";
import { callApi } from "@/lib/api/client";
import { moodleEndpoints } from "@/lib/api/endpoints";
import { formatAsOf, formatClock, formatShortDate, formatWeekday } from "@/lib/format";
import { checkMoodleFeedUrl, MOODLE_PROBLEM_MESSAGES } from "@/lib/moodle";
import { routes } from "@/lib/routes";
import type { MoodleStatus } from "@/lib/types/moodle";
import type { StudentDeadline } from "@/lib/types/plan";
import { ConfirmButton } from "./confirm-button";
import { useSyllabusAction } from "./use-syllabus-action";

/** Upcoming Moodle deadlines listed before "and N more". */
const SHOWN = 8;

export interface MoodlePanelProps {
  /** MOODLE_IMPORT_ENABLED: off, the panel only lets a student remove what is stored. */
  enabled: boolean;
  status: MoodleStatus;
  /** The server's now (ISO): which imported deadlines are still upcoming. */
  now: string;
  /** Whether Connect is the page's one primary action. */
  primary?: boolean;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Thu Oct 1, 11:59p" in Davidson time; "Thu Oct 8" for a Moodle date without a time (`allDay`). */
function dueText(deadline: Pick<StudentDeadline, "dueAt" | "allDay">): string {
  const day = `${formatWeekday(deadline.dueAt).slice(0, 3)} ${formatShortDate(deadline.dueAt)}`;
  return deadline.allDay ? day : `${day}, ${formatClock(deadline.dueAt)}`;
}

/**
 * Connect Moodle (/syllabi; server/moodle): the steps to get the calendar URL in Moodle, in plain words, and a
 * field for it. Connected, it says when it last synced (never the URL: the server keeps it encrypted), what the
 * last sync's problem was if any, and lists the upcoming deadlines it imported (shown on Today as "Moodle"), with
 * Sync now and Disconnect (optionally removing the imported deadlines). With MOODLE_IMPORT_ENABLED off it shows
 * only what is stored and Disconnect.
 */
export function MoodlePanel({ enabled, status: initial, now, primary = false }: MoodlePanelProps) {
  const id = React.useId();
  const [status, setStatus] = React.useState(initial);
  const [url, setUrl] = React.useState("");
  const [urlProblem, setUrlProblem] = React.useState<string | null>(null);
  const [alsoRemove, setAlsoRemove] = React.useState(true);
  const action = useSyllabusAction();

  // A fresh server status (router.refresh() after a change) replaces the one kept from the last answer.
  const [shown, setShown] = React.useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setStatus(initial);
  }

  const upcoming = status.deadlines.filter((d) => d.dueAt >= now);
  const earlier = status.deadlines.length - upcoming.length;
  const needsNewUrl =
    !status.connected || status.problem === "auth" || status.problem === "key_changed";

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    const check = checkMoodleFeedUrl(url);
    if (!check.ok) {
      setUrlProblem(check.problem);
      return;
    }
    setUrlProblem(null);
    const result = await action.run(
      () => callApi(moodleEndpoints.connect, { body: { url: check.url } }),
      { fallback: "Could not connect Moodle. Please try again." },
    );
    if (result.ok) {
      setStatus(result.value);
      setUrl("");
      notify.success(
        `Connected Moodle: ${plural(result.value.deadlines.length, "deadline", "deadlines")} imported.`,
      );
    }
  };

  const sync = async () => {
    const result = await action.run(() => callApi(moodleEndpoints.sync), {
      fallback: "Could not sync Moodle. Please try again.",
    });
    if (result.ok) {
      setStatus(result.value);
      if (!result.value.problem) notify.success("Synced with Moodle.");
    }
  };

  const disconnect = async (removeDeadlines: boolean) => {
    const result = await action.run(
      () => callApi(moodleEndpoints.disconnect, { query: { removeDeadlines } }),
      { fallback: "Could not disconnect Moodle. Please try again." },
    );
    if (result.ok) {
      setStatus((prev) => ({
        ...prev,
        connected: false,
        connectedAt: null,
        lastSyncedAt: null,
        lastAttemptAt: null,
        problem: null,
        capped: 0,
        deadlines: removeDeadlines ? [] : prev.deadlines,
      }));
      notify.success(
        removeDeadlines
          ? `Disconnected Moodle and removed ${plural(result.value.removed, "deadline", "deadlines")}.`
          : "Disconnected Moodle. Its deadlines stay in your plan.",
      );
    }
  };

  const removeKept = (
    <ConfirmButton
      question={`Remove the ${plural(status.deadlines.length, "Moodle deadline", "Moodle deadlines")} from your plan?`}
      confirmLabel="Yes, remove"
      disabled={action.busy}
      onConfirm={() => void disconnect(true)}
    >
      <Trash2 aria-hidden />
      Remove them
    </ConfirmButton>
  );

  if (!enabled) {
    return (
      <div className="flex flex-col gap-3" data-testid="moodle-panel" data-state="off">
        <Notice tone="info">Moodle import is turned off on MakeItSo for now.</Notice>
        {status.connected ? (
          <DisconnectButton
            count={status.deadlines.length}
            alsoRemove={alsoRemove}
            setAlsoRemove={setAlsoRemove}
            busy={action.busy}
            onConfirm={(remove) => void disconnect(remove)}
          />
        ) : status.deadlines.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
            {plural(status.deadlines.length, "deadline", "deadlines")} imported from Moodle are
            still in your plan. {removeKept}
          </p>
        ) : null}
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="moodle-panel"
      data-state={status.connected ? "connected" : "not-connected"}
    >
      {status.connected ? (
        <div className="flex flex-col gap-3">
          <p
            className="flex items-start gap-2 text-sm font-medium text-fg"
            data-testid="moodle-status"
          >
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              Connected ·{" "}
              {status.lastSyncedAt
                ? `last synced ${formatAsOf(status.lastSyncedAt)}`
                : "not synced yet"}
            </span>
          </p>
          {status.problem ? (
            <Notice tone="warning" data-testid="moodle-problem" data-problem={status.problem}>
              {MOODLE_PROBLEM_MESSAGES[status.problem]}
            </Notice>
          ) : null}
          {status.capped > 0 ? (
            <Notice tone="info">
              {plural(status.capped, "Moodle event was", "Moodle events were")} left out: MakeItSo
              keeps at most 500 events from the calendar and 300 deadlines in your plan.
            </Notice>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={action.busy}
              onClick={() => void sync()}
            >
              <RefreshCw aria-hidden />
              {action.busy ? "Syncing…" : "Sync now"}
            </Button>
            <DisconnectButton
              count={status.deadlines.length}
              alsoRemove={alsoRemove}
              setAlsoRemove={setAlsoRemove}
              busy={action.busy}
              onConfirm={(remove) => void disconnect(remove)}
            />
          </div>
        </div>
      ) : (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-fg">
          <li>
            In Moodle, open <b className="font-semibold">Calendar</b>, then{" "}
            <b className="font-semibold">Import or export calendars</b>, then{" "}
            <b className="font-semibold">Export calendar</b>.
          </li>
          <li>
            Under <b className="font-semibold">Events from</b>, choose{" "}
            <b className="font-semibold">All courses</b>, and for the time, choose{" "}
            <b className="font-semibold">Recent and next 60 days</b>.
          </li>
          <li>
            Choose <b className="font-semibold">Get calendar URL</b>, copy the whole address Moodle
            shows, and paste it below.
          </li>
        </ol>
      )}

      {needsNewUrl ? (
        <form onSubmit={(event) => void connect(event)} className="flex flex-col gap-3" noValidate>
          <Field
            id={`${id}-url`}
            label={status.connected ? "New Moodle calendar URL" : "Moodle calendar URL"}
            hint="Anyone with this link can read your Moodle calendar, so MakeItSo stores it encrypted and never shows it again. It reads only each event's title, due time and course."
            error={urlProblem}
          >
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://moodle.davidson.edu/calendar/export_execute.php?…"
              value={url}
              disabled={action.busy}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant={primary ? "primary" : "secondary"}
              disabled={action.busy}
            >
              <Link2 aria-hidden />
              {action.busy ? "Connecting…" : status.connected ? "Reconnect" : "Connect Moodle"}
            </Button>
            <Link
              href={`${routes.privacy()}#moodle`}
              className="inline-flex min-h-11 items-center text-sm link md:min-h-0"
            >
              What MakeItSo reads and stores
            </Link>
          </div>
        </form>
      ) : null}

      {!status.connected && status.deadlines.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
          {plural(status.deadlines.length, "deadline", "deadlines")} imported from Moodle earlier
          are still in your plan. {removeKept}
        </p>
      ) : null}

      <Notice tone="error" role="alert">
        {action.error}
      </Notice>

      {status.connected ? <ImportedList upcoming={upcoming} earlier={earlier} /> : null}
    </div>
  );
}

function DisconnectButton({
  count,
  alsoRemove,
  setAlsoRemove,
  busy,
  onConfirm,
}: {
  count: number;
  alsoRemove: boolean;
  setAlsoRemove: (value: boolean) => void;
  busy: boolean;
  onConfirm: (removeDeadlines: boolean) => void;
}) {
  const id = React.useId();
  return (
    <ConfirmButton
      question="Disconnect Moodle? MakeItSo deletes your saved calendar link."
      confirmLabel="Yes, disconnect"
      disabled={busy}
      details={
        count > 0 ? (
          <span className="flex min-h-11 items-center gap-2.5 md:min-h-0">
            <Checkbox
              id={`${id}-remove`}
              checked={alsoRemove}
              onCheckedChange={(checked) => setAlsoRemove(checked === true)}
            />
            <Label htmlFor={`${id}-remove`} className="font-normal">
              Also remove the {count === 1 ? "deadline" : `${count} deadlines`} it imported from
              your plan
            </Label>
          </span>
        ) : null
      }
      onConfirm={() => onConfirm(count > 0 && alsoRemove)}
    >
      <Trash2 aria-hidden />
      Disconnect
    </ConfirmButton>
  );
}

function ImportedList({
  upcoming,
  earlier,
}: {
  upcoming: readonly StudentDeadline[];
  earlier: number;
}) {
  const shown = upcoming.slice(0, SHOWN);
  const more = upcoming.length - shown.length;
  return (
    <div className="border-t border-line pt-3" data-testid="moodle-imported">
      <h3 className="text-sm font-semibold text-fg">Imported from Moodle</h3>
      <p className="mt-0.5 text-sm text-fg-2">
        {upcoming.length === 0
          ? "No upcoming due dates in your Moodle calendar."
          : `${plural(upcoming.length, "upcoming deadline is", "upcoming deadlines are")} in your plan; Today shows the ones due in the next two weeks, marked Moodle.`}
        {earlier > 0 ? ` ${plural(earlier, "earlier one is", "earlier ones are")} kept too.` : ""}
      </p>
      {shown.length > 0 ? (
        <ul className="mt-2 divide-y divide-line" aria-label="Upcoming deadlines from Moodle">
          {shown.map((deadline) => (
            <li
              key={deadline.id}
              className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
              data-testid="moodle-deadline"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-fg">
                {deadline.courseCode ? <CourseCode code={deadline.courseCode} /> : null}
                <span className="min-w-0">{deadline.title}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-fg-2">{dueText(deadline)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {more > 0 ? <p className="mt-1 text-xs text-fg-2">and {more} more later</p> : null}
    </div>
  );
}
