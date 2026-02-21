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

export const YEARS = [2025, 2026, 2027, 2028, 2029] as const;

export const CAREER_FIELDS = [
  "Software Engineering",
  "Data Science & Analytics",
  "Finance & Banking",
  "Consulting",
  "Product Management",
  "Healthcare & Medicine",
  "Law",
  "Education",
  "Research & Academia",
  "Marketing & Communications",
  "Government & Policy",
  "Nonprofit & Social Impact",
  "Entrepreneurship",
  "Environmental Science",
  "Media & Journalism",
  "Arts & Design",
  "Other",
] as const;

// Real Davidson College majors
export const MAJORS = [
  "Africana Studies",
  "Anthropology",
  "Art",
  "Biology",
  "Chemistry",
  "Chinese Studies",
  "Classical Languages and Literature",
  "Classical Studies",
  "Communication Studies",
  "Computer Science",
  "East Asian Studies",
  "Economics",
  "Educational Studies",
  "English",
  "Environmental Studies",
  "Film/Media/Digital Studies",
  "French & Francophone Studies",
  "Gender & Sexuality Studies",
  "German Studies",
  "Hispanic Studies",
  "History",
  "Interdisciplinary Studies",
  "Mathematics",
  "Music",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Health",
  "Religious Studies",
  "Sociology",
  "Theatre",
  "Undecided",
] as const;

// Davidson departments mapped to subject areas for course browsing
export const DEPARTMENTS = [
  "Africana Studies",
  "Anthropology",
  "Art",
  "Biology",
  "Chemistry",
  "Chinese",
  "Classics",
  "Communication Studies",
  "Computer Science",
  "Dance",
  "Digital Studies",
  "Economics",
  "Educational Studies",
  "English",
  "Environmental Studies",
  "Film & Media Studies",
  "French",
  "Gender & Sexuality Studies",
  "German",
  "Hispanic Studies",
  "History",
  "Mathematics",
  "Music",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Health",
  "Religious Studies",
  "Sociology",
  "Theatre",
] as const;

// Subject area groupings for interest selection
export const SUBJECT_AREAS = [
  { id: "stem", label: "STEM", departments: ["Biology", "Chemistry", "Computer Science", "Mathematics", "Physics", "Environmental Studies"], color: "emerald" },
  { id: "social-sciences", label: "Social Sciences", departments: ["Anthropology", "Economics", "Educational Studies", "Political Science", "Psychology", "Sociology", "Public Health"], color: "blue" },
  { id: "humanities", label: "Humanities", departments: ["Classics", "English", "History", "Philosophy", "Religious Studies"], color: "purple" },
  { id: "arts", label: "Arts & Media", departments: ["Art", "Dance", "Film & Media Studies", "Music", "Theatre", "Digital Studies", "Communication Studies"], color: "rose" },
  { id: "languages", label: "Languages & Culture", departments: ["Chinese", "French", "German", "Hispanic Studies", "Africana Studies", "Gender & Sexuality Studies"], color: "amber" },
] as const;
