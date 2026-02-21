"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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

function formatSalary(amount: number): string {
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${amount}`;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};

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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Career Paths
        </h1>
        <p className="text-muted-foreground mt-1">
          Explore careers and see how Davidson prepares you for each one.
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {CAREER_PATH_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              activeFilter === filter
                ? "bg-red-800 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Career cards grid */}
      <motion.div
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        initial="initial"
        animate="animate"
        variants={stagger}
        key={activeFilter}
      >
        {filteredPaths.map((career) => {
          const IconComponent = ICON_MAP[career.icon] || Lightbulb;
          const maxSalary = 300000;
          const salaryPercent = Math.round(
            ((career.salaryRange.max - career.salaryRange.min) / maxSalary) * 100
          );
          const salaryStart = Math.round(
            (career.salaryRange.min / maxSalary) * 100
          );

          return (
            <motion.div key={career.id} variants={fadeIn}>
              <Link href={`/career/${career.id}`} className="group block">
                <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-red-200 transition-all duration-300 h-full flex flex-col">
                  {/* Icon + Title */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <IconComponent className="h-5 w-5 text-red-800" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base group-hover:text-red-800 transition-colors">
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
                        className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600"
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
                      <span className="font-medium text-foreground">
                        {formatSalary(career.salaryRange.min)} – {formatSalary(career.salaryRange.max)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-800 rounded-full transition-all duration-500"
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
                  <div className="flex items-center text-sm font-medium text-red-800 group-hover:gap-2 transition-all duration-200">
                    <span>View</span>
                    <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      {filteredPaths.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No career paths match this filter.</p>
          <button
            onClick={() => setActiveFilter("All")}
            className="mt-2 text-sm text-red-800 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}
    </motion.div>
  );
}
