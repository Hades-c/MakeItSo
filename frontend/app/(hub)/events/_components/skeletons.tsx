import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholders for the /events Suspense boundaries. The page has no loading.tsx on purpose: a loading
 * boundary starts streaming before requireFeature() can answer 404 while FEATURE_EVENTS is off.
 */

export function EventsResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm text-fg-2">
        Loading events…
      </p>
      {[0, 1].map((group) => (
        <div
          key={group}
          className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5"
        >
          <Skeleton className="mb-4 h-5 w-48" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-4 border-t border-line py-3 first:border-t-0">
              <Skeleton className="hidden h-4 w-32 md:block" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5">
      <p className="mb-3.5 text-lg font-strong tracking-title text-fg">{title}</p>
      <p role="status" className="sr-only">
        Loading {title.toLowerCase()}…
      </p>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
