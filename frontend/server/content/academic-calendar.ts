import "server-only";
import type { z } from "zod";
import type { SourceId } from "@/lib/sources";
import type { TermCode } from "@/lib/term";
import {
  CalendarEventSchema,
  type CALENDAR_CATEGORIES,
  type CalendarEvent,
} from "@/lib/types/content";
import {
  addDays,
  davidsonDay,
  defineContent,
  latestVerifiedAt,
  type DayInput,
} from "@/server/content/define";

/**
 * Davidson's 2026-27 academic calendar (PLAN §3 Today "Due soon", §5 WebTree deadlines), converted from the verified
 * research in content-prep/final_calendar.json. Every row was re-checked against the live Registrar page (table
 * "Updated: 3/10/2026") and the other official pages it cites on 2026-09-30; weekdays, times and the Banner term
 * windows (terms API: 202601 2026-08-24..12-15, 202602 2027-01-19..05-12, 202603 2027-05-19..08-10) all match.
 *
 * - Dates are America/New_York calendar dates; `time` is the published 24 h ET opening/at time ("07:00").
 * - `termCode` is the Banner term the row belongs to: Registrar rows keep their table's term (the summer
 *   contract-grade row is 202603); other offices' rows get the term whose window contains them; rows between
 *   terms get the term they concern (Dec 16 → 202601; Jan 1, Jan 15, May 13 → 202602; Jun 15 spring incompletes
 *   → 202602).
 * - Derived rows say so in their description: the "Last Day to Drop" rows (Sep 4, Jan 29 at 17:00) come from
 *   "Drops not permitted after ..." plus week 2 closing at 5 p.m.; Thanksgiving Break ends Nov 29 because classes
 *   resume Mon Nov 30 at 8:05 a.m.; the Oct 1, 2026 minor deadline applies "Oct 1 of the senior year" to the Class
 *   of 2027; the personal-leave penalty dates and the Residence Life dates carry no year on their pages and map to
 *   exactly one 2026-27 date each.
 * - Not published, so not here: student winter-break dates, a dated major-declaration deadline, non-senior
 *   pass/fail deadlines, the 10th-day leave/refund cutoff, the Fall 2027 schedule release ("early July") and an
 *   end date for the January add/drop window.
 * - Known discrepancy: the calendar gives Aug 28, 2026 for removing Summer 2026 incompletes while the Incomplete
 *   Courses page says "Summer - September 1st"; the calendar date is used.
 *
 * Source tag: REGISTRAR for rows from Registrar pages (the calendar, the Academic Regulations, personal leave, the
 * Banner terms), DAVIDSON OFFICES for rows from other offices' pages (HR holidays, Residence Life, CIS): see
 * calendarEventSource(), which reads a row's first source. Any other page a description quotes (the WebTree
 * overview, the self-scheduled exam procedures, the Academic Regulations) is listed after it.
 * Faculty/staff-only rows (textbooks, grades due, chair reviews, office closures) are kept with their audience;
 * the student views leave them out (isStudentFacing()).
 * - Religious observances are not listed: the research held one (Easter Sunday), which would single out one faith
 *   as a student "holiday". The March/April Break row covers the no-class days, and HR's staff "Easter" holiday
 *   (Fri. March 26) has its own row. An even-handed observance feed would need the owner's approval.
 */

export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

const REGISTRAR_CALENDAR_2026_27 =
  "https://www.davidson.edu/offices-and-services/registrar/academic-calendars/2026-2027";
const HR_COLLEGE_HOLIDAYS =
  "https://www.davidson.edu/offices-and-services/human-resources/benefits/college-holidays";
const RESIDENCE_LIFE_DATES =
  "https://www.davidson.edu/offices-and-services/residence-life/dates-deadlines";
const PERSONAL_LEAVE =
  "https://www.davidson.edu/offices-and-services/registrar/academic-regulations/personal-leave";
const ACADEMIC_REGULATIONS_2026_27 = "https://www.davidson.edu/media/15696/download?attachment";
const CIS_APPLICATION_GUIDELINES =
  "https://www.davidson.edu/academic-departments/interdisciplinary-studies/majors/application-guidelines";
const CATALOG_2026_27_REGULATIONS =
  "https://catalog.davidson.edu/content.php?catoid=28&navoid=1332";
const WEBTREE_OVERVIEW =
  "https://www.davidson.edu/offices-and-services/registrar/course-registration-and-webtree-overview";
const SELF_SCHEDULED_EXAMS =
  "https://www.davidson.edu/offices-and-services/registrar/course-offerings/self-scheduled-exam-procedures";
const BANNER_TERMS = "https://api.davidson.edu/api/public/v2/terms?limit=1000";

