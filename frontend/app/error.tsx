"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/app/wordmark";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

/** Error boundary for pages outside the hub (landing, sign-in). */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <Wordmark subline="always" />
      <main className="w-full max-w-lg">
        <ErrorState
          reference={error.digest}
          action={
            <>
              <Button onClick={reset}>Try again</Button>
              <Button asChild variant="secondary">
                <Link href="/">Home</Link>
              </Button>
            </>
          }
        />
      </main>
    </div>
  );
}
