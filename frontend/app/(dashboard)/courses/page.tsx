"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  GraduationCap,
  Map,
  Sparkles,
} from "lucide-react";

export default function CoursesPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          Course Plan
        </h1>
        <p className="text-muted-foreground mt-2">
          Track your 4-year course plan and degree progress.
        </p>
      </div>

      {/* Empty state with beautiful call to action */}
      <Card className="border-2 border-dashed">
        <CardContent className="py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Start Building Your Plan</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Explore courses to find the right ones for your interests and career goals,
            or generate an AI roadmap for your major.
          </p>
          <div className="flex gap-3 justify-center">
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" asChild>
              <Link href="/explore">
                <Compass className="h-4 w-4 mr-2" />
                Explore Courses
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/roadmap">
                <Map className="h-4 w-4 mr-2" />
                Generate Roadmap
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-amber-100 bg-gradient-to-r from-amber-50/30 to-orange-50/30">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Coming Soon: Full Course Management</h3>
            <p className="text-sm text-muted-foreground">
              Soon you&apos;ll be able to add courses directly from the explorer, track prerequisites,
              manage your semester schedule, and monitor degree progress all in one place.
              For now, use the <Link href="/explore" className="text-violet-600 hover:underline">Explore</Link> and{" "}
              <Link href="/roadmap" className="text-violet-600 hover:underline">Roadmap</Link> features to plan your path.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
