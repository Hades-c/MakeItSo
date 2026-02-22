"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  X,
  Zap,
} from "lucide-react";
import { SUBJECT_AREAS } from "@/lib/utils";
import { DAVIDSON_COURSES, type SeedCourse, type ProfessorRMPData } from "@/lib/davidson-courses";
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

const AREA_TAG_COLORS: Record<string, string> = {
  "natural-sciences": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "math-computing": "bg-blue-50 text-blue-700 border-blue-200",
  "social-sciences": "bg-purple-50 text-purple-700 border-purple-200",
  humanities: "bg-amber-50 text-amber-700 border-amber-200",
  arts: "bg-pink-50 text-pink-700 border-pink-200",
  languages: "bg-teal-50 text-teal-700 border-teal-200",
};

const AREA_DESCRIPTIONS: Record<string, string> = {
  "natural-sciences": "Investigate the natural world through laboratory experimentation, field research, and scientific inquiry.",
  "math-computing": "Build computational systems and explore abstract structures through logic, algorithms, and mathematical proof.",
  "social-sciences": "Understand human behavior, institutions, and societies through analytical frameworks and empirical research.",
  humanities: "Engage with literature, history, philosophy, and the human experience across cultures and centuries.",
  arts: "Create, perform, and analyze art, music, theatre, film, and digital media in studio and stage settings.",
  languages: "Study world languages, cultural perspectives, and cross-cultural communication across global traditions.",
};

// Map Davidson grad requirement codes to readable labels
const GRAD_REQ_LABELS: Record<string, string> = {
  NSRQ: "Natural Science",
  SSRQ: "Social Science",
  HURQ: "Humanities",
  LTRQ: "Literary Studies",
  HARQ: "Historical Analysis",
  CPRQ: "Cultural Pluralism",
  JSRQ: "Justice, Equality & Community",
  QRRQ: "Quantitative Reasoning",
};

// Build a professor RMP lookup by last name for live courses
const PROF_RMP_BY_LAST_NAME: Record<string, ProfessorRMPData> = {};
for (const c of DAVIDSON_COURSES) {
  if (c.professorInfo?.rmpRating != null) {
    const parts = c.professorInfo.name.replace(/^Dr\.\s*/i, "").trim().split(/\s+/);
    const lastName = parts[parts.length - 1].toLowerCase();
    if (lastName && !PROF_RMP_BY_LAST_NAME[lastName]) {
      PROF_RMP_BY_LAST_NAME[lastName] = c.professorInfo;
    }
  }
}

function lookupProfRMP(professorName: string): ProfessorRMPData | undefined {
  const parts = professorName.replace(/^Dr\.\s*/i, "").trim().split(/\s+/);
  const lastName = parts[parts.length - 1].toLowerCase();
  return lastName ? PROF_RMP_BY_LAST_NAME[lastName] : undefined;
}

