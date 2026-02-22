import { NextResponse } from "next/server";

const DAVIDSON_API_URL =
  "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502";

interface DavidsonInstructor {
  first_name: string;
  last_name: string;
}

interface DavidsonMeeting {
  weekdays: string;
  class_time: string;
  building?: { description: string };
  room?: string;
}

interface DavidsonCourse {
  id: string;
  course_number: string;
  course_title: string;
  course_description: string;
  departments: { code: string; description: string }[];
  instructors: DavidsonInstructor[];
  enrollment: { current: number; max: number; remaining: number };
  grad_requirements: { code: string; description: string }[];
  meetings: DavidsonMeeting[];
  section: string;
  subject: { code: string; description: string };
  term: { code: number; description: string };
}

interface TransformedCourse {
  code: string;
  name: string;
  description: string;
  department: string;
  deptCode: string;
  professor: string;
  instructors: string[];
  sections: number;
  enrollment: { current: number; max: number };
  gradRequirements: string[];
  schedule: string;
  location: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(desc: string): string {
  // Remove instructor prefix like "Instructor B. Baker", "Instructor: J. R. Smith"
  let cleaned = desc.replace(/^Instructor:?\s+(?:[A-Z][.\w'-]*\s+){1,3}/i, "");
  // Remove prerequisites suffix (everything from "Prerequisites" or "Prerequisite" onward)
  cleaned = cleaned.replace(/\s*Prerequisites?[:.\s].*/i, "");
  // Remove "Corequisite" suffix
  cleaned = cleaned.replace(/\s*Corequisites?[:.\s].*/i, "");
  // Remove "Cross-listed" suffix
  cleaned = cleaned.replace(/\s*Cross-?listed.*/i, "");
  // Remove "Note:" or "Notes:" suffix
  cleaned = cleaned.replace(/\s*Notes?:\s.*/i, "");
  // Clean up trailing/leading whitespace
  return cleaned.trim();
}

function formatInstructorName(instructor: DavidsonInstructor): string {
  return `${instructor.first_name} ${instructor.last_name}`.trim();
}

function formatSchedule(meetings: DavidsonMeeting[]): string {
  if (!meetings || meetings.length === 0) return "TBA";
  const meeting = meetings[0];
  const weekdays = meeting.weekdays || "TBA";
  const time = meeting.class_time || "TBA";
  return `${weekdays} ${time}`;
}

function formatLocation(meetings: DavidsonMeeting[]): string {
  if (!meetings || meetings.length === 0) return "TBA";
  const meeting = meetings[0];
  const building = meeting.building?.description || "";
  const room = meeting.room || "";
  const location = `${building} ${room}`.trim();
  return location || "TBA";
}

function transformCourses(raw: DavidsonCourse[]): TransformedCourse[] {
  const courseMap = new Map<
    string,
    {
      course: DavidsonCourse;
      sections: number;
      totalCurrent: number;
      totalMax: number;
      allInstructors: Set<string>;
    }
  >();

  for (const course of raw) {
    const code = `${course.subject.code} ${course.course_number}`;

    if (courseMap.has(code)) {
      const existing = courseMap.get(code)!;
      existing.sections += 1;
      existing.totalCurrent += course.enrollment?.current ?? 0;
      existing.totalMax += course.enrollment?.max ?? 0;

      for (const instructor of course.instructors ?? []) {
        const name = formatInstructorName(instructor);
        if (name) existing.allInstructors.add(name);
      }
    } else {
      const instructors = new Set<string>();
      for (const instructor of course.instructors ?? []) {
        const name = formatInstructorName(instructor);
        if (name) instructors.add(name);
      }

      courseMap.set(code, {
        course,
        sections: 1,
        totalCurrent: course.enrollment?.current ?? 0,
        totalMax: course.enrollment?.max ?? 0,
        allInstructors: instructors,
      });
    }
  }

  const results: TransformedCourse[] = [];
  const entries = Array.from(courseMap.entries());

  for (let i = 0; i < entries.length; i++) {
    const [code, entry] = entries[i];
    const { course, sections, totalCurrent, totalMax, allInstructors } = entry;
    const instructorList: string[] = Array.from(allInstructors);

    results.push({
      code,
      name: course.course_title,
      description: cleanDescription(stripHtml(course.course_description || "")),
      department: course.departments?.[0]?.description ?? course.subject.description,
      deptCode: course.departments?.[0]?.code ?? course.subject.code,
      professor: instructorList.length > 0 ? instructorList[0] : "Staff",
      instructors: instructorList.length > 0 ? instructorList : ["Staff"],
      sections,
      enrollment: { current: totalCurrent, max: totalMax },
      gradRequirements: (course.grad_requirements ?? []).map(
        (gr: { code: string; description: string }) => gr.code
      ),
      schedule: formatSchedule(course.meetings),
      location: formatLocation(course.meetings),
    });
  }

  results.sort((a, b) => a.code.localeCompare(b.code));

  return results;
}

// GET /api/courses/davidson - fetch courses from Davidson College API
export async function GET() {
  try {
    const response = await fetch(DAVIDSON_API_URL, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.error(
        `Davidson API responded with status ${response.status}: ${response.statusText}`
      );
      return NextResponse.json(
        { error: "Failed to fetch courses from Davidson API" },
        { status: 502 }
      );
    }

    const rawCourses: DavidsonCourse[] = await response.json();

    if (!Array.isArray(rawCourses)) {
      console.error("Davidson API returned unexpected data format");
      return NextResponse.json(
        { error: "Unexpected response format from Davidson API" },
        { status: 502 }
      );
    }

    const courses = transformCourses(rawCourses);

    return NextResponse.json({
      courses,
      total: courses.length,
      term: "Spring 2026",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/courses/davidson error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
