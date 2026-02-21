"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Lightbulb,
  Loader2,
  Map,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { MAJORS } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Course {
  code: string;
  name: string;
  type: string;
  reason: string;
}

interface Semester {
  semester: string;
  courses: Course[];
}

interface RoadmapData {
  roadmap: Semester[];
  advice: string;
  totalCreditsRemaining: number;
  estimatedGraduation: string;
}

interface SavedRoadmap {
  data: RoadmapData;
  major: string;
  classYear: string;
  interests: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "makeItSo_savedRoadmap";

const CLASS_YEARS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

const TYPE_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "major-requirement": {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    dot: "bg-rose-400",
  },
  elective: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-400",
  },
  distribution: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
    dot: "bg-sky-400",
  },
};

const DEFAULT_TYPE_STYLE = {
  bg: "bg-gray-50",
  text: "text-gray-600",
  border: "border-gray-200",
  dot: "bg-gray-400",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSavedRoadmap(): SavedRoadmap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedRoadmap;
  } catch {
    return null;
  }
}

function saveRoadmap(saved: SavedRoadmap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function clearSavedRoadmap() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatTypeLabel(type: string): string {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} />
  );
}

function LoadingSkeleton() {
  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Summary skeleton */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-3">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-3 w-72" />
          </div>
        </div>
        <SkeletonBlock className="h-16 w-full" />
      </div>

      {/* Semester skeletons */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-3">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-8 w-8 rounded-lg" />
            <SkeletonBlock className="h-4 w-28" />
          </div>
          <div className="space-y-2 pt-2">
            {[0, 1, 2, 3].map((j) => (
              <SkeletonBlock key={j} className="h-16 w-full" />
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          onClick={onCancel}
        />
        {/* Dialog */}
        <motion.div
          className="relative bg-white rounded-2xl shadow-xl border border-gray-100 p-6 max-w-sm mx-4 w-full"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-1">{description}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onConfirm}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Course type badge
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] || DEFAULT_TYPE_STYLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text} ${style.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {formatTypeLabel(type)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RoadmapPage() {
  const { data: session } = useSession();

  // Form state
  const [selectedMajor, setSelectedMajor] = useState("");
  const [classYear, setClassYear] = useState<string>("Freshman");
  const [interests, setInterests] = useState("");
  const [specificity, setSpecificity] = useState(3);

  // Roadmap state
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ major: string; classYear: string; interests: string; generatedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSemesters, setExpandedSemesters] = useState<Set<number>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  // Confirmation state
  const [confirmAction, setConfirmAction] = useState<"regenerate" | "clear" | null>(null);

  // ---------------------------------------------------------------------------
  // Load saved roadmap on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const saved = loadSavedRoadmap();
    if (saved) {
      setRoadmap(saved.data);
      setSavedMeta({
        major: saved.major,
        classYear: saved.classYear,
        interests: saved.interests,
        generatedAt: saved.generatedAt,
      });
      // Expand first two semesters by default
      setExpandedSemesters(new Set([0, 1]));
    }
    setHydrated(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Generate roadmap
  // ---------------------------------------------------------------------------

  const generateRoadmap = useCallback(async () => {
    if (!selectedMajor) return;
    setLoading(true);
    setError(null);
    setRoadmap(null);
    setSavedMeta(null);

    try {
      const interestList = interests
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/ai/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          major: selectedMajor,
          completedCourses: [],
          classYear,
          interests: interestList,
          specificity,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const data: RoadmapData = json.roadmap;
        setRoadmap(data);

        const meta = {
          major: selectedMajor,
          classYear,
          interests,
          generatedAt: new Date().toISOString(),
        };
        setSavedMeta(meta);
        saveRoadmap({ data, ...meta });

        // Expand all semesters for the freshly generated roadmap
        setExpandedSemesters(new Set(data.roadmap.map((_, i) => i)));
      } else if (res.status === 401) {
        setError("You need to sign in before generating a roadmap.");
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Failed to generate roadmap. Please try again.");
      }
    } catch (err) {
      console.error("Failed to generate roadmap:", err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedMajor, classYear, interests, specificity]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleRegenerate = () => setConfirmAction("regenerate");
  const handleClear = () => setConfirmAction("clear");

  const handleConfirm = () => {
    if (confirmAction === "regenerate") {
      // Keep form inputs populated from saved meta so user can tweak
      if (savedMeta) {
        setSelectedMajor(savedMeta.major);
        setClassYear(savedMeta.classYear);
        setInterests(savedMeta.interests);
      }
      clearSavedRoadmap();
      setRoadmap(null);
      setSavedMeta(null);
      setExpandedSemesters(new Set());
    } else if (confirmAction === "clear") {
      clearSavedRoadmap();
      setRoadmap(null);
      setSavedMeta(null);
      setSelectedMajor("");
      setClassYear("Freshman");
      setInterests("");
      setExpandedSemesters(new Set());
    }
    setConfirmAction(null);
  };

  const toggleSemester = (index: number) => {
    setExpandedSemesters((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const expandAll = () => {
    if (roadmap) {
      setExpandedSemesters(new Set(roadmap.roadmap.map((_, i) => i)));
    }
  };

  const collapseAll = () => setExpandedSemesters(new Set());

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const totalCourses = roadmap
    ? roadmap.roadmap.reduce((sum, sem) => sum + (sem.courses?.length || 0), 0)
    : 0;

  const showForm = !roadmap && !loading;

  // Don't render until hydrated to avoid mismatch with localStorage
  if (!hydrated) return null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <ConfirmDialog
        open={confirmAction === "regenerate"}
        title="Regenerate Roadmap?"
        description="This will discard your current saved roadmap and let you generate a new one. This action cannot be undone."
        confirmLabel="Regenerate"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "clear"}
        title="Clear Saved Roadmap?"
        description="This will remove your saved roadmap and return you to the setup form. You can always generate a new one."
        confirmLabel="Clear"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />

      <motion.div
        className="max-w-4xl mx-auto space-y-6 pb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ----------------------------------------------------------------- */}
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-gray-900">
            My Roadmap
          </h1>
          <p className="text-gray-500 mt-1.5">
            AI-generated semester-by-semester course plan tailored to your major and interests.
          </p>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Form: shown when no saved roadmap                                 */}
        {/* ----------------------------------------------------------------- */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="space-y-5"
          >
            {/* Major selection */}
            <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-rose-500" />
                  Select Your Major
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Choose your intended major to build a personalized course plan.
                </p>
              </div>

              <div className="relative max-w-sm">
                <select
                  value={selectedMajor}
                  onChange={(e) => setSelectedMajor(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-white pl-4 pr-10 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 transition-colors cursor-pointer"
                >
                  <option value="">Select a major...</option>
                  {MAJORS.filter((m) => m !== "Undecided").map((major) => (
                    <option key={major} value={major}>{major}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>

            {/* Class year & interests */}
            <div className="rounded-xl border border-gray-100 bg-white p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-rose-500" />
                  Your Details
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Help us personalize your roadmap even further.
                </p>
              </div>

              {/* Class year */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Class Year</label>
                <div className="flex flex-wrap gap-2">
                  {CLASS_YEARS.map((yr) => (
                    <button
                      key={yr}
                      onClick={() => setClassYear(yr)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                        classYear === yr
                          ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                          : "border-gray-100 bg-white text-gray-700 hover:border-rose-200 hover:bg-rose-50/40"
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interests */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Interests <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="e.g. machine learning, environmental policy, creative writing"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 transition-colors"
                />
                <p className="text-xs text-gray-400">
                  Separate multiple interests with commas. These help the AI suggest relevant electives.
                </p>
              </div>

              {/* Specificity slider */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">
                  Course Specificity
                </label>
                <div className="space-y-2">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={specificity}
                    onChange={(e) => setSpecificity(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-gray-900 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-900 [&::-webkit-slider-thumb]:shadow-sm"
                  />
                  <div className="flex justify-between text-[11px] text-gray-400">
                    <span>General</span>
                    <span>Balanced</span>
                    <span>Specific</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  {specificity <= 1 && "Slots labeled as \"Elective\" or \"Distribution Requirement\" — you choose the courses."}
                  {specificity === 2 && "Mostly general categories like \"Social Science Elective\" with core requirements named."}
                  {specificity === 3 && "A mix — specific courses for key requirements, general placeholders for flexible slots."}
                  {specificity === 4 && "Mostly specific Davidson courses with a few open elective slots."}
                  {specificity >= 5 && "Every slot filled with a specific Davidson course based on the AI's best judgment."}
                </p>
              </div>
            </div>

            {/* Generate button */}
            {selectedMajor && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Button
                  onClick={generateRoadmap}
                  className="bg-gray-900 hover:bg-gray-800 text-white shadow-sm h-11 px-6"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate My Roadmap
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            )}

            {/* Error shown below form */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-200 bg-red-50 p-5 flex items-start gap-3"
              >
                <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                  <X className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-800 text-sm">Something went wrong</h3>
                  <p className="text-sm text-red-600 mt-0.5">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="text-sm text-red-700 underline underline-offset-2 mt-2 hover:text-red-800"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Loading state                                                     */}
        {/* ----------------------------------------------------------------- */}
        {loading && (
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-100 bg-white p-10 text-center">
              <motion.div
                className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-50 flex items-center justify-center mx-auto mb-4"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
              >
                <Loader2 className="h-8 w-8 text-rose-500 animate-spin" />
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Building Your Roadmap
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Our AI is analyzing {selectedMajor} requirements and crafting your
                personalized semester-by-semester plan...
              </p>
            </div>
            <LoadingSkeleton />
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Roadmap display                                                   */}
        {/* ----------------------------------------------------------------- */}
        {roadmap && !loading && (
          <motion.div
            className="space-y-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {/* Summary card */}
            <div className="rounded-xl border border-gray-100 bg-white p-6">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-serif text-lg font-bold text-gray-900">
                      {savedMeta?.major} Roadmap
                    </h2>
                    {roadmap.estimatedGraduation && (
                      <Badge
                        variant="outline"
                        className="bg-gray-50 text-gray-600 border-gray-200 text-xs"
                      >
                        Est. Graduation: {roadmap.estimatedGraduation}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span>{roadmap.roadmap.length} semesters</span>
                    <span className="text-gray-300">|</span>
                    <span>{totalCourses} courses</span>
                    {savedMeta?.generatedAt && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>
                          Generated{" "}
                          {new Date(savedMeta.generatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  className="text-gray-600 border-gray-200 hover:bg-gray-50"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  className="text-gray-600 border-gray-200 hover:bg-gray-50"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
                <div className="flex-1" />
                <button
                  onClick={expandAll}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Expand all
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button
                  onClick={collapseAll}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Collapse all
                </button>
              </div>
            </div>

            {/* AI Advice */}
            {roadmap.advice && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-xl border border-amber-100 bg-amber-50/50 p-5 flex items-start gap-3"
              >
                <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900 text-sm">AI Advisor Note</h3>
                  <p className="text-sm text-amber-800 mt-0.5 leading-relaxed">
                    {roadmap.advice}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Type legend */}
            <div className="flex items-center gap-3 flex-wrap px-1">
              {Object.entries(TYPE_STYLES).map(([type, style]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  {formatTypeLabel(type)}
                </div>
              ))}
            </div>

            {/* Semester timeline */}
            <div className="space-y-3">
              {roadmap.roadmap.map((sem, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * i }}
                  className={`rounded-xl border bg-white transition-all duration-200 ${
                    expandedSemesters.has(i) ? "border-gray-200 shadow-sm" : "border-gray-100"
                  }`}
                >
                  {/* Semester header (clickable) */}
                  <button
                    onClick={() => toggleSemester(i)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="h-9 w-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-gray-500" />
                        </div>
                        {/* Semester number indicator */}
                        <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-sm text-gray-900">{sem.semester}</h3>
                        <p className="text-xs text-gray-400">
                          {sem.courses?.length || 0} course{sem.courses?.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Mini type summary when collapsed */}
                      {!expandedSemesters.has(i) && sem.courses && (
                        <div className="hidden sm:flex items-center gap-1">
                          {sem.courses.slice(0, 3).map((c, j) => {
                            const s = TYPE_STYLES[c.type] || DEFAULT_TYPE_STYLE;
                            return (
                              <span key={j} className={`h-2 w-2 rounded-full ${s.dot}`} />
                            );
                          })}
                          {sem.courses.length > 3 && (
                            <span className="text-[10px] text-gray-400 ml-0.5">
                              +{sem.courses.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      {expandedSemesters.has(i) ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded course list */}
                  <AnimatePresence>
                    {expandedSemesters.has(i) && sem.courses && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4">
                          <div className="border-t border-gray-100 pt-3 grid gap-2">
                            {sem.courses.map((course, j) => {
                              const style = TYPE_STYLES[course.type] || DEFAULT_TYPE_STYLE;
                              return (
                                <motion.div
                                  key={j}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.2, delay: 0.04 * j }}
                                  className={`flex items-start gap-3 p-3.5 rounded-lg border ${style.border} ${style.bg}`}
                                >
                                  <div className="h-8 w-8 rounded-md bg-white border border-gray-100 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                    <BookOpen className="h-4 w-4 text-gray-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                      <span className="font-mono text-xs font-bold text-gray-800">
                                        {course.code}
                                      </span>
                                      <TypeBadge type={course.type} />
                                    </div>
                                    <h4 className="text-sm font-medium text-gray-900">
                                      {course.name}
                                    </h4>
                                    {course.reason && (
                                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                        {course.reason}
                                      </p>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>

            {/* Footer / completion note */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="rounded-xl border border-gray-100 bg-gray-50 p-5 flex items-center gap-3"
            >
              <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Roadmap complete -- {totalCourses} courses across{" "}
                  {roadmap.roadmap.length} semesters
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  This plan is AI-generated. Always verify requirements with your academic advisor.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </>
  );
}
