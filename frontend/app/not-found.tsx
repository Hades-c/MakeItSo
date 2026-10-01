import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Wordmark } from "@/components/app/wordmark";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <Link
        href="/"
        aria-label="MakeItSo home"
        className="inline-flex min-h-11 items-center rounded-md"
      >
        <Wordmark subline="always" />
      </Link>
      <main className="w-full max-w-lg">
        <EmptyState
          as="h1"
          icon={SearchX}
          title="We couldn't find that page"
          description={<p>The link may be mistyped, or the page may have moved.</p>}
          action={
            <>
              <Button asChild>
                <Link href="/today">Go to Today</Link>
              </Button>
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
