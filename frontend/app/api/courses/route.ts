import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectToDatabase } from "@/lib/mongodb";
import Course from "@/models/Course";

// GET /api/courses - list/search courses
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const department = searchParams.get("department");
    const tag = searchParams.get("tag");
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {};
    if (search) {
      query.$text = { $search: search };
    }
    if (department) {
      query.department = department;
    }
    if (tag) {
      query.tags = tag;
    }

    const [courses, total] = await Promise.all([
      Course.find(query).skip(skip).limit(limit).sort({ code: 1 }).lean(),
      Course.countDocuments(query),
    ]);

    return NextResponse.json({ courses, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("GET /api/courses error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/courses - add a course (admin use / seeding)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const data = await req.json();
    const course = await Course.create(data);

    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    console.error("POST /api/courses error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
