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

/** Raw HTML read for a summary (≤ 500 chars are kept): longer upstream values are cut first. */
export const HTML_INPUT_MAX = 20_000;
/** Raw text read for a one-line field (title ≤ 300, location ≤ 200 chars). */
export const LINE_INPUT_MAX = 2_000;

/** Elements whose content is never text (dropped with their content). */
const DROPPED_ELEMENT_OPEN =
  /<(script|style|head|noscript|template|iframe|svg|object|select|textarea)\b[^<>]*>/gi;
/** Tags that end a line of text. */
const BLOCK_TAGS: ReadonlySet<string> = new Set(
  "p div br li ul ol h1 h2 h3 h4 h5 h6 tr td th table thead tbody tfoot section article aside header footer nav blockquote figure figcaption hr pre dd dt dl address main".split(
    " ",
  ),
);
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const DECLARATION = /<![^<>]*>/g;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Soft hyphen, zero-width space, word joiner, BOM. ZWJ/ZWNJ (U+200C/D) stay: emoji sequences and scripts need them. */
const INVISIBLE_CHARS = /[\u00AD\u200B\u2060\uFEFF]/g;
const SPACE_LIKE = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** The first `max` UTF-16 units of `value`, never ending inside a surrogate pair. */
export function sliceText(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

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
const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";
/** Raw-text elements: an unclosed one hides everything after it (as in a browser). */
const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(["script", "style"]);

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isNameChar(code: number): boolean {
  return (
    isAsciiLetter(code) || (code >= 48 && code <= 57) || code === 95 || code === 58 || code === 45
  );
}

/** `<![CDATA[x]]>` → x (an unclosed section is left as it is). */
function unwrapCdata(html: string): string {
  if (!html.includes(CDATA_OPEN)) return html;
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    const open = html.indexOf(CDATA_OPEN, at);
    if (open < 0) break;
    const close = html.indexOf(CDATA_CLOSE, open + CDATA_OPEN.length);
    if (close < 0) break;
    parts.push(html.slice(at, open), html.slice(open + CDATA_OPEN.length, close));
    at = close + CDATA_CLOSE.length;
  }
  parts.push(html.slice(at));
  return parts.join("");
}

const closerPatterns = new Map<string, RegExp>();

function closerOf(name: string): RegExp {
  let pattern = closerPatterns.get(name);
  if (!pattern) {
    pattern = new RegExp(`</${name}\\s*>`, "gi");
    closerPatterns.set(name, pattern);
  }
  return pattern;
}

/**
 * Drop script/style/... elements with their content. Linear: each search starts where the previous one ended, and
 * an element name known to have no closing tag further on is not searched for again.
 */
function dropElements(html: string): string {
  const opener = new RegExp(DROPPED_ELEMENT_OPEN.source, "gi");
  const unclosed = new Set<string>();
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    opener.lastIndex = at;
    const open = opener.exec(html);
    if (!open) break;
    const name = open[1]!.toLowerCase();
    const contentStart = open.index + open[0].length;
    let close: RegExpExecArray | null = null;
    if (!unclosed.has(name)) {
      const closer = closerOf(name);
      closer.lastIndex = contentStart;
      close = closer.exec(html);
      if (!close) unclosed.add(name);
    }
    parts.push(html.slice(at, open.index), " ");
    if (close) {
      at = close.index + close[0].length;
    } else if (RAW_TEXT_ELEMENTS.has(name)) {
      at = html.length;
      break;
    } else {
      // An unclosed <select>, <head>, ...: drop only the tag itself.
      at = contentStart;
    }
  }
  parts.push(html.slice(at));
  return parts.join("");
}

/**
 * The tag starting at `lt` ("<" + optional "/" + an ASCII letter): its lower-case name and the index after its
 * ">", or null when `lt` does not start a tag. A ">" inside a quoted attribute value does not end the tag; with an
 * unbalanced quote the first ">" does. Never looks past the next "<", so stripping is linear in the input.
 */
function tagAt(html: string, lt: number): { name: string; end: number } | null {
  let i = lt + 1;
  if (html.charCodeAt(i) === 47) i++;
  if (!isAsciiLetter(html.charCodeAt(i))) return null;
  const nameStart = i;
  while (i < html.length && isNameChar(html.charCodeAt(i))) i++;
  const name = html.slice(nameStart, i).toLowerCase();
  let quote = 0;
  let firstGt = -1;
  for (; i < html.length; i++) {
    const code = html.charCodeAt(i);
    if (code === 60) break;
    if (code === 62 && firstGt < 0) firstGt = i;
    if (quote) {
      if (code === quote) quote = 0;
    } else if (code === 34 || code === 39) {
      quote = code;
    } else if (code === 62) {
      return { name, end: i + 1 };
    }
  }
  return firstGt >= 0 ? { name, end: firstGt + 1 } : null;
}

/** Remove tags; block-level tags become BREAK. Text such as "a < b" is kept. */
function stripTags(html: string): string {
  const parts: string[] = [];
  let at = 0;
  let from = 0;
  for (;;) {
    const lt = html.indexOf("<", from);
    if (lt < 0) break;
    const tag = tagAt(html, lt);
    if (!tag) {
      from = lt + 1;
      continue;
    }
    parts.push(html.slice(at, lt));
    if (BLOCK_TAGS.has(tag.name)) parts.push(BREAK);
    at = tag.end;
    from = tag.end;
  }
  parts.push(html.slice(at));
  return parts.join("");
}

/** Each run of block boundaries (with only whitespace between them) becomes one line break. */
function joinBreaks(text: string): string {
  if (!text.includes(BREAK)) return text;
  return text
    .split(BREAK)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * HTML (or plain text that may contain entities) → plain text. Block elements end a line (adjacent ones give one
 * line break, not several); line breaks already in the text are kept. Entities are decoded once, with the strict
 * HTML5 rules (only terminated references: "?a=1&region=2" and "&not pasta" stay as they are). Runs in time linear
 * in the input; callers still cut long upstream values first (HTML_INPUT_MAX, LINE_INPUT_MAX).
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let text = html.replaceAll(BREAK, "");
  if (text.includes("<")) {
    text = unwrapCdata(text).replace(COMMENT, " ");
    text = dropElements(text).replace(DECLARATION, " ");
    text = joinBreaks(stripTags(text));
  }
  return normalizeText(decode(text, { level: "html5", scope: "strict" }));
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
  const text = value ? oneLine(htmlToText(sliceText(value, LINE_INPUT_MAX))) : "";
  return text ? truncateText(text, max) : "";
}

/** Summary (≤ 500 chars, one line) of text that is already plain (no entity decoding), or null. */
export function summaryFromText(text: string | null | undefined, max = SUMMARY_MAX): string | null {
  const line = text ? oneLine(sliceText(text, HTML_INPUT_MAX)) : "";
  return line ? truncateText(line, max) : null;
}

/** Plain-text summary (≤ 500 chars, one line) of possibly-HTML input, or null. */
export function summaryFromHtml(html: string | null | undefined, max = SUMMARY_MAX): string | null {
  return html ? summaryFromText(htmlToText(sliceText(html, HTML_INPUT_MAX)), max) : null;
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
