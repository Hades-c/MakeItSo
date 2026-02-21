"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import * as LucideIcons from "lucide-react";
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  ExternalLink,
  GraduationCap,
  Linkedin,
  Loader2,
  Mail,
  Sparkles,
  Star,
  Sun,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CAREER_PATHS } from "@/lib/career-paths";
import { getAlumniForCareer, type DavidsonAlumni } from "@/lib/davidson-alumni";
import { ActivitiesCarousel } from "@/components/activities-carousel";

const ICON_COLORS: Record<string, { bg: string; text: string }> = {
  Code2: { bg: "bg-blue-50", text: "text-blue-600" },
  BarChart3: { bg: "bg-emerald-50", text: "text-emerald-600" },
  LineChart: { bg: "bg-violet-50", text: "text-violet-600" },
  Users: { bg: "bg-amber-50", text: "text-amber-600" },
  Layout: { bg: "bg-pink-50", text: "text-pink-600" },
  Stethoscope: { bg: "bg-teal-50", text: "text-teal-600" },
  Scale: { bg: "bg-indigo-50", text: "text-indigo-600" },
  Megaphone: { bg: "bg-orange-50", text: "text-orange-600" },
  Microscope: { bg: "bg-cyan-50", text: "text-cyan-600" },
  Building2: { bg: "bg-slate-50", text: "text-slate-600" },
  Rocket: { bg: "bg-rose-50", text: "text-rose-600" },
  Newspaper: { bg: "bg-sky-50", text: "text-sky-600" },
  Leaf: { bg: "bg-lime-50", text: "text-lime-600" },
  Palette: { bg: "bg-fuchsia-50", text: "text-fuchsia-600" },
  Heart: { bg: "bg-red-50", text: "text-red-600" },
  GraduationCap: { bg: "bg-yellow-50", text: "text-yellow-600" },
};

type Tab = "overview" | "courses" | "summer" | "networking";

