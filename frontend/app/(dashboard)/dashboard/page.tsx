"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Compass,
  GraduationCap,
  Map,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <motion.div
      className="max-w-5xl mx-auto space-y-8"
      initial="initial"
      animate="animate"
      variants={stagger}
    >
      {/* Welcome header */}
      <motion.div variants={fadeIn}>
        <div className="flex items-center gap-2 text-sm text-red-800 font-medium mb-1">
          <Sparkles className="h-4 w-4" />
          {greeting}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Let&apos;s keep building your academic and career plan.
        </p>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={fadeIn} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Courses Available", value: "200+", icon: BookOpen, color: "emerald" },
          { label: "Career Paths", value: "16", icon: Target, color: "red" },
          { label: "AI-Powered", value: "Gemini", icon: Zap, color: "blue" },
          { label: "Made For", value: "Davidson", icon: GraduationCap, color: "rose" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-none shadow-sm bg-white">
            <CardContent className="p-4">
              <div className={`h-8 w-8 rounded-lg bg-${color}-50 flex items-center justify-center mb-3`}>
                <Icon className={`h-4 w-4 text-${color}-600`} />
              </div>
              <p className="text-xl font-bold tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-2 gap-4">
        <Link href="/explore" className="group">
          <Card className="h-full border-2 border-transparent hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-50 to-transparent rounded-full -translate-y-1/2 translate-x-1/4 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6 flex items-start gap-5 relative">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                <Compass className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg mb-1 group-hover:text-emerald-700 transition-colors">
                  Explore Courses
                  <ArrowRight className="inline ml-2 h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground">
                  Find your next courses based on your interests and see how they connect to careers.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/career" className="group">
          <Card className="h-full border-2 border-transparent hover:border-red-200 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-red-50 to-transparent rounded-full -translate-y-1/2 translate-x-1/4 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6 flex items-start gap-5 relative">
              <div className="h-12 w-12 rounded-xl bg-red-800 flex items-center justify-center shadow-lg shadow-red-800/20 shrink-0">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg mb-1 group-hover:text-red-800 transition-colors">
                  Career Paths
                  <ArrowRight className="inline ml-2 h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground">
                  Explore 16 career paths and see courses, skills, and opportunities for each.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </motion.div>

      {/* Features grid */}
      <motion.div variants={fadeIn} className="grid sm:grid-cols-3 gap-4">
        <Link href="/roadmap" className="group">
          <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-blue-200">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
                <Map className="h-5 w-5 text-blue-600" />
              </div>
              <CardTitle className="text-base group-hover:text-blue-700 transition-colors">
                My Roadmap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                AI-generated semester-by-semester course sequence optimized for your major.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/courses" className="group">
          <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-amber-200">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
                <GraduationCap className="h-5 w-5 text-amber-600" />
              </div>
              <CardTitle className="text-base group-hover:text-amber-700 transition-colors">
                Course Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage your 4-year course plan, track credits, and monitor degree progress.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/profile" className="group">
          <Card className="h-full hover:shadow-md transition-all duration-200 hover:border-rose-200">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-rose-50 flex items-center justify-center mb-2">
                <BookOpen className="h-5 w-5 text-rose-600" />
              </div>
              <CardTitle className="text-base group-hover:text-rose-700 transition-colors">
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Update your major, interests, and academic info.
              </p>
            </CardContent>
          </Card>
        </Link>
      </motion.div>

      {/* AI Insight card */}
      <motion.div variants={fadeIn}>
        <Card className="relative overflow-hidden border-red-100">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-red-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/4" />
          <CardContent className="relative p-6 flex items-start gap-5">
            <div className="h-10 w-10 rounded-lg bg-red-800 flex items-center justify-center shrink-0 shadow-md shadow-red-800/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Powered by AI</h3>
              <p className="text-sm text-muted-foreground mb-4">
                MakeItSo uses AI to analyze Davidson&apos;s course catalog, career data, and alumni patterns
                to give you personalized recommendations you won&apos;t find anywhere else.
              </p>
              <div className="flex gap-3">
                <Button size="sm" className="bg-red-800 hover:bg-red-900" asChild>
                  <Link href="/explore">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    Explore Courses
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/career">Browse Careers</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