// Find a static course by code, with fuzzy fallback (same dept prefix, closest number)
function findStaticCourse(code: string): SeedCourse | undefined {
  // Exact match first
  const exact = DAVIDSON_COURSES.find((c) => c.code === code);
  if (exact) return exact;
  // Fuzzy: match dept prefix + closest course number
  const match = code.match(/^([A-Z]{2,4})\s*(\d+)/);
  if (!match) return undefined;
  const [, prefix, numStr] = match;
  const num = parseInt(numStr, 10);
  const sameDept = DAVIDSON_COURSES.filter((c) => c.code.startsWith(prefix + " "));
  if (sameDept.length === 0) return undefined;
  // Find closest by course number
  let best = sameDept[0];
  let bestDist = Infinity;
  for (const c of sameDept) {
    const cNum = parseInt(c.code.replace(/\D+/g, ""), 10);
    const dist = Math.abs(cNum - num);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  // Only match if within 15 of the requested number (e.g. 111 matches 112 but not 220)
  return bestDist <= 15 ? best : undefined;
}

function getDeptColor(dept: string): { bg: string; text: string; border: string } {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    "Computer Science": { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
    Mathematics: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
    Economics: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
    Biology: { bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
    Chemistry: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
    Physics: { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200" },
    Psychology: { bg: "bg-pink-50", text: "text-pink-600", border: "border-pink-200" },
    "Political Science": { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
    English: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
    History: { bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-200" },
    Sociology: { bg: "bg-teal-50", text: "text-teal-600", border: "border-teal-200" },
    Philosophy: { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200" },
    Art: { bg: "bg-fuchsia-50", text: "text-fuchsia-600", border: "border-fuchsia-200" },
    Music: { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-200" },
    "Environmental Studies": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
    "Communication Studies": { bg: "bg-cyan-50", text: "text-cyan-600", border: "border-cyan-200" },
    Anthropology: { bg: "bg-stone-100", text: "text-stone-600", border: "border-stone-200" },
    "Educational Studies": { bg: "bg-sky-50", text: "text-sky-600", border: "border-sky-200" },
    Theatre: { bg: "bg-pink-50", text: "text-pink-600", border: "border-pink-200" },
    Dance: { bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-200" },
    Classics: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    "Religious Studies": { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
    "Public Health": { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  };
  return colors[dept] || { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" };
}

type Step = "interests" | "browse" | "recommendations";

export default function ExplorePage() {
  const [step, setStep] = useState<Step>("interests");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
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

  // Build a set of static course codes for quick lookup
  const staticCodes = new Set(DAVIDSON_COURSES.map((c) => c.code));

  // Live-only courses: courses from the API that don't exist in our static data
  const liveOnlyCourses = liveCourses.filter((c) => !staticCodes.has(c.code));

  // Combined courses: static (rich data with RMP) first, then live-only extras
  const allCourses: (SeedCourse | LiveCourse)[] = [
    ...DAVIDSON_COURSES,
    ...liveOnlyCourses,
  ];

  // Departments available from selected areas
  const areaDepartments: string[] = SUBJECT_AREAS.filter((a) =>
    selectedAreas.includes(a.id)
  ).flatMap((a) => [...a.departments]);

  const filteredCourses = allCourses.filter((c) => {
    const matchesDept = selectedDepartments.length > 0
      ? selectedDepartments.includes(c.department)
      : areaDepartments.length > 0
        ? areaDepartments.includes(c.department)
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
      className="max-w-5xl mx-auto space-y-6"
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
          Discover Davidson&apos;s course catalog and see how courses connect to your career goals.{" "}
          {liveCourses.length > 0 && (
            <span className="text-gray-400">· {liveCourses.length} live courses loaded</span>
          )}
          {liveLoading && (
            <Loader2 className="inline h-3 w-3 animate-spin text-gray-400 ml-1" />
          )}
        </p>
      </div>

      {/* Step indicator — tabs appear progressively */}
      <div className="flex items-center gap-1 text-sm border-b border-gray-100 pb-0">
        {[
          { key: "interests" as Step, label: "Select Interests", num: "1", visible: true },
          { key: "browse" as Step, label: "Browse Courses", num: "2", visible: selectedAreas.length > 0 || step === "browse" },
          { key: "recommendations" as Step, label: "AI Recommendations", num: "3", visible: !!recommendations || step === "recommendations" },
        ].filter((s) => s.visible).map((s) => (
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

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SUBJECT_AREAS.map((area) => {
              const isSelected = selectedAreas.includes(area.id);
              const depts: string[] = [...area.departments];
              const courseCount = allCourses.filter((c) => depts.includes(c.department)).length;
              const tagColor = AREA_TAG_COLORS[area.id] || "bg-gray-50 text-gray-600 border-gray-200";
              return (
                <div
                  key={area.id}
                  onClick={() => toggleArea(area.id)}
                  className={`p-5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "bg-davidson text-white border-davidson shadow-sm"
                      : "bg-white text-gray-700 border-gray-100 hover:border-gray-200 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-serif font-semibold text-lg">{area.label}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isSelected ? "bg-white/20 text-white" : "bg-gray-50 text-gray-500"
                    }`}>
                      {courseCount} courses
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed mb-3 ${isSelected ? "text-white/80" : "text-[#555555]"}`}>
                    {AREA_DESCRIPTIONS[area.id]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {area.departments.map((dept) => {
                      const isDeptSelected = selectedDepartments.includes(dept);
                      return (
                        <button
                          key={dept}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDepartments((prev) =>
                              prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
                            );
                            if (!selectedAreas.includes(area.id)) toggleArea(area.id);
                          }}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                            isSelected
                              ? isDeptSelected
                                ? "bg-white text-davidson border-white"
                                : "bg-white/15 text-white/90 border-white/20 hover:bg-white/30"
                              : isDeptSelected
                                ? `${tagColor} border`
                                : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {dept}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedAreas.length > 0 && (
            <div className="flex gap-3 pt-1">
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
                value={selectedDepartments.length === 1 ? selectedDepartments[0] : ""}
                onChange={(e) =>
                  setSelectedDepartments(e.target.value ? [e.target.value] : [])
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
            {selectedDepartments.length > 0 && (
              <>
                {" "}in{" "}
                <span className="text-gray-600">{selectedDepartments.join(", ")}</span>
                <button
                  onClick={() => setSelectedDepartments([])}
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
            {recommendations.recommendations.map((rec, i) => {
              // Look up full course data — fuzzy match static, then live
              const staticCourse = findStaticCourse(rec.code);
              const liveCourse = liveCourses.find((c) => c.code === rec.code);

              return (
                <div key={i} className="relative">
                  {/* Priority badge */}
                  <div className="absolute -top-2 left-4 z-10">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium shadow-sm ${
                        rec.priority === "high"
                          ? "bg-davidson text-white"
                          : rec.priority === "medium"
                            ? "bg-white text-gray-600 border border-gray-200"
                            : "bg-gray-50 text-gray-400 border border-gray-100"
                      }`}
                    >
                      {rec.priority === "high"
                        ? "Must Take"
                        : rec.priority === "medium"
                          ? "Recommended"
                          : "Optional"}
                    </span>
                  </div>

                  {staticCourse ? (
                    <StaticCourseCard
                      course={staticCourse}
                      aiReason={rec.reason}
                      aiCareerImpact={rec.careerImpact}
                    />
                  ) : liveCourse ? (
                    <LiveCourseCard course={liveCourse} aiReason={rec.reason} />
                  ) : (
                    /* Fallback for courses not in our data */
                    <div className="bg-white rounded-lg border border-gray-100 p-5 hover:border-gray-200 transition-all">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-gray-50 text-gray-600">
                          {rec.code}
                        </span>
                      </div>
                      <h3 className="font-medium text-[15px] text-[#111111] mb-1">{rec.name}</h3>
                      <p className="text-sm text-[#555555] mb-2">{rec.reason}</p>
                      {rec.careerImpact?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {rec.careerImpact.map((career) => (
                            <span
                              key={career}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-600"
                            >
                              <Briefcase className="h-3 w-3 text-gray-400" />
                              {career}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
function LiveCourseCard({ course, aiReason }: { course: LiveCourse; aiReason?: string }) {
  const [expanded, setExpanded] = useState(false);
  const realProfessor =
    course.professor && course.professor !== "Staff"
      ? course.professor
      : null;
  const realInstructors = course.instructors.filter((i) => i !== "Staff");
  const prof = realProfessor ? lookupProfRMP(realProfessor) : undefined;
  const staticMatch = findStaticCourse(course.code);
  const careerRelevance = staticMatch?.careerRelevance ?? [];
  const deptColor = getDeptColor(course.department);
  // Filter out meaningless grad requirements and map to readable labels
  const gradReqs = course.gradRequirements
    .filter((r) => r !== "NONE" && r !== "" && GRAD_REQ_LABELS[r])
    .map((r) => GRAD_REQ_LABELS[r] || r);

  return (
    <div
      onClick={() => { if (!expanded) setExpanded(true); }}
      className={`bg-white rounded-lg border-l-[3px] border border-gray-100 transition-all ${expanded ? "shadow-sm border-gray-200" : "cursor-pointer hover:border-gray-200"} ${deptColor.border.replace("border-", "border-l-")}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`font-mono text-xs font-semibold px-2.5 py-1 rounded ${deptColor.bg} ${deptColor.text}`}>
                {course.code}
              </span>
              {gradReqs.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-[#555555] font-medium">
                  {gradReqs.join(", ")}
                </span>
              )}
              {prof?.rmpRating != null && (
                <span className="flex items-center gap-0.5 text-xs text-gray-500">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {prof.rmpRating}
                </span>
              )}
              {course.sections > 1 && (
                <span className="text-xs text-gray-400">
                  {course.sections} sections
                </span>
              )}
            </div>
            <h3 className="font-medium text-[15px] text-[#111111] mb-1">
              {course.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>{course.department}</span>
              {realProfessor && <span>· {realProfessor}</span>}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 animate-fade-in border-t border-gray-100 pt-4">
            {aiReason && (
              <div className="flex items-start gap-2 rounded-lg bg-davidson-light/50 border border-davidson/10 p-3">
                <Sparkles className="h-4 w-4 text-davidson shrink-0 mt-0.5" />
                <p className="text-sm text-[#555555] leading-relaxed">{aiReason}</p>
              </div>
            )}

            {course.description && (
              <p className="text-sm text-[#555555] leading-relaxed">
                {course.description}
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
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200"
                          >
                            <MessageSquare className="h-2.5 w-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {realInstructors.length > 1 && (
                  <p className="text-xs text-gray-400 ml-6">
                    All instructors: {realInstructors.join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Career Relevance (from static data match) */}
            {careerRelevance.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                  <TrendingUp className="h-3 w-3" /> Career Relevance
                </p>
                <div className="space-y-1.5">
                  {careerRelevance.map(({ field, relevance }) => (
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
    </div>
  );
}

/* ===== Static course card (from davidson-courses.ts) ===== */
function StaticCourseCard({ course, aiReason, aiCareerImpact }: { course: SeedCourse; aiReason?: string; aiCareerImpact?: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    courseHighlights?: string;
    keyTopics?: string[];
    skillsGained?: string[];
    careerApplications?: string[];
  } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showProfModal, setShowProfModal] = useState(false);
  const [profSummary, setProfSummary] = useState<{
    summary?: string;
    strengths?: string[];
    considerations?: string[];
    tipForSuccess?: string;
  } | null>(null);
  const [loadingProfSummary, setLoadingProfSummary] = useState(false);

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

  async function fetchProfSummary() {
    if (profSummary || loadingProfSummary || !prof) return;
    setLoadingProfSummary(true);
    try {
      const res = await fetch("/api/ai/professor-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professorName: prof.name,
          courseCode: course.code,
          courseName: course.name,
          rmpRating: prof.rmpRating,
          rmpDifficulty: prof.rmpDifficulty,
          rmpNumRatings: prof.rmpNumRatings,
          rmpWouldTakeAgain: prof.rmpWouldTakeAgain,
          rmpTags: prof.rmpTags,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to get professor summary:", err);
    } finally {
      setLoadingProfSummary(false);
    }
  }

  const deptColor = getDeptColor(course.department);

  return (
    <div
      onClick={() => { if (!expanded) setExpanded(true); }}
      className={`bg-white rounded-lg border-l-[3px] border border-gray-100 transition-all ${expanded ? "shadow-sm border-gray-200" : "cursor-pointer hover:border-gray-200"} ${deptColor.border.replace("border-", "border-l-")}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`font-mono text-xs font-semibold px-2.5 py-1 rounded ${deptColor.bg} ${deptColor.text}`}>
                {course.code}
              </span>
              {course.majorRequirements && course.majorRequirements.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-davidson-light text-davidson font-medium">
                  {formatMajorReq(course.majorRequirements)}
                </span>
              )}
              {prof?.rmpRating != null && (
                <span className="flex items-center gap-0.5 text-xs text-gray-500">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {prof.rmpRating}
                </span>
              )}
            </div>
            <h3 className="font-medium text-[15px] text-[#111111] mb-1">
              {course.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>{course.department}</span>
              {course.professor && <span>· {course.professor}</span>}
              <span>· {course.offered.join(", ")}</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        {expanded && (
            <div className="mt-4 space-y-4 animate-fade-in border-t border-gray-100 pt-4">
              {aiReason && (
                <div className="flex items-start gap-2 rounded-lg bg-davidson-light/50 border border-davidson/10 p-3">
                  <Sparkles className="h-4 w-4 text-davidson shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-[#555555] leading-relaxed">{aiReason}</p>
                    {aiCareerImpact && aiCareerImpact.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {aiCareerImpact.map((career) => (
                          <span
                            key={career}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-white/80 text-gray-600 border border-gray-200"
                          >
                            <Briefcase className="h-3 w-3 text-gray-400" />
                            {career}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200"
                              >
                                <MessageSquare className="h-2.5 w-2.5" />
                                {tag}
                              </span>
                            ))}
                        </div>
                      )}

                      {/* AI Professor Summary Button */}
                      <div className="pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!profSummary && !loadingProfSummary) fetchProfSummary();
                            setShowProfModal(true);
                          }}
                          disabled={loadingProfSummary}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-davidson-light text-davidson hover:bg-davidson-light/80 disabled:text-gray-300 transition-colors"
                        >
                          {loadingProfSummary ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Analyzing reviews...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              AI Professor Summary
                            </>
                          )}
                        </button>
                      </div>

                      {/* Professor Summary Modal — portaled to body */}
                      {typeof document !== "undefined" && createPortal(
                      <AnimatePresence>
                        {showProfModal && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh] px-4"
                          >
                            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setShowProfModal(false); }} />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 12 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 12 }}
                              className="relative bg-[#F8F9FB] rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[85vh] overflow-y-auto z-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Modal header */}
                              <div className="sticky top-0 bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between rounded-t-2xl z-10">
                                <div>
                                  <div className="flex items-center gap-2.5 mb-1">
                                    <GraduationCap className="h-5 w-5 text-davidson" />
                                    <h2 className="font-serif font-semibold text-xl text-[#111111]">Professor Summary</h2>
                                  </div>
                                  <p className="text-sm text-[#555555]">{prof.name} · {course.code} {course.name}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); setShowProfModal(false); }} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                  <X className="h-5 w-5" />
                                </button>
                              </div>

                              {/* Modal content */}
                              <div className="px-8 py-6 space-y-6">
                                {/* RMP stats bar */}
                                <div className="bg-white rounded-xl border border-gray-100 p-5">
                                  <div className="flex flex-wrap items-center gap-6 text-sm">
                                    <span className="flex items-center gap-1.5">
                                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                      <span className="font-bold text-lg text-[#111111]">{prof.rmpRating}</span>
                                      <span className="text-gray-400">/5</span>
                                    </span>
                                    {prof.rmpWouldTakeAgain != null && (
                                      <span className="flex items-center gap-1.5 text-[#555555]">
                                        <ThumbsUp className="h-4 w-4" />
                                        {prof.rmpWouldTakeAgain}% would take again
                                      </span>
                                    )}
                                    {prof.rmpDifficulty != null && (
                                      <span className="flex items-center gap-1.5 text-[#555555]">
                                        <Zap className="h-4 w-4" />
                                        {prof.rmpDifficulty} difficulty
                                      </span>
                                    )}
                                    {prof.rmpNumRatings != null && (
                                      <span className="flex items-center gap-1.5 text-gray-400">
                                        <Users className="h-4 w-4" />
                                        {prof.rmpNumRatings} ratings
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {loadingProfSummary ? (
                                  <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 className="h-8 w-8 animate-spin text-davidson mb-3" />
                                    <p className="text-sm text-[#555555]">Analyzing professor reviews...</p>
                                  </div>
                                ) : profSummary ? (
                                  <>
                                    {profSummary.summary && (
                                      <div className="bg-white rounded-xl border border-gray-100 p-6">
                                        <h3 className="text-sm font-semibold text-[#111111] mb-3 flex items-center gap-2">
                                          <Sparkles className="h-4 w-4 text-davidson" />
                                          Overview
                                        </h3>
                                        <p className="text-base text-[#555555] leading-relaxed">{profSummary.summary}</p>
                                      </div>
                                    )}

                                    <div className="grid sm:grid-cols-2 gap-4">
                                      {profSummary.strengths && profSummary.strengths.length > 0 && (
                                        <div className="bg-white rounded-xl border border-gray-100 p-6">
                                          <h3 className="text-sm font-semibold text-emerald-600 mb-3">Strengths</h3>
                                          <ul className="space-y-2">
                                            {profSummary.strengths.map((s, i) => (
                                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                                <span className="text-emerald-500 mt-0.5 shrink-0 font-bold">+</span> {s}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {profSummary.considerations && profSummary.considerations.length > 0 && (
                                        <div className="bg-white rounded-xl border border-gray-100 p-6">
                                          <h3 className="text-sm font-semibold text-amber-600 mb-3">Considerations</h3>
                                          <ul className="space-y-2">
                                            {profSummary.considerations.map((c, i) => (
                                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                                <span className="text-amber-500 mt-0.5 shrink-0 font-bold">!</span> {c}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>

                                    {profSummary.tipForSuccess && (
                                      <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-start gap-3">
                                        <Lightbulb className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                          <h3 className="text-sm font-semibold text-[#111111] mb-1">Tip for Success</h3>
                                          <p className="text-sm text-[#555555] leading-relaxed">{profSummary.tipForSuccess}</p>
                                        </div>
                                      </div>
                                    )}

                                    {/* RMP Tags */}
                                    {prof.rmpTags && prof.rmpTags.length > 0 && (
                                      <div className="bg-white rounded-xl border border-gray-100 p-6">
                                        <h3 className="text-sm font-semibold text-[#111111] mb-3">Student Tags</h3>
                                        <div className="flex flex-wrap gap-2">
                                          {prof.rmpTags.map((tag) => (
                                              <span key={tag} className="text-sm px-3 py-1 rounded-lg border bg-gray-50 text-gray-600 border-gray-200">
                                                {tag}
                                              </span>
                                            ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="flex flex-col items-center justify-center py-16">
                                    <GraduationCap className="h-8 w-8 text-gray-300 mb-3" />
                                    <p className="text-sm text-gray-400">No summary available yet</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>, document.body)}
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
                              className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
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
                              className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!aiInsights && !loadingInsights) fetchAiInsights();
                    setShowAiModal(true);
                  }}
                  disabled={loadingInsights}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-navy/5 text-navy hover:bg-navy/10 hover:text-davidson disabled:text-gray-300 transition-colors"
                >
                  {loadingInsights ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="h-3.5 w-3.5" />
                      AI Deep Dive
                    </>
                  )}
                </button>
              </div>

              {/* AI Deep Dive Modal — portaled to body */}
              {typeof document !== "undefined" && createPortal(
              <AnimatePresence>
                {showAiModal && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh] px-4"
                  >
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setShowAiModal(false); }} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 12 }}
                      className="relative bg-[#F8F9FB] rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[85vh] overflow-y-auto z-10"
                    >
                      {/* Modal header */}
                      <div className="sticky top-0 bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between rounded-t-2xl z-10">
                        <div>
                          <div className="flex items-center gap-2.5 mb-1">
                            <Sparkles className="h-5 w-5 text-davidson" />
                            <h2 className="font-serif font-semibold text-xl text-[#111111]">AI Deep Dive</h2>
                          </div>
                          <p className="text-sm text-[#555555]">{course.code} · {course.name}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setShowAiModal(false); }} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Modal content */}
                      <div className="px-8 py-6 space-y-5">
                        {loadingInsights ? (
                          <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-davidson mb-3" />
                            <p className="text-sm text-[#555555]">Analyzing course with AI...</p>
                          </div>
                        ) : aiInsights ? (
                          <>
                            {aiInsights.courseHighlights && (
                              <div className="bg-white rounded-xl border border-gray-100 p-6">
                                <h3 className="text-sm font-semibold text-[#111111] mb-3 flex items-center gap-2">
                                  <Sparkles className="h-4 w-4 text-davidson" />
                                  Course Highlights
                                </h3>
                                <p className="text-base text-[#555555] leading-relaxed">
                                  {aiInsights.courseHighlights}
                                </p>
                              </div>
                            )}

                            <div className="grid sm:grid-cols-2 gap-4">
                              {aiInsights.keyTopics && aiInsights.keyTopics.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-100 p-6">
                                  <h3 className="text-sm font-semibold text-[#111111] mb-3 flex items-center gap-2">
                                    <BookOpen className="h-4 w-4 text-blue-600" />
                                    Deep Dive Topics
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {aiInsights.keyTopics.map((topic) => (
                                      <span key={topic} className="text-sm px-3 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                                        {topic}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {aiInsights.skillsGained && aiInsights.skillsGained.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-100 p-6">
                                  <h3 className="text-sm font-semibold text-[#111111] mb-3 flex items-center gap-2">
                                    <Lightbulb className="h-4 w-4 text-amber-500" />
                                    Skills You&apos;ll Gain
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {aiInsights.skillsGained.map((skill) => (
                                      <span key={skill} className="text-sm px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {aiInsights.careerApplications && aiInsights.careerApplications.length > 0 && (
                              <div className="bg-white rounded-xl border border-gray-100 p-6">
                                <h3 className="text-sm font-semibold text-[#111111] mb-3 flex items-center gap-2">
                                  <Briefcase className="h-4 w-4 text-davidson" />
                                  Career Applications
                                </h3>
                                <ul className="space-y-2.5">
                                  {aiInsights.careerApplications.map((app) => (
                                    <li key={app} className="text-sm text-[#555555] flex items-start gap-2">
                                      <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-davidson/50" />
                                      {app}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-16">
                            <Brain className="h-8 w-8 text-gray-300 mb-3" />
                            <p className="text-sm text-gray-400">No insights available yet</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>, document.body)}
            </div>
          )}
      </div>
    </div>
  );
}
