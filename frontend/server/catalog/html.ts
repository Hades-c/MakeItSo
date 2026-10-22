import "server-only";
import { decode } from "html-entities";

/**
 * Course-description HTML → plain text (PLAN §5 "Sections": proper HTML → text, entities decoded, never
 * dangerouslySetInnerHTML). Pure; no DOM. What the Davidson course API sends, and what this module does with it:
 *
 * - Entities, sometimes encoded two or three times ("&amp;amp;amp;", "&amp;nbsp;", `href=&quot;…&quot;`): text and
 *   attributes are decoded until stable. Entity-encoded markup ("&lt;p&gt;") is decoded before tokenising.
 * - Paragraphs (`<p>`, headings, lists) become blank-line separated paragraphs, `<br>` a line break, `<li>` a
 *   "• " line; whitespace (incl. NBSP) is collapsed. Text outside any paragraph (a description with no markup at
 *   all, upstream's appended Prerequisites text) keeps its line breaks.
 * - Links keep their text; a real http(s) URL is kept as text after it: "Course Descriptions (https://…)". mailto:
 *   and tracking wrappers (Outlook "safelinks") keep the link text only.
 * - The leading instructor paragraph ("Instructor"/"Instructors"/"Insructor"/"Faculty" + the names) is dropped: the
 *   names come from the structured `instructors` field.
 * - The official Prerequisites block is cut out and returned separately. Upstream appends it as
 *   `<br><b>Prerequisites</b><br>…` (plain text: its line breaks are kept); departments also write `<b>Prerequisites:</b>`, `<strong>Prerequisite(s):</strong>`
 *   or `<b>Prerequisite</b>:`. A marker outside any paragraph runs to the end of the description; one inside a
 *   paragraph runs to the end of that paragraph. An empty block is null. The block's text is kept verbatim (it
 *   often holds "(Fall and Spring)" or lab notes rather than a prerequisite: that is what the Registrar wrote).
 */

const MAX_DECODE_PASSES = 5;

/** Decode HTML entities until the text stops changing (double/triple-encoded upstream text). */
export function decodeEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    const next = decode(out, { level: "html5" });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Collapse all whitespace (NBSP included), drop zero-width characters, trim. */
export function collapseWhitespace(text: string): string {
  return text
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A one-line upstream string (title, note, name): entities decoded, whitespace collapsed. */
export function cleanText(value: string | null | undefined): string {
  return value ? collapseWhitespace(decodeEntities(value)) : "";
}

// ---- Tokenising ------------------------------------------------------------------------------------------------

/** Tags that start a new paragraph (and count as "inside a block" for the Prerequisites rule). */
const PARAGRAPH_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
]);
/** Tags that separate paragraphs without holding text themselves. */
const SEPARATOR_TAGS = new Set([
  "div",
  "ul",
  "ol",
  "table",
  "tr",
  "section",
  "article",
  "header",
  "footer",
  "hr",
]);
const BOLD_TAGS = new Set(["b", "strong"]);
/** Tags whose content is never text. */
const SKIPPED_TAGS = new Set(["script", "style", "template"]);

const TOKEN_PATTERN =
  /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/** Entity-encoded markup such as "&lt;p&gt;" or "&amp;lt;br&amp;gt;". */
const ENCODED_MARKUP = /&(?:amp;)*lt;\/?(?:p|br|b|strong|em|i|u|a|ul|ol|li|div|span|h[1-6])\b/i;

interface Segment {
  text: string;
  bold: boolean;
}

interface Line {
  segments: Segment[];
  /** Paragraph number: lines of one paragraph share it. */
  para: number;
  /** True when the line started outside any paragraph element (e.g. upstream's appended Prerequisites block). */
  rootLevel: boolean;
}

interface OpenLink {
  href: string | null;
  line: Line;
  start: number;
}

const TRACKING_HOSTS = [/(^|\.)safelinks\.protection\.outlook\.com$/i, /(^|\.)urldefense\.com$/i];

/** A link target worth keeping as text: an absolute http(s) URL that is not a tracking wrapper. */
function keepableUrl(href: string | null): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (TRACKING_HOSTS.some((pattern) => pattern.test(url.hostname))) return null;
  return href;
}

