import "server-only";

/**
 * Name normalisation for RateMyProfessors matching (PLAN §5 "Ratings (RMP)"). Pure.
 *
 * Both sides (the course API's instructor names and RMP's roster names) go through the same function, so the
 * matcher compares like with like:
 *   - Unicode NFKD, combining marks removed (José → jose), a few letters without a decomposition folded
 *     (ø → o, ł → l, æ → ae, ß → ss);
 *   - lower case;
 *   - apostrophes of every kind removed, so O'Geen, O’Geen and RMP's doubled "O''Geen" all read "ogeen";
 *   - periods, hyphens, dashes, underscores, commas and slashes are token boundaries ("St. Clair" → "st clair",
 *     "Vaz-Hooper" → "vaz hooper"); any other punctuation is dropped;
 *   - whitespace collapsed and trimmed (RMP rows such as "Bond " or "Alesha ").
 */

const FOLD: Readonly<Record<string, string>> = {
  ø: "o",
  đ: "d",
  ð: "d",
  ł: "l",
  ħ: "h",
  ı: "i",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

const APOSTROPHES = /['‘’‛ʻʼʽ`´′]+/g;
const BOUNDARIES = /[.\-‐-―−_,/\\]+/g;

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[øđðłħıæœßþ]/g, (ch) => FOLD[ch] ?? ch)
    .replace(APOSTROPHES, "")
    .replace(BOUNDARIES, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalised tokens of a name part ("Villa Keith" → ["villa", "keith"]). */
export function nameTokens(raw: string): string[] {
  const normalized = normalizeName(raw);
  return normalized ? normalized.split(" ") : [];
}

/** Generational suffixes that are not part of a surname ("Smith Jr." → smith). */
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** Surname tokens without generational suffixes (kept when the suffix is the only token). */
export function surnameTokens(raw: string): string[] {
  const tokens = nameTokens(raw);
  const kept = tokens.filter((token) => !SUFFIXES.has(token));
  return kept.length > 0 ? kept : tokens;
}

/**
 * Surname particles. A surname match by token subset needs at least one shared token that is NOT one of these
 * (so "El Bejjani" never matches "El Amin" through "el", and "St Clair" never matches another "St ..." name).
 */
export const SURNAME_PARTICLES: ReadonlySet<string> = new Set([
  "al",
  "ben",
  "bin",
  "da",
  "das",
  "de",
  "del",
  "della",
  "der",
  "den",
  "di",
  "do",
  "dos",
  "du",
  "e",
  "el",
  "ibn",
  "la",
  "las",
  "le",
  "les",
  "lo",
  "los",
  "mac",
  "mc",
  "saint",
  "san",
  "santa",
  "st",
  "ste",
  "ter",
  "van",
  "von",
  "y",
]);

/** True for the "Staff" placeholder the course API uses for an unassigned instructor ("S Staff"). */
export function isStaffName(first: string, last: string): boolean {
  const lastNorm = normalizeName(last);
  const full = normalizeName(`${first} ${last}`);
  return lastNorm === "staff" || full === "staff" || full === "tba" || lastNorm === "tba";
}

/**
 * Tokens stored on each roster row (RmpTeacher.nameTokens) and used to pull candidates for an instructor: every
 * token of the first and last name plus the last name written as one word ("vazhooper", "stclair").
 */
export function indexTokens(first: string, last: string): string[] {
  const lastTokens = surnameTokens(last);
  const tokens = [...nameTokens(first), ...lastTokens];
  if (lastTokens.length > 1) tokens.push(lastTokens.join(""));
  return [...new Set(tokens)];
}

/** Tokens to look an instructor up by: the surname's tokens and the surname written as one word. */
export function lookupTokens(last: string): string[] {
  const tokens = surnameTokens(last);
  if (tokens.length > 1) tokens.push(tokens.join(""));
  return [...new Set(tokens)];
}
