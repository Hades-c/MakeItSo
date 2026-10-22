import "server-only";
import { after } from "next/server";
import { MissingFixtureError } from "@/server/http/fixtures";
import { onCatalogReset } from "@/server/catalog/state";

/**
 * Background work (stale-while-revalidate refreshes, history backfill). Inside a request, `after()` from
 * next/server runs the task once the response is sent (and keeps a serverless function alive for it). Outside a
 * request scope (tests, scripts) the task simply runs detached. Failures are logged, never thrown into the
 * request; a MissingFixtureError (a test bug) is also kept for `drainBackground()` to re-throw, so it is never
 * hidden.
 */

const pending = new Set<Promise<void>>();
let fixtureErrors: unknown[] = [];

onCatalogReset(() => {
  fixtureErrors = [];
});

export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      if (error instanceof MissingFixtureError) fixtureErrors.push(error);
      console.error(`[catalog] background ${label} failed:`, error);
    }
  };
  try {
    after(run);
    return;
  } catch {
    // Not inside a request (after() throws there): run detached.
  }
  const promise = run();
  pending.add(promise);
  void promise.finally(() => pending.delete(promise));
}

/** Tests: wait for every detached background task; re-throws a MissingFixtureError one of them hit. */
export async function drainBackground(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
  const [first] = fixtureErrors;
  fixtureErrors = [];
  if (first) throw first;
}
