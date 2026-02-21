"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { MAJORS, CAREER_FIELDS } from "@/lib/utils";
import {
  BookOpen,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  GraduationCap,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Save,
  User as UserIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const MINORS = MAJORS.filter((m) => m !== "Undecided");

const CURRENT_YEARS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Graduate",
] as const;

const GRADUATION_YEARS = Array.from({ length: 8 }, (_, i) => 2024 + i);

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ProfileData {
  name: string;
  email: string;
  major: string;
  minor?: string;
  graduationYear: number;
  currentYear: "Freshman" | "Sophomore" | "Junior" | "Senior" | "Graduate";
  bio?: string;
  careerInterests: string[];
}

/* ------------------------------------------------------------------ */
/*  Animation variants                                                */
/* ------------------------------------------------------------------ */

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const { data: session } = useSession();

  // --------------- state ---------------
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Form state (only used in edit mode)
  const [form, setForm] = useState<ProfileData>({
    name: "",
    email: "",
    major: "Undecided",
    minor: undefined,
    graduationYear: new Date().getFullYear() + 4,
    currentYear: "Freshman",
    bio: "",
    careerInterests: [],
  });

  const [showMinorField, setShowMinorField] = useState(false);

  // --------------- data fetching ---------------
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      const u = data.user as ProfileData;
      setProfile(u);
      setForm({
        name: u.name ?? "",
        email: u.email ?? "",
        major: u.major ?? "Undecided",
        minor: u.minor ?? undefined,
        graduationYear: u.graduationYear ?? new Date().getFullYear() + 4,
        currentYear: u.currentYear ?? "Freshman",
        bio: u.bio ?? "",
        careerInterests: u.careerInterests ?? [],
      });
      setShowMinorField(!!u.minor);
    } catch {
      showToast("Could not load profile data.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // --------------- handlers ---------------
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const enterEditMode = () => {
    if (profile) {
      setForm({
        name: profile.name,
        email: profile.email,
        major: profile.major,
        minor: profile.minor,
        graduationYear: profile.graduationYear,
        currentYear: profile.currentYear,
        bio: profile.bio ?? "",
        careerInterests: [...profile.careerInterests],
      });
      setShowMinorField(!!profile.minor);
    }
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast("Name is required.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        major: form.major,
        minor: showMinorField ? form.minor || undefined : undefined,
        graduationYear: form.graduationYear,
        currentYear: form.currentYear,
        bio: form.bio?.trim() || undefined,
        careerInterests: form.careerInterests,
      };

      // Remove undefined keys so Mongo doesn't set them to null
      if (!payload.minor) delete payload.minor;
      if (!payload.bio) delete payload.bio;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");

      const data = await res.json();
      setProfile(data.user as ProfileData);
      setEditing(false);
      showToast("Profile updated successfully.", "success");
    } catch {
      showToast("Failed to save changes. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleCareerInterest = (interest: string) => {
    setForm((prev) => ({
      ...prev,
      careerInterests: prev.careerInterests.includes(interest)
        ? prev.careerInterests.filter((i) => i !== interest)
        : [...prev.careerInterests, interest],
    }));
  };

  const removeMinor = () => {
    setForm((prev) => ({ ...prev, minor: undefined }));
    setShowMinorField(false);
  };

  // --------------- derived ---------------
  const user = session?.user;
  const initials =
    (profile?.name ?? user?.name ?? "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  // --------------- loading / auth guard ---------------
  if (!user) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const displayProfile = profile ?? {
    name: user.name ?? "",
    email: user.email ?? "",
    major: "Undecided",
    minor: undefined,
    graduationYear: new Date().getFullYear() + 4,
    currentYear: "Freshman" as const,
    bio: "",
    careerInterests: [] as string[],
  };

  // ================================================================
  //  RENDER
  // ================================================================
  return (
    <motion.div
      className="max-w-2xl mx-auto space-y-6 pb-12"
      initial="initial"
      animate="animate"
      variants={stagger}
    >
      {/* ---- Toast ---- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
              toast.type === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {toast.type === "success" ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Page heading ---- */}
      <motion.div variants={fadeIn}>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Profile
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Your academic information and settings.
        </p>
      </motion.div>

      {/* ---- Profile card ---- */}
      <motion.div variants={fadeIn}>
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {/* Avatar header */}
          <div className="px-6 pt-6 pb-4 flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-sm">
                <span className="text-lg font-bold text-white">{initials}</span>
              </div>
              <div>
                {editing ? (
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="text-xl font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 transition-colors"
                    placeholder="Your name"
                  />
                ) : (
                  <h2 className="text-xl font-semibold text-gray-900">
                    {displayProfile.name}
                  </h2>
                )}
                <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5" />
                  {displayProfile.email}
                </p>
              </div>
            </div>

            {!editing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={enterEditMode}
                className="text-gray-600 border-gray-200 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="text-gray-600 border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* ---- Fields ---- */}
          <div className="px-6 py-5 space-y-5">
            {/* Major */}
            <FieldRow icon={GraduationCap} label="Major">
              {editing ? (
                <SelectInput
                  value={form.major}
                  onChange={(v) => setForm((f) => ({ ...f, major: v }))}
                  options={MAJORS as unknown as string[]}
                />
              ) : (
                <span className="text-sm text-gray-900">{displayProfile.major}</span>
              )}
            </FieldRow>

            {/* Minor */}
            <FieldRow icon={BookOpen} label="Minor">
              {editing ? (
                showMinorField ? (
                  <div className="flex items-center gap-2">
                    <SelectInput
                      value={form.minor ?? ""}
                      onChange={(v) => setForm((f) => ({ ...f, minor: v }))}
                      options={MINORS as unknown as string[]}
                      placeholder="Select a minor"
                    />
                    <button
                      type="button"
                      onClick={removeMinor}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove minor"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowMinorField(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a minor
                  </button>
                )
              ) : (
                <span className="text-sm text-gray-900">
                  {displayProfile.minor || (
                    <span className="text-gray-400">None</span>
                  )}
                </span>
              )}
            </FieldRow>

            {/* Current Year */}
            <FieldRow icon={UserIcon} label="Current Year">
              {editing ? (
                <SelectInput
                  value={form.currentYear}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      currentYear: v as ProfileData["currentYear"],
                    }))
                  }
                  options={CURRENT_YEARS as unknown as string[]}
                />
              ) : (
                <span className="text-sm text-gray-900">
                  {displayProfile.currentYear}
                </span>
              )}
            </FieldRow>

            {/* Graduation Year */}
            <FieldRow icon={Calendar} label="Graduation Year">
              {editing ? (
                <SelectInput
                  value={String(form.graduationYear)}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, graduationYear: Number(v) }))
                  }
                  options={GRADUATION_YEARS.map(String)}
                />
              ) : (
                <span className="text-sm text-gray-900">
                  {displayProfile.graduationYear}
                </span>
              )}
            </FieldRow>

            {/* Bio */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Bio
              </label>
              {editing ? (
                <textarea
                  value={form.bio ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bio: e.target.value }))
                  }
                  maxLength={500}
                  rows={3}
                  placeholder="Tell us a bit about yourself..."
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 resize-none transition-colors"
                />
              ) : (
                <p className="text-sm text-gray-900 leading-relaxed">
                  {displayProfile.bio || (
                    <span className="text-gray-400">No bio added yet.</span>
                  )}
                </p>
              )}
              {editing && (
                <p className="text-xs text-gray-400 text-right">
                  {(form.bio ?? "").length}/500
                </p>
              )}
            </div>

            {/* Career Interests */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                Career Interests
              </label>
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {(CAREER_FIELDS as unknown as string[]).map((field) => {
                    const selected = form.careerInterests.includes(field);
                    return (
                      <button
                        key={field}
                        type="button"
                        onClick={() => toggleCareerInterest(field)}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                          selected
                            ? "bg-rose-50 border-rose-200 text-rose-700"
                            : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                        {field}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {displayProfile.careerInterests.length > 0 ? (
                    displayProfile.careerInterests.map((interest) => (
                      <span
                        key={interest}
                        className="inline-flex items-center rounded-full bg-gray-50 border border-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                      >
                        {interest}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">
                      No career interests selected.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ---- Sign out card ---- */}
      <motion.div variants={fadeIn}>
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Sign Out</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Sign out of your MakeItSo account
              </p>
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
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper components                                                 */
/* ------------------------------------------------------------------ */

function FieldRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-[140px]">
        <Icon className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="relative inline-block w-full max-w-[220px] ml-auto">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 pl-3 pr-8 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 transition-colors"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
    </div>
  );
}
