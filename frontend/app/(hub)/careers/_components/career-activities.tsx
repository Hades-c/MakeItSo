import { SectionCard } from "@/components/ui/section-card";
import { provenance, runHeads, SourceLine, SourceNote, viaLabel } from "@/components/ui/source-tag";
import { SOURCES } from "@/lib/sources";
import type { CareerOnCampus } from "@/lib/types/content";
import { verifiedRange, type SummerView } from "../_lib/activities";
import { formatContentDate } from "../_lib/format";
import { ExternalLink } from "./external-link";

/**
 * What to do outside class on a career page (owner request, 2026-10-29): "On campus" (student organizations from
 * WildcatSync) and "Summers" (office programs and outside programs). Presentational server components: the page
 * resolves the entries and passes them in; a path with no entries gets no card. Provenance follows the adopted rule
 * (docs/CONTRACTS.md "Look"): a single-source list says its source once in a SourceLine, a mixed list says it in
 * each row's meta line ("via Matthews Center", "via National Science Foundation"), once per run.
 */

/** "checked Oct 29, 2026", or "checked between Sep 30, 2026 and Oct 29, 2026" for a list read on several days. */
export function checkedWords(items: readonly { verifiedAt: string }[]): string {
  const range = verifiedRange(items);
  if (!range) return "";
  return range.from === range.to
    ? `checked ${formatContentDate(range.from)}`
    : `checked between ${formatContentDate(range.from)} and ${formatContentDate(range.to)}`;
}

const ON_CAMPUS_LINE: Record<CareerOnCampus["source"], string> = {
  wildcatsync: "From WildcatSync, Davidson’s student organization directory",
  "davidson-offices": "From Davidson offices’ pages",
};

export function OnCampusCard({ entries }: { entries: readonly CareerOnCampus[] | undefined }) {
  if (!entries || entries.length === 0) return null;
  const sources = [...new Set(entries.map((entry) => entry.source))];
  const single = sources.length === 1 ? sources[0]! : null;
  const labels = entries.map((entry) => viaLabel(entry.source));
  const heads = runHeads(labels);
  return (
    <SectionCard id="on-campus" title="On campus">
      <div {...(single ? provenance([single]) : {})}>
        <ul className="flex flex-col divide-y divide-line" data-testid="career-on-campus">
          {entries.map((entry, i) => (
            <li key={entry.url} className="py-3 first:pt-0 last:pb-0" data-source={entry.source}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ExternalLink href={entry.url} newTab>
                  {entry.name}
                </ExternalLink>
                {single ? null : (
                  <SourceNote
                    source={entry.source}
                    label={labels[i]!}
                    hidden={!heads[i]}
                    className="text-xs"
                  />
                )}
              </div>
              <p className="mt-1 text-sm text-fg-2">{entry.description}</p>
            </li>
          ))}
        </ul>
        {single ? (
          <SourceLine className="mt-3" testId="on-campus-source">
            {ON_CAMPUS_LINE[single]} · {checkedWords(entries)}
          </SourceLine>
        ) : (
          <p className="mt-3 text-xs text-fg-3">Each group’s own page · {checkedWords(entries)}</p>
        )}
      </div>
    </SectionCard>
  );
}

/** A row's "via" words: the office or source for an office program, the organization for an outside one. */
export function summerLabel(view: SummerView): string {
  return view.source ? viaLabel(view.source, view.officeName) : `via ${view.by ?? "its own page"}`;
}

function SummerNote({ view, label, hidden }: { view: SummerView; label: string; hidden: boolean }) {
  if (view.source) {
    return <SourceNote source={view.source} label={label} hidden={hidden} className="text-xs" />;
  }
  // An outside program has no source id (lib/sources.ts): the same quiet words, without data-source.
  if (hidden) return <span className="sr-only">Source: {label}</span>;
  return (
    <span className="font-sans text-xs text-fg-3">
      <span className="sr-only">Source: </span>
      {label}
    </span>
  );
}

/**
 * One source said once, when every row has the same one: a curated source by its label, an outside program by its
 * organization. DAVIDSON OFFICES rows always keep their office's name in each row (its line could not name the
 * source and the office at once).
 */
function singleSourceWords(views: readonly SummerView[]): string | null {
  const first = views[0];
  if (!first || first.source === "davidson-offices") return null;
  const label = summerLabel(first);
  if (!views.every((view) => summerLabel(view) === label)) return null;
  return `From ${first.source ? SOURCES[first.source].label : first.by}`;
}

export function SummersCard({ views }: { views: readonly SummerView[] }) {
  if (views.length === 0) return null;
  const single = singleSourceWords(views);
  const labels = views.map(summerLabel);
  const heads = runHeads(labels);
  const curated = [...new Set(views.flatMap((view) => (view.source ? [view.source] : [])))];
  return (
    <SectionCard id="summers" title="Summers">
      <div {...(single && curated.length > 0 ? provenance(curated) : {})}>
        <ul className="flex flex-col divide-y divide-line" data-testid="career-summers">
          {views.map((view, i) => (
            <li
              key={view.key}
              className="py-3 first:pt-0 last:pb-0"
              data-source={view.source ?? undefined}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ExternalLink href={view.url} newTab>
                  {view.name}
                </ExternalLink>
                {single ? null : <SummerNote view={view} label={labels[i]!} hidden={!heads[i]} />}
              </div>
              <p className="mt-1 text-sm text-fg-2">{view.description}</p>
              {view.audience || view.timing ? (
                // One layout for every row: the label beside its value, values aligned in one column, at every
                // width (a wrapping flex row put short values beside their label and long ones under it).
                <dl
                  className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm"
                  data-testid="summer-facts"
                >
                  {view.audience ? (
                    <>
                      <dt className="font-semibold text-fg">For</dt>
                      <dd className="min-w-0 text-fg-2">{view.audience}</dd>
                    </>
                  ) : null}
                  {view.timing ? (
                    <>
                      <dt className="font-semibold text-fg">{view.timing.label}</dt>
                      <dd className="min-w-0 text-fg-2">{view.timing.text}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
        {single ? (
          <SourceLine className="mt-3" testId="summers-source">
            {single} · {checkedWords(views)}. Confirm on the program’s page before you apply.
          </SourceLine>
        ) : (
          <p className="mt-3 text-xs text-fg-3">
            As each program publishes it · {checkedWords(views)}. Confirm on the program’s page
            before you apply.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
