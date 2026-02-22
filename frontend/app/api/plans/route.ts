import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import CoursePlan from "@/models/CoursePlan";
import Course from "@/models/Course";
import User from "@/models/User";

// GET /api/plans - get the current user's course plan
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let plan: any = await CoursePlan.findOne({ userId }).lean();

    if (!plan) {
      const created = await CoursePlan.create({ userId, plannedCourses: [] });
      plan = created.toObject();
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("GET /api/plans error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/plans - add a course to the plan
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    const body = await req.json();

    // Handle summer activity addition
    if (body.summerActivity) {
      const { title, description, year: actYear } = body.summerActivity;
      if (!title || !actYear) {
        return NextResponse.json({ error: "title and year are required for summer activity" }, { status: 400 });
      }

      let plan = await CoursePlan.findOne({ userId });
      if (!plan) {
        plan = new CoursePlan({ userId, plannedCourses: [], summerActivities: [] });
      }

      plan.summerActivities.push({
        title,
        description: description || "",
        summer: `Summer ${actYear}`,
        year: actYear,
      });

      await plan.save();
      return NextResponse.json({ plan }, { status: 201 });
    }

    // Handle course addition
    const { courseId, courseCode, courseName, credits, semester, year, status, notes } = body;

    if (!semester || !year) {
      return NextResponse.json({ error: "semester and year are required" }, { status: 400 });
    }

    let resolvedCode = courseCode;
    let resolvedName = courseName;
    let resolvedCredits = credits ?? 4;
    let resolvedCourseId = courseId;

    // If courseId is a MongoDB ObjectId, look up from DB (legacy path)
    if (courseId && /^[0-9a-fA-F]{24}$/.test(courseId)) {
      const course = await Course.findById(courseId);
      if (!course) {
        return NextResponse.json({ error: "Course not found" }, { status: 404 });
      }
      resolvedCode = course.code;
      resolvedName = course.name;
      resolvedCredits = course.credits;
      resolvedCourseId = course._id;
    } else if (!courseCode || !courseName) {
      return NextResponse.json({ error: "courseCode and courseName are required" }, { status: 400 });
    }

    let plan = await CoursePlan.findOne({ userId });
    if (!plan) {
      plan = new CoursePlan({ userId, plannedCourses: [], summerActivities: [] });
    }

    // Prevent duplicate entries by course code
    const alreadyAdded = plan.plannedCourses.some(
      (c) => c.courseCode === resolvedCode
    );
    if (alreadyAdded) {
      return NextResponse.json({ error: "Course already in your plan" }, { status: 409 });
    }

    plan.plannedCourses.push({
      courseId: resolvedCourseId || new mongoose.Types.ObjectId(),
      courseCode: resolvedCode,
      courseName: resolvedName,
      credits: resolvedCredits,
      semester,
      year,
      status: status ?? "planned",
      notes,
    });

    await plan.save();

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("POST /api/plans error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/plans - update a planned course (status, grade, notes)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    const { plannedCourseId, updates } = await req.json();

    const plan = await CoursePlan.findOne({ userId });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const course = (plan.plannedCourses as unknown as { id: (id: string) => Record<string, unknown> | null }).id(plannedCourseId);
    if (!course) {
      return NextResponse.json({ error: "Planned course not found" }, { status: 404 });
    }

    Object.assign(course, updates);
    await plan.save();

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("PATCH /api/plans error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/plans - remove a course from the plan
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    const { plannedCourseId, summerActivityId } = await req.json();

    const plan = await CoursePlan.findOne({ userId });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (summerActivityId) {
      plan.summerActivities = plan.summerActivities.filter(
        (a) => (a as unknown as { _id?: { toString(): string } })._id?.toString() !== summerActivityId
      ) as typeof plan.summerActivities;
    } else if (plannedCourseId) {
      plan.plannedCourses = plan.plannedCourses.filter(
        (c) => (c as unknown as { _id?: { toString(): string } })._id?.toString() !== plannedCourseId
      ) as typeof plan.plannedCourses;
    }

    await plan.save();

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("DELETE /api/plans error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
