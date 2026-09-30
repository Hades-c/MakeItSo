"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Brain,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Clock,
  GraduationCap,
  Lightbulb,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { SUBJECT_AREAS } from "@/lib/utils";
import { AddToPlan, type PlanCourseSummary } from "@/components/add-to-plan";
import type { TermInfo } from "@/lib/terms";

// Course as returned by /api/courses/davidson (live Davidson API data only).
// Static enrichment from lib/davidson-courses.ts and the static RateMyProfessors
// overlay were removed: they attached other courses' prerequisites and other
// professors' ratings to live courses.
interface CourseSection {
  section: string;
  crn?: number;
  title: string;
  description?: string; // only for topics courses whose sections differ
  instructors: string[];
  schedule: string;
  location: string;
  credits: number;
  enrollment: { current: number; max: number; remaining: number };
}

interface LiveCourse {
  code: string;
  name: string;
  description: string;
  prerequisites: string;
  department: string;
  deptCode: string;
  professor: string;
  instructors: string[];
  sections: number;
  sectionList: CourseSection[];
  enrollment: { current: number; max: number };
  gradRequirements: string[];
  gradRequirementLabels: string[];
  schedule: string;
  location: string;
  credits: number;
}

interface CoursesResponse {
  courses: LiveCourse[];
  total: number;
  sectionCount: number;
  term: string;
  termCode: string;
  terms: { active: TermInfo; registration: TermInfo };
  fetchedAt: string;
  stale: boolean;
}

