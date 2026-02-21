import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import CareerGoal from "@/models/CareerGoal";

// GET /api/career - get user's career goals
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    const goals = await CareerGoal.find({ userId }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ goals });
  } catch (error) {
    console.error("GET /api/career error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/career - create a career goal
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    const data = await req.json();

    if (!data.targetRole || !data.careerField) {
      return NextResponse.json(
        { error: "targetRole and careerField are required" },
        { status: 400 }
      );
    }

    const goal = await CareerGoal.create({ ...data, userId });

    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    console.error("POST /api/career error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/career - update a career goal
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    const { goalId, updates } = await req.json();

    const goal = await CareerGoal.findOneAndUpdate(
      { _id: goalId, userId },
      { $set: updates },
      { new: true }
    );

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ goal });
  } catch (error) {
    console.error("PATCH /api/career error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/career - delete a career goal
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const userId = (session.user as { id: string }).id;
    const { goalId } = await req.json();

    await CareerGoal.findOneAndDelete({ _id: goalId, userId });

    return NextResponse.json({ message: "Goal deleted" });
  } catch (error) {
    console.error("DELETE /api/career error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