function attribute(attrs: string, name: string): string | null {
  const decoded = decodeEntities(attrs);
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(
    decoded,
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? null : value.trim();
}

function tokenise(html: string): Line[] {
  const lines: Line[] = [];
  let para = 0;
  let depth = 0;
  /** Open container elements (div, ul, table, ...): whitespace inside them is HTML whitespace. */
  let containers = 0;
  let bold = 0;
  let skipping: string | null = null;
  let current: Line = { segments: [], para, rootLevel: true };
  const links: OpenLink[] = [];

  const newLine = () => {
    lines.push(current);
    current = { segments: [], para, rootLevel: depth === 0 };
  };
  // Text outside any paragraph element is plain text (upstream's appended Prerequisites block, descriptions with
  // no markup at all): its line breaks are real. Inside a paragraph a newline is just HTML whitespace.
  const push = (text: string) => {
    if (skipping || !text) return;
    const parts = depth === 0 && containers === 0 ? text.split("\n") : [text];
    parts.forEach((part, i) => {
      if (i > 0) newLine();
      if (part) current.segments.push({ text: decodeEntities(part), bold: bold > 0 });
    });
  };
  const newParagraph = () => {
    lines.push(current);
    para += 1;
    current = { segments: [], para, rootLevel: depth === 0 };
  };

  let last = 0;
  for (const match of html.matchAll(TOKEN_PATTERN)) {
    push(html.slice(last, match.index));
    last = match.index + match[0].length;
    const name = match[2]?.toLowerCase();
    if (!name) continue; // comment
    const closing = match[1] === "/";
    if (skipping) {
      if (closing && name === skipping) skipping = null;
      continue;
    }
    if (SKIPPED_TAGS.has(name)) {
      if (!closing && !/\/\s*$/.test(match[3] ?? "")) skipping = name;
      continue;
    }
    if (name === "br") {
      newLine();
    } else if (BOLD_TAGS.has(name)) {
      bold = Math.max(0, bold + (closing ? -1 : 1));
    } else if (PARAGRAPH_TAGS.has(name)) {
      depth = Math.max(0, depth + (closing ? -1 : 1));
      if (name === "li") {
        // One line per item (no empty line between </li> and the next <li>).
        if (current.segments.some((segment) => segment.text.trim() !== "")) newLine();
        else current.segments = [];
        if (!closing) current.segments.push({ text: "• ", bold: false });
      } else {
        newParagraph();
      }
    } else if (SEPARATOR_TAGS.has(name)) {
      if (name !== "hr") containers = Math.max(0, containers + (closing ? -1 : 1));
      newParagraph();
    } else if (name === "a") {
      if (!closing) {
        links.push({ href: attribute(match[3] ?? "", "href"), line: current, start: 0 });
        const open = links[links.length - 1];
        if (open) open.start = current.segments.length;
      } else {
        const open = links.pop();
        const url = keepableUrl(open?.href ?? null);
        if (open && url && open.line === current) {
          const text = collapseWhitespace(
            current.segments
              .slice(open.start)
              .map((s) => s.text)
              .join(""),
          );
          if (!text.includes(url)) current.segments.push({ text: ` (${url})`, bold: false });
        }
      }
    }
    // Every other tag (span, em, u, sup, font, ...) is formatting only.
  }
  push(html.slice(last));
  lines.push(current);
  return lines;
}

function lineText(line: Line): string {
  const text = collapseWhitespace(line.segments.map((s) => s.text).join(""));
  return text === "•" ? "" : text;
}

/** The bold run a line starts with, and the text after it. */
function leadingBold(line: Line): { bold: string; rest: string } {
  let i = 0;
  let bold = "";
  for (; i < line.segments.length; i++) {
    const segment = line.segments[i];
    if (!segment) break;
    if (segment.bold) bold += segment.text;
    else if (segment.text.trim() === "" && bold === "") continue;
    else if (segment.text.trim() === "") bold += segment.text;
    else break;
  }
  return {
    bold: collapseWhitespace(bold),
    rest: collapseWhitespace(
      line.segments
        .slice(i)
        .map((s) => s.text)
        .join(""),
    ),
  };
}

// ---- Descriptions ----------------------------------------------------------------------------------------------

const INSTRUCTOR_LABEL = /^(?:instructors?|insructors?|instuctors?|faculty)\s*:?$/i;
const INSTRUCTOR_LINE = /^(?:instructors?|insructors?|instuctors?|faculty)\s*:\s*\S/i;
const PREREQUISITES_LABEL = /^pre-?requisites?(?:\s*\(s\))?\s*:?$/i;
/** A names line is short; anything longer is description text and is kept. */
const MAX_NAMES_LENGTH = 160;
/** "Leading": the instructor paragraph is among the first few non-empty lines (after a term heading, say). */
const LEADING_LINES = 3;

interface TextLine {
  text: string;
  para: number;
}

/** Lines → text: lines of a paragraph joined by "\n", paragraphs (and blank lines) by "\n\n". */
function joinLines(lines: readonly TextLine[]): string {
  let out = "";
  let lastPara: number | null = null;
  let blank = false;
  for (const line of lines) {
    if (lastPara !== null && line.para !== lastPara) blank = true;
    lastPara = line.para;
    if (!line.text) {
      if (out) blank = true;
      continue;
    }
    if (out) out += blank ? "\n\n" : "\n";
    out += line.text;
    blank = false;
  }
  return out.trim();
}

/** Indexes of the leading instructor lines to drop (label + names), or []. */
function instructorLines(lines: readonly Line[], texts: readonly string[]): number[] {
  const nonEmpty = texts.flatMap((text, i) => (text ? [i] : [])).slice(0, LEADING_LINES);
  for (const i of nonEmpty) {
    const line = lines[i];
    const text = texts[i] ?? "";
    if (!line) continue;
    if (INSTRUCTOR_LABEL.test(text)) {
      const next = texts.findIndex((t, j) => j > i && t !== "");
      const names = next >= 0 ? (texts[next] ?? "") : "";
      return next >= 0 && names.length <= MAX_NAMES_LENGTH ? [i, next] : [i];
    }
    const { bold, rest } = leadingBold(line);
    if (
      text.length <= MAX_NAMES_LENGTH &&
      ((INSTRUCTOR_LABEL.test(bold) && rest !== "") || INSTRUCTOR_LINE.test(text))
    ) {
      return [i];
    }
  }
  return [];
}

export interface DescriptionParts {
  /** The description as text, without the instructor paragraph and the Prerequisites block. */
  descriptionText: string;
  /** The official Prerequisites block as text; null when there is none or it is empty. */
  prerequisitesText: string | null;
}

/** Split an upstream `course_description` into description text and the official Prerequisites text. */
export function parseDescription(html: string | null | undefined): DescriptionParts {
  let source = (html ?? "").replace(/\r\n?/g, "\n");
  for (let pass = 0; pass < MAX_DECODE_PASSES && ENCODED_MARKUP.test(source); pass++) {
    source = decode(source, { level: "html5" });
  }

  const lines = tokenise(source);
  const texts = lines.map(lineText);
  const removed = new Set<number>(instructorLines(lines, texts));

  // Prerequisites markers: a line starting with a bold "Prerequisite(s)[:]".
  const blocks: { indexes: number[]; text: string }[] = [];
  lines.forEach((line, i) => {
    if (removed.has(i)) return;
    const { bold, rest } = leadingBold(line);
    if (!PREREQUISITES_LABEL.test(bold)) return;
    const indexes = [i];
    const parts: TextLine[] = [{ text: rest.replace(/^[:\s]+/, ""), para: line.para }];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next) break;
      if (!line.rootLevel && next.para !== line.para) break;
      indexes.push(j);
      parts.push({ text: texts[j] ?? "", para: next.para });
    }
    blocks.push({ indexes, text: joinLines(parts) });
  });
  // The official block is the last one with text; empty markers are dropped as well.
  const chosen = [...blocks].reverse().find((block) => block.text !== "");
  for (const block of blocks) {
    if (block === chosen) block.indexes.forEach((i) => removed.add(i));
    else if (block.text === "") removed.add(block.indexes[0] ?? -1);
  }

  const descriptionText = joinLines(
    lines.flatMap((line, i) => (removed.has(i) ? [] : [{ text: texts[i] ?? "", para: line.para }])),
  );
  return { descriptionText, prerequisitesText: chosen ? chosen.text : null };
}
