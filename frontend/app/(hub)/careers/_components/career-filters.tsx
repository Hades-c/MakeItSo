import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CAREER_QUERY_MAX,
  careersHref,
  clusterSlug,
  type CareerCluster,
  type CareerFilters as Filters,
} from "../_lib/filters";

/**
 * /careers filters, all in the URL (PLAN §7 "State"): cluster links (each keeps the search text) and a GET search
 * form (which keeps the cluster). Server-rendered; works without JavaScript.
 */
export function CareerFilters({
  filters,
  clusters,
  total,
}: {
  filters: Filters;
  /** Clusters with their career counts, in cluster order. */
  clusters: readonly { cluster: CareerCluster; count: number }[];
  /** All careers. */
  total: number;
}) {
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors md:h-8.5 md:px-3",
      active
        ? "border-primary bg-primary-wash text-primary"
        : "border-line-strong bg-surface text-fg-2 hover:bg-surface-2 hover:text-fg",
    );
  return (
    <div className="mb-6 flex flex-col gap-4">
      <form method="get" action="/careers" className="flex flex-col gap-1.5">
        {/* First, so the URL reads like careersHref(): ?cluster=…&q=… */}
        {filters.cluster ? (
          <input type="hidden" name="cluster" value={clusterSlug(filters.cluster)} />
        ) : null}
        <Label htmlFor="careers-q">Search careers</Label>
        <div className="flex max-w-xl gap-2">
          <Input
            id="careers-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            maxLength={CAREER_QUERY_MAX}
            placeholder="A career, subject or course code"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary">
            <Search aria-hidden />
            Search
          </Button>
        </div>
      </form>
      <nav aria-label="Career clusters">
        {/* One scrollable row on phones (the page itself never scrolls sideways); wrapping rows from 720px. */}
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
          <li>
            <Link
              href={careersHref({ q: filters.q })}
              aria-current={filters.cluster === null ? "page" : undefined}
              className={chip(filters.cluster === null)}
            >
              All <span className="font-mono text-xs">{total}</span>
            </Link>
          </li>
          {clusters.map(({ cluster, count }) => (
            <li key={cluster}>
              <Link
                href={careersHref({ cluster, q: filters.q })}
                aria-current={filters.cluster === cluster ? "page" : undefined}
                className={chip(filters.cluster === cluster)}
              >
                {cluster} <span className="font-mono text-xs">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
