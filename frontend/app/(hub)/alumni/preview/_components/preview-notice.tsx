import { Info } from "lucide-react";
import { ExternalLink } from "@/app/(hub)/careers/_components/external-link";
import { formatContentDate } from "@/app/(hub)/careers/_lib/format";
import { cn } from "@/lib/utils";
import { DAVIDSON_CONNECT } from "@/server/content/alumni-sample";

/** The notice's first words: what the page is, said before anything else on it. */
export const PREVIEW_NOTICE_TITLE = "Davidson Connect preview · sample data";

/** What every sample profile is, in words (the notice, the career pages' link, the cards' screen-reader label). */
export const SAMPLE_PROFILES_SENTENCE =
  "These are fictional profiles that show how the Davidson Connect directory will look here once it is connected. They are not real alumni.";

/**
 * The Davidson Connect preview's notice (owner's request: sample data for pitching). Always shown, at the top of the
 * page, above the filters and every card; it has no close button and no state, so it cannot be dismissed. It is the
 * page's provenance line too: the sample profiles come from nowhere (server/content/alumni-sample.ts), and the one
 * real fact on the page, what Davidson Connect is, names its source and when it was checked.
 */
export function PreviewNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-labelledby="preview-notice-title"
      data-testid="preview-notice"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-line-strong bg-surface-2 p-4",
        className,
      )}
    >
      <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-2" />
      <div className="min-w-0 text-sm text-fg-2">
        <p id="preview-notice-title" className="text-base font-strong text-fg">
          {PREVIEW_NOTICE_TITLE}
        </p>
        <p className="mt-1">
          {SAMPLE_PROFILES_SENTENCE} MakeItSo is not connected to Davidson Connect yet, and nothing
          on this page contacts anyone.
        </p>
        <p className="mt-2 text-xs text-fg-3" data-testid="preview-about">
          {DAVIDSON_CONNECT.name} is the college’s alumni platform for mentoring, jobs and
          connecting with alumni:{" "}
          <ExternalLink href={DAVIDSON_CONNECT.sourceUrl}>
            {DAVIDSON_CONNECT.sourceTitle}
          </ExternalLink>{" "}
          · checked{" "}
          <time dateTime={DAVIDSON_CONNECT.verifiedAt}>
            {formatContentDate(DAVIDSON_CONNECT.verifiedAt)}
          </time>
        </p>
      </div>
    </div>
  );
}
