import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectToDatabase } from "@/lib/mongodb";
import CareerGoal from "@/models/CareerGoal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { Briefcase, CheckCircle, Circle, PlusCircle, Target, Zap } from "lucide-react";

const PROFICIENCY_COLORS = {
  beginner: "secondary" as const,
  intermediate: "default" as const,
  advanced: "success" as const,
};

export default async function CareerPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string })?.id;

  await connectToDatabase();

  const goals = await CareerGoal.find({ userId }).lean();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Career Planning</h1>
          <p className="text-muted-foreground">Track your goals, skills, and milestones</p>
        </div>
        <Button asChild>
          <Link href="/career/new">
            <PlusCircle className="h-4 w-4 mr-2" />
            New Goal
          </Link>
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No career goals yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Set your first career goal to start tracking skills, target companies, and milestones.
            </p>
            <Button asChild>
              <Link href="/career/new">
                <PlusCircle className="h-4 w-4 mr-2" />
                Create Your First Goal
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        goals.map((goal) => {
          const completedMilestones = goal.milestones.filter((m) => m.completed).length;
          const totalMilestones = goal.milestones.length;
          const progress = totalMilestones
            ? Math.round((completedMilestones / totalMilestones) * 100)
            : 0;
          const acquiredSkills = goal.skills.filter((s) => s.acquired).length;

          return (
            <Card key={goal._id?.toString()}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      {goal.targetRole}
                    </CardTitle>
                    <CardDescription className="mt-1">{goal.careerField}</CardDescription>
                  </div>
                  <Badge variant="outline">{progress}% complete</Badge>
                </div>

                {totalMilestones > 0 && (
                  <div className="mt-3">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {completedMilestones} of {totalMilestones} milestones completed
                    </p>
                  </div>
                )}
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Target companies */}
                {goal.targetCompanies.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Target Companies
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {goal.targetCompanies.map((c) => (
                        <Badge key={c} variant="secondary">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {goal.skills.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Skills ({acquiredSkills}/{goal.skills.length} acquired)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {goal.skills.map((skill) => (
                        <div key={skill.name} className="flex items-center gap-1">
                          <Zap
                            className={`h-3 w-3 ${skill.acquired ? "text-green-500" : "text-muted-foreground"}`}
                          />
                          <Badge variant={PROFICIENCY_COLORS[skill.proficiency]}>
                            {skill.name}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Milestones */}
                {goal.milestones.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Milestones
                    </p>
                    <div className="space-y-2">
                      {goal.milestones.map((milestone, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {milestone.completed ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          )}
                          <div>
                            <p className={`text-sm ${milestone.completed ? "line-through text-muted-foreground" : ""}`}>
                              {milestone.title}
                            </p>
                            {milestone.dueDate && (
                              <p className="text-xs text-muted-foreground">
                                Due: {new Date(milestone.dueDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {goal.notes && (
                  <p className="text-sm text-muted-foreground border-t pt-4">{goal.notes}</p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
