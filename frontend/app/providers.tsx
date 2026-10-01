"use client";

import dynamic from "next/dynamic";

/**
 * The toaster loads after the page, in its own chunk: toasts only follow a student's action, so sonner stays out
 * of every page's first-load JavaScript (PLAN §6.2 perf budget). `toast()` from "sonner" works as before.
 */
const Toaster = dynamic(() => import("@/components/ui/toaster").then((mod) => mod.Toaster), {
  ssr: false,
});

/**
 * Client-side providers for every page. There is no next-auth SessionProvider: server components read the user
 * with requireUser() and pass what client islands need as props, and signIn()/signOut() from next-auth/react work
 * without it. (The provider fetched /api/auth/session on every page load and window focus for nothing.) There is
 * no app-wide TooltipProvider either: components/ui/tooltip.tsx's <Tooltip> brings its own.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
