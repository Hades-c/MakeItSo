import "server-only";
import { routes, safeCallbackPath } from "@/lib/routes";
import { appOriginForEmail } from "@/server/auth/emails";

/**
 * Same-origin return paths (login `callbackUrl`, /verify `next`, requireUser's `returnTo`).
 *
 * lib/routes safeCallbackPath checks both the raw value and the normalised path it returns, so inputs whose dot
 * segments collapse into a protocol-relative path ("/.//evil.example", "/..//evil.example", "/a/..//evil.example",
 * "/%2e//evil.example", "/./\evil.example") give the fallback. isSafeAppPath re-checks every result anyway, as a
 * second line of defence, before a redirect, router.replace or link uses it.
 */

/**
 * True for an app path that can only resolve on this origin: one leading "/" and no second "/" or "\" right
 * after it ("//evil.example" and "/\evil.example" are protocol-relative URLs to another host).
 */
export function isSafeAppPath(path: string): boolean {
  return /^\/(?![/\\])/.test(path);
}

/** A safe same-origin path from untrusted input, else `fallback` (/today by default). */
export function safeAppPath(value: string | null | undefined, fallback: string = routes.today()) {
  const path = safeCallbackPath(value, appOriginForEmail() ?? "http://localhost", fallback);
  return isSafeAppPath(path) ? path : fallback;
}
