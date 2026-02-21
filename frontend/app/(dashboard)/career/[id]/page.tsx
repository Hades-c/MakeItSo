"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Briefcase,
  Code2,
  DollarSign,
  GraduationCap,
  Heart,
  HeartHandshake,
  Landmark,
  Layers,
  Lightbulb,
  Loader2,
  Megaphone,
  Microscope,
  Newspaper,
  Palette,
  Rocket,
  Scale,
  Sparkles,
  Star,
  Sun,
  TreePine,
  TrendingUp,
  Users,
} from "lucide-react";
import { CAREER_PATHS } from "@/lib/career-paths";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Code2,
  BarChart3,
  TrendingUp,
  Lightbulb,
  Layers,
  Heart,
  Scale,
  Megaphone,
  Microscope,
  Landmark,
  Rocket,
  Palette,
  HeartHandshake,
  GraduationCap,
  Newspaper,
  TreePine,
};

type Tab = "overview" | "courses" | "summer" | "networking" | "ai-roadmap";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "courses", label: "Courses" },
  { id: "summer", label: "Summer Opportunities" },
  { id: "networking", label: "Networking" },
  { id: "ai-roadmap", label: "AI Roadmap" },
];

function formatSalary(amount: number): string {
  return `$${(amount / 1000).toFixed(0)}k`;
}

