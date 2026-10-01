import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { SOURCES } from "@/lib/sources";
import { describeDeadline } from "../_lib/deadlines";
import type { Loaded, NextSemesterData } from "../_lib/load";
import { planHref } from "../_lib/tabs";
import { meetingsText } from "../_lib/week";
import { PrintButton } from "./print-button";
import "./print.css";

/**
 * The WebTree list on paper (/plan?tab=next&view=print): rank, CRN, course, title, meeting times and alternates
 * in one table, the registration dates (tag REGISTRAR, as plain text), and the reminder that WebTree is filled
 * in by the student. Interactive bits are hidden when printing.
 */
export function WebTreePrintView({
  loaded,
  now,
  timeZone,
}: {
  loaded: Loaded<NextSemesterData>;
  now: Date;
  timeZone: string;
}) {
  if (!loaded.ok) {
    return <ErrorState title="Your WebTree list could not load" description={loaded.message} />;
  }
  const data = loaded.data;
  const sectionText = (crn: string, fallback: string) => {
    const section = data.sections[crn];
    return section ? `${section.courseCode} ${section.section}` : fallback;
  };
  const details = new Map(
    data.report.details.flatMap((entry) =>
      [entry.choice, ...entry.alternates].map((d) => [d.crn, d]),
    ),
  );
  const term = data.termCode === data.registrationTerm ? undefined : data.termCode;

  return (
    <div data-plan-print className="flex flex-col gap-5">
      <div data-print-hide className="flex flex-wrap gap-2">
        <PrintButton />
        <Link
          href={planHref("next", { term })}
          className={buttonVariants({ variant: "secondary" })}
        >
          <ArrowLeft aria-hidden />
          Back to the list
        </Link>
      </div>
      <div>
        <h2 className="text-xl font-strong tracking-title text-fg">
          {data.termLabel} WebTree preferences
        </h2>
        <p className="mt-1 text-sm text-fg-2">
          From MakeItSo ({SOURCES["my-plan"].tag}). Unofficial: enter each CRN in WebTree yourself.
        </p>
      </div>

      {data.report.list.choices.length === 0 ? (
        <p className="text-sm text-fg-2">No choices yet.</p>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="WebTree choices table"
          tabIndex={0}
        >
          <table className="w-full min-w-xl border-collapse text-left text-sm">
            <caption className="sr-only">{data.termLabel} WebTree choices in rank order</caption>
            <thead>
              <tr className="border-b border-line-strong text-xs tracking-label text-fg-3 uppercase">
                <th scope="col" className="py-2 pr-3">
                  Rank
                </th>
                <th scope="col" className="py-2 pr-3">
                  CRN
                </th>
                <th scope="col" className="py-2 pr-3">
                  Course
                </th>
                <th scope="col" className="py-2 pr-3">
                  Meets
                </th>
                <th scope="col" className="py-2">
                  Alternates
                </th>
              </tr>
            </thead>
            <tbody>
              {data.report.list.choices.map((choice) => {
                const detail = details.get(choice.crn);
                const section = data.sections[choice.crn];
                return (
                  <tr key={choice.crn} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-mono font-semibold">{choice.rank}</td>
                    <td className="py-2 pr-3 font-mono">
                      {detail?.registerAs ? detail.registerAs.crn : choice.crn}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-semibold">
                        {sectionText(choice.crn, choice.courseCode)}
                      </span>
                      <span className="block text-fg-2">
                        {detail?.title ?? section?.title ?? ""}
                      </span>
                      {detail?.registerAs ? (
                        <span className="block text-xs text-fg-2">
                          Register as {detail.registerAs.courseCode} {detail.registerAs.section}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-fg-2">
                      {section ? meetingsText(section.meetings).join("; ") : "—"}
                    </td>
                    <td className="py-2 text-fg-2">
                      {choice.alternates.length === 0
                        ? "—"
                        : choice.alternates.map((crn) => (
                            <span key={crn} className="block">
                              <span className="font-mono">{crn}</span> {sectionText(crn, "")}
                            </span>
                          ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.deadlines.length > 0 ? (
        <div>
          <h3 className="text-base font-strong text-fg">
            Registration dates ({SOURCES.registrar.tag})
          </h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {data.deadlines.map((deadline) => {
              const row = describeDeadline(deadline, now, timeZone);
              return (
                <li key={row.id}>
                  <span className="font-semibold">{row.when}</span> · {row.title}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
