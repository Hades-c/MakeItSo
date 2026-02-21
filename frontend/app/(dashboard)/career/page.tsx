"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import * as LucideIcons from "lucide-react";
import {
  ArrowRight,
  DollarSign,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  CAREER_PATHS,
  CAREER_PATH_FILTERS,
  filterCareerPaths,
  type CareerFilter,
} from "@/lib/career-paths";

const ICON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Code2: { bg: "bg-blue-50", text: "text-blue-600", border: "hover:border-blue-200" },
  BarChart3: { bg: "bg-emerald-50", text: "text-emerald-600", border: "hover:border-emerald-200" },
  LineChart: { bg: "bg-violet-50", text: "text-violet-600", border: "hover:border-violet-200" },
  Users: { bg: "bg-amber-50", text: "text-amber-600", border: "hover:border-amber-200" },
  Layout: { bg: "bg-pink-50", text: "text-pink-600", border: "hover:border-pink-200" },
  Stethoscope: { bg: "bg-teal-50", text: "text-teal-600", border: "hover:border-teal-200" },
  Scale: { bg: "bg-indigo-50", text: "text-indigo-600", border: "hover:border-indigo-200" },
  Megaphone: { bg: "bg-orange-50", text: "text-orange-600", border: "hover:border-orange-200" },
  Microscope: { bg: "bg-cyan-50", text: "text-cyan-600", border: "hover:border-cyan-200" },
  Building2: { bg: "bg-slate-50", text: "text-slate-600", border: "hover:border-slate-200" },
  Rocket: { bg: "bg-rose-50", text: "text-rose-600", border: "hover:border-rose-200" },
  Newspaper: { bg: "bg-sky-50", text: "text-sky-600", border: "hover:border-sky-200" },
  Leaf: { bg: "bg-lime-50", text: "text-lime-600", border: "hover:border-lime-200" },
  Palette: { bg: "bg-fuchsia-50", text: "text-fuchsia-600", border: "hover:border-fuchsia-200" },
  Heart: { bg: "bg-red-50", text: "text-red-600", border: "hover:border-red-200" },
  GraduationCap: { bg: "bg-yellow-50", text: "text-yellow-600", border: "hover:border-yellow-200" },
};

const DEFAULT_COLOR = { bg: "bg-gray-50", text: "text-gray-600", border: "hover:border-gray-200" };

export default function CareerPage() {
  const [activeFilter, setActiveFilter] = useState<CareerFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = filterCareerPaths(CAREER_PATHS, activeFilter).filter((p) =>
    searchQuery
      ? p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  return (
    <motion.div
      className="max-w-5xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Career Paths</h1>
        <p className="text-sm text-gray-500 mt-1">
          Explore careers with courses, alumni connections, and AI-powered guidance.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search career paths..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CAREER_PATH_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeFilter === f
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 bg-white border border-gray-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((career, i) => {
            const iconName = career.icon as keyof typeof LucideIcons;
            const Icon = (LucideIcons[iconName] as LucideIcons.LucideIcon) || LucideIcons.Briefcase;
            const colors = ICON_COLORS[career.icon] || DEFAULT_COLOR;

            return (
              <motion.div
                key={career.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
              >
                <Link href={`/career/${career.id}`}>
                  <div className={`bg-white rounded-xl border border-gray-100 p-5 transition-all duration-200 hover:shadow-md ${colors.border} group`}>
                    <div className="flex items-start gap-4">
                      <div className={`h-10 w-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-5 w-5 ${colors.text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm text-gray-900">{career.title}</h3>
                          <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{career.description}</p>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-3 w-3 text-emerald-500" />
                          <span className="text-xs text-gray-500">
                            ${(career.salaryRange.min / 1000).toFixed(0)}k – ${(career.salaryRange.max / 1000).toFixed(0)}k
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {career.tags.map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <SlidersHorizontal className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No careers match your criteria.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => { setActiveFilter("All"); setSearchQuery(""); }}>Clear Filters</Button>
        </div>
      )}
    </motion.div>
  );
}
