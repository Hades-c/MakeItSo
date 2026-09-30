import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { academicYearEnd } from "@/server/auth/profile";
import { isMailAvailable } from "@/server/auth/mailer";
import { signedInUserOrNull } from "@/server/auth/pages";
import { now } from "@/server/clock";
import { RegisterForm, type ClassYearOption } from "./_components/register-form";

export const metadata: Metadata = { title: "Create an account" };

/**
 * /register (PLAN §1 "Sign-up", §3): new accounts are @davidson.edu only. Signed-in visitors go to /today. The
 * class-year choices are computed here from the server's "now" (the academic year rolls over on June 1, ET).
 */
export default async function RegisterPage() {
  if (await signedInUserOrNull()) redirect(routes.today());
  const end = academicYearEnd(now());
  const classYears: ClassYearOption[] = [
    { label: "First-year", graduationYear: end + 3 },
    { label: "Sophomore", graduationYear: end + 2 },
    { label: "Junior", graduationYear: end + 1 },
    { label: "Senior", graduationYear: end },
  ];
  return <RegisterForm classYears={classYears} mailAvailable={isMailAvailable()} />;
}