interface Recommendation {
  code: string;
  name: string;
  department: string;
  credits: number;
  reason: string;
  careerImpact: string[];
  priority: string;
  offeredIn?: string[];
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

const PAGE_SIZE = 50;

function formatCredits(credits: number): string {
  return credits === 1 ? "1 credit" : `${credits} credits`;
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<{ recommendations: Recommendation[] } | null>(null);

  // Live schedule for the selected term (default: registration term)
  const [termCode, setTermCode] = useState<string | null>(null);
  const [data, setData] = useState<CoursesResponse | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const termCache = useRef<Map<string, CoursesResponse>>(new Map());
  const [terms, setTerms] = useState<{ active: TermInfo; registration: TermInfo } | null>(null);

  // Plan state for "Add to Plan" buttons
  const [userPlanCourses, setUserPlanCourses] = useState<PlanCourseSummary[]>([]);
  const planCourseCodes = new Set(userPlanCourses.map((c) => c.courseCode));

  const fetchUserPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/plans");
      if (res.ok) {
        const json = await res.json();
        setUserPlanCourses(json.plan?.plannedCourses ?? []);
      }
    } catch {
      // plan badges are supplementary
    }
  }, []);

  useEffect(() => {
    fetchUserPlan();
  }, [fetchUserPlan]);

  useEffect(() => {
    let cancelled = false;
    const cached = termCode ? termCache.current.get(termCode) : undefined;
    if (cached) {
      setData(cached);
      setLiveError(null);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    setLiveError(null);
    fetch(`/api/courses/davidson${termCode ? `?term=${encodeURIComponent(termCode)}` : ""}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (json?.terms) setTerms({ active: json.terms.active, registration: json.terms.registration });
        if (!res.ok || !json?.courses) {
          setLiveError(json?.error ?? "Could not load the Davidson course schedule. Please try again.");
          setData(null);
          return;
        }
        const resp = json as CoursesResponse;
        termCache.current.set(resp.termCode, resp);
        setData(resp);
        if (!termCode) setTermCode(resp.termCode);
      })
      .catch(() => {
        if (!cancelled) setLiveError("Could not reach the server. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [termCode]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [termCode, searchQuery, selectedAreas, selectedDepartments]);

  const liveCourses = data?.courses ?? [];

  const toggleArea = (id: string) => {
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  // Departments available from selected areas
  const areaDepartments: string[] = SUBJECT_AREAS.filter((a) =>
    selectedAreas.includes(a.id)
  ).flatMap((a) => [...a.departments]);

  const filteredCourses = liveCourses.filter((c) => {
    const matchesDept = selectedDepartments.length > 0
      ? selectedDepartments.includes(c.department)
      : areaDepartments.length > 0
        ? areaDepartments.includes(c.department)
        : true;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = q
      ? c.code.toLowerCase().includes(q) ||
        c.code.replace(" ", "").toLowerCase().includes(q.replace(/\s+/g, "")) ||
        c.name.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q) ||
        c.instructors.some((i) => i.toLowerCase().includes(q))
      : true;
    return matchesDept && matchesSearch;
  }).sort((a, b) => {
    const aNum = parseInt(a.code.replace(/\D+/g, ""), 10) || 0;
    const bNum = parseInt(b.code.replace(/\D+/g, ""), 10) || 0;
    return aNum - bNum || a.code.localeCompare(b.code);
  });

  const filteredSectionCount = filteredCourses.reduce((n, c) => n + c.sections, 0);

  const departments = Array.from(
    new Set(liveCourses.map((c) => c.department))
  ).sort();

  function onPlanUpdated(planned: PlanCourseSummary[]) {
    setUserPlanCourses(planned);
  }

  async function getRecommendations() {
    setLoading(true);
    setRecError(null);
    try {
      const areaLabels = SUBJECT_AREAS.filter((a) =>
        selectedAreas.includes(a.id)
      ).map((a) => a.label);
      const interests = areaLabels.length > 0 ? areaLabels : [...selectedDepartments];

      if (interests.length === 0) {
        setRecError("Pick at least one interest area or department first.");
        setLoading(false);
        return;
      }

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
        const json = await res.json();
        setRecommendations(json.recommendations);
        setStep("recommendations");
      } else {
        const json = await res.json().catch(() => null);
        setRecError(json?.error ?? "Could not get recommendations right now.");
      }
    } catch (err) {
      console.error("Failed to get recommendations:", err);
      setRecError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  const termButtons = terms ? [terms.active, terms.registration] : [];

  return (
    <motion.div
      className="max-w-5xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#111111]">
            Explore Courses
          </h1>
          <p className="text-sm text-[#555555] mt-1.5 max-w-xl">
            Browse Davidson&apos;s live course schedule with official descriptions and prerequisites.
          </p>
        </div>

        {/* Term switch */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Term" data-testid="term-switch">
          {termButtons.map((t) => {
            const isSelected = (termCode ?? terms?.registration.code) === t.code;
            const tag = terms && t.code === terms.registration.code ? "registration" : "current term";
            return (
              <button
                key={t.code}
                type="button"
                aria-pressed={isSelected}
                data-term={t.code}
                onClick={() => setTermCode(t.code)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-davidson text-white border-davidson"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                }`}
              >
                {t.label}
                <span className={`ml-1.5 text-[11px] font-normal ${isSelected ? "text-white/80" : "text-gray-500"}`}>
                  {tag}
                </span>
              </button>
            );
          })}
          <span className="text-xs text-gray-500" data-testid="term-summary">
            {liveLoading ? (
              <Loader2 className="inline h-3.5 w-3.5 animate-spin text-gray-400" />
            ) : data ? (
              <>
                {data.term}: {data.total} courses · {data.sectionCount} sections
                {data.stale && " · showing the last saved copy (Davidson API not responding)"}
              </>
            ) : null}
          </span>
        </div>

        {liveError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {liveError}
          </div>
        )}
      </div>

      {/* Step indicator — tabs appear progressively */}
      <div className="flex items-center gap-1 text-sm border-b border-gray-100 pb-0">
        {[
          { key: "interests" as Step, label: "Select Interests", num: "1", visible: true },
          { key: "browse" as Step, label: "Browse Courses", num: "2", visible: selectedAreas.length > 0 || selectedDepartments.length > 0 || step === "browse" },
          { key: "recommendations" as Step, label: "AI Recommendations", num: "3", visible: !!recommendations || step === "recommendations" },
        ].filter((s) => s.visible).map((s) => (
          <button
            key={s.key}
            onClick={() => {
              if (s.key === "interests") setStep("interests");
              else if (s.key === "browse") setStep("browse");
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[#111111] mb-1">
                What areas interest you?
              </h2>
              <p className="text-sm text-[#555555]">
                Select one or more subject areas to filter the catalog, or browse everything.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedAreas([]);
                setSelectedDepartments([]);
                setStep("browse");
              }}
              className="border-gray-200"
            >
              Browse all {data ? `${data.total} ` : ""}courses
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SUBJECT_AREAS.map((area) => {
              const isSelected = selectedAreas.includes(area.id);
              const depts: string[] = [...area.departments];
              const courseCount = liveCourses.filter((c) => depts.includes(c.department)).length;
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
                    <h3 className={`font-serif font-semibold text-lg ${isSelected ? "" : "text-davidson"}`}>{area.label}</h3>
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

          {(selectedAreas.length > 0 || selectedDepartments.length > 0) && (
            <div className="flex flex-wrap gap-3 pt-1">
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
          {recError && <p className="text-sm text-red-600">{recError}</p>}
        </div>
      )}

      {/* Step 2: Browse Courses */}
      {step === "browse" && (
        <div className="space-y-5">
          {/* Search and filter bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, code, department, or instructor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-gray-200 focus:ring-gray-300 focus:border-gray-400"
              />
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1 sm:flex-none min-w-0">
                <select
                  value={selectedDepartments.length === 1 ? selectedDepartments[0] : ""}
                  onChange={(e) =>
                    setSelectedDepartments(e.target.value ? [e.target.value] : [])
                  }
                  className="appearance-none w-full h-10 rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400 cursor-pointer"
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
                disabled={loading || (selectedAreas.length === 0 && selectedDepartments.length === 0)}
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
          </div>
          {recError && <p className="text-sm text-red-600">{recError}</p>}

          {/* Results count */}
          <p className="text-xs text-gray-500" data-testid="results-count">
            {filteredCourses.length} course{filteredCourses.length !== 1 ? "s" : ""} ·{" "}
            {filteredSectionCount} section{filteredSectionCount !== 1 ? "s" : ""}
            {data ? ` in ${data.term}` : ""}
            {selectedDepartments.length > 0 && (
              <>
                {" "}·{" "}
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
            {filteredCourses.slice(0, visibleCount).map((course) => (
              <CourseCard
                key={`${data?.termCode}-${course.code}`}
                course={course}
                termCode={data?.termCode}
                inPlan={planCourseCodes.has(course.code)}
                onPlanUpdated={onPlanUpdated}
              />
            ))}
            {!liveLoading && !liveError && filteredCourses.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-6">
                No courses match. Try a different search or department.
              </p>
            )}
            {filteredCourses.length > visibleCount && (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-gray-500">
                  Showing {visibleCount} of {filteredCourses.length} courses.
                </p>
                <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, filteredCourses.length - visibleCount)} more
                </Button>
              </div>
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
                {(selectedAreas.length > 0
                  ? SUBJECT_AREAS.filter((a) => selectedAreas.includes(a.id)).map((a) => a.label)
                  : selectedDepartments
                ).join(", ")}
                . Only courses on the {terms ? `${terms.active.label} or ${terms.registration.label}` : "current"} schedule are shown.
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
            {recommendations.recommendations.length === 0 && (
              <p className="text-sm text-gray-500">No recommendations matched the live schedule. Try other interests.</p>
            )}
            {recommendations.recommendations.map((rec, i) => {
              // Exact code match only (no "closest course number" guessing)
              const match = liveCourses.find((c) => c.code === rec.code);

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
                            : "bg-gray-50 text-gray-500 border border-gray-100"
                      }`}
                    >
                      {rec.priority === "high"
                        ? "Must Take"
                        : rec.priority === "medium"
                          ? "Recommended"
                          : "Optional"}
                    </span>
                  </div>

                  {match ? (
                    <CourseCard
                      course={match}
                      termCode={data?.termCode}
                      aiReason={rec.reason}
                      aiCareerImpact={rec.careerImpact}
                      inPlan={planCourseCodes.has(match.code)}
                      onPlanUpdated={onPlanUpdated}
                    />
                  ) : (
                    /* Offered in the other live term only */
                    <div className="bg-white rounded-lg border border-gray-100 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-gray-50 text-gray-600">
                              {rec.code}
                            </span>
                            {rec.offeredIn && rec.offeredIn.length > 0 && (
                              <span className="text-xs text-gray-500">Offered {rec.offeredIn.join(", ")}</span>
                            )}
                          </div>
                          <h3 className="font-medium text-[15px] text-[#111111] mb-1">{rec.name}</h3>
                          <p className="text-sm text-[#555555] mb-2">{rec.reason}</p>
                        </div>
                        <AddToPlan
                          courseCode={rec.code}
                          courseName={rec.name}
                          credits={rec.credits}
                          inPlan={planCourseCodes.has(rec.code)}
                          onAdded={onPlanUpdated}
                        />
                      </div>
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

/* ===== Course card (live Davidson data only) ===== */
function CourseCard({
  course,
  termCode,
  aiReason,
  aiCareerImpact,
  inPlan,
  onPlanUpdated,
}: {
  course: LiveCourse;
  termCode?: string;
  aiReason?: string;
  aiCareerImpact?: string[];
  inPlan: boolean;
  onPlanUpdated: (planned: PlanCourseSummary[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    courseHighlights?: string;
    keyTopics?: string[];
    skillsGained?: string[];
    careerApplications?: string[];
  } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showAiModal) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [showAiModal]);

  const realInstructors = course.instructors.filter((i) => i !== "Staff");
  const gradReqs = course.gradRequirementLabels ?? [];

  async function fetchAiInsights() {
    if (aiInsights || loadingInsights) return;
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      // The server builds the prompt from its own copy of the live catalog;
      // shared insights cannot be regenerated by students.
      const res = await fetch("/api/ai/course-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode: course.code, termCode }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setAiInsights(json.insights);
      } else {
        setInsightsError(json?.error ?? "AI insights are not available right now.");
      }
    } catch (err) {
      console.error("Failed to get AI insights:", err);
      setInsightsError("Could not reach the server.");
    } finally {
      setLoadingInsights(false);
    }
  }

  const deptColor = getDeptColor(course.department);

  return (
    <div
      onClick={() => { if (!expanded) setExpanded(true); }}
      data-testid="course-card"
      data-code={course.code}
      className={`bg-white rounded-lg border-l-[3px] border border-gray-100 transition-all ${expanded ? "shadow-sm border-gray-200" : "cursor-pointer hover:border-gray-200"} ${deptColor.border.replace("border-", "border-l-")}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`font-mono text-xs font-semibold px-2.5 py-1 rounded ${deptColor.bg} ${deptColor.text}`}>
                {course.code}
              </span>
              {gradReqs.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-[#555555] font-medium">
                  {gradReqs.join(", ")}
                </span>
              )}
              <span className="text-xs text-gray-500">{formatCredits(course.credits)}</span>
              <span className="text-xs text-gray-500">
                {course.sections} section{course.sections !== 1 ? "s" : ""}
              </span>
            </div>
            <h3 className="font-medium text-[15px] text-[#111111] mb-1">
              {course.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
              <span>{course.department}</span>
              {realInstructors.length > 0 && (
                <span>
                  · {realInstructors.slice(0, 2).join(", ")}
                  {realInstructors.length > 2 ? ` +${realInstructors.length - 2}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
            <AddToPlan
              courseCode={course.code}
              courseName={course.name}
              credits={course.credits}
              inPlan={inPlan}
              onAdded={onPlanUpdated}
            />
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              aria-label={expanded ? "Collapse course details" : "Expand course details"}
              aria-expanded={expanded}
              className="shrink-0 p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
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

              <p className="text-sm text-[#555555] leading-relaxed" data-testid="course-description">
                {course.description ||
                  (course.sectionList.some((s) => s.description)
                    ? "Topics vary by section. Each section's title and description are listed below."
                    : "No description has been published for this course yet.")}
              </p>

              <div className="text-sm" data-testid="course-prerequisites">
                <span className="font-medium text-gray-700">Prerequisites (official): </span>
                <span className="text-[#555555]">{course.prerequisites || "None listed"}</span>
              </div>

              {/* Every section from the Davidson API */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                  <GraduationCap className="h-3 w-3" /> Sections
                </p>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100" data-testid="section-list">
                  {course.sectionList.map((s, i) => (
                    <li key={`${s.section}-${s.crn ?? i}`} className="px-3 py-2 text-xs text-[#555555] flex flex-wrap gap-x-4 gap-y-1">
                      <span className="font-semibold text-gray-700">Section {s.section || "?"}</span>
                      {s.title && s.title !== course.name && <span className="text-gray-700">{s.title}</span>}
                      <span>{s.instructors.length > 0 ? s.instructors.join(", ") : "Staff"}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.schedule}</span>
                      {s.location !== "TBA" && (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</span>
                      )}
                      {s.enrollment.max > 0 && (
                        <span>{s.enrollment.remaining} of {s.enrollment.max} seats open</span>
                      )}
                      {s.credits !== course.credits && <span>{formatCredits(s.credits)}</span>}
                      {s.description && <p className="basis-full text-[#555555] leading-relaxed">{s.description}</p>}
                    </li>
                  ))}
                </ul>
              </div>

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
                    className="fixed inset-0 z-[100]"
                  >
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]" onClick={(e) => { e.stopPropagation(); setShowAiModal(false); }} />
                    <div className="fixed inset-0 md:left-[240px] z-[101] overflow-y-auto p-4 md:p-8 py-[6vh]">
                    <div className="max-w-5xl mx-auto">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98, y: 12 }}
                      className="relative bg-[#F8F9FB] rounded-2xl shadow-2xl border border-gray-200 w-full max-h-[85vh] overflow-y-auto"
                    >
                      {/* Modal header */}
                      <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 mb-1">
                            <Sparkles className="h-5 w-5 text-davidson" />
                            <h2 className="font-serif font-semibold text-lg text-[#111111]">AI Deep Dive</h2>
                          </div>
                          <p className="text-sm text-[#555555] truncate">{course.code} · {course.name}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setShowAiModal(false); }} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Modal content */}
                      <div className="px-6 py-5 space-y-5">
                        <p className="text-xs text-gray-500">
                          AI-generated from the official course description. Check details with the department.
                        </p>
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
                            <p className="text-sm text-gray-500">{insightsError ?? "No insights available yet"}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                    </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>, document.body)}
            </div>
          )}
      </div>
    </div>
  );
}