function DifficultyStars({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i <= level ? "text-amber-400 fill-amber-400" : "text-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

interface AiRoadmap {
  summary: string;
  semesters: Array<{
    semester: string;
    courses: Array<{ code: string; name: string; reason: string }>;
    activities: string[];
  }>;
  advice: string;
}

export default function CareerDetailPage() {
  const params = useParams();
  const careerPath = CAREER_PATHS.find((c) => c.id === params.id);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [aiRoadmap, setAiRoadmap] = useState<AiRoadmap | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  if (!careerPath) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Career path not found</h1>
        <p className="text-muted-foreground mb-4">
          The career path you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/career"
          className="text-red-800 hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Career Paths
        </Link>
      </div>
    );
  }

  const IconComponent = ICON_MAP[careerPath.icon] || Lightbulb;
  const maxSalary = 300000;

  async function generateAiRoadmap() {
    if (!careerPath) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/career-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          career: careerPath.title,
          major: "Undecided",
          classYear: "Freshman",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const plan = data.plan;
        // Transform the AI response into our roadmap format
        const semesters: AiRoadmap["semesters"] = [];
        const years = ["Freshman", "Sophomore", "Junior", "Senior"];
        for (const year of years) {
          const yearCourses = (plan.coursesToTake || []).filter(
            (c: { typicalYear: string }) => c.typicalYear === year
          );
          const yearActivities = (plan.thingsToDo || [])
            .filter((t: { classYear: string }) => t.classYear === year)
            .map((t: { activity: string }) => t.activity);
          if (yearCourses.length > 0 || yearActivities.length > 0) {
            semesters.push({
              semester: `${year} Year`,
              courses: yearCourses.map(
                (c: { code: string; name: string; reason: string }) => ({
                  code: c.code,
                  name: c.name,
                  reason: c.reason,
                })
              ),
              activities: yearActivities,
            });
          }
        }
        setAiRoadmap({
          summary: plan.careerInsights || "",
          semesters,
          advice: plan.recommendedMajor
            ? `Recommended Major: ${plan.recommendedMajor}`
            : "",
        });
      } else if (res.status === 401) {
        setAiError("Please sign in to generate an AI roadmap.");
      } else {
        setAiError("Failed to generate roadmap. Please try again.");
      }
    } catch {
      setAiError("Network error. Please check your connection.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Back link */}
      <Link
        href="/career"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Career Paths
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <IconComponent className="h-7 w-7 text-red-800" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {careerPath.title}
          </h1>
          <p className="text-muted-foreground mt-1">{careerPath.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {careerPath.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-800"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "ai-roadmap" && !aiRoadmap && !aiLoading) {
                  generateAiRoadmap();
                }
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-red-800 text-red-800"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <motion.div
          className="space-y-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* What You'll Do */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-red-800" />
              What You&apos;ll Do
            </h2>
            <ul className="space-y-2">
              {careerPath.whatYoullDo.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-800 mt-2 shrink-0" />
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* A Day in the Life */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              A Day in the Life
            </h2>
            <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 leading-relaxed">
              {careerPath.dayInLife}
            </div>
          </div>

          {/* Skills Required */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Skills Required</h2>
            <div className="flex flex-wrap gap-2">
              {careerPath.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Salary Range */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Salary Range
            </h2>
            <div className="bg-white border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl font-bold">
                  {formatSalary(careerPath.salaryRange.min)} –{" "}
                  {formatSalary(careerPath.salaryRange.max)}
                </span>
                <span className="text-xs text-muted-foreground">per year</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded-full"
                  style={{
                    width: `${(careerPath.salaryRange.max / maxSalary) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                <span>Entry Level</span>
                <span>Senior / Experienced</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Courses Tab */}
      {activeTab === "courses" && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-sm text-muted-foreground">
            Key Davidson courses that prepare you for a career in{" "}
            {careerPath.title.toLowerCase()}.
          </p>
          <div className="grid gap-3">
            {careerPath.courses.map((course) => (
              <div
                key={course.code}
                className="bg-white border rounded-xl p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen className="h-4 w-4 text-red-800" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-sm font-semibold text-red-800">
                          {course.code}
                        </span>
                      </div>
                      <h3 className="font-medium text-sm mb-1">
                        {course.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {course.description}
                      </p>
                      {course.bestProfessor && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Best Professor: {course.bestProfessor}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Difficulty
                    </span>
                    <DifficultyStars level={course.difficulty} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Summer Opportunities Tab */}
      {activeTab === "summer" && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-sm text-muted-foreground">
            Make the most of your summers to build experience in{" "}
            {careerPath.title.toLowerCase()}.
          </p>
          <div className="grid gap-3">
            {careerPath.summerOpportunities.map((opp, i) => (
              <div
                key={i}
                className="bg-white border rounded-xl p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Sun className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm">{opp.title}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                        {opp.type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {opp.description}
                    </p>
                    <p className="text-xs text-red-800 font-medium mt-2">
                      {opp.timing}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Networking Tab */}
      {activeTab === "networking" && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-sm text-muted-foreground">
            Key people and connections to build for a career in{" "}
            {careerPath.title.toLowerCase()}.
          </p>
          <div className="grid gap-3">
            {careerPath.networking.map((contact, i) => (
              <div
                key={i}
                className="bg-white border rounded-xl p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm">{contact.role}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                        {contact.type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {contact.description}
                    </p>
                    <p className="text-xs text-gray-600 mt-2 font-medium">
                      How to connect: {contact.howToConnect}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* AI Roadmap Tab */}
      {activeTab === "ai-roadmap" && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {aiLoading && (
            <div className="py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="h-7 w-7 text-red-800 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Generating Your AI Roadmap
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Our AI is analyzing Davidson&apos;s courses and career data to
                build a personalized roadmap for {careerPath.title}...
              </p>
            </div>
          )}

          {aiError && !aiLoading && (
            <div className="py-10 text-center">
              <p className="text-sm text-red-600 mb-4">{aiError}</p>
              <button
                onClick={generateAiRoadmap}
                className="px-4 py-2 rounded-lg bg-red-800 text-white text-sm font-medium hover:bg-red-900 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {aiRoadmap && !aiLoading && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-red-50 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-red-800 mt-0.5" />
                  <div>
                    <h3 className="font-semibold mb-1">AI Career Insights</h3>
                    {aiRoadmap.advice && (
                      <p className="text-sm font-medium text-red-800 mb-2">
                        {aiRoadmap.advice}
                      </p>
                    )}
                    <p className="text-sm text-gray-700">
                      {aiRoadmap.summary}
                    </p>
                  </div>
                </div>
              </div>

              {/* Semesters */}
              {aiRoadmap.semesters.map((sem, i) => (
                <div key={i}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <GraduationCap className="h-3.5 w-3.5" />
                    {sem.semester}
                  </h3>

                  {/* Courses */}
                  {sem.courses.length > 0 && (
                    <div className="grid gap-2 mb-3">
                      {sem.courses.map((course, j) => (
                        <div
                          key={j}
                          className="bg-white border rounded-lg p-4 flex items-start gap-3"
                        >
                          <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                            <BookOpen className="h-4 w-4 text-red-800" />
                          </div>
                          <div>
                            <span className="font-mono text-sm font-semibold">
                              {course.code}
                            </span>
                            <span className="text-sm text-gray-700 ml-2">
                              {course.name}
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {course.reason}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Activities */}
                  {sem.activities.length > 0 && (
                    <div className="space-y-1.5">
                      {sem.activities.map((activity, j) => (
                        <div
                          key={j}
                          className="flex items-center gap-2 text-sm text-gray-600"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                          {activity}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={generateAiRoadmap}
                className="text-sm text-red-800 hover:underline"
              >
                Regenerate Roadmap
              </button>
            </div>
          )}

          {!aiRoadmap && !aiLoading && !aiError && (
            <div className="py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-7 w-7 text-red-800" />
              </div>
              <h3 className="text-lg font-semibold mb-2">AI-Powered Roadmap</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Get a personalized semester-by-semester plan for pursuing{" "}
                {careerPath.title} at Davidson.
              </p>
              <button
                onClick={generateAiRoadmap}
                className="px-5 py-2.5 rounded-lg bg-red-800 text-white text-sm font-medium hover:bg-red-900 transition-colors inline-flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Generate Roadmap
              </button>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
