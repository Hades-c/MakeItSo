import "server-only";
import { decode } from "html-entities";

/**
 * Feed text handling (PLAN §7 "Feed and catalog HTML becomes text"). Upstream titles, descriptions and locations
 * may carry HTML, entities, control characters and invisible characters; everything MakeItSo stores is plain
 * text that React renders escaped. Nothing here produces HTML.
 */

export const TITLE_MAX = 300;
export const SUMMARY_MAX = 500;
export const LOCATION_MAX = 200;

/** Elements whose content is never text (dropped with their content). */
const DROPPED_ELEMENTS =
  /<(script|style|head|noscript|template|iframe|svg|object|select|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** Tags that end a line of text. */
const BLOCK_TAG =
  /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|thead|tbody|tfoot|section|article|aside|header|footer|nav|blockquote|figure|figcaption|hr|pre|dd|dt|dl|address|main)\b(?:[^>"']|"[^"]*"|'[^']*')*\/?>/gi;
/** Any other tag (attribute values may contain ">"). */
const ANY_TAG = /<\/?[a-zA-Z][\w:-]*(?:[^>"']|"[^"]*"|'[^']*')*\/?>/g;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
const DECLARATION = /<![^>]*>/g;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE_CHARS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
const SPACE_LIKE = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Normalise whitespace but keep line breaks (at most one blank line in a row). */
export function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(INVISIBLE_CHARS, "")
    .replace(SPACE_LIKE, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Marks a block boundary while tags are stripped (a private-use character, never in feed text). */
const BREAK = String.fromCharCode(0xe000);
const BREAK_RUN = new RegExp(`[ \\t]*${BREAK}(?:\\s*${BREAK})*[ \\t]*`, "g");

/**
 * HTML (or plain text that may contain entities) → plain text. Block elements end a line (adjacent ones give one
 * line break, not several); line breaks already in the text are kept.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const text = html
    .replaceAll(BREAK, "")
    .replace(CDATA, "$1")
    .replace(COMMENT, " ")
    .replace(DROPPED_ELEMENTS, " ")
    .replace(DECLARATION, " ")
    .replace(BLOCK_TAG, BREAK)
    .replace(ANY_TAG, "")
    .replace(BREAK_RUN, "\n");
  return normalizeText(decode(text, { level: "html5" }));
}

/** Collapse every run of whitespace (line breaks included) into one space. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Cut to at most `max` characters, at a word boundary when one is near, ending with "…". Never splits a
 * surrogate pair.
 */
export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  let cut = value.slice(0, max - 1);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(max * 0.6)) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** A one-line plain-text field (title, location) from possibly-HTML input; "" when nothing is left. */
export function cleanLine(value: string | null | undefined, max: number): string {
  const text = oneLine(htmlToText(value));
  return text ? truncateText(text, max) : "";
}

/** Plain-text summary (≤ 500 chars, one line) or null. */
export function summaryFromHtml(html: string | null | undefined, max = SUMMARY_MAX): string | null {
  const text = oneLine(htmlToText(html));
  return text ? truncateText(text, max) : null;
}

/** Lower case, no diacritics, single spaces: for `q` matching ("Mauzé" matches "mauze"). */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Escape a string for use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
