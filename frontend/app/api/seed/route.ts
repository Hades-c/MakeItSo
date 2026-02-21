import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Course from "@/models/Course";
import { DAVIDSON_COURSES } from "@/lib/davidson-courses";

export async function POST() {
  try {
    await connectToDatabase();

    // Clear existing courses and insert fresh seed data
    await Course.deleteMany({});
    const courses = await Course.insertMany(DAVIDSON_COURSES);

    return NextResponse.json({
      message: `Seeded ${courses.length} Davidson courses`,
      count: courses.length,
    });
  } catch (error) {
    console.error("POST /api/seed error:", error);
    return NextResponse.json({ error: "Failed to seed courses" }, { status: 500 });
  }
}
