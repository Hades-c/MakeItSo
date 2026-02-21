import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectToDatabase } from "@/lib/mongodb";
import CoursePlan from "@/models/CoursePlan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import User from "@/models/User";

const STATUS_COLORS = {
  completed: "success" as const,
  "in-progress": "default" as const,
  planned: "secondary" as const,
  dropped: "destructive" as const,
};

function groupBySemester(courses: CoursePlan["plannedCourses"]) {
  const map = new Map<string, typeof courses>();
  for (const course of courses) {
    const key = `${course.semester} ${course.year}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(course);
  }
  return map;
}

export default async function CoursesPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string })?.id;

  await connectToDatabase();

  const [plan, user] = await Promise.all([
    CoursePlan.findOne({ userId }).lean(),
    User.findById(userId).lean(),
  ]);

  const courses = plan?.plannedCourses ?? [];
  const grouped = groupBySemester(courses);
  const semesterKeys = Array.from(grouped.keys()).sort((a, b) => {
    const [semA, yearA] = a.split(" ");
    const [semB, yearB] = b.split(" ");
    if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB);
    const order = ["Spring", "Summer", "Fall"];
    return order.indexOf(semA) - order.indexOf(semB);
  });

  const creditsCompleted = plan?.totalCreditsCompleted ?? 0;
  const creditsRequired = user?.totalCreditsRequired ?? 128;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Course Plan</h1>
          <p className="text-muted-foreground">
            {creditsCompleted} of {creditsRequired} credits completed
          </p>
        </div>
        <Button asChild>
          <Link href="/courses/add">
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Course
          </Link>
        </Button>
      </div>

      {/* Credit progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Degree Progress</span>
            <span className="text-muted-foreground">
              {creditsCompleted} / {creditsRequired} credits
            </span>
          </div>
          <Progress value={(creditsCompleted / creditsRequired) * 100} />
        </CardContent>
      </Card>

      {/* Course list by semester */}
      {semesterKeys.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">No courses in your plan yet.</p>
            <Button asChild>
              <Link href="/courses/add">
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Your First Course
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        semesterKeys.map((key) => {
          const semCourses = grouped.get(key)!;
          const semCredits = semCourses.reduce((s, c) => s + c.credits, 0);
          return (
            <Card key={key}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{key}</CardTitle>
                  <CardDescription>{semCredits} credits</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {semCourses.map((course) => (
                    <div
                      key={course.courseCode}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{course.courseCode}</p>
                        <p className="text-xs text-muted-foreground">{course.courseName}</p>
                        {course.grade && (
                          <p className="text-xs text-muted-foreground">Grade: {course.grade}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs text-muted-foreground">{course.credits} cr</span>
                        <Badge variant={STATUS_COLORS[course.status]}>
                          {course.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
