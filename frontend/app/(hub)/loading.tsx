import { Skeleton } from "@/components/ui/skeleton";

/** Shown inside the shell while a hub page streams in. */
export default function HubLoading() {
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
