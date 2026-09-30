import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** notFound() inside a hub page (e.g. a malformed course code): keeps the shell. */
export default function HubNotFound() {
  return (
    <EmptyState
      as="h1"
      icon={SearchX}
      title="We couldn't find that page"
      description={<p>The link may be mistyped, or the item may no longer exist.</p>}
      action={
        <>
          <Button asChild>
            <Link href="/today">Go to Today</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </>
      }
    />
  );
}
