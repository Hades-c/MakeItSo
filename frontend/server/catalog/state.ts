import "server-only";

/**
 * In-process catalog state (memoised terms, term metas, search indexes, in-flight refreshes) registers a reset
 * here, so tests can start from a clean process view after clearing the database: `resetCatalogState()`.
 */
const resets = new Set<() => void>();

export function onCatalogReset(reset: () => void): void {
  resets.add(reset);
}

/** Forget every in-process cache (tests; never needed in production). */
export function resetCatalogState(): void {
  for (const reset of resets) reset();
}
