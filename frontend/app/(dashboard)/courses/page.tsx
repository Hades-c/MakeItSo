"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
  AlertCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlannedCourse {
  _id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  semester: "Fall" | "Spring" | "Summer";
  year: number;
  status: "planned" | "in-progress" | "completed" | "dropped";
  grade?: string;
  notes?: string;
}

interface CatalogCourse {
  _id: string;
  code: string;
  name: string;
  credits: number;
  department: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_CREDITS = 128;
const CREDITS_PER_COURSE = 4;
const REQUIRED_COURSES = REQUIRED_CREDITS / CREDITS_PER_COURSE; // 32

const STATUS_CONFIG: Record<
  PlannedCourse["status"],
  { label: string; dotClass: string; bgClass: string; textClass: string; borderClass: string }
> = {
  planned: {
    label: "Planned",
    dotClass: "bg-gray-400",
    bgClass: "bg-gray-50",
    textClass: "text-gray-600",
    borderClass: "border-gray-200",
  },
  "in-progress": {
    label: "In Progress",
    dotClass: "bg-blue-500",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-blue-200",
  },
  completed: {
    label: "Completed",
    dotClass: "bg-green-500",
    bgClass: "bg-green-50",
    textClass: "text-green-700",
    borderClass: "border-green-200",
  },
  dropped: {
    label: "Dropped",
    dotClass: "bg-red-500",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-red-200",
  },
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
    ACC: { bg: "bg-lime-50", text: "text-lime-700" },
    ENV: { bg: "bg-green-50", text: "text-green-700" },
    ANT: { bg: "bg-stone-100", text: "text-stone-600" },
    DIG: { bg: "bg-violet-50", text: "text-violet-600" },
  };
  return colors[dept] || { bg: "bg-gray-50", text: "text-gray-600" };
}

