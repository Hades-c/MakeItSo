import "server-only";

/**
 * Per-user data registry for "Download my data" and "Delete account" (PLAN §4.1.12). W3's `GET /api/me/export`
 * and `DELETE /api/me` call `exportAccountData` / `eraseAccountData`, which iterate every registration; each
 * workstream registers its own per-user collections, so nothing is forgotten when a collection is added.
 *
 *   // server/plan/index.ts (W5s), at module top level:
 *   registerAccountData("plans", {
 *     export: async (userId) => Plan.findOne({ userId }).lean(),
 *     erase: async (userId) => (await Plan.deleteMany({ userId })).deletedCount,
 *   });
 *
 * Registration happens when the registering module is evaluated, so every registering module must be listed in
 * ACCOUNT_DATA_MODULES below (the orchestrator adds entries on request). The users document itself is deleted by
 * W3 after the erasers ran. Legacy collections (courseplans, aicaches) are erased by W3 directly.
 */

export interface AccountDataHandler {
  /** JSON-serialisable copy of everything this collection holds for the user (null/[] when nothing). */
  export(userId: string): Promise<unknown>;
  /** Delete the user's data; returns how many documents (or entries) were removed. */
  erase(userId: string): Promise<number>;
}

/**
 * Modules that call registerAccountData at top level. W6 adds `() => import("@/server/ai")` when server/ai exists.
 */
const ACCOUNT_DATA_MODULES: ReadonlyArray<() => Promise<unknown>> = [
  () => import("@/server/auth"),
  () => import("@/server/plan"),
];

const registry = new Map<string, AccountDataHandler>();

/**
 * Register (or, on hot reload, replace) the handler for `name`. Names are unique per collection, e.g. "plans",
 * "verificationcodes", "aicache_v2", "aiusages".
 */
export function registerAccountData(name: string, handler: AccountDataHandler): void {
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) throw new TypeError(`Invalid account data name: ${name}`);
  registry.set(name, handler);
}

/** Registered names, sorted (for tests and the export's table of contents). */
export function accountDataNames(): string[] {
  return [...registry.keys()].sort();
}

/** Import every registering module once (idempotent). */
export async function loadAccountDataRegistrations(): Promise<void> {
  await Promise.all(ACCOUNT_DATA_MODULES.map((load) => load()));
}

/** Everything registered for the user, keyed by registration name. */
export async function exportAccountData(userId: string): Promise<Record<string, unknown>> {
  await loadAccountDataRegistrations();
  const out: Record<string, unknown> = {};
  for (const name of accountDataNames()) {
    out[name] = await registry.get(name)!.export(userId);
  }
  return out;
}

/**
 * Run every eraser (all of them, even after a failure) and return the removed counts by name. Throws an
 * AggregateError naming the failed registrations if any eraser failed, after the others ran.
 */
export async function eraseAccountData(userId: string): Promise<Record<string, number>> {
  await loadAccountDataRegistrations();
  const removed: Record<string, number> = {};
  const failures: Error[] = [];
  for (const name of accountDataNames()) {
    try {
      removed[name] = await registry.get(name)!.erase(userId);
    } catch (error) {
      failures.push(
        new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Could not erase: ${failures.map((f) => f.message).join("; ")}`,
    );
  }
  return removed;
}

/** Test helper: drop every registration. */
export function resetAccountDataRegistry(): void {
  registry.clear();
}
