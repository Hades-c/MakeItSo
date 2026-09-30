"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAJORS } from "@/lib/utils";

/** Stored values (the API's enum) with Davidson's own wording for display. */
const CLASS_YEARS = [
  { value: "Freshman", label: "First-year", yearsLeft: 3 },
  { value: "Sophomore", label: "Sophomore", yearsLeft: 2 },
  { value: "Junior", label: "Junior", yearsLeft: 1 },
  { value: "Senior", label: "Senior", yearsLeft: 0 },
] as const;

type ClassYear = (typeof CLASS_YEARS)[number]["value"];

/** Graduation (spring) year for a class standing today. A new academic year starts in July. */
function graduationYearFor(standing: ClassYear, today = new Date()): number {
  const springOfThisAcademicYear =
    today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear();
  const yearsLeft = CLASS_YEARS.find((y) => y.value === standing)?.yearsLeft ?? 3;
  return springOfThisAcademicYear + yearsLeft;
}

interface ApiErrorResponse {
  error?: { code?: string; message?: string; issues?: { path: string; message: string }[] };
}

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    major: "Undecided",
    currentYear: "Freshman" as ClassYear,
  });

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, graduationYear: graduationYearFor(form.currentYear) }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        setError(
          data?.error?.issues?.[0]?.message ?? data?.error?.message ?? "Registration failed",
        );
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (result?.error) {
        router.push("/login");
        return;
      }

      router.push("/today");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 md:p-8">
      <h1 className="text-xl font-strong">Create your account</h1>
      <p className="mt-1.5 text-sm text-fg-2">
        Plan your courses, your four years and what comes after.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-danger bg-danger-wash px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <Field id="name" label="Full name">
          <Input
            placeholder="Alex Johnson"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
            autoComplete="name"
          />
        </Field>
        <Field id="email" label="Email" hint="Use your Davidson email address.">
          <Input
            type="email"
            placeholder="you@davidson.edu"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field id="password" label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2 md:gap-3">
          <Select value={form.major} onValueChange={(v) => update("major", v)}>
            <Field id="major" label="Major">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </Field>
            <SelectContent>
              {MAJORS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={form.currentYear}
            onValueChange={(v) => update("currentYear", v as ClassYear)}
          >
            <Field id="class-year" label="Class year">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </Field>
            <SelectContent>
              {CLASS_YEARS.map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-fg-2">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