export default function CareerDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedAlumni, setSelectedAlumni] = useState<DavidsonAlumni | null>(null);
  const [coldEmail, setColdEmail] = useState<{ subject: string; body: string; tips: string[] } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const careerPath = CAREER_PATHS.find((c) => c.id === params.id);
  if (!careerPath) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center">
        <p className="text-gray-500">Career path not found.</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/career"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Careers</Link>
        </Button>
      </div>
    );
  }

  const iconName = careerPath.icon as keyof typeof LucideIcons;
  const Icon = (LucideIcons[iconName] as LucideIcons.LucideIcon) || Briefcase;
  const colors = ICON_COLORS[careerPath.icon] || { bg: "bg-gray-50", text: "text-gray-600" };
  const careerAlumni = getAlumniForCareer(careerPath.id);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "courses", label: "Courses" },
    { id: "summer", label: "Summer" },
    { id: "networking", label: `Alumni (${careerAlumni.length})` },
  ];

  async function generateEmail(alumni: DavidsonAlumni) {
    setSelectedAlumni(alumni);
    setColdEmail(null);
    setEmailLoading(true);
    try {
      const res = await fetch("/api/ai/cold-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alumniName: alumni.name,
          alumniRole: alumni.currentRole,
          alumniCompany: alumni.company,
          alumniBio: alumni.bio,
          alumniMajor: alumni.major,
          alumniClassYear: parseInt(alumni.classYear) || 0,
          studentName: session?.user?.name || "",
          studentMajor: "",
          studentClassYear: "Sophomore",
          careerField: careerPath?.title || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setColdEmail(data.email);
      }
    } catch {
      // silent fail
    } finally {
      setEmailLoading(false);
    }
  }

  function copyEmail() {
    if (!coldEmail) return;
    navigator.clipboard.writeText(`Subject: ${coldEmail.subject}\n\n${coldEmail.body}`);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  }

  return (
    <motion.div
      className="max-w-5xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Breadcrumb */}
      <Link href="/career" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Careers
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`h-12 w-12 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-6 w-6 ${colors.text}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{careerPath.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{careerPath.description}</p>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-sm text-emerald-600">
              <DollarSign className="h-3.5 w-3.5" />
              ${(careerPath.salaryRange.min / 1000).toFixed(0)}k – ${(careerPath.salaryRange.max / 1000).toFixed(0)}k
            </div>
            <div className="flex gap-1">
              {careerPath.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="career-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Skills */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Key Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {careerPath.skills.map((skill) => (
                <span key={skill} className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-100">{skill}</span>
              ))}
            </div>
          </div>

          {/* What You'll Do */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">What You&apos;ll Do</h3>
            <ul className="space-y-2">
              {careerPath.whatYoullDo.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <div className="h-5 w-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="h-3 w-3 text-emerald-600" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Day in Life */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">A Day in the Life</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{careerPath.dayInLife}</p>
          </div>
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === "courses" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 mb-3">
            Recommended courses at Davidson for {careerPath.title.toLowerCase()}.
          </p>
          {careerPath.courses.map((course, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs font-semibold text-gray-900">{course.code}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div key={n} className={`h-1 w-2 rounded-full ${n <= course.difficulty ? "bg-amber-400" : "bg-gray-100"}`} />
                      ))}
                    </div>
                  </div>
                  <h3 className="font-medium text-sm text-gray-900">{course.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{course.description}</p>
                  {course.bestProfessor && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                      <GraduationCap className="h-3 w-3" /> Best professor: {course.bestProfessor}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summer Tab */}
      {activeTab === "summer" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 mb-3">
            Summer opportunities to build experience in {careerPath.title.toLowerCase()}.
          </p>
          {careerPath.summerOpportunities.map((opp, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-all">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Sun className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-medium text-sm text-gray-900">{opp.title}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{opp.type}</span>
                  </div>
                  <p className="text-xs text-gray-500">{opp.description}</p>
                  <p className="text-xs text-rose-600 font-medium mt-1.5">{opp.timing}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Networking Tab */}
      {activeTab === "networking" && (
        <div className="space-y-6">
          {/* Davidson Alumni */}
          {careerAlumni.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Davidson Alumni in {careerPath.title}
              </h3>
              <div className="grid gap-2">
                {careerAlumni.map((alumni) => (
                  <div key={alumni.name} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                        {alumni.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-sm text-gray-900">{alumni.name}</h4>
                        <p className="text-xs text-gray-500">{alumni.currentRole}</p>
                        <p className="text-xs text-gray-400">{alumni.company} · Class of {alumni.classYear}</p>
                        <p className="text-xs text-gray-500 mt-1.5">{alumni.bio}</p>
                        <div className="flex items-center gap-2 mt-2.5">
                          <a
                            href={alumni.linkedinSearch}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Linkedin className="h-3 w-3" /> Find on LinkedIn
                          </a>
                          <button
                            onClick={() => generateEmail(alumni)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                          >
                            <Mail className="h-3 w-3" /> Generate Cold Email
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General Networking */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">General Networking Tips</h3>
            <div className="grid gap-2">
              {careerPath.networking.map((contact, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-gray-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-xs text-gray-900">{contact.role}</h4>
                      <p className="text-xs text-gray-400 mb-1">{contact.type}</p>
                      <p className="text-xs text-gray-500">{contact.description}</p>
                      <p className="text-xs text-rose-600 mt-1.5">{contact.howToConnect}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cold Email Modal */}
      <AnimatePresence>
        {selectedAlumni && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => { setSelectedAlumni(null); setColdEmail(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Cold Email for {selectedAlumni.name}</h3>
                  <p className="text-xs text-gray-500">{selectedAlumni.currentRole} at {selectedAlumni.company}</p>
                </div>
                <button onClick={() => { setSelectedAlumni(null); setColdEmail(null); }} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              {emailLoading && (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                  <span className="text-sm text-gray-500">Generating personalized email...</span>
                </div>
              )}

              {coldEmail && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-[10px] font-medium text-gray-400 mb-1">SUBJECT</p>
                    <p className="text-sm font-medium text-gray-900">{coldEmail.subject}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-[10px] font-medium text-gray-400 mb-1">BODY</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{coldEmail.body}</p>
                  </div>
                  {coldEmail.tips && coldEmail.tips.length > 0 && (
                    <div className="bg-amber-50 rounded-lg p-4">
                      <p className="text-[10px] font-medium text-amber-700 mb-1.5">TIPS</p>
                      <ul className="space-y-1">
                        {coldEmail.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                            <Sparkles className="h-3 w-3 mt-0.5 shrink-0" /> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Button onClick={copyEmail} className="w-full bg-gray-900 hover:bg-gray-800 text-white">
                    {emailCopied ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Email</>}
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activities Carousel */}
      <ActivitiesCarousel />
    </motion.div>
  );
}
