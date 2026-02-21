import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
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
    let plan = await CoursePlan.findOne({ userId }).lean();

    if (!plan) {
      plan = await CoursePlan.create({ userId, plannedCourses: [] });
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
    const { courseId, semester, year, status, notes } = await req.json();

    if (!courseId || !semester || !year) {
      return NextResponse.json({ error: "courseId, semester, and year are required" }, { status: 400 });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    let plan = await CoursePlan.findOne({ userId });
    if (!plan) {
      plan = new CoursePlan({ userId, plannedCourses: [] });
    }

    // Prevent duplicate entries
    const alreadyAdded = plan.plannedCourses.some(
      (c) => c.courseId.toString() === courseId
    );
    if (alreadyAdded) {
      return NextResponse.json({ error: "Course already in your plan" }, { status: 409 });
    }

    plan.plannedCourses.push({
      courseId: course._id,
      courseCode: course.code,
      courseName: course.name,
      credits: course.credits,
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

    const course = plan.plannedCourses.id(plannedCourseId);
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
    const { plannedCourseId } = await req.json();

    const plan = await CoursePlan.findOne({ userId });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    plan.plannedCourses = plan.plannedCourses.filter(
      (c) => c._id?.toString() !== plannedCourseId
    ) as typeof plan.plannedCourses;

    await plan.save();

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("DELETE /api/plans error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