const SEMESTER_COLORS: Record<string, { accent: string; bg: string; text: string; icon: string; border: string }> = {
  Fall: { accent: "border-l-amber-400", bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-500", border: "border-amber-200" },
  Spring: { accent: "border-l-emerald-400", bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-500", border: "border-emerald-200" },
  Summer: { accent: "border-l-sky-400", bg: "bg-sky-50", text: "text-sky-700", icon: "text-sky-500", border: "border-sky-200" },
};

const SEMESTER_ORDER: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2 };

const GRADE_OPTIONS = [
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F", "Pass", "Fail",
];

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const modalOverlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalContent = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 12 },
};

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function CoursesPage() {
  // ---- State ----
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add course modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSemester, setAddSemester] = useState<"Fall" | "Spring" | "Summer">("Fall");
  const [addYear, setAddYear] = useState(new Date().getFullYear());
  const [catalogCourses, setCatalogCourses] = useState<CatalogCourse[]>([]);
  const [courseSearch, setCourseSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  // Grade modal
  const [gradeModal, setGradeModal] = useState<PlannedCourse | null>(null);
  const [selectedGrade, setSelectedGrade] = useState("");

  // Deleting / updating state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ---- Fetch plan ----
  const fetchPlan = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Failed to load course plan");
      const data = await res.json();
      setPlannedCourses(data.plan?.plannedCourses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // ---- Search catalog courses (debounced) ----
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchCourses = useCallback(async (query: string) => {
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/courses?${params}`);
      if (!res.ok) throw new Error("Failed to search courses");
      const data = await res.json();
      setCatalogCourses(data.courses ?? []);
    } catch {
      setCatalogCourses([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showAddModal) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchCourses(courseSearch), 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [courseSearch, showAddModal, searchCourses]);

  // Load initial catalog when modal opens
  useEffect(() => {
    if (showAddModal) searchCourses("");
  }, [showAddModal, searchCourses]);

  // ---- Actions ----

  const clearActionError = () => setActionError(null);

  const addCourse = async (courseId: string) => {
    setAdding(courseId);
    clearActionError();
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          semester: addSemester,
          year: addYear,
          status: "planned",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add course");
      }
      const data = await res.json();
      setPlannedCourses(data.plan?.plannedCourses ?? []);
      setShowAddModal(false);
      setCourseSearch("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add course");
    } finally {
      setAdding(null);
    }
  };

  const updateCourseStatus = async (pc: PlannedCourse, newStatus: PlannedCourse["status"]) => {
    setUpdatingId(pc._id);
    clearActionError();
    try {
      const res = await fetch("/api/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedCourseId: pc._id,
          updates: { status: newStatus },
        }),
      });
      if (!res.ok) throw new Error("Failed to update course");
      const data = await res.json();
      setPlannedCourses(data.plan?.plannedCourses ?? []);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update course");
    } finally {
      setUpdatingId(null);
    }
  };

  const setGrade = async () => {
    if (!gradeModal) return;
    setUpdatingId(gradeModal._id);
    clearActionError();
    try {
      const res = await fetch("/api/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedCourseId: gradeModal._id,
          updates: { status: "completed", grade: selectedGrade },
        }),
      });
      if (!res.ok) throw new Error("Failed to set grade");
      const data = await res.json();
      setPlannedCourses(data.plan?.plannedCourses ?? []);
      setGradeModal(null);
      setSelectedGrade("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to set grade");
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteCourse = async (plannedCourseId: string) => {
    setDeletingId(plannedCourseId);
    clearActionError();
    try {
      const res = await fetch("/api/plans", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedCourseId }),
      });
      if (!res.ok) throw new Error("Failed to remove course");
      const data = await res.json();
      setPlannedCourses(data.plan?.plannedCourses ?? []);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove course");
    } finally {
      setDeletingId(null);
    }
  };

  // ---- Derived data ----

  const semesterGroups = useMemo(() => {
    const groups: Record<string, PlannedCourse[]> = {};
    for (const pc of plannedCourses) {
      const key = `${pc.semester} ${pc.year}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(pc);
    }
    // Sort keys chronologically
    const sorted = Object.entries(groups).sort(([a], [b]) => {
      const [aSem, aYear] = a.split(" ");
      const [bSem, bYear] = b.split(" ");
      const yearDiff = Number(aYear) - Number(bYear);
      if (yearDiff !== 0) return yearDiff;
      return (SEMESTER_ORDER[aSem] ?? 0) - (SEMESTER_ORDER[bSem] ?? 0);
    });
    return sorted;
  }, [plannedCourses]);

  const stats = useMemo(() => {
    const completed = plannedCourses.filter((c) => c.status === "completed");
    const inProgress = plannedCourses.filter((c) => c.status === "in-progress");
    const planned = plannedCourses.filter((c) => c.status === "planned");
    const active = plannedCourses.filter((c) => c.status !== "dropped");

    const completedCredits = completed.length * CREDITS_PER_COURSE;
    const inProgressCredits = inProgress.length * CREDITS_PER_COURSE;
    const plannedCredits = planned.length * CREDITS_PER_COURSE;
    const activeCredits = active.length * CREDITS_PER_COURSE;

    return {
      completedCount: completed.length,
      inProgressCount: inProgress.length,
      plannedCount: planned.length,
      activeCount: active.length,
      completedCredits,
      inProgressCredits,
      plannedCredits,
      activeCredits,
      progressPercent: Math.min(
        100,
        Math.round((completedCredits / REQUIRED_CREDITS) * 100)
      ),
    };
  }, [plannedCourses]);

  // IDs of courses already in the plan (for filtering catalog)
  const plannedCourseIds = useMemo(
    () => new Set(plannedCourses.map((c) => c.courseId)),
    [plannedCourses]
  );

  // ---- Render helpers ----

  const isEmpty = plannedCourses.length === 0 && !loading;

  // ---- Year options for add modal ----
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i);

  // =========================================================================
  // RENDER
  // =========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[#111111] mb-1">
            Failed to load your course plan
          </h2>
          <p className="text-sm text-[#555555] mb-4">{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              fetchPlan();
            }}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        className="max-w-5xl mx-auto space-y-6"
        initial="initial"
        animate="animate"
        variants={stagger}
      >
        {/* ---- Header ---- */}
        <motion.div
          variants={fadeIn}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif tracking-tight flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-davidson flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              Course Plan
            </h1>
            <p className="text-[#555555] mt-1 text-sm">
              Plan your path to graduation at Davidson.
            </p>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-davidson hover:bg-davidson-dark text-white shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Course
          </Button>
        </motion.div>

        {/* ---- Action error toast ---- */}
        <AnimatePresence>
          {actionError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-sm text-red-700">{actionError}</span>
              </div>
              <button onClick={clearActionError} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Progress Card ---- */}
        <motion.div variants={fadeIn}>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold font-serif text-[#111111] flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-davidson" />
                Graduation Progress
              </h2>
              <span className="text-xs text-[#555555]">
                {REQUIRED_CREDITS} credits required ({REQUIRED_COURSES} courses)
              </span>
            </div>

            {/* Segmented progress bar */}
            <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-4 flex">
              <motion.div
                className="bg-green-500 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (stats.completedCredits / REQUIRED_CREDITS) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
              <motion.div
                className="bg-blue-400 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (stats.inProgressCredits / REQUIRED_CREDITS) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
              />
              <motion.div
                className="bg-gray-300 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (stats.plannedCredits / REQUIRED_CREDITS) * 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBlock
                label="Completed"
                courses={stats.completedCount}
                credits={stats.completedCredits}
                accent="text-green-600"
                bg="bg-green-50"
              />
              <StatBlock
                label="In Progress"
                courses={stats.inProgressCount}
                credits={stats.inProgressCredits}
                accent="text-blue-600"
                bg="bg-blue-50"
              />
              <StatBlock
                label="Planned"
                courses={stats.plannedCount}
                credits={stats.plannedCredits}
                accent="text-gray-600"
                bg="bg-gray-50"
              />
              <StatBlock
                label="Remaining"
                courses={Math.max(0, REQUIRED_COURSES - stats.activeCount)}
                credits={Math.max(0, REQUIRED_CREDITS - stats.activeCredits)}
                accent="text-davidson"
                bg="bg-davidson-light"
              />
            </div>
          </div>
        </motion.div>

        {/* ---- Empty State ---- */}
        {isEmpty && (
          <motion.div variants={fadeIn}>
            <div className="bg-white border border-gray-100 rounded-xl p-10 text-center shadow-sm">
              <div className="h-14 w-14 rounded-2xl bg-davidson-light border border-davidson/10 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="h-7 w-7 text-davidson/40" />
              </div>
              <h2 className="text-lg font-semibold font-serif text-[#111111] mb-1">
                No courses in your plan yet
              </h2>
              <p className="text-sm text-[#555555] mb-5 max-w-md mx-auto">
                Start building your four-year course plan. Search Davidson's catalog and add
                courses to each semester.
              </p>
              <Button
                onClick={() => setShowAddModal(true)}
                className="bg-davidson hover:bg-davidson-dark text-white"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Your First Course
              </Button>
            </div>
          </motion.div>
        )}

        {/* ---- Semester Sections ---- */}
        {semesterGroups.map(([semKey, courses]) => {
          const semName = semKey.split(" ")[0];
          const semColors = SEMESTER_COLORS[semName] || { accent: "border-l-gray-300", bg: "bg-gray-50", text: "text-gray-600", icon: "text-gray-400", border: "border-gray-200" };
          return (
          <motion.div key={semKey} variants={fadeIn}>
            <div className={`bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden border-l-4 ${semColors.accent}`}>
              {/* Semester header */}
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className={`h-4 w-4 ${semColors.icon}`} />
                  <h3 className="font-semibold font-serif text-sm text-[#111111]">{semKey}</h3>
                  <Badge className={`text-[10px] px-1.5 py-0 border-0 ${semColors.bg} ${semColors.text}`}>
                    {courses.length} {courses.length === 1 ? "course" : "courses"}
                  </Badge>
                </div>
                <span className="text-xs text-gray-400">
                  {courses.filter((c) => c.status !== "dropped").length * CREDITS_PER_COURSE} credits
                </span>
              </div>

              {/* Course list */}
              <div className="divide-y divide-gray-50">
                <AnimatePresence mode="popLayout">
                  {courses.map((pc) => {
                    const cfg = STATUS_CONFIG[pc.status];
                    const isDeleting = deletingId === pc._id;
                    const isUpdating = updatingId === pc._id;
                    const busy = isDeleting || isUpdating;

                    return (
                      <motion.div
                        key={pc._id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="px-5 py-3 flex items-center gap-3 group"
                      >
                        {/* Status dot */}
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dotClass}`}
                        />

                        {/* Course info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${getDeptColor(pc.courseCode).bg} ${getDeptColor(pc.courseCode).text}`}>
                              {pc.courseCode}
                            </span>
                            <span className="text-sm text-[#555555] truncate">
                              {pc.courseName}
                            </span>
                          </div>
                        </div>

                        {/* Grade badge if completed */}
                        {pc.status === "completed" && pc.grade && (
                          <Badge
                            variant="success"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {pc.grade}
                          </Badge>
                        )}

                        {/* Status badge */}
                        <Badge
                          className={`text-[10px] px-2 py-0.5 border ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`}
                        >
                          {cfg.label}
                        </Badge>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Status cycle dropdown */}
                          <StatusDropdown
                            current={pc.status}
                            disabled={busy}
                            onSelect={(s) => {
                              if (s === "completed") {
                                setGradeModal(pc);
                                setSelectedGrade(pc.grade ?? "");
                              } else {
                                updateCourseStatus(pc, s);
                              }
                            }}
                          />

                          {/* Delete */}
                          <button
                            disabled={busy}
                            onClick={() => deleteCourse(pc._id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Remove from plan"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
          );
        })}
      </motion.div>

      {/* ================================================================= */}
      {/* Add Course Modal */}
      {/* ================================================================= */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => {
                setShowAddModal(false);
                setCourseSearch("");
              }}
            />

            {/* Modal */}
            <motion.div
              variants={modalContent}
              className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden z-10"
            >
              {/* Modal header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h2 className="text-base font-semibold font-serif text-[#111111]">Add Course to Plan</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setCourseSearch("");
                  }}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Semester / year selectors */}
              <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-gray-500">Semester</label>
                  <select
                    value={addSemester}
                    onChange={(e) =>
                      setAddSemester(e.target.value as "Fall" | "Spring" | "Summer")
                    }
                    className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-davidson/20 focus:border-davidson"
                  >
                    <option value="Fall">Fall</option>
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-gray-500">Year</label>
                  <select
                    value={addYear}
                    onChange={(e) => setAddYear(Number(e.target.value))}
                    className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-davidson/20 focus:border-davidson"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Search input */}
              <div className="px-5 py-3 border-b border-gray-50 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by course code or name..."
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-davidson/20 focus:border-davidson transition-colors"
                  />
                </div>
              </div>

              {/* Course list */}
              <div className="flex-1 overflow-y-auto">
                {catalogLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : catalogCourses.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">
                    No courses found. Try a different search term.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {catalogCourses.map((c) => {
                      const alreadyAdded = plannedCourseIds.has(c._id);
                      const isAdding = adding === c._id;

                      return (
                        <div
                          key={c._id}
                          className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${getDeptColor(c.code).bg} ${getDeptColor(c.code).text}`}>
                                {c.code}
                              </span>
                              <span className="text-xs text-gray-400">{c.department}</span>
                            </div>
                            <p className="text-xs text-[#555555] truncate">{c.name}</p>
                          </div>

                          {alreadyAdded ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-2 py-0.5 text-gray-400"
                            >
                              <Check className="h-3 w-3 mr-0.5" />
                              Added
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isAdding}
                              onClick={() => addCourse(c._id)}
                              className="h-7 text-xs px-2.5 border-gray-200 hover:bg-davidson-light hover:text-davidson hover:border-davidson/20"
                            >
                              {isAdding ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/* Grade Modal */}
      {/* ================================================================= */}
      <AnimatePresence>
        {gradeModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => {
                setGradeModal(null);
                setSelectedGrade("");
              }}
            />

            <motion.div
              variants={modalContent}
              className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-sm p-5 z-10"
            >
              <h2 className="text-base font-semibold font-serif text-[#111111] mb-1">
                Mark as Completed
              </h2>
              <p className="text-sm text-[#555555] mb-4">
                Set a grade for{" "}
                <span className="font-medium text-gray-700">
                  {gradeModal.courseCode}
                </span>
              </p>

              <div className="grid grid-cols-5 gap-1.5 mb-5">
                {GRADE_OPTIONS.map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedGrade(g)}
                    className={`py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      selectedGrade === g
                        ? "bg-davidson-light border-davidson/30 text-davidson"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setGradeModal(null);
                    setSelectedGrade("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-davidson hover:bg-davidson-dark text-white"
                  disabled={!selectedGrade || updatingId === gradeModal._id}
                  onClick={setGrade}
                >
                  {updatingId === gradeModal._id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBlock({
  label,
  courses,
  credits,
  accent,
  bg,
}: {
  label: string;
  courses: number;
  credits: number;
  accent: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-lg p-3 border border-gray-100`}>
      <p className={`text-lg font-bold ${accent}`}>{courses}</p>
      <p className="text-xs font-medium text-gray-700">{label}</p>
      <p className="text-[10px] text-gray-400">{credits} credits</p>
    </div>
  );
}

function StatusDropdown({
  current,
  disabled,
  onSelect,
}: {
  current: PlannedCourse["status"];
  disabled: boolean;
  onSelect: (status: PlannedCourse["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const statuses: PlannedCourse["status"][] = [
    "planned",
    "in-progress",
    "completed",
    "dropped",
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
        title="Change status"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 w-36"
          >
            {statuses
              .filter((s) => s !== current)
              .map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => {
                      onSelect(s);
                      setOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors"
                  >
                    <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
                    {cfg.label}
                  </button>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
