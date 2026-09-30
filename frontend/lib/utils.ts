import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge taught about the Lakeside theme (app/globals.css), so that e.g. `shadow-card` and `shadow-pop`
 * or `rounded-md` and `rounded-xl` are recognised as conflicting and the last one wins.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"],
      shadow: ["card", "pop"],
      radius: ["xs", "sm", "md", "lg", "xl", "2xl"],
      "font-weight": ["nav", "strong"],
      tracking: ["title", "label"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Davidson's majors, verbatim from the official programs page, plus "Undecided".
 * Source: https://www.davidson.edu/majors-minors-programs (the "Major" badges), verified 2026-09-30.
 * Interim list for sign-up: W1b replaces it with the official names from the Acalog catalog (PLAN §5).
 */
export const MAJORS_SOURCE = {
  url: "https://www.davidson.edu/majors-minors-programs",
  verifiedAt: "2026-09-30",
} as const;

export const MAJORS = [
  "Africana Studies",
  "Anthropology",
  "Arab Studies",
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
  "Film, Media, and Digital Studies",
  "French & Francophone Studies",
  "Gender & Sexuality Studies",
  "Genomics, Bioinformatics",
  "German Studies",
  "Global Literary Theory",
  "Hispanic Studies",
  "History",
  "Interdisciplinary Studies",
  "Latin American, Latinx, and Caribbean Studies",
  "Mathematics",
  "Music",
  "Philosophy",
  "Philosophy, Politics, and Economics",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Health",
  "Religious Studies",
  "Russian Studies",
  "Sociology",
  "Theatre",
  "Undecided",
] as const;
