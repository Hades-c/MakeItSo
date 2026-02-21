"use client";

import { useState, useEffect } from "react";
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
import { ActivitiesCarousel } from "@/components/activities-carousel";

// Major name -> abbreviation map
const MAJOR_ABBREV: Record<string, string> = {
  "Computer Science": "CSC",
  Mathematics: "MAT",
  Economics: "ECO",
  Biology: "BIO",
  Chemistry: "CHE",
  Physics: "PHY",
  Psychology: "PSY",
  "Political Science": "POL",
  English: "ENG",
  History: "HIS",
  Sociology: "SOC",
  Philosophy: "PHI",
  Anthropology: "ANT",
  Art: "ART",
  Music: "MUS",
  Theatre: "THE",
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
  Classics: "CLA",
  Dance: "DAN",
  "Digital Studies": "DIG",
};

function formatMajorReq(majors: string[]): string {
  return (
    majors
      .map(
        (m) =>
          MAJOR_ABBREV[m] || m.split(" ")[0].toUpperCase().slice(0, 3)
      )
      .join("/") + " Req."
  );
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
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [liveCourses, setLiveCourses] = useState<LiveCourse[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
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

  const selectedDepartments: string[] = SUBJECT_AREAS.filter((a) =>
    selectedAreas.includes(a.id)
  ).flatMap((a) => [...a.departments]);

  // Build a set of static course codes for quick lookup
  const staticCodes = new Set(DAVIDSON_COURSES.map((c) => c.code));

  // Live-only courses: courses from the API that don't exist in our static data
  const liveOnlyCourses = liveCourses.filter((c) => !staticCodes.has(c.code));

  // Combined courses: static (rich data with RMP) first, then live-only extras
  const allCourses: (SeedCourse | LiveCourse)[] = [
    ...DAVIDSON_COURSES,
    ...liveOnlyCourses,
  ];

  const filteredCourses = allCourses.filter((c) => {
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
        ("professor" in c && c.professor
          ? c.professor.toLowerCase().includes(q)
          : false)
      : true;
    return matchesDept && matchesSearch;
  });

  const departments = Array.from(
    new Set(allCourses.map((c) => c.department))
  ).sort();

  async function getRecommendations() {
    setLoading(true);
    try {
      const interests = SUBJECT_AREAS.filter((a) =>
        selectedAreas.includes(a.id)
      ).map((a) => a.label);

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
      className="max-w-4xl mx-auto space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[#111111]">
          Explore Courses
        </h1>
        <p className="text-sm text-[#555555] mt-1.5 max-w-xl">
          Discover Davidson&apos;s course catalog and see how courses connect to
          your career goals.
          {liveCourses.length > 0 && (
            <span className="text-gray-400 ml-1">
              · {liveCourses.length} live courses loaded
            </span>
          )}
          {liveLoading && (
            <Loader2 className="inline h-3 w-3 animate-spin text-gray-400 ml-1" />
          )}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 text-sm border-b border-gray-100 pb-0">
        {[
          { key: "interests" as Step, label: "Select Interests", num: "1" },
          { key: "browse" as Step, label: "Browse Courses", num: "2" },
          {
            key: "recommendations" as Step,
            label: "AI Recommendations",
            num: "3",
          },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => {
              if (s.key === "interests") setStep("interests");
              else if (s.key === "browse" && selectedAreas.length > 0)
                setStep("browse");
              else if (s.key === "recommendations" && recommendations)
                setStep("recommendations");
            }}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              step === s.key
                ? "text-[#111111]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {s.num}. {s.label}
            {step === s.key && (
              <motion.div
                layoutId="explore-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-davidson rounded-full"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Step 1: Interest Selection */}
      {step === "interests" && (
        <div className="space-y-6">
          <div>
            <h2 className="font-serif text-lg font-semibold text-[#111111] mb-1">
              What areas interest you?
            </h2>
            <p className="text-sm text-[#555555]">
              Select one or more subject areas to filter the catalog.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SUBJECT_AREAS.map((area) => (
              <button
                key={area.id}
                onClick={() => toggleArea(area.id)}
                className={`p-3.5 rounded-lg border text-left transition-all duration-150 ${
                  selectedAreas.includes(area.id)
                    ? "bg-davidson text-white border-davidson"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium text-sm">{area.label}</div>
                <div
                  className={`text-xs mt-0.5 ${
                    selectedAreas.includes(area.id)
                      ? "text-gray-400"
                      : "text-gray-400"
                  }`}
                >
                  {area.departments.slice(0, 3).join(", ")}
                  {area.departments.length > 3 &&
                    ` +${area.departments.length - 3}`}
                </div>
              </button>
            ))}
          </div>

          {selectedAreas.length > 0 && (
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => setStep("browse")}
                className="bg-davidson hover:bg-davidson-dark text-white"
              >
                Browse Courses
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={getRecommendations}
                disabled={loading}
                className="border-navy/30 text-navy hover:bg-navy hover:text-white"
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
        </div>
      )}

      {/* Step 2: Browse Courses */}
      {step === "browse" && (
        <div className="space-y-5">
          {/* Search and filter bar */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, code, department, or professor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-gray-200 focus:ring-gray-300 focus:border-gray-400"
              />
            </div>
            <div className="relative">
              <select
                value={selectedDepartment || ""}
                onChange={(e) =>
                  setSelectedDepartment(e.target.value || null)
                }
                className="appearance-none h-10 rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400 cursor-pointer"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>
            <Button
              variant="outline"
              onClick={getRecommendations}
              disabled={loading}
              className="shrink-0 border-navy/30 text-navy hover:bg-navy hover:text-white"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Picks
                </>
              )}
            </Button>
          </div>

          {/* Results count */}
          <p className="text-xs text-gray-400">
            {filteredCourses.length} course
            {filteredCourses.length !== 1 ? "s" : ""}
            {selectedDepartment && (
              <>
                {" "}
                in{" "}
                <span className="text-gray-600">{selectedDepartment}</span>
                <button
                  onClick={() => setSelectedDepartment(null)}
                  className="ml-1 text-gray-400 hover:text-gray-600 underline"
                >
                  clear
                </button>
              </>
            )}
          </p>

          {/* Course list */}
          <div className="space-y-2">
            {filteredCourses.slice(0, 50).map((course) =>
              "careerRelevance" in course ? (
                <StaticCourseCard
                  key={course.code}
                  course={course as SeedCourse}
                />
              ) : (
                <LiveCourseCard
                  key={course.code}
                  course={course as LiveCourse}
                />
              )
            )}
            {filteredCourses.length > 50 && (
              <p className="text-sm text-gray-400 text-center py-6">
                Showing 50 of {filteredCourses.length} courses. Use search to
                narrow results.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: AI Recommendations */}
      {step === "recommendations" && recommendations && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[#111111]">
                AI-Powered Recommendations
              </h2>
              <p className="text-xs text-[#555555] mt-0.5">
                Based on:{" "}
                {SUBJECT_AREAS.filter((a) => selectedAreas.includes(a.id))
                  .map((a) => a.label)
                  .join(", ")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStep("browse")}
              className="border-gray-200"
            >
              Browse All
            </Button>
          </div>

          <div className="space-y-2">
            {recommendations.recommendations.map((rec, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-gray-100 p-5 hover:border-gray-200 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-[#111111]">
                        {rec.code}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          rec.priority === "high"
                            ? "bg-davidson text-white"
                            : rec.priority === "medium"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-gray-50 text-gray-400"
                        }`}
                      >
                        {rec.priority === "high"
                          ? "Must Take"
                          : rec.priority === "medium"
                            ? "Recommended"
                            : "Optional"}
                      </span>
                    </div>
                    <h3 className="font-medium text-sm text-[#111111] mb-1">
                      {rec.name}
                    </h3>
                    <p className="text-sm text-[#555555] mb-3">{rec.reason}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rec.careerImpact?.map((career) => (
                        <span
                          key={career}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-600"
                        >
                          <Briefcase className="h-3 w-3 text-gray-400" />
                          {career}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {rec.difficulty && (
                      <div className="flex items-center gap-0.5 mt-1 justify-end">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div
                            key={n}
                            className={`h-1.5 w-3 rounded-full ${
                              n <= rec.difficulty
                                ? "bg-navy"
                                : "bg-gray-100"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activities carousel */}
      <ActivitiesCarousel />
    </motion.div>
  );
}

function RatingBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

/* ===== Live course card (courses from Davidson API without static RMP data) ===== */
function LiveCourseCard({ course }: { course: LiveCourse }) {
  const [expanded, setExpanded] = useState(false);
  const realProfessor =
    course.professor && course.professor !== "Staff"
      ? course.professor
      : null;
  const realInstructors = course.instructors.filter((i) => i !== "Staff");
  const shortDesc = course.description
    ? course.description.split(/\.\s/)[0] +
      (course.description.includes(". ") ? "." : "")
    : "";

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-5 hover:border-gray-200 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-semibold text-[#111111]">
              {course.code}
            </span>
            {course.gradRequirements.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-[#555555] font-medium">
                {course.gradRequirements.join(", ")}
              </span>
            )}
            {course.sections > 1 && (
              <span className="text-xs text-gray-400">
                {course.sections} sections
              </span>
            )}
          </div>
          <h3 className="font-medium text-sm text-[#111111] mb-0.5">
            {course.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{course.department}</span>
            {realProfessor && <span>· {realProfessor}</span>}
            {course.schedule && course.schedule !== "TBA" && (
              <span>· {course.schedule}</span>
            )}
          </div>

          {expanded && (
            <div className="mt-4 space-y-4 animate-fade-in">
              {shortDesc && (
                <p className="text-sm text-[#555555] leading-relaxed">
                  {shortDesc}
                </p>
              )}

              {realProfessor && (
                <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {realProfessor}
                    </span>
                  </div>
                  {realInstructors.length > 1 && (
                    <p className="text-xs text-gray-400 ml-6">
                      All instructors: {realInstructors.join(", ")}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                {course.schedule && course.schedule !== "TBA" && (
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-[#555555]">
                      {course.schedule}
                    </span>
                  </div>
                )}
                {course.location && course.location !== "TBA" && (
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-[#555555]">
                      {course.location}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
        >
          {expanded ? "Less" : "Details"}
        </button>
      </div>
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
          extraContext: {
            professor: prof?.name,
            rmpRating: prof?.rmpRating,
            rmpDifficulty: prof?.rmpDifficulty,
            knownTopics: course.courseInsights?.keyTopics,
            knownSkills: course.courseInsights?.skillsGained,
            careerRelevance: course.careerRelevance?.map((cr) => ({
              field: cr.field,
              relevance: cr.relevance,
            })),
          },
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
    <div className="bg-white rounded-lg border border-gray-100 p-5 hover:border-gray-200 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-semibold text-[#111111]">
              {course.code}
            </span>
            {course.majorRequirements && course.majorRequirements.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-[#555555] font-medium">
                {formatMajorReq(course.majorRequirements)}
              </span>
            )}
          </div>
          <h3 className="font-medium text-sm text-[#111111] mb-0.5">
            {course.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{course.department}</span>
            {course.professor && <span>· {course.professor}</span>}
            <span>· {course.offered.join(", ")}</span>
          </div>

          {expanded && (
            <div className="mt-4 space-y-4 animate-fade-in">
              <p className="text-sm text-[#555555] leading-relaxed">
                {course.description}
              </p>

              {/* Professor Section with RMP Data */}
              {course.professor && (
                <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {course.professor}
                    </span>
                  </div>
                  {prof?.title && (
                    <p className="text-xs text-gray-400 ml-6">{prof.title}</p>
                  )}
                  {prof?.rmpRating != null && (
                    <div className="ml-6 space-y-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-semibold text-sm text-[#111111]">
                            {prof.rmpRating}
                          </span>
                          <span className="text-gray-400">/5</span>
                        </span>
                        {prof.rmpWouldTakeAgain != null && (
                          <span className="flex items-center gap-1 text-[#555555]">
                            <ThumbsUp className="h-3 w-3" />
                            {prof.rmpWouldTakeAgain}% would take again
                          </span>
                        )}
                        {prof.rmpDifficulty != null && (
                          <span className="flex items-center gap-1 text-[#555555]">
                            <Zap className="h-3 w-3" />
                            {prof.rmpDifficulty} difficulty
                          </span>
                        )}
                        {prof.rmpNumRatings != null && (
                          <span className="flex items-center gap-1 text-gray-400">
                            <Users className="h-3 w-3" />
                            {prof.rmpNumRatings} ratings
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 w-14">
                            Quality
                          </span>
                          <RatingBar
                            value={prof.rmpRating}
                            max={5}
                            color={
                              prof.rmpRating >= 4
                                ? "bg-emerald-500"
                                : prof.rmpRating >= 3
                                  ? "bg-amber-400"
                                  : "bg-red-400"
                            }
                          />
                        </div>
                        {prof.rmpDifficulty != null && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-14">
                              Difficulty
                            </span>
                            <RatingBar
                              value={prof.rmpDifficulty}
                              max={5}
                              color={
                                prof.rmpDifficulty <= 2.5
                                  ? "bg-emerald-500"
                                  : prof.rmpDifficulty <= 3.5
                                    ? "bg-amber-400"
                                    : "bg-orange-500"
                              }
                            />
                          </div>
                        )}
                      </div>

                      {prof.rmpTags && prof.rmpTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {prof.rmpTags.slice(0, 5).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-[#555555]"
                            >
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
                  {course.courseInsights.keyTopics &&
                    course.courseInsights.keyTopics.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                          <BookOpen className="h-3 w-3" /> Topics
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {course.courseInsights.keyTopics.map((topic) => (
                            <span
                              key={topic}
                              className="text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-100"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {course.courseInsights.skillsGained &&
                    course.courseInsights.skillsGained.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                          <Lightbulb className="h-3 w-3" /> Skills
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {course.courseInsights.skillsGained.map((skill) => (
                            <span
                              key={skill}
                              className="text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-100"
                            >
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
                    <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-[#555555]">
                      Prerequisites: {course.prerequisites.join(", ")}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-[#555555]">
                    Offered: {course.offered.join(", ")}
                  </span>
                </div>
              </div>

              {/* Career Relevance */}
              {course.careerRelevance.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                    <TrendingUp className="h-3 w-3" /> Career Relevance
                  </p>
                  <div className="space-y-1.5">
                    {course.careerRelevance.map(({ field, relevance }) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-40 truncate">
                          {field}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-davidson"
                            style={{ width: `${relevance * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">
                          {Math.round(relevance * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Deep Dive Button */}
              <div className="pt-1">
                <button
                  onClick={fetchAiInsights}
                  disabled={loadingInsights || !!aiInsights}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-navy hover:text-davidson disabled:text-gray-300 transition-colors"
                >
                  {loadingInsights ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing...
                    </>
                  ) : aiInsights ? (
                    <>
                      <Brain className="h-3 w-3" />
                      AI Insights Loaded
                    </>
                  ) : (
                    <>
                      <Brain className="h-3 w-3" />
                      Get AI Deep Dive
                    </>
                  )}
                </button>
              </div>

              {/* AI-Generated Insights */}
              {aiInsights && (
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-davidson" />
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      AI Analysis
                    </span>
                  </div>

                  {aiInsights.courseHighlights && (
                    <p className="text-sm text-[#555555] leading-relaxed">
                      {aiInsights.courseHighlights}
                    </p>
                  )}

                  {aiInsights.keyTopics && aiInsights.keyTopics.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wide">
                        Deep Dive Topics
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {aiInsights.keyTopics.map((topic) => (
                          <span
                            key={topic}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white text-gray-600 border border-gray-200"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiInsights.skillsGained &&
                    aiInsights.skillsGained.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wide">
                          Additional Skills
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {aiInsights.skillsGained.map((skill) => (
                            <span
                              key={skill}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white text-gray-600 border border-gray-200"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {aiInsights.careerApplications &&
                    aiInsights.careerApplications.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 mb-1 uppercase tracking-wide">
                          Career Applications
                        </p>
                        <ul className="space-y-0.5">
                          {aiInsights.careerApplications.map((app) => (
                            <li
                              key={app}
                              className="text-[11px] text-[#555555] flex items-start gap-1.5"
                            >
                              <Briefcase className="h-3 w-3 mt-0.5 shrink-0 text-gray-300" />
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

        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
        >
          {expanded ? "Less" : "Details"}
        </button>
      </div>
    </div>
  );
}
