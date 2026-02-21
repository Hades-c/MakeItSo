import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import CoursePlan from "@/models/CoursePlan";
import CareerGoal from "@/models/CareerGoal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BookOpen, Briefcase, CheckCircle, GraduationCap } from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string })?.id;

  await connectToDatabase();

  const [user, plan, goals] = await Promise.all([
    User.findById(userId).lean(),
    CoursePlan.findOne({ userId }).lean(),
    CareerGoal.find({ userId }).lean(),
  ]);

  const creditsCompleted = plan?.totalCreditsCompleted ?? 0;
  const creditsRequired = user?.totalCreditsRequired ?? 128;
  const creditsProgress = Math.round((creditsCompleted / creditsRequired) * 100);

  const completedMilestones = goals.flatMap((g) => g.milestones.filter((m) => m.completed)).length;
  const totalMilestones = goals.flatMap((g) => g.milestones).length;

  const currentSemesterCourses = plan?.plannedCourses.filter(
    (c) => c.status === "in-progress"
  ) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {session?.user?.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          {user?.major ?? "Undecided"} · {user?.currentYear} · Class of {user?.graduationYear}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Degree Progress</CardDescription>
            <CardTitle className="text-3xl">{creditsProgress}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={creditsProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {creditsCompleted} / {creditsRequired} credits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Courses Planned</CardDescription>
            <CardTitle className="text-3xl">{plan?.plannedCourses.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {currentSemesterCourses.length} in progress this semester
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Career Milestones</CardDescription>
            <CardTitle className="text-3xl">{completedMilestones}/{totalMilestones}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {goals.length} career goal{goals.length !== 1 ? "s" : ""} tracked
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Current courses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" />
              Current Courses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentSemesterCourses.length === 0 ? (
              <div className="text-center py-6">
                <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No courses marked as in-progress</p>
                <Button size="sm" asChild>
                  <Link href="/courses">Plan Courses</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {currentSemesterCourses.map((course) => (
                  <div key={course.courseCode} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{course.courseCode}</p>
                      <p className="text-xs text-muted-foreground">{course.courseName}</p>
                    </div>
                    <Badge variant="secondary">{course.credits} cr</Badge>
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="w-full mt-2" asChild>
                  <Link href="/courses">View all courses</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Career goals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4" />
              Career Goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <div className="text-center py-6">
                <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No career goals set yet</p>
                <Button size="sm" asChild>
                  <Link href="/career">Set a Goal</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {goals.slice(0, 2).map((goal) => {
                  const done = goal.milestones.filter((m) => m.completed).length;
                  const total = goal.milestones.length;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={goal._id?.toString()}>
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-medium">{goal.targetRole}</p>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      <p className="text-xs text-muted-foreground mt-1">
                        <CheckCircle className="inline h-3 w-3 mr-1" />
                        {done}/{total} milestones
                      </p>
                    </div>
                  );
                })}
                <Button size="sm" variant="ghost" className="w-full" asChild>
                  <Link href="/career">View all goals</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
