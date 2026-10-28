import { SourceLink } from "@/components/ui/source-tag";
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
   * RMP's "would take again" share, 0–100: "80% would take again". null or missing, or under MIN_DETAIL_RATINGS
   * ratings: not shown.
   */
  wouldTakeAgainPct?: number | null;
  /**
   * The teacher's most used RMP tags, most used first, as server/rmp serves them. Shown as "Most common tags (from
   * 39 ratings): …": the first SHOWN_TAGS used at least MIN_TAG_COUNT times, once at least MIN_DETAIL_RATINGS
   * ratings were counted.
   */
  topTags?: readonly { tag: string; count: number }[];
  /** How many ratings `topTags` was counted from (the tags line says so). */
  tagRatingsCounted?: number;
  /** The professor's RateMyProfessors page. Only https://www.ratemyprofessors.com/ links are rendered. */
  url?: string;
  /** Professor's name as RMP lists it, e.g. "Daniel Aldridge" (read out with the count). */
  instructorName?: string;
  /** The caller already shows the name beside the summary, so "for <name>" is for screen readers only. */
  nameShown?: boolean;
  /** What to render without a rating: nothing (default) or a quiet "No rating". */
  empty?: "hide" | "quiet";
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
function RatingDots({ value }: { value: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.min(1, Math.max(0, value - i));
        return (
          <span key={i} className="relative size-3.5 overflow-hidden rounded-full bg-line-2">
            <span
              className="absolute inset-y-0 left-0 bg-fg-2"
              style={{ width: `${Math.round(fill * 100)}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}

/**
 * A professor's RateMyProfessors rating, shown once per instructor on a course page (InstructorRatings): the
 * average, how many ratings, the difficulty and "would take again", the most common tags (RMP's fixed tags with
 * how many ratings used each and how many ratings were counted), then the source, named once as the link to the
 * professor's RMP page (SourceLink: data-source and "Source: RateMyProfessors" for screen readers). Difficulty,
 * "would take again" and the tags need MIN_DETAIL_RATINGS ratings. Nothing else from RMP is shown (PLAN §5). Both
 * numbers out of 5 carry their label ("Rating" is read out, "Difficulty" is printed). Unmatched, staff, disabled
 * and under-review instructors get nothing, or a quiet "No rating" when asked.
 */
export function RatingSummary({
  status,
  avgRating,
  numRatings,
  avgDifficulty,
  wouldTakeAgainPct,
  topTags,
  tagRatingsCounted,
  url,
  instructorName,
  nameShown = false,
  empty = "hide",
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
  // Difficulty and "would take again" only from MIN_DETAIL_RATINGS ratings (like the tags).
  const detailed = count >= MIN_DETAIL_RATINGS;
  const difficulty = detailed ? difficultyText(avgDifficulty) : null;
  const takeAgain = detailed ? takeAgainText(wouldTakeAgainPct) : null;
  const tags = shownTags(topTags, tagRatingsCounted);
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
          {difficulty ? (
            <>
              <Sep />
              <span>Difficulty {difficulty} of 5</span>
            </>
          ) : null}
          {takeAgain ? (
            <>
              <Sep />
              <span>{takeAgain} would take again</span>
            </>
          ) : null}
        </p>
      </div>
      {tags.length > 0 ? (
        <p className="text-sm text-fg-2" data-testid="rating-tags">
          Most common tags (from {ratingsCount(tagRatingsCounted ?? 0)}):{" "}
          {tags.map(({ tag, count: uses }, index) => (
            <span key={tag}>
              {index > 0 ? ", " : null}
              {tag} <span aria-hidden>{`(${uses})`}</span>
              <span className="sr-only">{`(${uses} ratings)`}</span>
            </span>
          ))}
        </p>
      ) : null}
      <p
        className="flex flex-wrap items-center gap-x-1.5 text-sm text-fg-2"
        data-testid="rating-source"
      >
        <SourceLink
          source="ratemyprofessors"
          href={href}
          what={`${instructorName ?? "this professor"}’s page`}
        />
      </p>
    </div>
  );
}
