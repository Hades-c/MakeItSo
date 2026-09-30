import "server-only";

/**
 * Post-validation of model text (PLAN §6.1 W6 "outputs are post-validated"): every string a model wrote goes
 * through here before it is cached or returned, and the UI renders it as text only.
 *   - links and e-mail addresses are removed (URLs, www.…, bare domains, addresses);
 *   - Markdown markers, control characters and repeated whitespace are removed;
 *   - lengths are enforced (cut at a sentence or word boundary, with "…");
 *   - sentences or list items that talk about prerequisites, difficulty, workload or grades are dropped: the UI
 *     never shows model-written prerequisites, difficulty or workload (PLAN §5 "AI grounding").
 */

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]*[^\s<>"')\].,;:!?]/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const BARE_DOMAIN_PATTERN =
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|edu|net|io|gov|ly|co|us|info|me|app|dev|ai)\b(?:\/[^\s<>"')\]]*)?/gi;
const CONTROL_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E]/g;

/** Talk the UI must never show from a model (prerequisites, difficulty, workload, grading). */
export const FORBIDDEN_CLAIM_PATTERN =
  /\b(?:pre-?req\w*|pre-?requisites?|workloads?|work\s+load|difficult\w*|easy|easier|easiest|grading|graded|grades?|gpa|hours?\s+(?:a|per)\s+week|time-consuming|rigorous)\b/i;

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

/** Drop the sentences that match `pattern` (default: forbidden claims). */
export function dropSentences(text: string, pattern: RegExp = FORBIDDEN_CLAIM_PATTERN): string {
  return sentences(text)
    .filter((sentence) => !pattern.test(sentence))
    .join(" ");
}

/** Clean a list: each item cleaned, forbidden claims and empty or duplicate items dropped, at most `maxItems`. */
export function cleanList(
  items: readonly string[],
  { maxItems, maxLength }: { maxItems: number; maxLength: number },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const cleaned = cleanText(item, { maxLength });
    if (!cleaned || FORBIDDEN_CLAIM_PATTERN.test(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** A paragraph: cleaned, forbidden-claim sentences dropped, cut to length. */
export function cleanParagraph(input: string, maxLength: number): string {
  const cleaned = cleanText(input, { maxLength: maxLength * 2 });
  return truncate(dropSentences(cleaned), maxLength);
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
