"use client";

import "./globals.css";

/** Last-resort boundary when the root layout itself fails. Must render its own <html> and <body>. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center px-4">
        <main role="alert" className="max-w-md text-center">
          <h1 className="text-xl font-strong">MakeItSo could not load</h1>
          <p className="mt-2 text-sm text-fg-2">Something went wrong. Please try again.</p>
          {error.digest ? (
            <p className="mt-3 font-mono text-xs text-fg-3">Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="mt-5 h-11 rounded-md bg-primary-fill px-4 text-sm font-semibold text-on-primary"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
