"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Calendar,
  Clock,
  GraduationCap,
  Lightbulb,
  Loader2,
  MapPin,
  Network,
  Search,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { CAREER_FIELDS } from "@/lib/utils";

interface CareerPlan {
  recommendedMajor: string;
  coursesToTake: Array<{
    code: string;
    name: string;
    reason: string;
    priority: string;
    typicalYear: string;
  }>;
  peopleToMeet: Array<{
    role: string;
    type: string;
    reason: string;
    suggestedTiming: string;
    howToFind: string;
  }>;
  thingsToDo: Array<{
    activity: string;
    type: string;
    reason: string;
    timing: string;
    classYear: string;
  }>;
  careerInsights: string;
}

type Tab = "courses" | "people" | "things";

export default function CareerPage() {
  const [selectedCareer, setSelectedCareer] = useState("");
  const [customCareer, setCustomCareer] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<CareerPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("courses");

  async function generatePlan() {
    const career = selectedCareer === "custom" ? customCareer : selectedCareer;
    if (!career) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/career-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          career,
          major: "Undecided",
          classYear: "Freshman",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
      } else if (res.status === 401) {
        setError("You need to sign in before generating a career plan.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to generate career plan. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate plan:", err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const priorityColors: Record<string, string> = {
    required: "bg-red-50 text-red-700 border-red-200",
    recommended: "bg-amber-50 text-amber-700 border-amber-200",
    helpful: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const typeIcons: Record<string, typeof Briefcase> = {
    alumni: Network,
    faculty: GraduationCap,
    advisor: Users,
    professional: Briefcase,
  };

  const activityColors: Record<string, string> = {
    internship: "bg-emerald-50 text-emerald-700",
    research: "bg-blue-50 text-blue-700",
    club: "bg-purple-50 text-purple-700",
    certification: "bg-amber-50 text-amber-700",
    project: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Target className="h-5 w-5 text-white" />
          </div>
          Career Planner
        </h1>
        <p className="text-muted-foreground mt-2">
          Choose your dream career and get a complete plan — courses, people, and opportunities.
        </p>
      </div>

      {/* Career Selection */}
      {!plan && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What career are you interested in?</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select a field or type your dream role. Our AI will build a complete Davidson-specific plan.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {CAREER_FIELDS.filter((f) => f !== "Other").map((field) => (
                <button
                  key={field}
                  onClick={() => { setSelectedCareer(field); setCustomCareer(""); }}
                  className={`p-3 rounded-lg border text-left text-sm font-medium transition-all duration-200 ${
                    selectedCareer === field
                      ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/20"
                      : "hover:border-violet-300 hover:bg-violet-50/50"
                  }`}
                >
                  {field}
                </button>
              ))}
              <button
                onClick={() => setSelectedCareer("custom")}
                className={`p-3 rounded-lg border text-left text-sm font-medium transition-all duration-200 border-dashed ${
                  selectedCareer === "custom"
                    ? "bg-violet-600 text-white border-violet-600"
                    : "hover:border-violet-300 hover:bg-violet-50/50"
                }`}
              >
                Other / Custom...
              </button>
            </div>

            {selectedCareer === "custom" && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g., Investment Banking Analyst at Goldman Sachs"
                  value={customCareer}
                  onChange={(e) => setCustomCareer(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>
            )}

            {((selectedCareer && selectedCareer !== "custom") || customCareer) && (
              <Button
                onClick={generatePlan}
                disabled={loading}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Career Plan
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card className="border-violet-100">
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Building Your Career Plan</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Our AI is analyzing Davidson&apos;s courses, alumni data, and career outcomes to create your personalized plan...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && !plan && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-10 text-center">
            <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Target className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1 text-red-800">Something went wrong</h3>
            <p className="text-sm text-red-600 mb-4 max-w-md mx-auto">{error}</p>
            <Button variant="outline" onClick={() => { setError(null); }}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Career Plan Results */}
      {plan && !loading && (
        <>
          {/* Insights banner */}
          <Card className="border-violet-100 bg-gradient-to-r from-violet-50/50 to-indigo-50/50">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md shadow-violet-500/20">
                <Lightbulb className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold">Career Insights</h3>
                  <Badge className="bg-violet-100 text-violet-700 border-violet-200">
                    Recommended Major: {plan.recommendedMajor}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{plan.careerInsights}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPlan(null)} className="shrink-0">
                New Search
              </Button>
            </CardContent>
          </Card>

          {/* Tab navigation */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            {[
              { id: "courses" as Tab, label: "Courses to Take", icon: BookOpen, count: plan.coursesToTake?.length || 0 },
              { id: "people" as Tab, label: "People to Meet", icon: Users, count: plan.peopleToMeet?.length || 0 },
              { id: "things" as Tab, label: "Things to Do", icon: Trophy, count: plan.thingsToDo?.length || 0 },
            ].map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === id
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200/80">{count}</span>
              </button>
            ))}
          </div>

          {/* Courses Tab */}
          {activeTab === "courses" && plan.coursesToTake && (
            <div className="space-y-6">
              {["Freshman", "Sophomore", "Junior", "Senior"].map((year) => {
                const yearCourses = plan.coursesToTake.filter((c) => c.typicalYear === year);
                if (yearCourses.length === 0) return null;
                return (
                  <div key={year}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <GraduationCap className="h-3.5 w-3.5" />
                      {year} Year
                    </h3>
                    <div className="grid gap-2">
                      {yearCourses.map((course, i) => (
                        <Card key={i} className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-4 flex items-start gap-4">
                            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                              <BookOpen className="h-4 w-4 text-violet-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-mono text-sm font-semibold">{course.code}</span>
                                <Badge variant="outline" className={`text-[10px] ${priorityColors[course.priority] || ""}`}>
                                  {course.priority}
                                </Badge>
                              </div>
                              <h4 className="font-medium text-sm">{course.name}</h4>
                              <p className="text-xs text-muted-foreground mt-0.5">{course.reason}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* People Tab */}
          {activeTab === "people" && plan.peopleToMeet && (
            <div className="space-y-6">
              {["Freshman", "Sophomore", "Junior", "Senior"].map((year) => {
                const yearPeople = plan.peopleToMeet.filter((p) => p.suggestedTiming === year);
                if (yearPeople.length === 0) return null;
                return (
                  <div key={year}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      Reach out in {year} Year
                    </h3>
                    <div className="grid gap-2">
                      {yearPeople.map((person, i) => {
                        const TypeIcon = typeIcons[person.type] || Users;
                        return (
                          <Card key={i} className="hover:shadow-sm transition-shadow">
                            <CardContent className="p-4 flex items-start gap-4">
                              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                                <TypeIcon className="h-4 w-4 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <h4 className="font-medium text-sm">{person.role}</h4>
                                  <Badge variant="outline" className="text-[10px]">{person.type}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{person.reason}</p>
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {person.howToFind}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Things to Do Tab */}
          {activeTab === "things" && plan.thingsToDo && (
            <div className="space-y-6">
              {["Freshman", "Sophomore", "Junior", "Senior"].map((year) => {
                const yearThings = plan.thingsToDo.filter((t) => t.classYear === year);
                if (yearThings.length === 0) return null;
                return (
                  <div key={year}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      {year} Year
                    </h3>
                    <div className="grid gap-2">
                      {yearThings.map((thing, i) => (
                        <Card key={i} className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-4 flex items-start gap-4">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${activityColors[thing.type] || "bg-gray-50 text-gray-700"}`}>
                              <Trophy className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h4 className="font-medium text-sm">{thing.activity}</h4>
                                <Badge variant="outline" className={`text-[10px] ${activityColors[thing.type] || ""}`}>
                                  {thing.type}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{thing.reason}</p>
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> {thing.timing}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
