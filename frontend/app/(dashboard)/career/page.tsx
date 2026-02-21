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
      className="max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="pt-4 pb-10 border-b border-gray-200">
        <h1 className="font-serif text-4xl tracking-tight text-[#111]">
          Career Paths
        </h1>
        <p className="text-base text-gray-500 mt-3 max-w-2xl leading-relaxed">
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
            className="w-full pl-6 pr-4 py-2 bg-transparent border-b border-gray-300 text-sm text-[#111] placeholder:text-gray-400 focus:outline-none focus:border-[#111] transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CAREER_PATH_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 text-xs tracking-wide transition-colors ${
                activeFilter === f
                  ? "bg-[#111] text-white"
                  : "text-gray-500 hover:text-[#111] bg-gray-100 hover:bg-gray-200"
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

      {/* Career listing */}
      <div className="divide-y divide-gray-100">
        <AnimatePresence mode="popLayout">
          {filtered.map((career, i) => {
            const iconName = career.icon as keyof typeof LucideIcons;
            const Icon =
              (LucideIcons[iconName] as LucideIcons.LucideIcon) ||
              LucideIcons.Briefcase;

            return (
              <motion.div
                key={career.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
              >
                <Link href={`/career/${career.id}`}>
                  <div className="group py-6 flex items-start gap-5 transition-colors hover:bg-gray-50/50 -mx-4 px-4 rounded">
                    {/* Icon */}
                    <div className="mt-1 shrink-0">
                      <Icon className="h-5 w-5 text-gray-400 group-hover:text-[#111] transition-colors" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-serif text-lg text-[#111] group-hover:underline underline-offset-4 decoration-gray-300">
                          {career.title}
                        </h3>
                        <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#111] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                      <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-3">
                        {career.description}
                      </p>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-400">
                          ${(career.salaryRange.min / 1000).toFixed(0)}k &ndash; $
                          {(career.salaryRange.max / 1000).toFixed(0)}k
                        </span>
                        <span className="text-gray-200">|</span>
                        <div className="flex flex-wrap gap-1.5">
                          {career.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[11px] px-2 py-0.5 text-gray-500 bg-gray-100"
                            >
                              {tag}
                            </span>
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

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20">
          <SlidersHorizontal className="h-6 w-6 text-gray-300 mx-auto mb-4" />
          <p className="text-sm text-gray-500 mb-4">
            No careers match your current criteria.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
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
