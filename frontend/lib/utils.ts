import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(credits: number): string {
  return credits === 1 ? "1 credit" : `${credits} credits`;
}

export function getSemesterLabel(semester: string, year: number): string {
  return `${semester} ${year}`;
}

export const SEMESTERS = ["Fall", "Spring", "Summer"] as const;
export type Semester = (typeof SEMESTERS)[number];

export const YEARS = [2024, 2025, 2026, 2027, 2028] as const;

export const CAREER_FIELDS = [
  "Software Engineering",
  "Data Science",
  "Product Management",
  "UX/UI Design",
  "Business Analysis",
  "Finance",
  "Marketing",
  "Research",
  "Healthcare",
  "Education",
  "Law",
  "Government & Policy",
  "Consulting",
  "Entrepreneurship",
  "Other",
] as const;

export const MAJORS = [
  "Computer Science",
  "Data Science",
  "Mathematics",
  "Statistics",
  "Economics",
  "Business Administration",
  "Psychology",
  "Biology",
  "Chemistry",
  "Physics",
  "English",
  "History",
  "Political Science",
  "Sociology",
  "Engineering",
  "Undecided",
  "Other",
] as const;
