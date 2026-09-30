"use client";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers for every page. There is no next-auth SessionProvider: server components read the user
 * with requireUser() and pass what client islands need as props, and signIn()/signOut() from next-auth/react work
 * without it. (The provider fetched /api/auth/session on every page load and window focus for nothing.)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
