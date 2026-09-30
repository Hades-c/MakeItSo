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
