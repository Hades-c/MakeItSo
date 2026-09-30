import type * as React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { DayTimeline } from "@/components/domain/day-timeline";
import { FiveDayStrip } from "@/components/domain/five-day-strip";
import { PlanMap } from "@/components/domain/plan-map";
import { RatingSummary } from "@/components/domain/rating-summary";
import { RequirementSlots } from "@/components/domain/requirement-slots";
import { SeatBar } from "@/components/domain/seat-bar";
import { windowLabel } from "@/components/domain/time-geometry";
import { WeekGrid } from "@/components/domain/week-grid";
import { Chip } from "@/components/ui/chip";
import { CourseCode } from "@/components/ui/course-code";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  ADD_TO_PLAN_TERMS,
  NOW,
  PLAN_2029,
  PLAN_HUMANITIES,
  PLAN_PREVIEW,
  REQUIREMENTS,
  REQUIREMENTS_PLANNED,
  SAMPLE_SEARCH_RESULTS,
  SHELL_SOURCES,
  THURSDAY_EDGE_CASES,
  THURSDAY_NOW,
  TIME_ZONE,
  WEDNESDAY,
  WEEK_EDGE_CASES,
  WEEK_STRIP,
  WEEK_WITH_HIS_357,
} from "./_data";
import { AddToPlanDemo } from "./_components/add-to-plan-demo";
import { CommandPaletteDemo } from "./_components/command-palette-demo";

export const metadata: Metadata = {
  title: "Design gallery",
  robots: { index: false, follow: false },
};

const GRID = "grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]";
const STACK = "flex min-w-0 flex-col gap-5";

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-10 mb-3 border-t border-line pt-5 font-mono text-xs font-medium tracking-label text-fg-3 uppercase">
      {children}
    </p>
  );
}

const REQ_CHIPS: { code: string; state: "done" | "now" | "open" }[] = [
  { code: "VPRQ", state: "done" },
  { code: "NSRQ", state: "done" },
  { code: "Writing", state: "done" },
  { code: "LTRQ", state: "now" },
  { code: "MQRQ", state: "now" },
  { code: "SSRQ", state: "now" },
  { code: "HTRQ", state: "open" },
  { code: "PRRQ", state: "open" },
  { code: "JEC", state: "open" },
  { code: "Language", state: "open" },
];

/**
 * Dev-only gallery of the Lakeside domain components with the mockup data, for screenshots and axe. It never ships:
 * production builds answer 404.
 */
