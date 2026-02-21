"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Briefcase,
  ChevronRight,
  Compass,
  Filter,
  GraduationCap,
  Lightbulb,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  Star,
  ThumbsUp,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { SUBJECT_AREAS } from "@/lib/utils";
import { DAVIDSON_COURSES, type SeedCourse } from "@/lib/davidson-courses";

type Step = "interests" | "browse" | "recommendations";

export default function ExplorePage() {
  const [step, setStep] = useState<Step>("interests");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<{
    recommendations: Array<{
      code: string;
      name: string;
      department: string;
      credits: number;
      reason: string;
      careerImpact: string[];
      difficulty: number;
      priority: string;
      prerequisites: string[];
    }>;
  } | null>(null);

  const toggleArea = (id: string) => {
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const selectedDepartments: string[] = SUBJECT_AREAS
    .filter((a) => selectedAreas.includes(a.id))
    .flatMap((a) => [...a.departments]);

  const filteredCourses = DAVIDSON_COURSES.filter((c) => {
    const matchesDept = selectedDepartment
      ? c.department === selectedDepartment
      : selectedDepartments.length > 0
      ? selectedDepartments.includes(c.department)
      : true;
    const matchesSearch = searchQuery
      ? c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.professor && c.professor.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    return matchesDept && matchesSearch;
  });

  const departments = Array.from(new Set(
    DAVIDSON_COURSES
      .filter((c) => selectedDepartments.length === 0 || selectedDepartments.includes(c.department))
      .map((c) => c.department)
  )).sort();

  async function getRecommendations() {
    setLoading(true);
    try {
      const interests = SUBJECT_AREAS
        .filter((a) => selectedAreas.includes(a.id))
        .map((a) => a.label);

      const res = await fetch("/api/ai/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interests,
          completedCourses: [],
          major: "Undecided",
          classYear: "Freshman",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations);
        setStep("recommendations");
      }
    } catch (err) {
      console.error("Failed to get recommendations:", err);
    } finally {
      setLoading(false);
    }
  }

  const areaColors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
    purple: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
    rose: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
    amber: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  };

  const areaColorsSelected: Record<string, string> = {
    emerald: "bg-emerald-600 text-white border-emerald-600",
    blue: "bg-blue-600 text-white border-blue-600",
    purple: "bg-purple-600 text-white border-purple-600",
    rose: "bg-rose-600 text-white border-rose-600",
    amber: "bg-amber-600 text-white border-amber-600",
  };

  return (
    <motion.div
      className="max-w-5xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Compass className="h-5 w-5 text-white" />
            </div>
            Explore Courses
          </h1>
          <p className="text-muted-foreground mt-2">
            Discover courses based on your interests and see how they connect to careers.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setStep("interests")}
          className={`px-3 py-1.5 rounded-full font-medium transition-colors ${
            step === "interests" ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          1. Select Interests
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <button
          onClick={() => selectedAreas.length > 0 && setStep("browse")}
          className={`px-3 py-1.5 rounded-full font-medium transition-colors ${
            step === "browse" ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          2. Browse Courses
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <button
          onClick={() => recommendations && setStep("recommendations")}
          className={`px-3 py-1.5 rounded-full font-medium transition-colors ${
            step === "recommendations" ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          3. AI Recommendations
        </button>
      </div>

      {/* Step 1: Interest Selection */}
      {step === "interests" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What areas interest you?</CardTitle>
              <p className="text-sm text-muted-foreground">
                Select one or more subject areas to filter Davidson&apos;s course catalog.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SUBJECT_AREAS.map((area) => (
                  <button
                    key={area.id}
                    onClick={() => toggleArea(area.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                      selectedAreas.includes(area.id)
                        ? areaColorsSelected[area.color]
                        : areaColors[area.color]
                    }`}
                  >
                    <div className="font-semibold mb-1">{area.label}</div>
                    <div className={`text-xs ${selectedAreas.includes(area.id) ? "text-white/80" : "opacity-70"}`}>
                      {area.departments.slice(0, 3).join(", ")}
                      {area.departments.length > 3 && ` +${area.departments.length - 3} more`}
                    </div>
                  </button>
                ))}
              </div>

              {selectedAreas.length > 0 && (
                <div className="flex gap-3 mt-6">
                  <Button
                    onClick={() => setStep("browse")}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                  >
                    Browse Courses
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={getRecommendations}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Get AI Recommendations
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Browse Courses */}
      {step === "browse" && (
        <div className="space-y-4">
          {/* Search and filter bar */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, department, or professor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={getRecommendations}
              disabled={loading}
              className="shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              AI Picks
            </Button>
          </div>

          {/* Department filter chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedDepartment(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                !selectedDepartment ? "bg-gray-900 text-white border-gray-900" : "text-muted-foreground hover:text-foreground border-gray-200"
              }`}
            >
              All ({filteredCourses.length})
            </button>
            {departments.map((dept) => {
              const count = DAVIDSON_COURSES.filter(
                (c) => c.department === dept && (searchQuery ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.code.toLowerCase().includes(searchQuery.toLowerCase()) : true)
              ).length;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDepartment(selectedDepartment === dept ? null : dept)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedDepartment === dept ? "bg-gray-900 text-white border-gray-900" : "text-muted-foreground hover:text-foreground border-gray-200"
                  }`}
                >
                  {dept} ({count})
                </button>
              );
            })}
          </div>

          {/* Course list */}
          <div className="grid gap-3">
            {filteredCourses.map((course) => (
              <CourseCard key={course.code} course={course} />
            ))}
          </div>
        </div>
      )}

      {/* Step 3: AI Recommendations */}
      {step === "recommendations" && recommendations && (
        <div className="space-y-4">
          <Card className="border-emerald-100 bg-emerald-50/30">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">AI-Powered Recommendations</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on your selected interests: {SUBJECT_AREAS.filter((a) => selectedAreas.includes(a.id)).map((a) => a.label).join(", ")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setStep("browse")} className="ml-auto shrink-0">
                Browse All
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {recommendations.recommendations.map((rec, i) => (
              <Card key={i} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-red-800">{rec.code}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {rec.priority === "high" ? "Must Take" : rec.priority === "medium" ? "Recommended" : "Optional"}
                        </Badge>
                      </div>
                      <h3 className="font-semibold mb-1">{rec.name}</h3>
                      <p className="text-sm text-muted-foreground mb-3">{rec.reason}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {rec.careerImpact?.map((career) => (
                          <span key={career} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-800">
                            <Briefcase className="h-3 w-3" />
                            {career}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">{rec.credits} credits</div>
                      {rec.difficulty && (
                        <div className="flex items-center gap-0.5 mt-1 justify-end">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              className={`h-1.5 w-3 rounded-full ${
                                n <= rec.difficulty ? "bg-amber-400" : "bg-gray-200"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function RatingBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

function CourseCard({ course }: { course: SeedCourse }) {
  const [expanded, setExpanded] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    courseHighlights?: string;
    keyTopics?: string[];
    skillsGained?: string[];
    careerApplications?: string[];
  } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const prof = course.professorInfo;

  async function fetchAiInsights() {
    if (aiInsights || loadingInsights) return;
    setLoadingInsights(true);
    try {
      const res = await fetch("/api/ai/course-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseCode: course.code,
          courseName: course.name,
          description: course.description,
          department: course.department,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsights(data.insights);
      }
    } catch (err) {
      console.error("Failed to get AI insights:", err);
    } finally {
      setLoadingInsights(false);
    }
  }

  return (
    <Card className="hover:shadow-md transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-semibold text-emerald-600">{course.code}</span>
              <span className="text-xs text-muted-foreground">{course.credits} cr</span>
              {course.tags.includes("major-requirement") && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Major Req</Badge>
              )}
            </div>
            <h3 className="font-semibold mb-0.5">{course.name}</h3>
            <p className="text-xs text-muted-foreground">{course.department}</p>

            {expanded && (
              <div className="mt-3 space-y-4 animate-fade-in">
                <p className="text-sm text-muted-foreground">{course.description}</p>

                {/* Professor Section with RMP Data */}
                {course.professor && (
                  <div className="rounded-lg border bg-slate-50/50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium">{course.professor}</span>
                    </div>
                    {prof?.title && (
                      <p className="text-xs text-muted-foreground ml-6">{prof.title}</p>
                    )}
                    {prof?.rmpRating != null && (
                      <div className="ml-6 space-y-2">
                        {/* Rating overview row */}
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span className="font-semibold text-sm">{prof.rmpRating}</span>
                            <span className="text-muted-foreground">/5</span>
                          </span>
                          {prof.rmpWouldTakeAgain != null && (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <ThumbsUp className="h-3 w-3" />
                              {prof.rmpWouldTakeAgain}% would take again
                            </span>
                          )}
                          {prof.rmpDifficulty != null && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <Zap className="h-3 w-3" />
                              {prof.rmpDifficulty} difficulty
                            </span>
                          )}
                          {prof.rmpNumRatings != null && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {prof.rmpNumRatings} ratings
                            </span>
                          )}
                        </div>

                        {/* Rating bars */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-14">Quality</span>
                            <RatingBar
                              value={prof.rmpRating}
                              max={5}
                              color={prof.rmpRating >= 4 ? "bg-emerald-500" : prof.rmpRating >= 3 ? "bg-amber-400" : "bg-red-400"}
                            />
                          </div>
                          {prof.rmpDifficulty != null && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-14">Difficulty</span>
                              <RatingBar
                                value={prof.rmpDifficulty}
                                max={5}
                                color={prof.rmpDifficulty <= 2.5 ? "bg-emerald-500" : prof.rmpDifficulty <= 3.5 ? "bg-amber-400" : "bg-orange-500"}
                              />
                            </div>
                          )}
                        </div>

                        {/* RMP Tags */}
                        {prof.rmpTags && prof.rmpTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {prof.rmpTags.slice(0, 5).map((tag) => (
                              <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                                <MessageSquare className="h-2.5 w-2.5" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Course Insights - Static data */}
                {course.courseInsights && (
                  <div className="space-y-3">
                    {/* Key Topics */}
                    {course.courseInsights.keyTopics && course.courseInsights.keyTopics.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                          <BookOpen className="h-3 w-3" /> Key Topics
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {course.courseInsights.keyTopics.map((topic) => (
                            <span key={topic} className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Skills Gained */}
                    {course.courseInsights.skillsGained && course.courseInsights.skillsGained.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Lightbulb className="h-3 w-3" /> Skills You&apos;ll Gain
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {course.courseInsights.skillsGained.map((skill) => (
                            <span key={skill} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Prerequisites and offering info */}
                <div className="flex flex-wrap gap-4">
                  {course.prerequisites.length > 0 && (
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs">Prerequisites: {course.prerequisites.join(", ")}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">Offered: {course.offered.join(", ")}</span>
                  </div>
                </div>

                {/* Career Relevance */}
                {course.careerRelevance.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Career Relevance
                    </p>
                    <div className="space-y-1.5">
                      {course.careerRelevance.map(({ field, relevance }) => (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-xs w-40 truncate">{field}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-500"
                              style={{ width: `${relevance * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {Math.round(relevance * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Deep Dive Button */}
                <div className="pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchAiInsights}
                    disabled={loadingInsights || !!aiInsights}
                    className="text-xs"
                  >
                    {loadingInsights ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        Analyzing...
                      </>
                    ) : aiInsights ? (
                      <>
                        <Brain className="mr-1.5 h-3 w-3" />
                        AI Insights Loaded
                      </>
                    ) : (
                      <>
                        <Brain className="mr-1.5 h-3 w-3" />
                        Get AI Deep Dive
                      </>
                    )}
                  </Button>
                </div>

                {/* AI-Generated Insights */}
                {aiInsights && (
                  <div className="rounded-lg border border-red-200 bg-red-50/30 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-red-800" />
                      <span className="text-xs font-semibold text-red-800">AI Course Analysis</span>
                    </div>

                    {aiInsights.courseHighlights && (
                      <p className="text-xs text-muted-foreground">{aiInsights.courseHighlights}</p>
                    )}

                    {aiInsights.keyTopics && aiInsights.keyTopics.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-red-800 mb-1">Deep Dive Topics</p>
                        <div className="flex flex-wrap gap-1">
                          {aiInsights.keyTopics.map((topic) => (
                            <span key={topic} className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-100 text-red-800">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiInsights.skillsGained && aiInsights.skillsGained.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-red-800 mb-1">Additional Skills</p>
                        <div className="flex flex-wrap gap-1">
                          {aiInsights.skillsGained.map((skill) => (
                            <span key={skill} className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiInsights.careerApplications && aiInsights.careerApplications.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-red-800 mb-1">Career Applications</p>
                        <ul className="space-y-0.5">
                          {aiInsights.careerApplications.map((app) => (
                            <li key={app} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <Briefcase className="h-3 w-3 mt-0.5 shrink-0 text-red-400" />
                              {app}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0"
          >
            {expanded ? "Less" : "Details"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
