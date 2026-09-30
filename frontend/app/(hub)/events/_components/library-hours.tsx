import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { formatAsOf } from "@/lib/format";
import { SOURCES } from "@/lib/sources";
import type { LibraryHours, LibraryLocationHours } from "@/lib/types/feeds";
import { loadLibraryHours, type LibraryHoursResult } from "../_lib/load";

/**
 * Today's library hours from LibCal (the brief: "today's library hours card with its source"). Locations LibCal
 * lists without hours ("not-set") are left out; LibCal's own text is shown verbatim ("7am - 11:59pm", "Closed for
 * Renovation"), with "Open now" / "Closed now" worked out from its times.
 */

export interface LibraryHoursCardProps {
  /** Today in America/New_York ("YYYY-MM-DD"). */
  today: string;
  now: Date;
  timeZone: string;
}

/** Async server component (inside a Suspense boundary: a cold read may wait up to 5 s for LibCal). */
export async function LibraryHoursCard(props: LibraryHoursCardProps) {
  return <LibraryHoursView {...props} result={await loadLibraryHours(props.today)} />;
}

export type OpenState = "open-now" | "closed-now" | "closed" | "info";

/** Whether a location is open at `now`, from LibCal's status and times. */
export function openState(location: LibraryLocationHours, now: Date): OpenState {
  if (location.status === "closed") return "closed";
  if (location.status === "open" || location.status === "24hours") {
    if (!location.opensAt || !location.closesAt) return "info";
    const at = now.getTime();
    return at >= Date.parse(location.opensAt) && at < Date.parse(location.closesAt)
      ? "open-now"
      : "closed-now";
  }
  return "info";
}

function hoursText(location: LibraryLocationHours): string {
  if (location.text) return location.text;
  if (location.status === "24hours") return "Open 24 hours";
  if (location.status === "closed") return "Closed";
  return "";
}

export function listedLocations(hours: LibraryHours): LibraryLocationHours[] {
  return hours.locations.filter((l) => l.status !== "not-set" && hoursText(l) !== "");
}

export function LibraryHoursView({
  result,
  now,
  timeZone,
}: LibraryHoursCardProps & { result: LibraryHoursResult }) {
  const libraryUrl = SOURCES.library.url;
  return (
    <SectionCard id="library-hours" title="Library hours" count="today">
      {result.ok ? (
        <LibraryHoursList hours={result.hours} now={now} />
      ) : (
        <p className="text-sm text-fg-2" data-testid="library-hours-unavailable">
          Library hours are unavailable right now. Check the library&apos;s own page.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
          <SourceTag source="library" />
          {result.ok ? <span>as of {formatAsOf(result.hours.fetchedAt, timeZone)}</span> : null}
        </span>
        {libraryUrl ? (
          <a
            href={libraryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-semibold text-primary hover:underline md:min-h-0"
          >
            Library website <span className="sr-only">(opens in a new tab)</span>
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>
    </SectionCard>
  );
}

function LibraryHoursList({ hours, now }: { hours: LibraryHours; now: Date }) {
  const locations = listedLocations(hours);
  if (locations.length === 0) {
    return <p className="text-sm text-fg-2">LibCal lists no hours for today.</p>;
  }
  return (
    <ul className="divide-y divide-line" data-testid="library-hours">
      {locations.map((location) => {
        const state = openState(location, now);
        return (
          <li
            key={location.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="min-w-0 font-semibold text-fg">{location.name}</span>
            <span className="flex flex-wrap items-center gap-2 text-fg-2">
              {hoursText(location)}
              {state === "open-now" ? <Badge variant="success">Open now</Badge> : null}
              {state === "closed-now" ? <Badge>Closed now</Badge> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