export default function DesignGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <AppShell
      user={{ name: "Taylor Student", email: "tastudent@davidson.edu" }}
      counts={{ courses: 676, plan: { done: 12, total: 32 } }}
      sources={SHELL_SOURCES}
      now={NOW}
      timeZone={TIME_ZONE}
    >
      <PageHeader
        kicker="Design gallery · development only"
        title="Wednesday, September 30"
        subtitle={
          <>
            Fall 2026 · <b>3 classes</b> today · <b>4 deadlines</b> in the next 10 days
          </>
        }
        actions={<FiveDayStrip days={WEEK_STRIP} className="w-full md:w-auto" />}
      />

      <div className={GRID}>
        <div className={STACK}>
          <SectionCard
            id="today"
            title="Today"
            count={windowLabel(9, 16)}
            link={{ href: "/design#week", label: "Week view" }}
          >
            <DayTimeline
              now={NOW}
              timeZone={TIME_ZONE}
              startHour={9}
              endHour={16}
              items={WEDNESDAY}
              showFreeGaps
              label="Schedule for Wednesday, September 30"
              nextUp={{
                code: "ENG 260 A",
                when: "Tomorrow 9:40",
                title: "British Literature Since 1800",
                location: "Chambers 3084",
              }}
            />
          </SectionCard>

          <section
            aria-labelledby="progress-title"
            className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5"
          >
            <PlanMap
              terms={PLAN_2029}
              requiredCredits={32}
              heading={
                <h2 id="progress-title" className="text-lg font-strong tracking-title text-fg">
                  Degree progress
                </h2>
              }
            />
            <ul
              aria-label="Requirements"
              className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3.5"
            >
              {REQ_CHIPS.map(({ code, state }) => (
                <li key={code}>
                  <Chip
                    mono
                    variant={state === "done" ? "done" : state === "now" ? "active" : "outline"}
                  >
                    {state === "done" ? <Check aria-hidden strokeWidth={3} /> : null}
                    {code}
                    {state === "now" ? " · now" : null}
                    <span className="sr-only">
                      {state === "done" ? ", done" : state === "open" ? ", open" : ""}
                    </span>
                  </Chip>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className={STACK}>
          <SectionCard id="seats" title="Seats" count="HIS 357 A · Fall 2026">
            <SeatBar current={16} max={24} remaining={8} courseCode="HIS 357" />
          </SectionCard>
          <SectionCard id="ratings" title="Student ratings">
            <RatingSummary
              status="matched"
              avgRating={3.7}
              numRatings={21}
              asOf="2026-09-30T13:00:00Z"
              url="https://www.ratemyprofessors.com/search/professors/3965?q=Aldridge"
              instructorName="Daniel Aldridge"
              timeZone={TIME_ZONE}
            />
          </SectionCard>
        </div>
      </div>

      <Kicker>Course page · HIS 357 A</Kicker>
      <div className={GRID}>
        <div className={STACK}>
          <SectionCard id="fills" title="What it fills in your plan">
            <Chip variant="done" className="mb-3">
              <Check aria-hidden strokeWidth={3} />2 open requirements
            </Chip>
            <RequirementSlots slots={REQUIREMENTS} candidate="HIS 357" />
          </SectionCard>
          <SectionCard id="fills-planned" title="Requirement slots · planned and done with courses">
            <RequirementSlots
              slots={REQUIREMENTS_PLANNED}
              note="Each course fills at most one Ways of Knowing slot."
            />
          </SectionCard>
        </div>
        <div className={STACK}>
          <SectionCard id="add" title="Add to plan">
            <AddToPlanDemo terms={ADD_TO_PLAN_TERMS} initialValue="202701" courseCode="HIS 357">
              <PlanMap
                variant="compact"
                terms={PLAN_PREVIEW}
                requiredCredits={32}
                highlightTermCode="202701"
                label="Plan preview"
              />
            </AddToPlanDemo>
          </SectionCard>
          <section
            id="week"
            aria-labelledby="week-title"
            className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-5"
          >
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <h2 id="week-title" className="text-lg font-strong tracking-title text-fg">
                Your week with HIS 357
              </h2>
              <Chip variant="done">
                <Check aria-hidden strokeWidth={3} />
                No conflicts
              </Chip>
            </div>
            <WeekGrid
              startHour={9}
              endHour={16}
              blocks={WEEK_WITH_HIS_357}
              label="Your week with HIS 357"
              initialDay="W"
            />
            <p className="mt-3 text-sm text-fg-2">
              80 min after <CourseCode code="ENG 260" /> on Tue/Thu — both in Chambers.
            </p>
          </section>
        </div>
      </div>

      <Kicker>States and edge cases</Kicker>
      <div className={GRID}>
        <div className={STACK}>
          <SectionCard id="thursday" title="Timeline · overlaps, deadline, edges" count="12:40p">
            <DayTimeline
              now={THURSDAY_NOW}
              timeZone={TIME_ZONE}
              startHour={9}
              endHour={16}
              items={THURSDAY_EDGE_CASES}
              showFreeGaps
              label="Schedule for Thursday, October 1"
            />
          </SectionCard>
          <SectionCard id="week-edge" title="Week · conflict, TBA, weekend, evening">
            <WeekGrid
              days={["M", "T", "W", "R", "F", "S"]}
              startHour={9}
              endHour={16}
              blocks={WEEK_EDGE_CASES}
              label="Week with a conflicting candidate"
            />
          </SectionCard>
          <SectionCard id="plan-edge" title="Plan · 2-credit, 0-credit and summer">
            <PlanMap terms={PLAN_HUMANITIES} requiredCredits={32} label="Humanities plan" />
          </SectionCard>
        </div>
        <div className={STACK}>
          <SectionCard id="seat-states" title="Seat states">
            <div className="flex flex-col gap-5">
              <SeatBar current={24} max={24} remaining={0} courseCode="CSC 221" />
              <SeatBar current={26} max={24} remaining={-2} courseCode="ECO 232" />
              <SeatBar current={0} max={0} remaining={0} />
              <SeatBar current={9} max={30} remaining={21} courseCode="ENG 260" size="sm" />
              <SeatBar current={13} max={12} remaining={-1} size="sm" />
            </div>
          </SectionCard>
          <SectionCard id="rating-states" title="Rating states">
            <ul className="flex flex-col gap-3">
              <li>
                <RatingSummary
                  status="matched"
                  avgRating={4.6}
                  numRatings={1}
                  size="sm"
                  asOf="2026-09-29T09:00:00Z"
                  timeZone={TIME_ZONE}
                />
              </li>
              <li>
                <RatingSummary status="unmatched" empty="quiet" />
              </li>
              <li>
                <RatingSummary status="staff" empty="quiet" />
              </li>
              <li>
                <RatingSummary status="matched" avgRating={4} numRatings={0} empty="quiet" />
              </li>
              <li className="text-xs text-fg-3">
                (status &quot;disabled&quot; and &quot;review&quot; render nothing by default:)
                <RatingSummary status="disabled" />
                <RatingSummary status="review" avgRating={4.1} numRatings={12} />
              </li>
            </ul>
          </SectionCard>
          <SectionCard id="add-states" title="Add to plan · offered, all published">
            <AddToPlanDemo
              terms={[
                { code: "202601", label: "Fall 2026", availability: "offered", sectionCount: 3 },
                { code: "202602", label: "Spring 2027", availability: "offered", sectionCount: 2 },
                {
                  code: "202603",
                  label: "Summer 2027",
                  availability: "not-yet-published",
                  note: "Usually not offered",
                },
                { code: "202701", label: "Fall 2027", availability: "not-yet-published" },
              ]}
              initialValue={null}
              courseCode="CSC 221"
            />
          </SectionCard>
          <SectionCard id="strip-states" title="Five-day strip · no links">
            <FiveDayStrip
              label="Next week"
              noun={["class", "classes"]}
              days={WEEK_STRIP.map((d) => ({ ...d, href: undefined, isToday: false }))}
            />
          </SectionCard>
          <SectionCard id="palette" title="Command palette">
            <p className="mb-3 text-sm text-fg-2">
              ⌘K / Ctrl+K opens the real palette (it reports that search is unavailable until
              /api/search exists). This one uses sample results.
            </p>
            <CommandPaletteDemo results={SAMPLE_SEARCH_RESULTS} initialQuery="civil rights" />
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
