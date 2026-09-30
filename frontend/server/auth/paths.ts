import "server-only";
import { routes, safeCallbackPath } from "@/lib/routes";
import { appOriginForEmail } from "@/server/auth/emails";

/**
 * Same-origin return paths (login `callbackUrl`, /verify `next`, requireUser's `returnTo`).
 *
 * lib/routes safeCallbackPath checks the RAW value for a leading "//" but returns the NORMALISED path, and dot
 * segments normalise into one: "/.//evil.example", "/..//evil.example", "/a/..//evil.example" and
 * "/%2e//evil.example" all come back as "//evil.example", a protocol-relative URL to another host. So every
 * result is checked again (isSafeAppPath) before a redirect, router.replace or link uses it.
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
