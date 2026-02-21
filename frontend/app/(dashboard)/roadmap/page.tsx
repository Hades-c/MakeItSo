"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Loader2,
  Map,
  Sparkles,
  Star,
} from "lucide-react";
import { MAJORS } from "@/lib/utils";

interface RoadmapData {
  roadmap: Array<{
    semester: string;
    courses: Array<{
      code: string;
      name: string;
      type: string;
      reason: string;
    }>;
  }>;
  advice: string;
  totalCreditsRemaining: number;
  estimatedGraduation: string;
}

export default function RoadmapPage() {
  const { data: session } = useSession();
  const [selectedMajor, setSelectedMajor] = useState("");
  const [loading, setLoading] = useState(false);
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSemesters, setExpandedSemesters] = useState<Set<number>>(new Set([0, 1]));

  async function generateRoadmap() {
    if (!selectedMajor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          major: selectedMajor,
          completedCourses: [],
          classYear: "Freshman",
          interests: [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRoadmap(data.roadmap);
        setExpandedSemesters(new Set([0, 1]));
      } else if (res.status === 401) {
        setError("You need to sign in before generating a roadmap.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to generate roadmap. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate roadmap:", err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const toggleSemester = (i: number) => {
    setExpandedSemesters((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const typeColors: Record<string, string> = {
    "major-requirement": "bg-red-50 text-red-800 border-red-200",
    elective: "bg-emerald-50 text-emerald-700 border-emerald-200",
    distribution: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Map className="h-5 w-5 text-white" />
          </div>
          My Roadmap
        </h1>
        <p className="text-muted-foreground mt-2">
          AI-generated semester-by-semester course plan optimized for your major.
        </p>
      </div>

      {/* Major selection */}
      {!roadmap && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Your Major</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose your major to generate an optimized course roadmap through graduation.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {MAJORS.filter((m) => m !== "Undecided").map((major) => (
                <button
                  key={major}
                  onClick={() => setSelectedMajor(major)}
                  className={`p-3 rounded-lg border text-left text-sm font-medium transition-all duration-200 ${
                    selectedMajor === major
                      ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                      : "hover:border-blue-300 hover:bg-blue-50/50"
                  }`}
                >
                  {major}
                </button>
              ))}
            </div>

            {selectedMajor && (
              <Button
                onClick={generateRoadmap}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Roadmap
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card className="border-blue-100">
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Generating Your Roadmap</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Planning your optimal course sequence through graduation...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && !roadmap && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-10 text-center">
            <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Map className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1 text-red-800">Something went wrong</h3>
            <p className="text-sm text-red-600 mb-4 max-w-md mx-auto">{error}</p>
            <Button variant="outline" onClick={() => { setError(null); }}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Roadmap Results */}
      {roadmap && !loading && (
        <>
          {/* Summary */}
          <Card className="border-blue-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold">{selectedMajor} Roadmap</h3>
                  {roadmap.estimatedGraduation && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      Est. Graduation: {roadmap.estimatedGraduation}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{roadmap.advice}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setRoadmap(null)} className="shrink-0">
                New Major
              </Button>
            </CardContent>
          </Card>

          {/* Timeline */}
          <div className="space-y-3">
            {roadmap.roadmap?.map((sem, i) => (
              <Card key={i} className={`transition-all duration-200 ${expandedSemesters.has(i) ? "shadow-sm" : ""}`}>
                <button
                  onClick={() => toggleSemester(i)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-sm">{sem.semester}</h3>
                      <p className="text-xs text-muted-foreground">{sem.courses?.length || 0} courses</p>
                    </div>
                  </div>
                  {expandedSemesters.has(i) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {expandedSemesters.has(i) && sem.courses && (
                  <CardContent className="pt-0 pb-4 px-4">
                    <div className="grid gap-2 border-t pt-3">
                      {sem.courses.map((course, j) => (
                        <div key={j} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50/80">
                          <div className="h-7 w-7 rounded-md bg-white border flex items-center justify-center shrink-0 mt-0.5">
                            <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-xs font-semibold">{course.code}</span>
                              <Badge variant="outline" className={`text-[10px] ${typeColors[course.type] || "bg-gray-50 text-gray-700"}`}>
                                {course.type?.replace("-", " ")}
                              </Badge>
                            </div>
                            <h4 className="text-sm font-medium">{course.name}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">{course.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
