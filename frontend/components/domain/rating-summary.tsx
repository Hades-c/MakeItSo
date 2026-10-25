import { ArrowUpRight } from "lucide-react";
import { SourceTag } from "@/components/ui/source-tag";
import { DEFAULT_TIME_ZONE, formatMediumDate } from "@/lib/format";
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
  /**
   * RMP's average difficulty, 1–5 (5 = hardest): "Difficulty 3.1 of 5". null or missing, or under
   * MIN_DETAIL_RATINGS ratings: not shown.
   */
  avgDifficulty?: number | null;
  /**
   * RMP's "would take again" share, 0–100 (lg only): "80% would take again". null or missing, or under
   * MIN_DETAIL_RATINGS ratings: not shown.
   */
  wouldTakeAgainPct?: number | null;
  /**
   * The teacher's most used RMP tags, most used first, as server/rmp serves them (lg only). Shown as "Most common
   * tags (from 39 ratings, as of Oct 25, 2026): …": the first SHOWN_TAGS used at least MIN_TAG_COUNT times, once
   * at least MIN_DETAIL_RATINGS ratings were counted.
   */
  topTags?: readonly { tag: string; count: number }[];
  /** How many ratings `topTags` was counted from (the tags line says so). */
  tagRatingsCounted?: number;
  /** When `topTags` was counted: the tags line's own "as of" (the roster's `asOf` is for the rest). */
  tagsAsOf?: Date | string | null;
  /** When the roster was synced: printed as "as of Sep 30, 2026" beside the source tag. */
  asOf?: Date | string | null;
  /** The professor's RateMyProfessors page. Only https://www.ratemyprofessors.com/ links are rendered. */
  url?: string;
  /** Professor's name as RMP lists it, e.g. "Daniel Aldridge" (read out with the count). */
  instructorName?: string;
  /** lg: the caller already shows the name beside the summary, so "for <name>" is for screen readers only. */
  nameShown?: boolean;
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

/** "as of Sep 30, 2026", or null for a missing or unreadable date. */
function asOfText(asOf: Date | string | null | undefined, timeZone: string): string | null {
  if (!asOf) return null;
  const date = new Date(asOf);
  return Number.isNaN(date.getTime()) ? null : `as of ${formatMediumDate(date, timeZone)}`;
}

function ratingsCount(n: number): string {
  return n === 1 ? "1 rating" : `${n.toLocaleString("en-US")} ratings`;
}

/**
 * Difficulty, "would take again" and the tags need this many ratings (counted ratings, for the tags) before they
 * are shown: with one or two, they read 0% or 100%, or a tag "most common", about a named professor. The overall
 * rating and its count show from one rating, as always.
 */
export const MIN_DETAIL_RATINGS = 3;
/** Each shown tag needs this many uses... */
export const MIN_TAG_COUNT = 2;
/** ...and at most this many are shown. */
export const SHOWN_TAGS = 3;

/** The tags "Most common tags" lists (see RatingSummaryProps.topTags). */
export function shownTags(
  topTags: readonly { tag: string; count: number }[] | undefined,
  tagRatingsCounted: number | undefined,
): { tag: string; count: number }[] {
  if (
    !topTags ||
    !(typeof tagRatingsCounted === "number" && tagRatingsCounted >= MIN_DETAIL_RATINGS)
  ) {
    return [];
  }
  return topTags
    .filter(({ tag, count }) => tag.trim() && Number.isFinite(count) && count >= MIN_TAG_COUNT)
    .slice(0, SHOWN_TAGS);
}

/**
 * "from 39 ratings, as of Oct 25, 2026" (the date left out when missing or unreadable). With the year, like the
 * roster's line: stored counts are kept while every count run fails, so the date can be a year old.
 */
function tagsFreshness(
  counted: number,
  tagsAsOf: Date | string | null | undefined,
  timeZone: string,
): string {
  const date = tagsAsOf ? new Date(tagsAsOf) : null;
  const when =
    date && !Number.isNaN(date.getTime()) ? `, as of ${formatMediumDate(date, timeZone)}` : "";
  return `from ${ratingsCount(counted)}${when}`;
}

/** "3.1", or null when there is no difficulty to show (RMP's scale is 1–5). */
function difficultyText(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.min(5, value).toFixed(1)
    : null;
}

