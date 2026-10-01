"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A GET form that leaves empty fields out of the URL ("All departments", "Any time" submit "" natively, giving
 * ?dept=&after=…). With JavaScript the submit becomes a client navigation to the cleaned URL (back and reload
 * work as for any link) inside a transition: while the server renders the results the form is aria-busy and
 * carries data-pending (the Search buttons show a spinner through `group-data-[pending]/search:`), and once the new
 * results are in, ResultsHeading takes focus. Without JavaScript the native GET still works and the page ignores
 * the empty values.
 */
export function cleanQuery(data: FormData): string {
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (typeof value === "string" && value.trim() !== "") params.append(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

let focusRequestedAt = 0;
const FOCUS_TTL_MS = 30_000;

/** A search was submitted and its results should take focus when they render (consumed once). */
export function takeResultsFocusRequest(at = Date.now()): boolean {
  const pending = focusRequestedAt > 0 && at - focusRequestedAt <= FOCUS_TTL_MS;
  focusRequestedAt = 0;
  return pending;
}

export const RESULTS_HEADING_ID = "results-title";

export function CleanGetForm({
  action,
  children,
  className,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "method" | "onSubmit"> & {
  action: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      {...props}
      method="get"
      action={action}
      aria-busy={pending || undefined}
      data-pending={pending ? "" : undefined}
      className={cn("group/search", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const target = `${action}${cleanQuery(new FormData(event.currentTarget))}`;
        const same = `${window.location.pathname}${window.location.search}` === target;
        focusRequestedAt = same ? 0 : Date.now();
        startTransition(() => router.push(target));
        // The same URL renders the same results: move focus to them now.
        if (same) document.getElementById(RESULTS_HEADING_ID)?.focus();
      }}
    >
      {children}
    </form>
  );
}
