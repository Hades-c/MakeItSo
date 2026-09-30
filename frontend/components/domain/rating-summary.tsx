import { ArrowUpRight } from "lucide-react";
import { SourceTag } from "@/components/ui/source-tag";
import { cn } from "@/lib/utils";

export type RatingStatus = "matched" | "unmatched" | "staff" | "disabled" | "review";

export interface RatingSummaryProps {
  /**
   * From the RMP matcher (PLAN §5): only "matched" shows a rating. "unmatched", "staff" (Staff / TBA),
   * "disabled" (RMP_ENABLED off) and "review" (a department conflict awaiting review) never do.
   */
  status: RatingStatus;
  /** 1–5. */
  avgRating?: number;
  numRatings?: number;
  /** When the roster was synced ("as of" on the source tag). */
  asOf?: Date | string | null;
  /** The professor's RateMyProfessors page. Only https://www.ratemyprofessors.com/ links are rendered. */
  url?: string;
  /** Professor's name as RMP lists it, e.g. "Daniel Aldridge" (read out with the count). */
  instructorName?: string;
  /** What to render without a rating: nothing (default) or a quiet "No rating". */
  empty?: "hide" | "quiet";
  /** lg: the course page card; sm: inline on a section row. */
  size?: "lg" | "sm";
  timeZone?: string;
  className?: string;
}

/** An RMP link we are willing to render: https, on ratemyprofessors.com, nothing else. */
export function safeRmpUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "www.ratemyprofessors.com"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function ratingsCount(n: number): string {
  return n === 1 ? "1 rating" : `${n.toLocaleString("en-US")} ratings`;
}

/** Five dots filled to the rating (3.7 → three full, one 70%, one empty). Decorative; the number is the text. */
function RatingDots({ value, small }: { value: number; small?: boolean }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.min(1, Math.max(0, value - i));
        return (
          <span
            key={i}
            className={cn(
              "relative overflow-hidden rounded-full bg-line-2",
              small ? "size-2.5" : "size-3.5",
            )}
          >
            <span
              className="absolute inset-y-0 left-0 bg-primary-fill"
              style={{ width: `${Math.round(fill * 100)}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}

/**
 * A professor's RateMyProfessors rating: the average, how many ratings, when it was synced (source tag) and a
 * link to RMP. Nothing else from RMP is shown (PLAN §5). Unmatched, staff, disabled and under-review instructors
 * get nothing, or a quiet "No rating" when asked.
 */
export function RatingSummary({
  status,
  avgRating,
  numRatings,
  asOf,
  url,
  instructorName,
  empty = "hide",
  size = "lg",
  timeZone,
  className,
}: RatingSummaryProps) {
  const count =
    typeof numRatings === "number" && Number.isFinite(numRatings) ? Math.floor(numRatings) : 0;
  const average =
    status === "matched" && typeof avgRating === "number" && Number.isFinite(avgRating) && count > 0
      ? avgRating
      : null;

  if (average === null) {
    if (empty === "hide") return null;
    return (
      <p className={cn("text-xs text-fg-3", className)} data-rating="none">
        {status === "matched" ? "No ratings yet" : "No rating"}
      </p>
    );
  }

  const rating = Math.min(5, Math.max(0, average));
  const shown = rating.toFixed(1);
  const href = safeRmpUrl(url);
  const who = instructorName ? ` for ${instructorName}` : "";
  const link = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 rounded-xs text-sm font-semibold text-primary hover:underline md:min-h-0"
    >
      RateMyProfessors
      <ArrowUpRight aria-hidden className="size-3.5" />
      <span className="sr-only">
        : {instructorName ?? "this professor"}’s page (opens in a new tab)
      </span>
    </a>
  ) : null;

  if (size === "sm") {
    return (
      <p
        className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2", className)}
        data-rating={shown}
      >
        <span className="font-semibold text-fg">
          {shown}
          <span className="sr-only"> out of 5</span>
        </span>
        <RatingDots value={rating} small />{" "}
        <span>
          {ratingsCount(count)}
          <span className="sr-only">{who}</span>
        </span>{" "}
        <SourceTag source="ratemyprofessors" asOf={asOf} timeZone={timeZone} />
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} data-rating={shown}>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-strong text-fg tabular-nums">{shown}</span>
            <span className="text-base font-medium text-fg-3">
              <span aria-hidden>/ 5</span>
              <span className="sr-only">out of 5</span>
            </span>
          </p>
          <div className="mt-1.5">
            <RatingDots value={rating} />
          </div>
        </div>
        <p className="text-sm text-fg-2">
          {ratingsCount(count)}
          {who}
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="ratemyprofessors" asOf={asOf} timeZone={timeZone} />
        {link}
      </p>
    </div>
  );
}