const EVENTS = [
  {
    id: "f26-adddrop-upperclass",
    title: "Banner Self-Service Add/Drop for Sophomores, Juniors, and Seniors",
    category: "registration",
    start: "2026-08-03",
    end: "2026-08-07",
    time: "07:00",
    termCode: "202601",
    audience: "Sophomores, juniors, and seniors",
    description:
      "Pre-semester add/drop for Fall 2026 on Banner Self-Service. Opens Aug. 3 at 7 a.m.; closes Aug. 7 at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-movein-firstyear",
    title: "First-Year and Transfer Student Move-In",
    category: "other",
    start: "2026-08-19",
    end: null,
    time: "08:00",
    termCode: "202601",
    audience: "First-year and transfer students",
    description:
      "2026 move-in (Wed., Aug. 19), staggered by residence hall from 8 a.m. to 5 p.m.; transfer students check in at the Residence Life Office 12:30-1:30 p.m.",
    sources: [RESIDENCE_LIFE_DATES],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-orientation",
    title: "Orientation",
    category: "other",
    start: "2026-08-20",
    end: "2026-08-23",
    time: null,
    termCode: "202601",
    audience: "New students",
    description: "New student orientation, Aug. 20-23.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-adddrop-new",
    title: "Banner Self-Service Add/Drop for New Students Only",
    category: "registration",
    start: "2026-08-21",
    end: null,
    time: "07:00",
    termCode: "202601",
    audience: "New students",
    description:
      "New students may add/drop on Banner Self-Service from 7 a.m. until midnight on Aug. 21.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-adddrop-reopen",
    title: "Banner Self-Service Add/Drop Re-Opens for Sophomores, Juniors and Seniors",
    category: "registration",
    start: "2026-08-22",
    end: null,
    time: "07:00",
    termCode: "202601",
    audience: "Sophomores, juniors, and seniors",
    description:
      "Add/drop re-opens at 7 a.m. on Aug. 22 for continuing students (the Registrar's registration overview describes this as the two days before the start of classes; add/drop Week 1 then runs Aug. 24-28).",
    sources: [REGISTRAR_CALENDAR_2026_27, WEBTREE_OVERVIEW],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-movein-returning",
    title: "Returning Student Move-In",
    category: "other",
    start: "2026-08-22",
    end: "2026-08-23",
    time: "09:00",
    termCode: "202601",
    audience: "Returning students",
    description:
      "Sat., Aug. 22, 9 a.m.-5 p.m. (late check-in 6-8 p.m. at the Residence Life Office); Sun., Aug. 23, 9 a.m.-4 p.m. at the Residence Life Office.",
    sources: [RESIDENCE_LIFE_DATES],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-adddrop-week1",
    title: "Add/Drop Week 1 (Banner Self-Service)",
    category: "registration",
    start: "2026-08-24",
    end: "2026-08-28",
    time: "07:00",
    termCode: "202601",
    audience: "All students",
    description:
      "Add/drop available to all students on Banner Self-Service; opens at 7 a.m. Aug. 24 for new students and ends Aug. 28 at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-classes-begin",
    title: "Fall Semester Classes Begin",
    category: "classes",
    start: "2026-08-24",
    end: null,
    time: "08:05",
    termCode: "202601",
    audience: "All students",
    description: "First day of Fall 2026 classes (Mon., Aug. 24, 8:05 a.m.).",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-adddrop-week2",
    title: "Add/Drop Week 2 (Permission Form, $20 Late Fee)",
    category: "registration",
    start: "2026-08-28",
    end: "2026-09-04",
    time: "17:01",
    termCode: "202601",
    audience: "All students",
    description:
      "Aug. 28 (5:01 p.m.) - Sept. 4 (5 p.m.): add/drop only via the Add/Drop Permission Form with a $20 late fee; professor permission required to add.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-summer-incompletes",
    title: "Deadline to Remove Summer Incompletes",
    category: "deadline",
    start: "2026-08-28",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Students with Summer 2026 incompletes",
    description: "Deadline to remove Summer 2026 incomplete grades.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-drop-deadline",
    title: "Last Day to Drop a Fall 2026 Course",
    category: "deadline",
    start: "2026-09-04",
    end: null,
    time: "17:00",
    termCode: "202601",
    audience: "All students",
    description: "Add/Drop Week 2 ends at 5 p.m.; drops are not permitted after September 4.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-chairs-review-spring",
    title: "Dept. Chairs Review Posted Spring Schedule for Changes",
    category: "other",
    start: "2026-09-04",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Department chairs",
    description: "Department chairs review the posted Spring 2027 schedule for changes.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-chairs-review-degreeworks",
    title: "Department Chairs Review Major Requirements in Degree Works for Senior Majors",
    category: "other",
    start: "2026-09-21",
    end: "2026-10-05",
    time: null,
    termCode: "202601",
    audience: "Department chairs; senior majors",
    description: "Department chairs review senior majors' major requirements in Degree Works.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-fall-break",
    title: "Fall Break",
    category: "break",
    start: "2026-09-21",
    end: "2026-09-22",
    time: null,
    termCode: "202601",
    audience: "All students",
    description: "Fall Break (Mon.-Tue., Sept. 21-22); no classes.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-minor-declaration",
    title: "Minor Declaration Deadline for Seniors",
    category: "deadline",
    start: "2026-10-01",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Seniors (Class of 2027)",
    description:
      "Seniors may declare a minor through the Registrar's Office no later than October 1 of the senior year (2026-2027 Academic Regulations; the 2026-2027 catalog's Academic Regulations page says the same). For the Class of 2027 this is Thu., Oct. 1, 2026.",
    sources: [ACADEMIC_REGULATIONS_2026_27, CATALOG_2026_27_REGULATIONS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-webtree-spring27",
    title: "WebTree Open: Submit Spring 2027 Course Preferences",
    category: "registration",
    start: "2026-10-12",
    end: "2026-11-03",
    time: "07:00",
    termCode: "202601",
    audience: "All students",
    description:
      "Students submit Spring 2027 course preferences on WebTree. Opens Oct. 12 at 7 a.m.; closes Nov. 3 at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-adviser-conferences",
    title: "Student-Adviser Conferences",
    category: "advising",
    start: "2026-10-12",
    end: "2026-11-03",
    time: null,
    termCode: "202601",
    audience: "All students",
    description:
      "Student-Adviser Conferences ahead of Spring 2027 registration. Seniors should check Degree Works to make sure they are on track to graduate.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-textbooks",
    title: "Faculty Textbook Information Due to Bookstore",
    category: "other",
    start: "2026-10-12",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Faculty",
    description:
      "Faculty textbook information due to the bookstore. The Registrar calendar does not say which term the textbooks are for.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-jan-grad-app",
    title: "January Graduation Application Due",
    category: "deadline",
    start: "2026-11-01",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Students planning a January graduation",
    description: "January graduation application due.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-leave-spring-notice",
    title: "Spring 2027 Non-Enrollment Notice Deadline ($250 Penalty After)",
    category: "deadline",
    start: "2026-11-01",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Students not planning to enroll for Spring 2027",
    description:
      "A $250 penalty is charged if a student notifies the college after November 1 that they do not intend to enroll for the spring semester (rising to $500 after January 1).",
    sources: [PERSONAL_LEAVE],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-webtree-closes",
    title: "WebTree Closes (Spring 2027 Preferences Due)",
    category: "deadline",
    start: "2026-11-03",
    end: null,
    time: "17:00",
    termCode: "202601",
    audience: "All students",
    description: "WebTree closes at 5 p.m.; last moment to submit Spring 2027 course preferences.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-schedules-available",
    title: "Spring 2027 Student Schedules Available on Banner Self-Service",
    category: "registration",
    start: "2026-11-06",
    end: null,
    time: "17:00",
    termCode: "202601",
    audience: "All students",
    description:
      "Student schedules for Spring 2027 become available on Banner Self-Service at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-adddrop-november",
    title: "Banner Self-Service Add/Drop (Spring 2027)",
    category: "registration",
    start: "2026-11-09",
    end: "2026-11-13",
    time: "07:00",
    termCode: "202601",
    audience: "All students",
    description:
      "November add/drop window for Spring 2027 schedules. Opens Nov. 9 at 7 a.m.; ends Nov. 13 at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-adddrop-ends",
    title: "Add/Drop Ends (November Window)",
    category: "deadline",
    start: "2026-11-13",
    end: null,
    time: "17:00",
    termCode: "202601",
    audience: "All students",
    description: "November Banner Self-Service add/drop for Spring 2027 ends at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-transfer-preauth",
    title: "Pre-Authorization to Transfer Credit Form Due for Spring",
    category: "deadline",
    start: "2026-11-15",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Students taking courses elsewhere in Spring 2027",
    description: "Pre-Authorization to Transfer Credit form due for spring courses.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-thanksgiving-break",
    title: "Thanksgiving Break",
    category: "break",
    start: "2026-11-20",
    end: "2026-11-29",
    time: "16:20",
    termCode: "202601",
    audience: "All students",
    description:
      "Thanksgiving break begins Fri., Nov. 20 at 4:20 p.m.; classes resume Mon., Nov. 30 at 8:05 a.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-thanksgiving-holiday",
    title: "Thanksgiving Holiday (College Offices Closed)",
    category: "holiday",
    start: "2026-11-26",
    end: "2026-11-27",
    time: null,
    termCode: "202601",
    audience: "Faculty and staff (college offices closed)",
    description: "College staff holiday, Thu., Nov. 26 - Fri., Nov. 27, 2026.",
    sources: [HR_COLLEGE_HOLIDAYS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-classes-resume",
    title: "Classes Resume After Thanksgiving",
    category: "classes",
    start: "2026-11-30",
    end: null,
    time: "08:05",
    termCode: "202601",
    audience: "All students",
    description: "Classes resume Mon., Nov. 30 at 8:05 a.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-classes-end",
    title: "Fall Semester Classes End",
    category: "classes",
    start: "2026-12-08",
    end: null,
    time: null,
    termCode: "202601",
    audience: "All students",
    description: "Last day of Fall 2026 classes.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-withdrawal-deadline",
    title:
      "Last Day to Petition for Individual Class Withdrawal or Initiate a Personal Leave (Fall)",
    category: "deadline",
    start: "2026-12-08",
    end: null,
    time: null,
    termCode: "202601",
    audience: "All students",
    description:
      "Last day to petition for an individual class withdrawal or to initiate a Personal Leave for Fall 2026.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-reading-day",
    title: "Reading and Reflection Day",
    category: "exams",
    start: "2026-12-09",
    end: null,
    time: null,
    termCode: "202601",
    audience: "All students",
    description:
      "Reading and Reflection Day. The Academic Regulations say there should be no for-credit assessment, exercise or activity (such as juries, thesis defenses or oral exams) that day unless the student requests it and the instructor approves.",
    sources: [REGISTRAR_CALENDAR_2026_27, ACADEMIC_REGULATIONS_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-schedule-request",
    title: "Request to Department Chairs for Fall 2027 and Spring 2028 Class Schedules",
    category: "other",
    start: "2026-12-09",
    end: null,
    time: null,
    termCode: "202601",
    audience: "Department chairs",
    description: "Request sent to department chairs for Fall 2027 and Spring 2028 class schedules.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-exam-center-1210",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2026-12-10",
    end: null,
    time: "08:40",
    termCode: "202601",
    audience: "Students with self-scheduled exams",
    description:
      "Exam Center open Thu.; exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-final-assessment",
    title: "Final Assessment Period",
    category: "exams",
    start: "2026-12-10",
    end: "2026-12-15",
    time: null,
    termCode: "202601",
    audience: "All students",
    description:
      "Fall 2026 final assessment days: Thu., Dec. 10; Fri., Dec. 11; Mon., Dec. 14; Tue., Dec. 15 (not the weekend).",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-exam-center-1211",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2026-12-11",
    end: null,
    time: "08:40",
    termCode: "202601",
    audience: "Students with self-scheduled exams",
    description:
      "Exam Center open Fri.; exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-exam-center-1214",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2026-12-14",
    end: null,
    time: "08:40",
    termCode: "202601",
    audience: "Students with self-scheduled exams",
    description:
      "Exam Center open Mon.; exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-exam-center-1215",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2026-12-15",
    end: null,
    time: "08:40",
    termCode: "202601",
    audience: "Students with self-scheduled exams",
    description:
      "Exam Center open Tue.; exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-final-day",
    title: "Final Day of the Fall Semester",
    category: "exams",
    start: "2026-12-15",
    end: null,
    time: null,
    termCode: "202601",
    audience: "All students",
    description: "Final day of the semester; the due date for any final assessment is December 15.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-halls-close",
    title: "Residence Halls Close for Winter Break",
    category: "other",
    start: "2026-12-16",
    end: null,
    time: "12:00",
    termCode: "202601",
    audience: "Residential students",
    description:
      'Winter Break Move-Out: all residence halls and apartments close at noon. Residence Life lists "December 16" under "Upcoming Dates" with no year. The next Dec 16 is 2026, which is the day after the Registrar\'s Dec 15, 2026 final day. Fall 2025 ended Dec 16, 2025, so this is not a leftover 2025 date.',
    sources: [RESIDENCE_LIFE_DATES],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-winter-break-offices",
    title: "College Winter Break (College Offices Closed)",
    category: "holiday",
    start: "2026-12-24",
    end: "2027-01-01",
    time: null,
    termCode: "202601",
    audience: "Faculty and staff (college offices closed)",
    description: "College staff winter break holiday, Thu., Dec. 24, 2026 - Fri., Jan. 1, 2027.",
    sources: [HR_COLLEGE_HOLIDAYS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-leave-spring-late",
    title: "Spring 2027 Non-Enrollment Notice: $500 Penalty After This Date",
    category: "deadline",
    start: "2027-01-01",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Students not planning to enroll for Spring 2027",
    description:
      "A $500 penalty applies if a student notifies the college after January 1 that they do not intend to enroll for the spring semester.",
    sources: [PERSONAL_LEAVE],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-adddrop-opens",
    title: "Banner Self-Service Add/Drop Opens (Spring 2027)",
    category: "registration",
    start: "2027-01-05",
    end: null,
    time: "07:00",
    termCode: "202602",
    audience: "All students",
    description:
      'Banner Self-Service add/drop for Spring 2027 opens at 7 a.m. The Registrar\'s Course Registration & WebTree Overview says this early-January add/drop window runs "through the beginning of classes" (classes begin Jan. 19). No separate closing time is published.',
    sources: [REGISTRAR_CALENDAR_2026_27, WEBTREE_OVERVIEW],
    verifiedAt: "2026-09-30",
  },
  {
    id: "f26-grades-due",
    title: "Fall Semester Grades Due",
    category: "deadline",
    start: "2027-01-05",
    end: null,
    time: "10:00",
    termCode: "202601",
    audience: "Faculty",
    description: "Fall 2026 grades due Tue., Jan. 5, 2027 at 10 a.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-halls-open",
    title: "Residence Halls Open for Spring Semester",
    category: "other",
    start: "2027-01-15",
    end: null,
    time: "09:00",
    termCode: "202602",
    audience: "Residential students",
    description:
      'Spring Semester Move-In: all residence halls and apartments open at 9 a.m. Residence Life lists "January 15" under "Upcoming Dates" with no year, between Dec 16 and May 13. The next Jan 15 is 2027, a Friday, 4 days before Spring 2027 classes begin on Tue., Jan. 19.',
    sources: [RESIDENCE_LIFE_DATES],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-mlk-day",
    title: "Martin Luther King Day (College Offices Closed)",
    category: "holiday",
    start: "2027-01-18",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Faculty and staff (college offices closed)",
    description: "College staff holiday, Mon., Jan. 18, 2027.",
    sources: [HR_COLLEGE_HOLIDAYS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-adddrop-week1",
    title: "Add/Drop Week 1 (Banner Self-Service)",
    category: "registration",
    start: "2027-01-19",
    end: "2027-01-22",
    time: "07:00",
    termCode: "202602",
    audience: "All students",
    description:
      "Add/drop available to all students on Banner Self-Service, Jan. 19 (7 a.m.) - Jan. 22 (5 p.m.).",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-classes-begin",
    title: "Spring Semester Classes Begin",
    category: "classes",
    start: "2027-01-19",
    end: null,
    time: "08:15",
    termCode: "202602",
    audience: "All students",
    description: "First day of Spring 2027 classes (Tue., Jan. 19, 8:15 a.m.).",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-adddrop-week2",
    title: "Add/Drop Week 2 (Permission Form, $20 Late Fee)",
    category: "registration",
    start: "2027-01-22",
    end: "2027-01-29",
    time: "17:01",
    termCode: "202602",
    audience: "All students",
    description:
      "Jan. 22 (5:01 p.m.) - Jan. 29 (5 p.m.): add/drop only via the Add/Drop Permission Form with a $20 late fee; professor permission required to add.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-fall-incompletes",
    title: "Deadline to Remove Fall Incompletes",
    category: "deadline",
    start: "2027-01-22",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Students with Fall 2026 incompletes",
    description: "Deadline to remove Fall 2026 incomplete grades.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-drop-deadline",
    title: "Last Day to Drop a Spring 2027 Course",
    category: "deadline",
    start: "2027-01-29",
    end: null,
    time: "17:00",
    termCode: "202602",
    audience: "All students",
    description: "Add/Drop Week 2 ends at 5 p.m.; drops are not permitted after January 29.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-schedules-prelim",
    title: "Fall 2027 and Spring 2028 Course Schedules Due (Preliminary)",
    category: "other",
    start: "2027-01-29",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Departments and faculty",
    description: "Preliminary Fall 2027 and Spring 2028 course schedules due (final due Feb. 5).",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-schedules-final",
    title: "Fall 2027 and Spring 2028 Course Schedules Due (Final)",
    category: "other",
    start: "2027-02-05",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Departments and faculty",
    description: "Final Fall 2027 and Spring 2028 course schedules due.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-cis-application",
    title: "Center for Interdisciplinary Studies Major Application Deadline",
    category: "deadline",
    start: "2027-02-19",
    end: null,
    time: "17:00",
    termCode: "202602",
    audience: "Sophomores applying for a CIS major",
    description:
      "Deadline for sophomores to apply for a student-designed major or a center-established CIS major (Global Literary Theory, Bioinformatics, Genomics, Public Health): Fri., Feb. 19, 2027 at 5 p.m.",
    sources: [CIS_APPLICATION_GUIDELINES],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-spring-break",
    title: "Spring Break",
    category: "break",
    start: "2027-03-08",
    end: "2027-03-12",
    time: null,
    termCode: "202602",
    audience: "All students",
    description: "Spring Break (Mon.-Fri., March 8-12); no classes.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-webtree-fall27",
    title: "WebTree Open: Submit Fall 2027 Course Preferences",
    category: "registration",
    start: "2027-03-15",
    end: "2027-04-06",
    time: "07:00",
    termCode: "202602",
    audience: "Continuing students",
    description:
      "Students submit course preferences in WebTree. Opens March 15 at 7 a.m.; closes April 6 at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-adviser-conferences",
    title: "Student-Adviser Conferences",
    category: "advising",
    start: "2027-03-15",
    end: "2027-04-06",
    time: null,
    termCode: "202602",
    audience: "All students",
    description: "Student-Adviser Conferences ahead of Fall 2027 registration.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-leave-fall-notice",
    title: "Fall 2027 Personal Leave: $250 Penalty if Approved After This Date",
    category: "deadline",
    start: "2027-03-15",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Students considering a Fall 2027 personal leave",
    description:
      "After March 15, a $250 penalty is charged if a student receives approval for personal leave beginning the following fall semester (rising to $500 after June 15).",
    sources: [PERSONAL_LEAVE],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-textbooks",
    title: "Faculty Textbook Information Due to Bookstore",
    category: "other",
    start: "2027-03-15",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Faculty",
    description:
      "Faculty textbook information due to the bookstore. The Registrar calendar does not say which term the textbooks are for.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-passfail-seniors",
    title: "Pass/Fail Forms Due for Seniors (Final Deadline)",
    category: "deadline",
    start: "2027-03-19",
    end: null,
    time: "17:00",
    termCode: "202602",
    audience: "Seniors",
    description: "Pass/Fail forms for seniors due Fri., March 19 at 5 p.m.; the deadline is final.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-easter-holiday-offices",
    title: "Easter Holiday (College Offices Closed)",
    category: "holiday",
    start: "2027-03-26",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Faculty and staff (college offices closed)",
    description:
      "HR's 2026-2027 staff holiday schedule lists \"Easter\" on Fri., March 26, 2027 (Good Friday). This is also a no-class day, part of the Registrar's March/April Break (March 26 and 29).",
    sources: [HR_COLLEGE_HOLIDAYS, REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-march-april-break",
    title: "March/April Break (No Classes)",
    category: "break",
    start: "2027-03-26",
    end: "2027-03-29",
    time: null,
    termCode: "202602",
    audience: "All students",
    description: "No classes Fri., March 26 and Mon., March 29 (with the weekend between).",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-convocation",
    title: "Spring Convocation",
    category: "ceremony",
    start: "2027-04-13",
    end: null,
    time: "11:15",
    termCode: "202602",
    audience: "All students",
    description:
      'Spring Convocation at 11:15 a.m.; only classes meeting at 12:15 p.m. are cancelled (Registrar: "12:15 p.m.-only classes cancelled").',
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-monday-schedule",
    title: "Classes Follow Monday Schedule",
    category: "classes",
    start: "2027-04-20",
    end: null,
    time: null,
    termCode: "202602",
    audience: "All students",
    description: "Tue., April 20: classes follow the Monday class meeting schedule.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-transfer-preauth",
    title: "Pre-Authorization Transfer Credit Form Due (Summer and Fall Courses)",
    category: "deadline",
    start: "2027-05-01",
    end: null,
    time: "17:00",
    termCode: "202602",
    audience: "Students taking summer or fall courses elsewhere",
    description:
      "Pre-Authorization to Transfer Credit form for Summer 2027 and Fall 2027 courses due at 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-last-class-day",
    title: "Last Day of Spring Classes (Friday Schedule)",
    category: "classes",
    start: "2027-05-05",
    end: null,
    time: null,
    termCode: "202602",
    audience: "All students",
    description:
      "Wed., May 5: classes follow the Friday class meeting schedule; last day of scheduled classes. All work, except that which is part of the final assessment, is due no later than 5 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-withdrawal-deadline",
    title:
      "Last Day to Petition for Individual Class Withdrawal or Initiate a Personal Leave (Spring)",
    category: "deadline",
    start: "2027-05-05",
    end: null,
    time: null,
    termCode: "202602",
    audience: "All students",
    description:
      "Last day to petition for an individual class withdrawal or to initiate a Personal Leave for Spring 2027.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-symposium",
    title: "Verna Miller Case Research & Creative Works Symposium (No Classes)",
    category: "other",
    start: "2027-05-06",
    end: null,
    time: null,
    termCode: "202602",
    audience: "All students",
    description: "Verna Miller Case Research & Creative Works Symposium; no classes.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-reading-day",
    title: "Reading and Reflection Day",
    category: "exams",
    start: "2027-05-07",
    end: null,
    time: null,
    termCode: "202602",
    audience: "All students",
    description:
      "Reading and Reflection Day. The Academic Regulations say there should be no for-credit assessment, exercise or activity (such as juries, thesis defenses or oral exams) that day unless the student requests it and the instructor approves.",
    sources: [REGISTRAR_CALENDAR_2026_27, ACADEMIC_REGULATIONS_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-exam-center-0508",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2027-05-08",
    end: null,
    time: "08:40",
    termCode: "202602",
    audience: "Students with self-scheduled exams",
    description:
      "Exam Center open Sat.; exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-final-nonseniors",
    title: "Final Assessment Period - Non-Seniors",
    category: "exams",
    start: "2027-05-08",
    end: "2027-05-12",
    time: null,
    termCode: "202602",
    audience: "Non-seniors",
    description: "Final assessment period for non-seniors, May 8-12.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-final-seniors",
    title: "Final Assessment Period - Seniors",
    category: "exams",
    start: "2027-05-08",
    end: "2027-05-10",
    time: null,
    termCode: "202602",
    audience: "Seniors",
    description: "Final assessment period for seniors, May 8-10.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-exam-center-0509",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2027-05-09",
    end: null,
    time: "08:40",
    termCode: "202602",
    audience: "Students with self-scheduled exams",
    description:
      "Exam Center open Sun.; exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-exam-center-0510",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2027-05-10",
    end: null,
    time: "08:40",
    termCode: "202602",
    audience: "Students with self-scheduled exams",
    description:
      "Exam Center open Mon.; exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-final-day-seniors",
    title: "Final Day of the Semester for Seniors",
    category: "exams",
    start: "2027-05-10",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Seniors",
    description:
      "Final day of the semester for seniors; the due date for any final assessment for all seniors is May 10.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-exam-center-0512",
    title: "Exam Center Open (Self-Scheduled Exams)",
    category: "exams",
    start: "2027-05-12",
    end: null,
    time: "08:40",
    termCode: "202602",
    audience: "Non-seniors with self-scheduled exams",
    description:
      "Exam Center open Wed. (non-seniors only); exam pickup at 8:40 a.m. and 1:40 p.m. per the academic calendar. The Self-Scheduled Exam Procedures page gives the pickup windows as 8:40-9:15 a.m. and 1:40-2:15 p.m. in the Chambers lobby Exam Center.",
    sources: [REGISTRAR_CALENDAR_2026_27, SELF_SCHEDULED_EXAMS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-grades-seniors",
    title: "Grades Due - Graduating Seniors",
    category: "deadline",
    start: "2027-05-12",
    end: null,
    time: "10:00",
    termCode: "202602",
    audience: "Faculty",
    description: "Grades for graduating seniors due Wed., May 12 at 10 a.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-final-day-nonseniors",
    title: "Final Day of the Semester for Non-Seniors",
    category: "exams",
    start: "2027-05-12",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Non-seniors",
    description:
      "Final day of the semester for non-seniors; the due date for any final assessment for all non-seniors is May 12.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-moveout-nonseniors",
    title: "Move-Out for Non-Graduating Students",
    category: "other",
    start: "2027-05-13",
    end: null,
    time: "12:00",
    termCode: "202602",
    audience: "Non-graduating residential students",
    description:
      'Non-graduating students must move out by noon (and within 24 hours of their last exam); late departure fee up to $250 unless approved by Residence Life. Residence Life lists "May 13" under "Upcoming Dates" with no year. The next May 13 is 2027, the day after the Registrar\'s May 12, 2027 non-senior final day.',
    sources: [RESIDENCE_LIFE_DATES],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-baccalaureate",
    title: "Baccalaureate Service",
    category: "ceremony",
    start: "2027-05-15",
    end: null,
    time: "14:30",
    termCode: "202602",
    audience: "Graduating seniors and families",
    description: "Baccalaureate Service, Sat., May 15 at 2:30 p.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-commencement",
    title: "Commencement 2027",
    category: "ceremony",
    start: "2027-05-16",
    end: null,
    time: "10:00",
    termCode: "202602",
    audience: "Graduating seniors (Class of 2027)",
    description: "Commencement for the Class of 2027, Sun., May 16 at 10 a.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-grades-nonseniors",
    title: "Grades Due - Non-Graduating Students",
    category: "deadline",
    start: "2027-05-18",
    end: null,
    time: "10:00",
    termCode: "202602",
    audience: "Faculty",
    description: "Grades for non-graduating students due Tue., May 18 at 10 a.m.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "su27-term",
    title: "Summer 2027 Term (Banner Term Dates)",
    category: "other",
    start: "2027-05-19",
    end: "2027-08-10",
    time: null,
    termCode: "202603",
    audience: "Students taking Summer 2027 contract courses or special programs",
    description:
      'Davidson\'s official course API lists term 202603 "Summer 2027" (Academic Year 2026-2027) as running May 19 - Aug. 10, 2027. Davidson publishes no separate summer academic calendar. The Academic Regulations say summer is for special programs (study abroad, summer contract courses) and that contract-course registration and completion deadlines and fees are announced by the Registrar during the spring semester.',
    sources: [BANNER_TERMS, ACADEMIC_REGULATIONS_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "su27-memorial-day",
    title: "Memorial Day (College Offices Closed)",
    category: "holiday",
    start: "2027-05-31",
    end: null,
    time: null,
    termCode: "202603",
    audience: "Faculty and staff (college offices closed)",
    description: "College staff holiday, Mon., May 31, 2027.",
    sources: [HR_COLLEGE_HOLIDAYS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "s27-spring-incompletes",
    title: "Deadline to Remove Spring Incompletes",
    category: "deadline",
    start: "2027-06-15",
    end: null,
    time: null,
    termCode: "202602",
    audience: "Students with Spring 2027 incompletes",
    description: "Deadline to remove Spring 2027 incomplete grades.",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
  {
    id: "su27-leave-fall-late",
    title: "Fall 2027 Personal Leave: $500 Penalty if Approved After This Date",
    category: "deadline",
    start: "2027-06-15",
    end: null,
    time: null,
    termCode: "202603",
    audience: "Students considering a Fall 2027 personal leave",
    description:
      "A $500 penalty applies if personal leave beginning the fall semester is approved after June 15.",
    sources: [PERSONAL_LEAVE],
    verifiedAt: "2026-09-30",
  },
  {
    id: "su27-juneteenth",
    title: "Juneteenth (College Offices Closed)",
    category: "holiday",
    start: "2027-06-18",
    end: null,
    time: null,
    termCode: "202603",
    audience: "Faculty and staff (college offices closed)",
    description:
      "College staff holiday, Fri., June 18, 2027 (listed in HR's 2027-2028 Holiday Schedule).",
    sources: [HR_COLLEGE_HOLIDAYS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "su27-independence-day",
    title: "Independence Day (College Offices Closed)",
    category: "holiday",
    start: "2027-07-05",
    end: null,
    time: null,
    termCode: "202603",
    audience: "Faculty and staff (college offices closed)",
    description:
      "College staff holiday observed Mon., July 5, 2027 (listed in HR's 2027-2028 Holiday Schedule; July 4, 2027 is a Sunday).",
    sources: [HR_COLLEGE_HOLIDAYS],
    verifiedAt: "2026-09-30",
  },
  {
    id: "su27-contract-grades",
    title: "Deadline for Summer Contract Course Grades",
    category: "deadline",
    start: "2027-08-06",
    end: null,
    time: null,
    termCode: "202603",
    audience: "Faculty; students in Summer 2027 contract courses",
    description:
      "Deadline for Summer 2027 contract course grades (listed at the bottom of the Registrar's Spring 2027 table; falls inside the Banner Summer 2027 term, 202603, May 19 - Aug. 10, 2027).",
    sources: [REGISTRAR_CALENDAR_2026_27],
    verifiedAt: "2026-09-30",
  },
] satisfies z.input<typeof CalendarEventSchema>[];

export const ACADEMIC_CALENDAR: readonly CalendarEvent[] = defineContent(
  "academic-calendar",
  CalendarEventSchema,
  EVENTS,
  (event) => event.id,
);

/** When the calendar was last checked against the Registrar ("verified <date>" in the Sources panel). */
export const CALENDAR_VERIFIED_AT: string = latestVerifiedAt(ACADEMIC_CALENDAR);

const BY_ID = new Map(ACADEMIC_CALENDAR.map((event) => [event.id, event]));

export function getCalendarEvent(id: string): CalendarEvent | undefined {
  return BY_ID.get(id);
}

/** Every row of one Banner term, in date order. */
export function calendarForTerm(termCode: TermCode): CalendarEvent[] {
  return sortEvents(ACADEMIC_CALENDAR.filter((event) => event.termCode === termCode));
}

/** Last day of the row: `end` for multi-day rows, else `start`. */
export function eventEndDay(event: CalendarEvent): string {
  return event.end ?? event.start;
}

const STAFF_AUDIENCE = /^(faculty|departments?)\b/i;

/**
 * False for rows only faculty, staff or departments act on (textbook orders, grades due, chair reviews, office
 * closures); true for everything that concerns students, including mixed audiences ("Department chairs; senior
 * majors") and rows with no audience.
 */
export function isStudentFacing(event: CalendarEvent): boolean {
  if (event.audience === null) return true;
  const parts = event.audience
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return !parts.every((part) => STAFF_AUDIENCE.test(part));
}

const REGISTRAR_SOURCE_PREFIXES = [
  "https://www.davidson.edu/offices-and-services/registrar/",
  ACADEMIC_REGULATIONS_2026_27,
  BANNER_TERMS,
];

/** The truthful source tag of a row: REGISTRAR for Registrar pages, DAVIDSON OFFICES for other offices' pages. */
export function calendarEventSource(
  event: CalendarEvent,
): Extract<SourceId, "registrar" | "davidson-offices"> {
  const url = event.sources[0] ?? "";
  return REGISTRAR_SOURCE_PREFIXES.some((prefix) => url.startsWith(prefix))
    ? "registrar"
    : "davidson-offices";
}

export interface CalendarQueryOptions {
  /** "students" (default) leaves out faculty/staff-only rows; "all" keeps them. */
  audience?: "students" | "all";
  /** Only these categories (default: all). */
  categories?: readonly CalendarCategory[];
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.id.localeCompare(b.id),
  );
}

function matches(event: CalendarEvent, options: CalendarQueryOptions): boolean {
  if ((options.audience ?? "students") === "students" && !isStudentFacing(event)) return false;
  return !options.categories || options.categories.includes(event.category);
}

/**
 * Rows that overlap the Davidson days `from`..`to` (inclusive; a Date is read as its America/New_York day), so a
 * window already under way (WebTree Oct 12 - Nov 3) is included while it lasts. Sorted by start, time, id.
 */
export function calendarBetween(
  from: DayInput,
  to: DayInput,
  options: CalendarQueryOptions = {},
): CalendarEvent[] {
  const first = davidsonDay(from);
  const last = davidsonDay(to);
  if (last < first) return [];
  return sortEvents(
    ACADEMIC_CALENDAR.filter(
      (event) => event.start <= last && eventEndDay(event) >= first && matches(event, options),
    ),
  );
}

/**
 * Rows overlapping the `days` Davidson days starting on the day of `from` (days = 1 → that day only; 7 → that day
 * and the six after it). Pass the server's `now()`.
 */
export function upcomingCalendar(
  from: DayInput,
  days: number,
  options: CalendarQueryOptions = {},
): CalendarEvent[] {
  if (!Number.isInteger(days) || days < 1) throw new RangeError("days must be a positive integer");
  const first = davidsonDay(from);
  return calendarBetween(first, addDays(first, days - 1), options);
}

/** Calendar categories that are deadlines or registration windows (Due soon). */
export const CALENDAR_DEADLINE_CATEGORIES = [
  "deadline",
  "registration",
] as const satisfies readonly CalendarCategory[];

/**
 * A dated item for Due soon from curated content: a calendar deadline/registration row or a program deadline
 * (server/content/deadlines.ts merges both). Render the tag from `source`.
 */
export interface ContentDeadline {
  /** "calendar:<event id>" or "program:<program slug>:<date>". */
  id: string;
  kind: "calendar" | "program";
  title: string;
  /** The program deadline's label ("Priority deadline"); null for calendar rows (the title says it). */
  label: string | null;
  /** Davidson day it falls on (a window's first day). */
  date: string;
  /** Last day of a multi-day window, else null. */
  endDate: string | null;
  /** Published 24 h ET time, else null. */
  time: string | null;
  source: SourceId;
  /** The page to open (https). */
  url: string;
  audience: string | null;
  termCode: TermCode | null;
  /** The office that runs a program deadline; null for calendar rows. */
  officeSlug: string | null;
  verifiedAt: string;
}

export function calendarDeadline(event: CalendarEvent): ContentDeadline {
  return {
    id: `calendar:${event.id}`,
    kind: "calendar",
    title: event.title,
    label: null,
    date: event.start,
    endDate: event.end,
    time: event.time,
    source: calendarEventSource(event),
    url: event.sources[0] ?? REGISTRAR_CALENDAR_2026_27,
    audience: event.audience,
    termCode: event.termCode,
    officeSlug: null,
    verifiedAt: event.verifiedAt,
  };
}

/** Student-facing deadline and registration rows overlapping `from`..`to` (see calendarBetween). */
export function calendarDeadlinesBetween(
  from: DayInput,
  to: DayInput,
  options: Pick<CalendarQueryOptions, "audience"> = {},
): ContentDeadline[] {
  return calendarBetween(from, to, {
    ...options,
    categories: CALENDAR_DEADLINE_CATEGORIES,
  }).map(calendarDeadline);
}
