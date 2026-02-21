"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Mail, Sparkles, User as UserIcon } from "lucide-react";

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <UserIcon className="h-5 w-5 text-white" />
          </div>
          Profile
        </h1>
        <p className="text-muted-foreground mt-2">Your academic information and settings.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
              <span className="text-2xl font-bold text-violet-700">
                {user.name?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
            <div>
              <CardTitle className="text-xl">{user.name}</CardTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 py-4 border-t">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">College</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4 text-violet-500" />
                Davidson College
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Powered by</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-violet-500" />
                MakeItSo AI
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
