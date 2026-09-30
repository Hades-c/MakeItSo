"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import * as LucideIcons from "lucide-react";
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Check,
  Copy,
  ExternalLink,
  Linkedin,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAREER_PATHS, formatUsd } from "@/lib/career-paths";
import type { DavidsonAlumni } from "@/lib/davidson-alumni";
import { ALUMNI_NETWORKING_ENABLED } from "@/lib/features";
import { termFromCode } from "@/lib/terms";
import { AddToPlan, type PlanCourseSummary } from "@/components/add-to-plan";

type Tab = "overview" | "courses" | "resources" | "networking" | "roadmap";

interface CareerPlan {
  recommendedMajor: string;
  coursesToTake: { code: string; name: string; reason: string; priority: string; typicalYear: string; courseType?: string; offeredIn?: string[] }[];
  peopleToMeet: { role: string; type: string; reason: string; suggestedTiming: string; howToFind: string }[];
  thingsToDo: { activity: string; type: string; reason: string; timing: string; classYear: string }[];
  careerInsights: string;
}

const ACTIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  internship: { bg: "bg-amber-50", text: "text-amber-700" },
  research: { bg: "bg-purple-50", text: "text-purple-700" },
  club: { bg: "bg-teal-50", text: "text-teal-700" },
  certification: { bg: "bg-blue-50", text: "text-blue-700" },
  project: { bg: "bg-pink-50", text: "text-pink-700" },
};

const YEAR_COLORS: Record<string, { bg: string; text: string }> = {
  Freshman: { bg: "bg-emerald-50", text: "text-emerald-700" },
  Sophomore: { bg: "bg-blue-50", text: "text-blue-700" },
  Junior: { bg: "bg-amber-50", text: "text-amber-700" },
  Senior: { bg: "bg-davidson-light", text: "text-davidson" },
};

const YEAR_ORDER: Record<string, number> = {
  Freshman: 0,
  Sophomore: 1,
  Junior: 2,
  Senior: 3,
};

const COURSE_TYPE_ORDER: Record<string, number> = {
  "major-requirement": 0,
  distribution: 1,
  elective: 2,
};

const COURSE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "major-requirement": { bg: "bg-davidson-light", text: "text-davidson", border: "border-davidson/20" },
  distribution: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  elective: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

const TAG_COLORS: Record<string, string> = {
  "Technical": "bg-blue-50 text-blue-700 border-blue-200",
  "Analytical": "bg-purple-50 text-purple-700 border-purple-200",
  "Leadership": "bg-amber-50 text-amber-700 border-amber-200",
  "Creative": "bg-pink-50 text-pink-700 border-pink-200",
  "Work-Life Balance": "bg-teal-50 text-teal-700 border-teal-200",
};

function getDeptColor(courseCode: string): { bg: string; text: string } {
  const dept = courseCode.split(" ")[0];
  const colors: Record<string, { bg: string; text: string }> = {
    CSC: { bg: "bg-blue-50", text: "text-blue-600" },
    MAT: { bg: "bg-purple-50", text: "text-purple-600" },
    ECO: { bg: "bg-emerald-50", text: "text-emerald-600" },
    BIO: { bg: "bg-green-50", text: "text-green-600" },
    CHE: { bg: "bg-orange-50", text: "text-orange-600" },
    PHI: { bg: "bg-indigo-50", text: "text-indigo-600" },
    PSY: { bg: "bg-pink-50", text: "text-pink-600" },
    POL: { bg: "bg-red-50", text: "text-red-600" },
    ENG: { bg: "bg-amber-50", text: "text-amber-600" },
    COM: { bg: "bg-cyan-50", text: "text-cyan-600" },
    SOC: { bg: "bg-teal-50", text: "text-teal-600" },
    ART: { bg: "bg-fuchsia-50", text: "text-fuchsia-600" },
    HIS: { bg: "bg-rose-50", text: "text-rose-600" },
    EDU: { bg: "bg-sky-50", text: "text-sky-600" },
    ENV: { bg: "bg-green-50", text: "text-green-700" },
    ANT: { bg: "bg-stone-100", text: "text-stone-600" },
    DIG: { bg: "bg-violet-50", text: "text-violet-600" },
  };
  return colors[dept] || { bg: "bg-gray-50", text: "text-gray-600" };
}

