import "server-only";
import { after } from "next/server";

/**
 * Run e-mail work after the response is sent (next/server `after`), so an enumeration-safe endpoint answers in
 * the same time whether or not it had something to send. Outside a request scope (unit tests, scripts) the task
 * runs inline and is awaited. Failures are logged, never thrown: the answer has already been decided.
 */
export async function runAfterResponse(label: string, task: () => Promise<void>): Promise<void> {
  const safe = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[auth] ${label} failed:`, error);
    }
  };
  try {
    after(safe);
  } catch {
    await safe();
  }
}
