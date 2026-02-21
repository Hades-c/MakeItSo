"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Code2,
  DollarSign,
  GraduationCap,
  Heart,
  HeartHandshake,
  Landmark,
  Layers,
  Lightbulb,
  Megaphone,
  Microscope,
  Newspaper,
  Palette,
  Rocket,
  Scale,
  Sparkles,
  TreePine,
  TrendingUp,
} from "lucide-react";
import { CAREER_PATHS, CAREER_PATH_FILTERS, filterCareerPaths } from "@/lib/career-paths";
import type { CareerFilter } from "@/lib/career-paths";

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

const ICON_COLORS: Record<string, { gradient: string; shadow: string }> = {
  Code2: { gradient: "from-blue-500 to-indigo-600", shadow: "shadow-blue-500/20" },
  BarChart3: { gradient: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-500/20" },
  TrendingUp: { gradient: "from-green-500 to-emerald-600", shadow: "shadow-green-500/20" },
  Lightbulb: { gradient: "from-amber-500 to-orange-600", shadow: "shadow-amber-500/20" },
  Layers: { gradient: "from-violet-500 to-purple-600", shadow: "shadow-violet-500/20" },
  Heart: { gradient: "from-red-500 to-rose-600", shadow: "shadow-red-500/20" },
  Scale: { gradient: "from-slate-600 to-gray-700", shadow: "shadow-slate-600/20" },
  Megaphone: { gradient: "from-pink-500 to-rose-600", shadow: "shadow-pink-500/20" },
  Microscope: { gradient: "from-cyan-500 to-blue-600", shadow: "shadow-cyan-500/20" },
  Landmark: { gradient: "from-indigo-500 to-blue-600", shadow: "shadow-indigo-500/20" },
  Rocket: { gradient: "from-orange-500 to-red-600", shadow: "shadow-orange-500/20" },
  Palette: { gradient: "from-fuchsia-500 to-pink-600", shadow: "shadow-fuchsia-500/20" },
  HeartHandshake: { gradient: "from-teal-500 to-cyan-600", shadow: "shadow-teal-500/20" },
  GraduationCap: { gradient: "from-yellow-500 to-amber-600", shadow: "shadow-yellow-500/20" },
  Newspaper: { gradient: "from-gray-500 to-slate-600", shadow: "shadow-gray-500/20" },
  TreePine: { gradient: "from-green-600 to-emerald-700", shadow: "shadow-green-600/20" },
};

function formatSalary(amount: number): string {
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${amount}`;
}

export default function CareerPathsPage() {
  const [activeFilter, setActiveFilter] = useState<CareerFilter>("All");

  const filteredPaths = filterCareerPaths(CAREER_PATHS, activeFilter);

  return (
    <motion.div
      className="max-w-6xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-700 to-rose-600 flex items-center justify-center shadow-lg shadow-red-700/20 shrink-0">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Career Paths
          </h1>
          <p className="text-muted-foreground mt-0.5">
            Explore careers and see how Davidson prepares you for each one.
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {CAREER_PATH_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              activeFilter === filter
                ? "bg-[#0f1117] text-white shadow-sm"
                : "bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-50 border border-gray-200/60"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Career cards grid */}
      <AnimatePresence mode="wait">
        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          key={activeFilter}
        >
          {filteredPaths.map((career, i) => {
            const IconComponent = ICON_MAP[career.icon] || Lightbulb;
            const colors = ICON_COLORS[career.icon] || { gradient: "from-red-600 to-rose-600", shadow: "shadow-red-600/20" };
            const maxSalary = 300000;
            const salaryPercent = Math.round(
              ((career.salaryRange.max - career.salaryRange.min) / maxSalary) * 100
            );
            const salaryStart = Math.round(
              (career.salaryRange.min / maxSalary) * 100
            );

            return (
              <motion.div
                key={career.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={`/career/${career.id}`} className="group block h-full">
                  <div className="bg-white rounded-xl border border-gray-200/60 p-5 hover:shadow-xl hover:shadow-gray-200/50 hover:border-gray-300/60 transition-all duration-300 h-full flex flex-col">
                    {/* Icon + Title */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${colors.gradient} flex items-center justify-center shrink-0 shadow-md ${colors.shadow}`}>
                        <IconComponent className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base group-hover:text-gray-900 transition-colors leading-tight">
                          {career.title}
                        </h3>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {career.description}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {career.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Salary range */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          Salary Range
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatSalary(career.salaryRange.min)} – {formatSalary(career.salaryRange.max)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${colors.gradient} rounded-full transition-all duration-500`}
                          style={{
                            width: `${salaryStart + salaryPercent}%`,
                            marginLeft: `${salaryStart}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Skills */}
                    <div className="flex flex-wrap gap-1 mb-4 flex-1">
                      {career.skills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="text-[11px] text-gray-500"
                        >
                          {skill}{career.skills.indexOf(skill) < Math.min(career.skills.length, 4) - 1 ? " · " : ""}
                        </span>
                      ))}
                      {career.skills.length > 4 && (
                        <span className="text-[11px] text-gray-400">
                          +{career.skills.length - 4} more
                        </span>
                      )}
                    </div>

                    {/* View link */}
                    <div className="flex items-center text-sm font-medium text-gray-400 group-hover:text-gray-900 transition-all duration-200">
                      <span>Explore</span>
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {filteredPaths.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No career paths match this filter.</p>
          <button
            onClick={() => setActiveFilter("All")}
            className="mt-2 text-sm text-red-700 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}
    </motion.div>
  );
}
