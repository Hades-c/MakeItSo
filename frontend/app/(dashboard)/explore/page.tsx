"use client";

import { useState, useEffect, useCallback } from "react";
// UI components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Filter,
  GraduationCap,
  Loader2,
  Search,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
  Zap,
} from "lucide-react";
import { SUBJECT_AREAS } from "@/lib/utils";
import { DAVIDSON_COURSES, type SeedCourse } from "@/lib/davidson-courses";
import { ActivitiesCarousel } from "@/components/activities-carousel";

// Major name -> abbreviation map
const MAJOR_ABBREV: Record<string, string> = {
  "Computer Science": "CSC",
  "Mathematics": "MAT",
  "Economics": "ECO",
  "Biology": "BIO",
  "Chemistry": "CHE",
  "Physics": "PHY",
  "Psychology": "PSY",
  "Political Science": "POL",
  "English": "ENG",
  "History": "HIS",
  "Sociology": "SOC",
  "Philosophy": "PHI",
  "Anthropology": "ANT",
  "Art": "ART",
  "Music": "MUS",
  "Theatre": "THE",
  "Religious Studies": "REL",
  "Environmental Studies": "ENV",
  "Educational Studies": "EDU",
  "Communication Studies": "COM",
  "French & Francophone Studies": "FRE",
  "German Studies": "GER",
  "Hispanic Studies": "SPA",
  "Africana Studies": "AFR",
  "Gender & Sexuality Studies": "GSS",
  "Public Health": "PBH",
  "Chinese Studies": "CHI",
  "Classics": "CLA",
  "Dance": "DAN",
  "Digital Studies": "DIG",
};

function formatMajorReq(majors: string[]): string {
  return majors.map(m => MAJOR_ABBREV[m] || m.split(" ")[0].toUpperCase().slice(0, 3)).join("/") + " Req.";
}

interface LiveCourse {
  code: string;
  name: string;
  description: string;
  department: string;
  deptCode: string;
  professor: string;
  instructors: string[];
  sections: number;
  enrollment: { current: number; max: number };
  gradRequirements: string[];
  schedule: string;
  location: string;
}

type Step = "interests" | "browse" | "recommendations";

