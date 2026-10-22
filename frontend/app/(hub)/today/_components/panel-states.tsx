import { TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The small per-panel states of /today: every panel loads on its own (its own Suspense boundary and data reads),
 * so a failing source shows this inside its card instead of taking the page down.
 */

export function PanelError({ id, title, what }: { id: string; title: string; what: string }) {
  return (
    <SectionCard id={id} title={title}>
      <p
        role="status"
        data-testid="panel-error"
        className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-sm text-fg-2"
      >
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
        <span>
          {what} could not load right now. The rest of Today still works; reload the page to try
          again.
        </span>
      </p>
    </SectionCard>
  );
}

export function PanelSkeleton({
  id,
  title,
  rows = 3,
}: {
  id: string;
  title: string;
  rows?: number;
}) {
  return (
    <SectionCard id={`${id}-loading`} title={title}>
      <span role="status" className="sr-only">
        Loading {title.toLowerCase()}…
      </span>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </SectionCard>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <span role="status" className="sr-only">
        Loading your day…
      </span>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-9 w-full max-w-2xl" />
      <Skeleton className="h-5 w-72" />
    </div>
  );
}
