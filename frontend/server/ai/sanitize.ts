import "server-only";

/**
 * Post-validation of model text (PLAN §6.1 W6 "outputs are post-validated"): every string a model wrote goes
 * through here before it is cached or returned, and the UI renders it as text only.
 *   - links and e-mail addresses are removed (URLs, www.…, bare domains, addresses);
 *   - Markdown markers, control characters and repeated whitespace are removed;
 *   - lengths are enforced (cut at a sentence or word boundary, with "…");
 *   - sentences or list items that talk about prerequisites or eligibility (course codes a student must have taken,
 *     instructor permission, "requires", "background in"…), difficulty, workload or grades are dropped: the UI
 *     never shows model-written prerequisites, difficulty or workload (PLAN §5 "AI grounding"). Difficulty words
 *     (and "requires"/"required") that the official catalog description itself uses (a physics course about
 *     light, "an intensive writing course", "required weekly meetings") may be passed as `official` and are then
 *     not treated as the model's claims; prerequisite talk (codes, permission, "taken", "background in") never
 *     is.
 */

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]*[^\s<>"')\].,;:!?]/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const BARE_DOMAIN_PATTERN =
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|edu|net|io|gov|ly|co|us|info|me|app|dev|ai)\b(?:\/[^\s<>"')\]]*)?/gi;
const CONTROL_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E]/g;

/** Prerequisite and eligibility talk: never from a model (the official prerequisite text is shown as is). */
export const PREREQUISITE_PATTERN =
  /\b(?:pre-?req\w*|co-?req\w*|permission\s+of\s+(?:the\s+)?(?:instructor|professor|department|chair)|(?:instructor|professor|department(?:al)?)(?:'s)?\s+(?:permission|consent|approval)|consent\s+of\s+(?:the\s+)?(?:instructor|professor|department)|must\s+(?:first\s+)?(?:complete|take|pass|have)|(?:already|previously|first)\s+(?:taken|completed|passed)|taken|background\s+in|familiarity\s+with|prior\s+(?:experience|knowledge|coursework|courses?|exposure|study|training)|before\s+(?:enrolling|taking|registering)|placement|eligib\w*)\b/i;

const DIFFICULTY_SOURCE = String.raw`requires?|required|difficult\w*|easy|easier|easiest|hard|harder|hardest|tough\w*|challeng\w*|demanding|intensive\w*|intense\w*|rigou?r\w*|heavy|heavier|light|lighter|lightweight|manageable|fast-?paced|slow-?paced|workloads?|work\s*load|reading\s+load|time-?consuming|time\s+commitment|hours?\s+(?:a|per|each)\s+week|grading|graded|grades?|gpa`;

/** Difficulty, workload and grading words, and "required" (may be exempted by official text, see above). */
export const DIFFICULTY_PATTERN = new RegExp(`\\b(?:${DIFFICULTY_SOURCE})\\b`, "i");
const DIFFICULTY_ALL = new RegExp(DIFFICULTY_PATTERN.source, "gi");

/** Talk the UI must never show from a model (prerequisites, eligibility, difficulty, workload, grading). */
export const FORBIDDEN_CLAIM_PATTERN = new RegExp(
  `${PREREQUISITE_PATTERN.source}|${DIFFICULTY_PATTERN.source}`,
  "i",
);

function normalizedWord(match: string): string {
  return match.toLowerCase().replace(/\s+/g, " ").replace(/-/g, "");
}

/** The difficulty words an official text itself uses (see the module comment). */
export function officialDifficultyWords(officialText: string): Set<string> {
  return new Set([...officialText.matchAll(DIFFICULTY_ALL)].map((m) => normalizedWord(m[0])));
}

/** True when `text` makes a claim the UI must not show (difficulty words in `official` excepted). */
export function hasForbiddenClaim(text: string, official?: ReadonlySet<string>): boolean {
  if (PREREQUISITE_PATTERN.test(text)) return true;
  for (const match of text.matchAll(DIFFICULTY_ALL)) {
    if (!official?.has(normalizedWord(match[0]))) return true;
  }
  return false;
}

/** A sentence or list item test: true = drop it. */
export type SentenceFilter = (text: string) => boolean;

/** The default filter: forbidden claims. */
export const forbiddenClaims: SentenceFilter = (text) => hasForbiddenClaim(text);

export interface CleanOptions {
  maxLength: number;
  /** Keep line breaks (e-mail bodies); otherwise all whitespace collapses to single spaces. */
  multiline?: boolean;
}

function stripLinks(text: string): string {
  return text.replace(URL_PATTERN, "").replace(EMAIL_PATTERN, "").replace(BARE_DOMAIN_PATTERN, "");
}

function stripMarkdown(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\*\*|__|`+/g, "")
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:!?])/g, "$1$2");
}

/** Cut to `max` characters at a sentence end or word boundary, adding "…" when something was cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, Math.max(1, max - 1));
  const sentenceEnd = Math.max(
    room.lastIndexOf(". "),
    room.lastIndexOf("! "),
    room.lastIndexOf("? "),
  );
  if (sentenceEnd >= max * 0.5) return room.slice(0, sentenceEnd + 1);
  const space = /\s/.test(text.charAt(room.length)) ? room.length : room.lastIndexOf(" ");
  const cut = space >= max * 0.5 ? room.slice(0, space) : room;
  return `${cut.replace(/[\s,;:.-]+$/, "")}…`;
}

function tidySpaces(text: string): string {
  return text
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Clean one model-written string (see the module comment). */
export function cleanText(input: string, options: CleanOptions): string {
  const normalized = input.normalize("NFKC").replace(/\r\n?/g, "\n").replace(CONTROL_PATTERN, "");
  const unlinked = stripLinks(normalized);
  if (options.multiline) {
    const lines = unlinked.split("\n").map((line) => tidySpaces(stripMarkdown(line)));
    const joined = lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return truncate(joined, options.maxLength);
  }
  const single = tidySpaces(stripMarkdown(unlinked.replace(/\s+/g, " ")));
  return truncate(single, options.maxLength);
}

/** Sentences of a paragraph (keeps the terminal punctuation). */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Drop the sentences that `drop` (a filter or a pattern; default: forbidden claims) matches. */
export function dropSentences(
  text: string,
  drop: SentenceFilter | RegExp = forbiddenClaims,
): string {
  const test = drop instanceof RegExp ? (sentence: string) => drop.test(sentence) : drop;
  return sentences(text)
    .filter((sentence) => !test(sentence))
    .join(" ");
}

/** Clean a list: each item cleaned, filtered items (default: forbidden claims), empty or duplicate ones dropped. */
export function cleanList(
  items: readonly string[],
  {
    maxItems,
    maxLength,
    drop = forbiddenClaims,
  }: { maxItems: number; maxLength: number; drop?: SentenceFilter },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const cleaned = cleanText(item, { maxLength });
    if (!cleaned || drop(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** A paragraph: cleaned, filtered sentences (default: forbidden claims) dropped, cut to length. */
export function cleanParagraph(
  input: string,
  maxLength: number,
  drop: SentenceFilter = forbiddenClaims,
): string {
  const cleaned = cleanText(input, { maxLength: maxLength * 2 });
  return truncate(dropSentences(cleaned, drop), maxLength);
}

/** Combine sentence filters: a sentence is dropped when any of them matches. */
export function anyOf(...filters: SentenceFilter[]): SentenceFilter {
  return (text) => filters.some((filter) => filter(text));
}

/** Words of a text for overlap checks (lower case, letters and digits only). */
export function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * True when `output` repeats a run of more than `maxRun` consecutive words from any of `sources` verbatim
 * (professor summaries must not quote reviews at length).
 */
export function copiesLongRun(output: string, sources: readonly string[], maxRun = 20): boolean {
  const n = maxRun + 1;
  const grams = new Set<string>();
  for (const source of sources) {
    const w = words(source);
    for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(" "));
  }
  if (grams.size === 0) return false;
  const out = words(output);
  for (let i = 0; i + n <= out.length; i++) {
    if (grams.has(out.slice(i, i + n).join(" "))) return true;
  }
  return false;
}

/** True when the text contains a quotation longer than `maxWords` words. */
export function hasLongQuote(text: string, maxWords = 20): boolean {
  const quoted = text.match(/["“”][^"“”]+["“”]/g) ?? [];
  return quoted.some((quote) => words(quote).length > maxWords);
}
