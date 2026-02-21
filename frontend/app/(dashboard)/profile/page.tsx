"use client";

import { useSession, signOut } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Briefcase,
  Calendar,
  GraduationCap,
  LogOut,
  Mail,
  Sparkles,
  User as UserIcon,
} from "lucide-react";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;

  if (!user) return null;

  return (
    <motion.div
      className="max-w-2xl mx-auto space-y-6"
      initial="initial"
      animate="animate"
      variants={stagger}
    >
      <motion.div variants={fadeIn}>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <UserIcon className="h-5 w-5 text-white" />
          </div>
          Profile
        </h1>
        <p className="text-muted-foreground mt-2">Your academic information and settings.</p>
      </motion.div>

      <motion.div variants={fadeIn}>
        <Card className="shadow-sm overflow-hidden">
          {/* Profile header with gradient background */}
          <div className="h-24 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-600 relative">
            <div className="absolute -bottom-8 left-6">
              <div className="h-16 w-16 rounded-2xl bg-white shadow-lg flex items-center justify-center border-4 border-white">
                <span className="text-2xl font-bold gradient-text">
                  {user.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
            </div>
          </div>
          <CardContent className="pt-12 pb-6 px-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold">{user.name}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-t">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
                  <GraduationCap className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">College</p>
                  <p className="text-sm font-medium">Davidson College</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Class</p>
                  <p className="text-sm font-medium">Davidson Student</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Planning</p>
                  <p className="text-sm font-medium">AI-Assisted</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Powered by</p>
                  <p className="text-sm font-medium">MakeItSo AI</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeIn}>
        <Card className="border-violet-100 bg-gradient-to-r from-violet-50/30 to-indigo-50/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-violet-600" />
              </div>
              <h3 className="font-semibold text-sm">About MakeItSo</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              MakeItSo is an AI-powered course and career planner built specifically for Davidson College students.
              It connects your academic journey with career outcomes, helping you plan forward from your interests
              or backward from your dream career.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeIn}>
        <Card className="border-red-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Sign Out</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Sign out of your MakeItSo account</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
