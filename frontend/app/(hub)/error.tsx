"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

/** Error boundary for hub pages: the shell stays, the page shows a retry. */
export default function HubError({
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
    <ErrorState
      title="This page could not load"
      description="Something went wrong on our side. Try again, or go back to Today."
      reference={error.digest}
      action={
        <>
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="secondary">
            <Link href="/today">Go to Today</Link>
          </Button>
        </>
      }
    />
  );
}
