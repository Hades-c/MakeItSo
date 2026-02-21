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
      <div className="max-w-4xl mx-auto py-20 text-center">
        <p className="text-gray-400 text-sm">Career path not found.</p>
        <Button variant="outline" size="sm" className="mt-6 text-xs border-gray-200 text-gray-500 hover:text-gray-900" asChild>
          <Link href="/career"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Careers</Link>
        </Button>
      </div>
    );
  }

  const iconName = careerPath.icon as keyof typeof LucideIcons;
  const Icon = (LucideIcons[iconName] as LucideIcons.LucideIcon) || Briefcase;
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
      className="max-w-4xl mx-auto space-y-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Breadcrumb */}
      <Link
        href="/career"
        className="inline-flex items-center gap-1.5 text-xs tracking-wide uppercase text-gray-400 hover:text-[#111827] transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Careers
      </Link>

      {/* Header */}
      <div className="flex items-start gap-5">
        <div className="h-11 w-11 rounded-lg border border-gray-200 bg-white flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-[#111827]" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#111827] leading-tight">
            {careerPath.title}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
            {careerPath.description}
          </p>
          <div className="flex items-center gap-4 pt-1">
            <span className="text-sm text-[#111827] font-medium tabular-nums">
              ${(careerPath.salaryRange.min / 1000).toFixed(0)}k &ndash; ${(careerPath.salaryRange.max / 1000).toFixed(0)}k
            </span>
            <span className="text-gray-200">|</span>
            <div className="flex gap-1.5">
              {careerPath.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] tracking-wide uppercase px-2 py-0.5 rounded border border-gray-200 text-gray-500 bg-white"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-gray-200" />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 pb-0 -mt-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-medium tracking-tight transition-colors ${
              activeTab === tab.id ? "text-[#111827]" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="career-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#111827] rounded-full"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Skills */}
          <section>
            <h2 className="font-serif text-lg font-semibold text-[#111827] mb-4">Key Skills</h2>
            <div className="flex flex-wrap gap-2">
              {careerPath.skills.map((skill) => (
                <span
                  key={skill}
                  className="text-xs px-3 py-1.5 text-gray-600 bg-gray-50 border border-gray-150 rounded"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>

          {/* What You'll Do */}
          <section>
            <h2 className="font-serif text-lg font-semibold text-[#111827] mb-4">What You&apos;ll Do</h2>
            <ul className="space-y-3">
              {careerPath.whatYoullDo.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600 leading-relaxed">
                  <Check className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Day in Life */}
          <section>
            <h2 className="font-serif text-lg font-semibold text-[#111827] mb-3">A Day in the Life</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{careerPath.dayInLife}</p>
          </section>
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === "courses" && (
        <div className="space-y-1">
          <p className="text-sm text-gray-500 mb-5">
            Recommended courses at Davidson for {careerPath.title.toLowerCase()}.
          </p>
          <div className="divide-y divide-gray-100">
            {careerPath.courses.map((course, i) => (
              <div key={i} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-xs font-semibold text-[#111827] tracking-wide">
                        {course.code}
                      </span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div
                            key={n}
                            className={`h-1 w-2 rounded-full ${
                              n <= course.difficulty ? "bg-[#111827]" : "bg-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <h3 className="font-medium text-sm text-[#111827]">{course.name}</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{course.description}</p>
                    {course.bestProfessor && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                        <GraduationCap className="h-3 w-3" /> {course.bestProfessor}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summer Tab */}
      {activeTab === "summer" && (
        <div className="space-y-1">
          <p className="text-sm text-gray-500 mb-5">
            Summer opportunities to build experience in {careerPath.title.toLowerCase()}.
          </p>
          <div className="divide-y divide-gray-100">
            {careerPath.summerOpportunities.map((opp, i) => (
              <div key={i} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded border border-gray-200 bg-white flex items-center justify-center shrink-0 mt-0.5">
                    <Sun className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 mb-0.5">
                      <h3 className="font-medium text-sm text-[#111827]">{opp.title}</h3>
                      <span className="text-[10px] tracking-wide uppercase px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 bg-white">
                        {opp.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{opp.description}</p>
                    <p className="text-xs text-[#111827] font-medium mt-1.5">{opp.timing}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Networking Tab */}
      {activeTab === "networking" && (
        <div className="space-y-10">
          {/* Davidson Alumni */}
          {careerAlumni.length > 0 && (
            <section>
              <h2 className="font-serif text-lg font-semibold text-[#111827] mb-5">
                Davidson Alumni in {careerPath.title}
              </h2>
              <div className="divide-y divide-gray-100">
                {careerAlumni.map((alumni) => (
                  <div key={alumni.name} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-full bg-[#111827] flex items-center justify-center text-white text-xs font-medium tracking-wide shrink-0">
                        {alumni.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <h4 className="font-medium text-sm text-[#111827]">{alumni.name}</h4>
                          <span className="text-xs text-gray-400">Class of {alumni.classYear}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {alumni.currentRole} &middot; {alumni.company}
                        </p>
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed">{alumni.bio}</p>
                        <div className="flex items-center gap-2.5 mt-3">
                          <a
                            href={alumni.linkedinSearch}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Linkedin className="h-3 w-3" /> Find on LinkedIn
                          </a>
                          <button
                            onClick={() => generateEmail(alumni)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                          >
                            <Mail className="h-3 w-3" /> Generate Cold Email
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* General Networking */}
          <section>
            <h2 className="font-serif text-lg font-semibold text-[#111827] mb-5">Networking Tips</h2>
            <div className="divide-y divide-gray-100">
              {careerPath.networking.map((contact, i) => (
                <div key={i} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded border border-gray-200 bg-white flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 mb-0.5">
                        <h4 className="font-medium text-xs text-[#111827]">{contact.role}</h4>
                        <span className="text-[10px] tracking-wide uppercase text-gray-400">{contact.type}</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{contact.description}</p>
                      <p className="text-xs text-[#111827] font-medium mt-1.5">{contact.howToConnect}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
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
              className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-[#111827]">
                    Cold Email for {selectedAlumni.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedAlumni.currentRole} at {selectedAlumni.company}
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedAlumni(null); setColdEmail(null); }}
                  className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              {emailLoading && (
                <div className="flex items-center gap-2.5 py-10 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-[#111827]" />
                  <span className="text-sm text-gray-500">Generating personalized email...</span>
                </div>
              )}

              {coldEmail && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-[10px] font-medium tracking-widest uppercase text-gray-400 mb-1.5">Subject</p>
                    <p className="text-sm font-medium text-[#111827]">{coldEmail.subject}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-[10px] font-medium tracking-widest uppercase text-gray-400 mb-1.5">Body</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{coldEmail.body}</p>
                  </div>
                  {coldEmail.tips && coldEmail.tips.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <p className="text-[10px] font-medium tracking-widest uppercase text-gray-400 mb-2">Tips</p>
                      <ul className="space-y-1.5">
                        {coldEmail.tips.map((tip, i) => (
                          <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                            <span className="text-gray-300 shrink-0 mt-0.5">&mdash;</span> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Button
                    onClick={copyEmail}
                    className="w-full bg-[#111827] hover:bg-[#1f2937] text-white rounded-lg"
                  >
                    {emailCopied ? (
                      <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied</>
                    ) : (
                      <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Email</>
                    )}
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
