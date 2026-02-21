"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import * as LucideIcons from "lucide-react";
import {
  ArrowRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  CAREER_PATHS,
  CAREER_PATH_FILTERS,
  filterCareerPaths,
  type CareerFilter,
} from "@/lib/career-paths";

const TAG_COLORS: Record<string, string> = {
  "High Salary": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Technical": "bg-blue-50 text-blue-700 border-blue-200",
  "Analytical": "bg-purple-50 text-purple-700 border-purple-200",
  "Leadership": "bg-amber-50 text-amber-700 border-amber-200",
  "Creative": "bg-pink-50 text-pink-700 border-pink-200",
  "Work-Life Balance": "bg-teal-50 text-teal-700 border-teal-200",
};

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
      className="max-w-5xl mx-auto"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="pt-4 pb-10 border-b border-gray-200">
        <h1 className="font-serif text-4xl tracking-tight text-[#111111]">
          Career Paths
        </h1>
        <p className="text-base text-[#555555] mt-3 max-w-2xl leading-relaxed">
          Explore careers with curated courses, alumni connections, and
          AI-powered guidance tailored to your interests.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="py-8 space-y-5">
        <div className="relative max-w-md">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search career paths..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-6 pr-4 py-2 bg-transparent border-b border-gray-300 text-sm text-[#111111] placeholder:text-gray-400 focus:outline-none focus:border-davidson transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CAREER_PATH_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 text-xs tracking-wide rounded-full border transition-colors ${
                activeFilter === f
                  ? f === "All"
                    ? "bg-davidson text-white border-davidson"
                    : TAG_COLORS[f] || "bg-davidson text-white border-davidson"
                  : "text-[#555555] border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="pb-4">
        <p className="text-xs text-gray-400 uppercase tracking-widest">
          {filtered.length} {filtered.length === 1 ? "path" : "paths"} found
        </p>
      </div>

      {/* Career card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((career, i) => {
            const iconName = career.icon as keyof typeof LucideIcons;
            const Icon =
              (LucideIcons[iconName] as LucideIcons.LucideIcon) ||
              LucideIcons.Briefcase;
            const salaryPercent = Math.min(
              100,
              (career.salaryRange.max / 200000) * 100
            );

            return (
              <motion.div
                key={career.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
              >
                <Link href={`/career/${career.id}`}>
                  <div className="group bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md hover:border-gray-200 transition-all h-full flex flex-col">
                    {/* Icon + Title */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg bg-davidson-light border border-davidson/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-davidson" />
                      </div>
                      <h3 className="font-serif text-lg text-[#111111] group-hover:text-davidson transition-colors leading-tight">
                        {career.title}
                      </h3>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-[#555555] leading-relaxed line-clamp-2 mb-4">
                      {career.description}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {career.tags.map((tag) => (
                        <span
                          key={tag}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                            TAG_COLORS[tag] ||
                            "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Salary bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
                        <span>
                          ${(career.salaryRange.min / 1000).toFixed(0)}k
                        </span>
                        <span>
                          ${(career.salaryRange.max / 1000).toFixed(0)}k
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-davidson/40 to-davidson rounded-full"
                          style={{ width: `${salaryPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Skills */}
                    <div className="flex flex-wrap gap-1 mb-4 mt-auto">
                      {career.skills.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-500 rounded border border-gray-100"
                        >
                          {skill}
                        </span>
                      ))}
                      {career.skills.length > 3 && (
                        <span className="text-[10px] px-2 py-0.5 text-gray-400">
                          +{career.skills.length - 3}
                        </span>
                      )}
                    </div>

                    {/* View link */}
                    <div className="flex items-center gap-1 text-xs font-medium text-davidson group-hover:gap-2 transition-all pt-3 border-t border-gray-50">
                      View <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20">
          <SlidersHorizontal className="h-6 w-6 text-gray-300 mx-auto mb-4" />
          <p className="text-sm text-[#555555] mb-4">
            No careers match your current criteria.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-navy text-navy hover:bg-navy hover:text-white transition-colors"
            onClick={() => {
              setActiveFilter("All");
              setSearchQuery("");
            }}
          >
            Clear Filters
          </Button>
        </div>
      )}
    </motion.div>
  );
}
