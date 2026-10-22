import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for a hub page that is still loading: title block plus the Lakeside 7/5 card grid. Use it from a
 * segment's own loading.tsx (e.g. app/(hub)/today/loading.tsx).
 *
 * Keep loading.tsx files off routes that call notFound() for bad URLs (course codes, career slugs): a loading
 * boundary starts streaming, so the 200 status is already sent and the not-found page cannot return 404.
 */
export function PageSkeleton() {
  return (
    <div>
      <p role="status" className="sr-only">
        Loading…
      </p>
      <Skeleton className="mb-2 h-4 w-48" />
      <Skeleton className="mb-6 h-9 w-full max-w-xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Skeleton className="h-72 rounded-xl" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
