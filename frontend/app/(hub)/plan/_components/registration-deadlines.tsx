import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SourceTag } from "@/components/ui/source-tag";
import { cn } from "@/lib/utils";
import { describeDeadline, type DeadlineInput } from "../_lib/deadlines";

/**
 * Registration windows and deadlines for the WebTree term, from the academic calendar (server/content, tag
 * REGISTRAR, each row linked to the Registrar's page). Worded on the server for `now` in Davidson time.
 */
export function RegistrationDeadlines({
  deadlines,
  termLabel,
  now,
  timeZone,
  className,
}: {
  deadlines: readonly DeadlineInput[];
  termLabel: string;
  now: Date;
  timeZone: string;
  className?: string;
}) {
  const rows = deadlines.map((deadline) => describeDeadline(deadline, now, timeZone));
  return (
    <section
      aria-labelledby="registration-deadlines-title"
      className={cn("rounded-xl border border-line bg-surface p-4 shadow-card md:px-5", className)}
      data-testid="registration-deadlines"
    >
      <h2
        id="registration-deadlines-title"
        className="flex items-center gap-2 text-lg font-strong tracking-title text-fg"
      >
        <CalendarClock aria-hidden className="size-5 text-taupe" />
        {termLabel} registration
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-fg-2">
          The academic calendar lists no {termLabel} registration dates yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
              data-source={row.source}
              data-state={row.state}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-fg underline-offset-2 hover:underline"
                >
                  {row.title}
                </a>
                <SourceTag source={row.source} />
              </div>
              <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                <time dateTime={row.dateTime}>{row.when}</time>
                <Badge
                  variant={
                    row.state === "open" ? "primary" : row.state === "past" ? "neutral" : "outline"
                  }
                >
                  {row.relative}
                </Badge>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
