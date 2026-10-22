"use client";

/**
 * A full page load to `path` (after signing out, a password change that could not sign back in, or deleting the
 * account): every client cache (SWR, router, component state) is dropped with it. One place, so tests can
 * replace it.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