export default function CareerDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedAlumni, setSelectedAlumni] = useState<DavidsonAlumni | null>(null);
  const [coldEmail, setColdEmail] = useState<{ subject: string; body: string; tips: string[] } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [careerPlan, setCareerPlan] = useState<CareerPlan | null>(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState<string | null>(null);
  const [userPlanCourses, setUserPlanCourses] = useState<PlanCourseSummary[]>([]);

  const fetchUserPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/plans");
      if (res.ok) {
        const data = await res.json();
        setUserPlanCourses(data.plan?.plannedCourses ?? []);
      }
    } catch {
      // silent — plan fetch is supplementary
    }
  }, []);

  useEffect(() => {
    fetchUserPlan();
  }, [fetchUserPlan]);

  // Auto-load cached career plan when switching to the roadmap tab
  const roadmapFetched = useRef(false);
  useEffect(() => {
    if (activeTab === "roadmap" && !careerPlan && !roadmapLoading && !roadmapFetched.current) {
      roadmapFetched.current = true;
      generateRoadmap();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when cold email modal is open
  useEffect(() => {
    if (selectedAlumni) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [selectedAlumni]);

  const planCourseCodes = new Set(userPlanCourses.map((c) => c.courseCode));

  const careerPath = CAREER_PATHS.find((c) => c.id === params.id);
  if (!careerPath) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <p className="text-gray-400 text-sm">Career path not found.</p>
        <Button variant="outline" size="sm" className="mt-6 text-xs border-gray-200 text-gray-500 hover:text-gray-900" asChild>
          <Link href="/career"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Careers</Link>
        </Button>
      </div>
    );
  }

  const iconName = careerPath.icon as keyof typeof LucideIcons;
  const Icon = (LucideIcons[iconName] as LucideIcons.LucideIcon) || Briefcase;
  // Alumni data is not loaded while the networking feature is hidden
  // (lib/features.ts); the list below stays empty.
  const careerAlumni: DavidsonAlumni[] = [];
  // Term labels come from the verified course data (term codes), not literals.
  const courseTermLabels = Array.from(new Set(careerPath.courses.flatMap((c) => c.terms)))
    .sort()
    .map((code) => termFromCode(code)?.label)
    .filter((label): label is string => !!label);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "courses", label: "Courses" },
    { id: "resources", label: "Davidson Resources" },
    ...(ALUMNI_NETWORKING_ENABLED ? [{ id: "networking" as Tab, label: "Networking" }] : []),
    { id: "roadmap", label: "Roadmap" },
  ];

  async function generateRoadmap(regenerate = false) {
    setRoadmapLoading(true);
    setRoadmapError(null);
    if (regenerate) setCareerPlan(null);
    try {
      const completedCourses = userPlanCourses
        .filter((c) => c.status === "completed")
        .map((c) => c.courseCode);
      const res = await fetch("/api/ai/career-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          career: careerPath!.title,
          major: "Undecided",
          classYear: "Freshman",
          completedCourses,
          regenerate,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCareerPlan(data.plan);
      } else {
        const data = await res.json().catch(() => null);
        setRoadmapError(data?.error ?? "Failed to generate roadmap. Please try again.");
      }
    } catch {
      setRoadmapError("Failed to generate roadmap. Please try again.");
    } finally {
      setRoadmapLoading(false);
    }
  }

  async function generateEmail(alumni: DavidsonAlumni, regenerate = false) {
    if (!ALUMNI_NETWORKING_ENABLED) return;
    setSelectedAlumni(alumni);
    if (regenerate) setColdEmail(null);
    setEmailLoading(true);
    try {
      const res = await fetch("/api/ai/cold-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alumniName: alumni.name,
          alumniRole: alumni.currentRole,
          alumniCompany: alumni.company,
          alumniBio: alumni.bio,
          alumniMajor: alumni.major,
          alumniClassYear: parseInt(alumni.classYear) || 0,
          studentName: session?.user?.name || "",
          studentMajor: "",
          studentClassYear: "Sophomore",
          careerField: careerPath?.title || "",
          regenerate,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setColdEmail(data.email);
      }
    } catch {
      // silent fail
    } finally {
      setEmailLoading(false);
    }
  }

  function copyEmail() {
    if (!coldEmail) return;
    navigator.clipboard.writeText(`Subject: ${coldEmail.subject}\n\n${coldEmail.body}`);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  }

  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Breadcrumb */}
      <Link
        href="/career"
        className="inline-flex items-center gap-1.5 text-xs tracking-wide uppercase text-gray-400 hover:text-davidson transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Careers
      </Link>

      {/* Header */}
      <div className="flex items-start gap-5">
        <div className="h-11 w-11 rounded-lg border border-davidson/20 bg-davidson-light flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-davidson" />
        </div>
        <div className="space-y-2 min-w-0">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-navy leading-tight">
            {careerPath.title}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
            {careerPath.description}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <a
              href={careerPath.pay.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-davidson font-semibold tabular-nums hover:underline"
              title={careerPath.pay.occupation}
            >
              Median pay (BLS, {careerPath.pay.period}): {formatUsd(careerPath.pay.medianAnnual)}
              <ExternalLink className="inline h-3 w-3 ml-1 -mt-0.5" />
            </a>
            <div className="flex flex-wrap gap-1.5">
              {careerPath.tags.map((tag) => (
                <span
                  key={tag}
                  className={`text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full border ${TAG_COLORS[tag] || "bg-gray-50 text-gray-600 border-gray-200"}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-gray-500">
            Pay figure is the U.S. median for: {careerPath.pay.occupation}.
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-gray-200" />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 pb-0 -mt-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium tracking-tight transition-colors ${
              activeTab === tab.id ? "text-[#111111]" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="career-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-davidson rounded-full"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Skills */}
          <section>
            <h2 className="font-serif text-lg font-semibold text-navy mb-4">Key Skills</h2>
            <div className="flex flex-wrap gap-2">
              {careerPath.skills.map((skill) => (
                <span
                  key={skill}
                  className="text-xs px-3 py-1.5 text-navy bg-navy/5 border border-navy/10 rounded"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>

          {/* What You'll Do */}
          <section>
            <h2 className="font-serif text-lg font-semibold text-navy mb-4">What You&apos;ll Do</h2>
            <ul className="space-y-3">
              {careerPath.whatYoullDo.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600 leading-relaxed">
                  <Check className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Day in Life */}
          <section>
            <h2 className="font-serif text-lg font-semibold text-navy mb-3">A Day in the Life</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{careerPath.dayInLife}</p>
          </section>
        </div>
      )}

      {/* Courses Tab: verified Davidson courses with a section in the live terms */}
      {activeTab === "courses" && (
        <div className="space-y-1">
          <p className="text-sm text-gray-500 mb-5">
            Davidson courses that build skills for {careerPath.title.toLowerCase()}. Every course below has a
            section on the {courseTermLabels.join(" or ")} schedule; check the Courses page for times and prerequisites.
          </p>
          <div className="space-y-2">
            {careerPath.courses.map((course) => {
              const deptColor = getDeptColor(course.code);
              const offered = course.terms.map((t) => termFromCode(t)?.label).filter(Boolean);
              return (
                <div key={course.code} className="bg-white rounded-lg border border-gray-100 p-4" data-testid="career-course">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${deptColor.bg} ${deptColor.text}`}>
                          {course.code}
                        </span>
                        {offered.length > 0 && (
                          <span className="text-[11px] text-gray-500">Offered {offered.join(" · ")}</span>
                        )}
                      </div>
                      <h3 className="font-medium text-sm text-[#111111]">{course.title}</h3>
                      <p className="text-xs text-gray-600 leading-relaxed mt-1">{course.why}</p>
                    </div>
                    <div className="shrink-0 self-end sm:self-start">
                      <AddToPlan
                        courseCode={course.code}
                        courseName={course.title}
                        offeredIn={offered as string[]}
                        inPlan={planCourseCodes.has(course.code)}
                        onAdded={setUserPlanCourses}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Davidson Resources Tab (verified links) */}
      {activeTab === "resources" && (
        <div className="space-y-1">
          <p className="text-sm text-gray-500 mb-5">
            Davidson offices and programs that support students interested in {careerPath.title.toLowerCase()}.
          </p>
          <div className="divide-y divide-gray-100">
            {careerPath.davidsonResources.map((res) => (
              <div key={res.url} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded border border-gray-200 bg-white flex items-center justify-center shrink-0 mt-0.5">
                    <BookOpen className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm text-[#111111] hover:text-davidson hover:underline"
                    >
                      {res.name}
                      <ExternalLink className="inline h-3 w-3 ml-1 -mt-0.5 text-gray-400" />
                    </a>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{res.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Networking Tab: hidden while ALUMNI_NETWORKING_ENABLED is false */}
      {ALUMNI_NETWORKING_ENABLED && activeTab === "networking" && (
        <div className="space-y-10">
          {careerAlumni.length > 0 && (
            <section>
              <h2 className="font-serif text-lg font-semibold text-navy mb-5">
                Davidson Alumni in {careerPath.title}
              </h2>
              <div className="divide-y divide-gray-100">
                {careerAlumni.map((alumni) => (
                  <div key={alumni.name} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-full bg-davidson flex items-center justify-center text-white text-xs font-medium tracking-wide shrink-0">
                        {alumni.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <h4 className="font-medium text-sm text-[#111111]">{alumni.name}</h4>
                          <span className="text-xs text-gray-400">Class of {alumni.classYear}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {alumni.currentRole} &middot; {alumni.company}
                        </p>
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed">{alumni.bio}</p>
                        <div className="flex items-center gap-2.5 mt-3">
                          <a
                            href={alumni.linkedinSearch}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-davidson hover:text-davidson transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Linkedin className="h-3 w-3" /> Find on LinkedIn
                          </a>
                          <button
                            onClick={() => generateEmail(alumni)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-davidson hover:text-davidson transition-colors"
                          >
                            <Mail className="h-3 w-3" /> Generate Cold Email
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Roadmap Tab */}
      {activeTab === "roadmap" && (
        <div className="space-y-6">
          {roadmapLoading && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-100 rounded-xl p-8 text-center shadow-sm">
                <Loader2 className="h-6 w-6 animate-spin text-davidson mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading your career roadmap...</p>
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {roadmapError && (
            <div className="bg-white border border-red-200 rounded-xl p-8 text-center shadow-sm">
              <p className="text-sm text-red-600 mb-4">{roadmapError}</p>
              <Button
                onClick={() => generateRoadmap()}
                variant="outline"
                className="border-davidson text-davidson hover:bg-davidson-light"
              >
                Try Again
              </Button>
            </div>
          )}

          {careerPlan && (
            <div className="space-y-6">
              {/* Career Insights */}
              <div className="bg-gradient-to-r from-davidson-light to-white border border-davidson/10 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-davidson flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-serif text-sm font-semibold text-navy mb-1">Career Insights (AI-generated)</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{careerPlan.careerInsights}</p>
                    <p className="text-xs text-davidson font-medium mt-2">
                      Recommended Major: {careerPlan.recommendedMajor}
                    </p>
                  </div>
                </div>
              </div>

              {/* Courses to Take (server keeps only courses on the live schedule) */}
              <section>
                <h2 className="font-serif text-lg font-semibold text-navy mb-4 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-davidson" />
                  Recommended Courses
                </h2>
                <div className="grid gap-2">
                  {careerPlan.coursesToTake.length === 0 && (
                    <p className="text-sm text-gray-500">None of the AI&apos;s course suggestions are on the current schedule. See the Courses tab.</p>
                  )}
                  {[...careerPlan.coursesToTake].sort((a, b) => {
                    const typeA = COURSE_TYPE_ORDER[a.courseType ?? "elective"] ?? 99;
                    const typeB = COURSE_TYPE_ORDER[b.courseType ?? "elective"] ?? 99;
                    if (typeA !== typeB) return typeA - typeB;
                    const numA = parseInt(a.code.replace(/\D/g, "")) || 0;
                    const numB = parseInt(b.code.replace(/\D/g, "")) || 0;
                    return numA - numB;
                  }).map((course, i) => {
                    const ctColor = COURSE_TYPE_COLORS[course.courseType ?? "elective"] || COURSE_TYPE_COLORS.elective;
                    const yColor = YEAR_COLORS[course.typicalYear] || { bg: "bg-gray-50", text: "text-gray-600" };
                    const deptColor = getDeptColor(course.code);
                    return (
                      <div key={i} className="bg-white border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${deptColor.bg} ${deptColor.text}`}>
                                {course.code}
                              </span>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${ctColor.bg} ${ctColor.text} ${ctColor.border}`}>
                                {(course.courseType ?? "elective").replace("-", " ")}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded ${yColor.bg} ${yColor.text}`}>
                                {course.typicalYear}
                              </span>
                            </div>
                            <h4 className="font-medium text-sm text-[#111111]">{course.name}</h4>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{course.reason}</p>
                          </div>
                          <div className="shrink-0 self-end sm:self-start">
                            <AddToPlan
                              courseCode={course.code}
                              courseName={course.name}
                              offeredIn={course.offeredIn}
                              inPlan={planCourseCodes.has(course.code)}
                              onAdded={setUserPlanCourses}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Things to Do */}
              <section>
                <h2 className="font-serif text-lg font-semibold text-navy mb-4 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Activities & Experiences
                </h2>
                <div className="grid gap-2">
                  {[...careerPlan.thingsToDo].sort((a, b) => (YEAR_ORDER[a.classYear] ?? 99) - (YEAR_ORDER[b.classYear] ?? 99)).map((item, i) => {
                    const aColor = ACTIVITY_COLORS[item.type] || { bg: "bg-gray-50", text: "text-gray-600" };
                    const yColor = YEAR_COLORS[item.classYear] || { bg: "bg-gray-50", text: "text-gray-600" };
                    return (
                      <div key={i} className="bg-white border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${aColor.bg} ${aColor.text}`}>
                            {item.type}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded ${yColor.bg} ${yColor.text}`}>
                            {item.classYear}
                          </span>
                          <span className="text-[10px] text-gray-400">{item.timing}</span>
                        </div>
                        <h4 className="font-medium text-sm text-[#111111]">{item.activity}</h4>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.reason}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* People to Meet */}
              <section>
                <h2 className="font-serif text-lg font-semibold text-navy mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-500" />
                  People to Connect With
                </h2>
                <div className="grid gap-2">
                  {[...careerPlan.peopleToMeet].sort((a, b) => (YEAR_ORDER[a.suggestedTiming] ?? 99) - (YEAR_ORDER[b.suggestedTiming] ?? 99)).map((person, i) => {
                    const typeColor: Record<string, string> = {
                      alumni: "bg-davidson-light text-davidson",
                      faculty: "bg-navy/5 text-navy",
                      advisor: "bg-purple-50 text-purple-700",
                      professional: "bg-emerald-50 text-emerald-700",
                    };
                    const yColor = YEAR_COLORS[person.suggestedTiming] || { bg: "bg-gray-50", text: "text-gray-600" };
                    return (
                      <div key={i} className="bg-white border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${typeColor[person.type] || "bg-gray-50 text-gray-600"}`}>
                            {person.type}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded ${yColor.bg} ${yColor.text}`}>{person.suggestedTiming}</span>
                        </div>
                        <h4 className="font-medium text-sm text-[#111111]">{person.role}</h4>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{person.reason}</p>
                        <p className="text-xs text-navy font-medium mt-1.5">{person.howToFind}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Regenerate button (this plan is cached per student) */}
              <div className="text-center pt-2">
                <Button
                  onClick={() => generateRoadmap(true)}
                  variant="outline"
                  size="sm"
                  className="text-xs border-gray-200 text-gray-500 hover:text-davidson hover:border-davidson"
                >
                  <Sparkles className="h-3 w-3 mr-1.5" />
                  Regenerate Roadmap
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cold Email Modal (hidden while ALUMNI_NETWORKING_ENABLED is false) */}
      {ALUMNI_NETWORKING_ENABLED && typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {selectedAlumni && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
          >
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]"
              onClick={(e) => { e.stopPropagation(); setSelectedAlumni(null); setColdEmail(null); }}
            />
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-navy">
                    Cold Email for {selectedAlumni.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedAlumni.currentRole} at {selectedAlumni.company}
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedAlumni(null); setColdEmail(null); }}
                  className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              {emailLoading && (
                <div className="flex items-center gap-2.5 py-10 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-davidson" />
                  <span className="text-sm text-gray-500">Generating personalized email...</span>
                </div>
              )}

              {coldEmail && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-[10px] font-medium tracking-widest uppercase text-gray-400 mb-1.5">Subject</p>
                    <p className="text-sm font-medium text-[#111111]">{coldEmail.subject}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-[10px] font-medium tracking-widest uppercase text-gray-400 mb-1.5">Body</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{coldEmail.body}</p>
                  </div>
                  {coldEmail.tips && coldEmail.tips.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <p className="text-[10px] font-medium tracking-widest uppercase text-gray-400 mb-2">Tips</p>
                      <ul className="space-y-1.5">
                        {coldEmail.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                            <span className="text-gray-300 shrink-0 mt-0.5">&mdash;</span> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      onClick={copyEmail}
                      className="flex-1 bg-davidson hover:bg-davidson-dark text-white rounded-lg"
                    >
                      {emailCopied ? (
                        <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied</>
                      ) : (
                        <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Email</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { if (selectedAlumni) generateEmail(selectedAlumni, true); }}
                      disabled={emailLoading}
                      className="border-gray-200 text-gray-500 hover:text-davidson hover:border-davidson"
                    >
                      {emailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}

    </motion.div>
  );
}
