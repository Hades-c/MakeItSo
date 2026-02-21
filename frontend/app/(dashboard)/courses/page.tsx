"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Calendar,
  Compass,
  GraduationCap,
  Map,
  Sparkles,
} from "lucide-react";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const semesters = [
  { label: "Freshman Fall", year: 1 },
  { label: "Freshman Spring", year: 1 },
  { label: "Sophomore Fall", year: 2 },
  { label: "Sophomore Spring", year: 2 },
  { label: "Junior Fall", year: 3 },
  { label: "Junior Spring", year: 3 },
  { label: "Senior Fall", year: 4 },
  { label: "Senior Spring", year: 4 },
];

export default function CoursesPage() {
  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-6"
      initial="initial"
      animate="animate"
      variants={stagger}
    >
      <motion.div variants={fadeIn}>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          Course Plan
        </h1>
        <p className="text-muted-foreground mt-2">
          Track your 4-year course plan and degree progress.
        </p>
      </motion.div>

      {/* 4-year visual plan */}
      <motion.div variants={fadeIn}>
        <div className="grid sm:grid-cols-2 gap-3">
          {semesters.map(({ label, year }) => (
            <Card key={label} className="hover:shadow-sm transition-all duration-200 group">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                    year === 1 ? "bg-emerald-50" :
                    year === 2 ? "bg-blue-50" :
                    year === 3 ? "bg-violet-50" :
                    "bg-amber-50"
                  }`}>
                    <Calendar className={`h-4 w-4 ${
                      year === 1 ? "text-emerald-600" :
                      year === 2 ? "text-blue-600" :
                      year === 3 ? "text-violet-600" :
                      "text-amber-600"
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{label}</h3>
                    <p className="text-xs text-muted-foreground">No courses added yet</p>
                  </div>
                </div>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center group-hover:border-gray-300 transition-colors">
                  <p className="text-xs text-muted-foreground">
                    Use Explore or Roadmap to add courses
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Action cards */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-2 gap-3">
        <Card className="border-emerald-100 hover:shadow-md transition-all duration-200">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
              <Compass className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">Explore Courses</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Browse Davidson&apos;s catalog with AI-powered recommendations and professor ratings.
              </p>
              <Button size="sm" className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" asChild>
                <Link href="/explore">
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                  Browse Courses
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 hover:shadow-md transition-all duration-200">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
              <Map className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">AI Roadmap</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Generate a complete semester-by-semester plan optimized for your major.
              </p>
              <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700" asChild>
                <Link href="/roadmap">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Generate Roadmap
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Degree requirements overview */}
      <motion.div variants={fadeIn}>
        <Card className="border-amber-100 bg-gradient-to-r from-amber-50/30 to-orange-50/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <GraduationCap className="h-4 w-4 text-amber-600" />
              </div>
              <h3 className="font-semibold text-sm">Davidson Degree Requirements</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Credits", value: "32", desc: "courses needed" },
                { label: "Major", value: "10-14", desc: "courses" },
                { label: "Distribution", value: "7", desc: "areas" },
                { label: "Cultural Diversity", value: "2", desc: "courses" },
              ].map(({ label, value, desc }) => (
                <div key={label} className="bg-white rounded-lg p-3 border border-amber-100">
                  <p className="text-lg font-bold text-amber-700">{value}</p>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
