import "server-only";
import { decode } from "html-entities";

/**
 * Acalog rich text → plain text (PLAN §5 "Majors": requirement text is shown verbatim, as text; §7 "Feed and
 * catalog HTML becomes text"). Pure; no DOM. The output keeps the structure students need to read requirements:
 * one line per paragraph or line break, list items as "- item" (ordered lists as "1. item"), nested lists indented
 * by two spaces per level. Entities are decoded, non-breaking and zero-width spaces normalised, and tags, scripts
 * and styles dropped. It is text: callers render it as text, never as HTML.
 *
 * Course permalinks. Acalog links courses with `<a class="permalink" data-to_type="course" ...>BIO 209 - Title</a>`.
 * Most permalinks in the 2026-2027 catalog are *unlinked* (`data-to_type="unlinked"`, empty text): the widget API
 * does not say which course they meant. Such a link renders, in order of preference, as its `data-anchor_text`,
 * the literal part of its `data-link_text` template ("%prefix% %code%: Child Development" → "[course]: Child
 * Development"), or MISSING_COURSE. `missingCourseRefs` counts the links whose course code is unknown.
 */

/** Stands in for a course the catalog links to without saying which one. */
export const MISSING_COURSE = "[course]";

/** Longest text one call returns (a whole department page is ~15 kB of text). */
export const MAX_TEXT_LENGTH = 50_000;

/** Longest HTML one call reads (the longest description in the 2026-2027 catalog is ~12 kB); the rest is cut. */
export const MAX_HTML_LENGTH = 500_000;

export interface HtmlText {
  text: string;
  missingCourseRefs: number;
}

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "center",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
]);
/** Tags whose content is never text. */
const SKIPPED = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "svg",
  "head",
]);

/**
 * One token: a comment, a tag, a run of text, or a stray "<". A tag's attribute part never contains an unquoted
 * "<", so an unclosed tag ("<a" at the end of a truncated description, or thousands of them) is read as text at
 * once instead of being retried against the rest of the input (which made malformed input quadratic).
 */
const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;
const ATTRIBUTE = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** NBSP and friends → space; zero-width characters → nothing. */
function normaliseSpaces(value: string): string {
  return value.replace(/[​-‍⁠﻿]/g, "").replace(/[   -   　]/g, " ");
}

/** Decoded, whitespace-collapsed, trimmed text of an attribute or a short string. */
export function cleanText(value: string | null | undefined): string {
  return normaliseSpaces(decode(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = decode(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function isPermalink(attrs: Record<string, string>): boolean {
  return /(?:^|\s)permalink(?:\s|$)/.test(attrs.class ?? "");
}

/** What an empty course permalink stands for (see the module comment); `missing` when the code is unknown. */
export function permalinkFallback(attrs: Readonly<Record<string, string>>): {
  text: string;
  missing: boolean;
} {
  const anchor = cleanText(attrs["data-anchor_text"]);
  if (anchor) return { text: anchor, missing: false };
  const literal = cleanText(
    (attrs["data-link_text"] ?? "")
      .replace(/%prefix%\s*%code%/gi, MISSING_COURSE)
      .replace(/%(?:prefix|code|name|title)%/gi, ""),
  );
  if (literal && literal !== MISSING_COURSE) {
    return { text: literal, missing: literal.includes(MISSING_COURSE) };
  }
  return { text: MISSING_COURSE, missing: true };
}

interface ListState {
  ordered: boolean;
  next: number;
}

interface OpenAnchor {
  permalink: boolean;
  attrs: Record<string, string>;
  /** Non-space text characters written while this anchor was open. */
  written: number;
}

/** Convert Acalog HTML to text (see the module comment). */
export function htmlToText(html: string | null | undefined): HtmlText {
  const lines: string[] = [];
  const lists: ListState[] = [];
  const anchors: OpenAnchor[] = [];
  let buffer = "";
  let prefix: string | null = null;
  let skipping: string | null = null;
  let missingCourseRefs = 0;

  const write = (text: string) => {
    const collapsed = text.replace(/\s+/g, " ");
    if (collapsed === "" || (collapsed === " " && (buffer === "" || buffer.endsWith(" ")))) return;
    buffer += buffer === "" ? collapsed.trimStart() : collapsed;
    const visible = collapsed.replace(/\s/g, "").length;
    if (visible > 0) for (const anchor of anchors) anchor.written += visible;
  };

  /** End the current line. A list marker waits for the item's first text (`<li><p>text</p></li>`). */
  const flush = () => {
    let content = buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    if (!content) return;
    // Hand-typed bullets ("• item", "● item") read like list items; "Economics 202 , Economics 203" loses the
    // stray space the markup left before the comma.
    content = content.replace(/^[•●▪◦]\s*/, "- ").replace(/\s+([,;])/g, "$1");
    const indent = prefix ?? "  ".repeat(lists.length);
    prefix = null;
    lines.push(indent + content);
  };

  for (const match of (html ?? "").slice(0, MAX_HTML_LENGTH).matchAll(TOKEN)) {
    const [whole, closing, rawTag, rawAttrs, text, stray] = match;
    if (whole.startsWith("<!--")) continue;
    if (text !== undefined || stray !== undefined) {
      if (!skipping) write(normaliseSpaces(decode(text ?? stray ?? "")));
      continue;
    }
    const tag = (rawTag ?? "").toLowerCase();
    if (skipping) {
      if (closing && tag === skipping) skipping = null;
      continue;
    }
    if (SKIPPED.has(tag)) {
      if (!closing && !/\/\s*$/.test(rawAttrs ?? "")) skipping = tag;
      continue;
    }
    if (tag === "br") {
      flush();
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      flush();
      prefix = null;
      if (closing) lists.pop();
      else {
        const start = Number.parseInt(parseAttributes(rawAttrs ?? "").start ?? "1", 10);
        lists.push({ ordered: tag === "ol", next: Number.isFinite(start) ? start : 1 });
      }
      continue;
    }
    if (tag === "li") {
      flush();
      prefix = null;
      if (!closing) {
        const list = lists.at(-1);
        const depth = Math.max(lists.length, 1);
        const marker = list?.ordered ? `${list.next++}. ` : "- ";
        prefix = "  ".repeat(depth - 1) + marker;
      }
      continue;
    }
    if (tag === "a") {
      if (!closing) {
        const attrs = parseAttributes(rawAttrs ?? "");
        anchors.push({ permalink: isPermalink(attrs), attrs, written: 0 });
      } else {
        const anchor = anchors.pop();
        if (anchor?.permalink && anchor.written === 0) {
          const fallback = permalinkFallback(anchor.attrs);
          if (fallback.missing) missingCourseRefs += 1;
          const needsSpace = buffer !== "" && !/[\s(/=[]$/.test(buffer);
          write((needsSpace ? " " : "") + fallback.text);
        }
      }
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      continue;
    }
    // Inline tags (strong, em, u, span, sup, ...) carry no text of their own.
  }
  // Unclosed permalinks at the end of the input still stand for a course.
  for (const anchor of anchors.reverse()) {
    if (anchor.permalink && anchor.written === 0) {
      const fallback = permalinkFallback(anchor.attrs);
      if (fallback.missing) missingCourseRefs += 1;
      write(` ${fallback.text}`);
    }
  }
  flush();

  let text = lines.join("\n");
  if (text.length > MAX_TEXT_LENGTH) {
    text = `${text.slice(0, MAX_TEXT_LENGTH - 1).trimEnd()}…`;
  }
  return { text, missingCourseRefs };
}
