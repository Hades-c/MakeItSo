import Link from "next/link";
import { Info, Printer } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { buttonVariants } from "@/components/ui/button";
import type { Loaded, NextSemesterData } from "../_lib/load";
import { planHref } from "../_lib/tabs";
import type { SectionDetail } from "./choice-card";
import { RegistrationDeadlines } from "./registration-deadlines";
import { WebTreeEditor } from "./webtree-editor";

/**
 * Next semester (PLAN §3): the WebTree list for the registration term with its conflict check and week grid,
 * seat pressure, requirement slots and restriction flags per choice, "Copy for WebTree" and a print view, and
 * the registration deadlines from the academic calendar.
 */
export function NextSemesterTab({
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
  const details: Record<string, SectionDetail> = {};
  for (const entry of data.report.details) {
    for (const detail of [entry.choice, ...entry.alternates]) details[detail.crn] = detail;
  }
  const registration = data.termCode === data.registrationTerm;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      {/* Dates first on phones (WebTree opens soon); the right column from lg. DOM order = phone order. */}
      <aside aria-label="Registration dates" className="min-w-0 lg:col-start-2 lg:row-start-1">
        <RegistrationDeadlines
          deadlines={data.deadlines}
          termLabel={data.termLabel}
          now={now}
          timeZone={timeZone}
          className="lg:sticky lg:top-20"
        />
      </aside>
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-strong tracking-title text-fg">
              {data.termLabel} WebTree list
            </h2>
            <p className="mt-1 max-w-prose text-sm text-fg-2">
              {registration
                ? `Rank the sections you want for ${data.termLabel}, with alternates. `
                : `A list for ${data.termLabel}, a later term. `}
              Your choices are saved as you go.
            </p>
          </div>
          {data.report.list.choices.length > 0 ? (
            <Link
              href={planHref("next", {
                term: registration ? undefined : data.termCode,
                print: true,
              })}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <Printer aria-hidden />
              Print view
            </Link>
          ) : null}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-fg-3">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            <span className="font-semibold text-fg-2">{data.report.disclaimer}.</span> Requirement
            notes and restriction flags are a planning aid; WebTree and the Registrar decide.
          </span>
        </p>
        <WebTreeEditor
          termCode={data.termCode}
          termLabel={data.termLabel}
          list={data.report.list}
          details={details}
          sections={data.sections}
          conflicts={data.report.conflicts}
          warnings={data.report.warnings}
          copyText={data.report.copyText}
          planCourses={data.planCourses}
          slotLabels={data.slotLabels}
          slotFillers={data.slotFillers}
        />
      </div>
    </div>
  );
}