export default function ExplorePage() {
  const [step, setStep] = useState<Step>("interests");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveCourses, setLiveCourses] = useState<LiveCourse[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<{
    recommendations: Array<{
      code: string;
      name: string;
      department: string;
      reason: string;
      careerImpact: string[];
      difficulty: number;
      priority: string;
      prerequisites: string[];
    }>;
  } | null>(null);

  // Fetch live courses from Davidson API
  useEffect(() => {
    async function fetchLive() {
      setLiveLoading(true);
      try {
        const res = await fetch("/api/courses/davidson");
        if (res.ok) {
          const data = await res.json();
          setLiveCourses(data.courses || []);
        }
      } catch {
        // Fall back to static data
      } finally {
        setLiveLoading(false);
      }
    }
    fetchLive();
  }, []);

  const toggleArea = (id: string) => {
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const selectedDepartments: string[] = SUBJECT_AREAS
    .filter((a) => selectedAreas.includes(a.id))
    .flatMap((a) => [...a.departments]);

  // Use live courses if available, fall back to static
  const allCourses = liveCourses.length > 0 ? liveCourses : DAVIDSON_COURSES;

  const filteredCourses = (liveCourses.length > 0
    ? liveCourses.filter((c) => {
        const matchesDept = selectedDepartment
          ? c.department === selectedDepartment
          : selectedDepartments.length > 0
          ? selectedDepartments.includes(c.department)
          : true;
        const q = searchQuery.toLowerCase();
        const matchesSearch = searchQuery
          ? c.code.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.department.toLowerCase().includes(q) ||
            c.professor?.toLowerCase().includes(q)
          : true;
        return matchesDept && matchesSearch;
      })
    : DAVIDSON_COURSES.filter((c) => {
        const matchesDept = selectedDepartment
          ? c.department === selectedDepartment
          : selectedDepartments.length > 0
          ? selectedDepartments.includes(c.department)
          : true;
        const q = searchQuery.toLowerCase();
        const matchesSearch = searchQuery
          ? c.code.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.department.toLowerCase().includes(q) ||
            (c.professor && c.professor.toLowerCase().includes(q))
          : true;
        return matchesDept && matchesSearch;
      })
  );

  const departments = Array.from(new Set(
    (liveCourses.length > 0
      ? liveCourses.map((c) => c.department)
      : DAVIDSON_COURSES
          .filter((c) => selectedDepartments.length === 0 || selectedDepartments.includes(c.department))
          .map((c) => c.department)
    )
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

  return (
    <motion.div
      className="max-w-5xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          Explore Courses
          {liveLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {liveCourses.length > 0 && (
            <span className="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              Live · {liveCourses.length} courses
            </span>
          )}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {liveCourses.length > 0
            ? "Real-time data from Davidson's Spring 2026 course schedule."
            : "Discover courses by interest and career relevance."}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 text-sm">
        {[
          { id: "interests" as Step, label: "1. Interests", enabled: true },
          { id: "browse" as Step, label: "2. Browse", enabled: selectedAreas.length > 0 },
          { id: "recommendations" as Step, label: "3. AI Picks", enabled: !!recommendations },
        ].map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
            <button
              onClick={() => s.enabled && setStep(s.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                step === s.id
                  ? "bg-gray-900 text-white"
                  : s.enabled
                  ? "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  : "text-gray-300 cursor-default"
              }`}
            >
              {s.label}
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Interest Selection */}
      {step === "interests" && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">What areas interest you?</h2>
            <p className="text-xs text-gray-400 mb-4">
              Select one or more to filter Davidson&apos;s full course catalog.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {SUBJECT_AREAS.map((area) => (
                <button
                  key={area.id}
                  onClick={() => toggleArea(area.id)}
                  className={`p-3 rounded-lg border text-left transition-all duration-150 ${
                    selectedAreas.includes(area.id)
                      ? "bg-gray-900 text-white border-gray-900"
                      : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className={`font-medium text-sm mb-0.5 ${selectedAreas.includes(area.id) ? "" : "text-gray-900"}`}>{area.label}</div>
                  <div className={`text-[11px] ${selectedAreas.includes(area.id) ? "text-gray-300" : "text-gray-400"}`}>
                    {area.departments.slice(0, 3).join(", ")}
                    {area.departments.length > 3 && ` +${area.departments.length - 3}`}
                  </div>
                </button>
              ))}
            </div>

            {selectedAreas.length > 0 && (
              <div className="flex gap-2 mt-5">
                <Button onClick={() => setStep("browse")} size="sm" className="bg-gray-900 hover:bg-gray-800 text-white">
                  Browse Courses <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={getRecommendations} disabled={loading}>
                  {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                  AI Recommendations
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Browse Courses */}
      {step === "browse" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search courses, departments, professors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm border-gray-200 bg-white"
              />
            </div>
            <Button variant="outline" size="sm" onClick={getRecommendations} disabled={loading} className="h-9 shrink-0">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              AI Picks
            </Button>
          </div>

          {/* Department chips */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedDepartment(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                !selectedDepartment ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900 bg-white border border-gray-200"
              }`}
            >
              All ({filteredCourses.length})
            </button>
            {departments.map((dept) => {
              const count = (liveCourses.length > 0
                ? liveCourses.filter((c) => c.department === dept)
                : DAVIDSON_COURSES.filter((c) => c.department === dept)
              ).length;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDepartment(selectedDepartment === dept ? null : dept)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedDepartment === dept ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900 bg-white border border-gray-200"
                  }`}
                >
                  {dept} ({count})
                </button>
              );
            })}
          </div>

          {/* Course list */}
          <div className="grid gap-2">
            {filteredCourses.slice(0, 50).map((course) => (
              "careerRelevance" in course
                ? <StaticCourseCard key={course.code} course={course as SeedCourse} />
                : <LiveCourseCard key={course.code} course={course as LiveCourse} />
            ))}
            {filteredCourses.length > 50 && (
              <p className="text-xs text-gray-400 text-center py-4">
                Showing 50 of {filteredCourses.length} courses. Use search to narrow results.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: AI Recommendations */}
      {step === "recommendations" && recommendations && (
        <div className="space-y-4">
          <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4 flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-rose-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm text-gray-900">AI Recommendations</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Based on: {SUBJECT_AREAS.filter((a) => selectedAreas.includes(a.id)).map((a) => a.label).join(", ")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setStep("browse")} className="shrink-0 text-xs h-7">
              Browse All
            </Button>
          </div>

          <div className="grid gap-2">
            {recommendations.recommendations.map((rec, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs font-semibold text-gray-900">{rec.code}</span>
                      <Badge variant="outline" className={`text-[10px] ${
                        rec.priority === "high" ? "border-rose-200 text-rose-600 bg-rose-50" :
                        rec.priority === "medium" ? "border-blue-200 text-blue-600 bg-blue-50" :
                        "border-gray-200 text-gray-500"
                      }`}>
                        {rec.priority === "high" ? "Must Take" : rec.priority === "medium" ? "Recommended" : "Optional"}
                      </Badge>
                    </div>
                    <h3 className="font-medium text-sm text-gray-900">{rec.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{rec.reason}</p>
                    {rec.careerImpact?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {rec.careerImpact.map((career) => (
                          <span key={career} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">
                            {career}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {rec.difficulty && (
                    <div className="flex gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div key={n} className={`h-1 w-2.5 rounded-full ${n <= rec.difficulty ? "bg-amber-400" : "bg-gray-100"}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Activities carousel at bottom of all steps */}
      <ActivitiesCarousel />
    </motion.div>
  );
}

/* ===== Live course card ===== */
function LiveCourseCard({ course }: { course: LiveCourse }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-all duration-150 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs font-semibold text-gray-900">{course.code}</span>
              {course.gradRequirements.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                  {course.gradRequirements.join(", ")}
                </span>
              )}
              {course.sections > 1 && (
                <span className="text-[10px] text-gray-400">{course.sections} sections</span>
              )}
            </div>
            <h3 className="font-medium text-sm text-gray-900">{course.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span>{course.department}</span>
              {course.professor && <span>· {course.professor}</span>}
              <span>· {course.enrollment.current}/{course.enrollment.max} enrolled</span>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-300 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-gray-50 space-y-3">
              {course.description && (
                <p className="text-xs text-gray-500 leading-relaxed">{course.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                {course.schedule && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> {course.schedule}
                  </span>
                )}
                {course.location && (
                  <span className="flex items-center gap-1">
                    <Filter className="h-3 w-3" /> {course.location}
                  </span>
                )}
              </div>
              {course.instructors.length > 0 && (
                <div className="text-xs text-gray-500">
                  <span className="text-gray-400">Instructors:</span> {course.instructors.join(", ")}
                </div>
              )}
              {/* Enrollment bar */}
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>Enrollment</span>
                  <span>{course.enrollment.current}/{course.enrollment.max}</span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      course.enrollment.current / course.enrollment.max > 0.9 ? "bg-red-400" :
                      course.enrollment.current / course.enrollment.max > 0.7 ? "bg-amber-400" :
                      "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.min(100, (course.enrollment.current / course.enrollment.max) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ===== Static course card (from davidson-courses.ts) ===== */
function StaticCourseCard({ course }: { course: SeedCourse }) {
  const [expanded, setExpanded] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    courseHighlights?: string;
    keyTopics?: string[];
    skillsGained?: string[];
    careerApplications?: string[];
  } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const prof = course.professorInfo;

  async function fetchAiInsights(e: React.MouseEvent) {
    e.stopPropagation();
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
    } catch {} finally {
      setLoadingInsights(false);
    }
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-all duration-150 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-mono text-xs font-semibold text-gray-900">{course.code}</span>
              {course.majorRequirements && course.majorRequirements.length > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50 py-0 h-4">
                  {formatMajorReq(course.majorRequirements)}
                </Badge>
              )}
            </div>
            <h3 className="font-medium text-sm text-gray-900">{course.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span>{course.department}</span>
              {course.professor && <span>· {course.professor}</span>}
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-300 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-gray-50 space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">{course.description}</p>

              {/* Professor with RMP */}
              {course.professor && prof?.rmpRating != null && (
                <div className="rounded-lg bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-medium text-gray-900">{course.professor}</span>
                    {prof.title && <span className="text-[10px] text-gray-400">{prof.title}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="font-semibold">{prof.rmpRating}</span>
                      <span className="text-gray-400">/5</span>
                    </span>
                    {prof.rmpWouldTakeAgain != null && (
                      <span className="text-emerald-600">
                        <ThumbsUp className="h-3 w-3 inline mr-0.5" />
                        {prof.rmpWouldTakeAgain}% again
                      </span>
                    )}
                    {prof.rmpDifficulty != null && (
                      <span className="text-orange-600">
                        <Zap className="h-3 w-3 inline mr-0.5" />
                        {prof.rmpDifficulty} difficulty
                      </span>
                    )}
                    {prof.rmpNumRatings != null && (
                      <span className="text-gray-400">
                        <Users className="h-3 w-3 inline mr-0.5" />
                        {prof.rmpNumRatings} ratings
                      </span>
                    )}
                  </div>
                  {prof.rmpTags && prof.rmpTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {prof.rmpTags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Course insights */}
              {course.courseInsights && (
                <div className="space-y-2">
                  {course.courseInsights.keyTopics && (
                    <div className="flex flex-wrap gap-1">
                      {course.courseInsights.keyTopics.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">{t}</span>
                      ))}
                    </div>
                  )}
                  {course.courseInsights.skillsGained && (
                    <div className="flex flex-wrap gap-1">
                      {course.courseInsights.skillsGained.map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Prereqs & offering */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                {course.prerequisites.length > 0 && (
                  <span>Prerequisites: {course.prerequisites.join(", ")}</span>
                )}
                <span>Offered: {course.offered.join(", ")}</span>
              </div>

              {/* Career relevance */}
              {course.careerRelevance.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-gray-400 mb-1.5">Career Relevance</p>
                  <div className="space-y-1">
                    {course.careerRelevance.map(({ field, relevance }) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="text-[11px] w-36 truncate text-gray-500">{field}</span>
                        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-rose-400" style={{ width: `${relevance * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 w-7 text-right">{Math.round(relevance * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Deep Dive */}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAiInsights}
                disabled={loadingInsights || !!aiInsights}
                className="text-xs h-7"
              >
                {loadingInsights ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Brain className="mr-1 h-3 w-3" />}
                {aiInsights ? "AI Loaded" : "AI Deep Dive"}
              </Button>

              {aiInsights && (
                <div className="rounded-lg border border-rose-100 bg-rose-50/30 p-3 space-y-2">
                  <p className="text-[10px] font-medium text-rose-700">AI Analysis</p>
                  {aiInsights.courseHighlights && (
                    <p className="text-xs text-gray-600">{aiInsights.courseHighlights}</p>
                  )}
                  {aiInsights.careerApplications && (
                    <ul className="space-y-0.5">
                      {aiInsights.careerApplications.map((app) => (
                        <li key={app} className="text-[11px] text-gray-500 flex items-start gap-1">
                          <Briefcase className="h-3 w-3 mt-0.5 shrink-0 text-rose-400" />
                          {app}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