/** "80%", or null. */
function takeAgainText(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? `${Math.round(value)}%`
    : null;
}

/** " · " between the parts of a line: a pause for screen readers, not "middle dot". */
function Sep() {
  return (
    <>
      <span aria-hidden> · </span>
      <span className="sr-only">, </span>
    </>
  );
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
 * A professor's RateMyProfessors rating: the average, how many ratings, the difficulty, when it was synced (as
 * visible text, so phones see it too) with the RATEMYPROFESSORS source tag, and a link to RMP. The lg size adds
 * "would take again" and the most common tags (RMP's fixed tags with how many ratings used each, how many ratings
 * were counted and when). Difficulty, "would take again" and the tags need MIN_DETAIL_RATINGS ratings. Nothing else
 * from RMP is shown (PLAN §5). Both numbers out of 5 carry their label ("Rating" is read out, "Difficulty" is printed).
 * Unmatched, staff, disabled and under-review instructors get nothing, or a quiet "No rating" when asked.
 */
export function RatingSummary({
  status,
  avgRating,
  numRatings,
  avgDifficulty,
  wouldTakeAgainPct,
  topTags,
  tagRatingsCounted,
  tagsAsOf,
  asOf,
  url,
  instructorName,
  nameShown = false,
  empty = "hide",
  size = "lg",
  timeZone = DEFAULT_TIME_ZONE,
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
  const synced = asOfText(asOf, timeZone);
  // Difficulty and "would take again" only from MIN_DETAIL_RATINGS ratings (like the tags).
  const detailed = count >= MIN_DETAIL_RATINGS;
  const difficulty = detailed ? difficultyText(avgDifficulty) : null;
  const difficultyPart = difficulty ? (
    <>
      <Sep />
      <span>Difficulty {difficulty} of 5</span>
    </>
  ) : null;
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
          <span className="sr-only">Rating </span>
          {shown}
          <span className="sr-only"> out of 5</span>
        </span>
        <RatingDots value={rating} small />{" "}
        <span>
          {ratingsCount(count)}
          <span className="sr-only">{who}</span>
          {difficultyPart}
          {synced ? (
            <>
              <Sep />
              {synced}
            </>
          ) : null}
        </span>{" "}
        <SourceTag source="ratemyprofessors" />
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 rounded-xs font-semibold text-primary hover:underline max-md:min-h-11 max-md:px-1"
          >
            RMP
            <ArrowUpRight aria-hidden className="size-3.5" />
            <span className="sr-only">
              : {instructorName ?? "this professor"} on RateMyProfessors (opens in a new tab)
            </span>
          </a>
        ) : null}
      </p>
    );
  }

  const takeAgain = detailed ? takeAgainText(wouldTakeAgainPct) : null;
  const tags = shownTags(topTags, tagRatingsCounted);
  const tagsCounted =
    tags.length > 0 ? tagsFreshness(tagRatingsCounted ?? 0, tagsAsOf, timeZone) : "";
  return (
    <div className={cn("flex flex-col gap-3", className)} data-rating={shown}>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <p className="flex items-baseline gap-1">
            <span className="sr-only">Rating </span>
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
          <span>
            {ratingsCount(count)}
            {nameShown ? <span className="sr-only">{who}</span> : who}
          </span>
          {difficultyPart}
          {takeAgain ? (
            <>
              <Sep />
              <span>{takeAgain} would take again</span>
            </>
          ) : null}
        </p>
      </div>
      {tags.length > 0 ? (
        // Its own freshness: the tags are counted daily from `tagRatingsCounted` ratings, apart from the roster.
        <p className="text-sm text-fg-2" data-testid="rating-tags">
          Most common tags ({tagsCounted}):{" "}
          {tags.map(({ tag, count: uses }, index) => (
            <span key={tag}>
              {index > 0 ? ", " : null}
              {tag} <span aria-hidden>{`(${uses})`}</span>
              <span className="sr-only">{`(${uses} ratings)`}</span>
            </span>
          ))}
          <Sep />
          via RateMyProfessors
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceTag source="ratemyprofessors" />
        {synced ? <span className="text-xs text-fg-2">{synced}</span> : null}
        {link}
      </p>
    </div>
  );
}
