import "server-only";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { cleanLine, summaryFromHtml, TITLE_MAX } from "@/server/feeds/text";
import { DAY_MS } from "@/server/feeds/time";
import { FeedParseError, type NormalizedFeedItem, type ParseContext } from "@/server/feeds/types";
import { pickItemUrl } from "@/server/feeds/urls";

/**
 * RSS 2.0 → items, with fast-xml-parser (entity expansion limits on, no DTD/external entities, no attribute
 * values evaluated). The XML is validated with zod; one malformed item is skipped, a document that is not RSS
 * (an HTML error page, a WAF challenge) is a FeedParseError.
 *
 * News rule (PLAN §6.1 W4a): feeds such as www.davidson.edu/rss.xml pin old "sticky" stories above new ones, and
 * WildcatSync's news feed is unordered and mixes in 2024 posts. An item whose pubDate is more than
 * STALE_NEWS_DAYS (60) older than the newest item in the same feed is stale and skipped.
 */

export const STALE_NEWS_DAYS = 60;
/** At most this many news items per feed are kept (newest first). */
export const MAX_NEWS_ITEMS = 50;

export interface RssItem {
  title: string;
  link: string | null;
  guid: string | null;
  pubDate: Date | null;
  /** description (HTML or text, entities already decoded once by the XML parser). */
  description: string | null;
  /** content:encoded, when present. */
  content: string | null;
  categories: string[];
}

export interface RssChannel {
  title: string;
  link: string | null;
  items: RssItem[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (_name, jpath) =>
    jpath === "rss.channel.item" ||
    jpath === "rss.channel.item.category" ||
    jpath === "rdf:RDF.item",
});

/** A text node: "value", 12, or { "#text": "value", "@_attr": ... }. */
const TextNode = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.looseObject({ "#text": z.union([z.string(), z.number()]).optional() }),
  ])
  .transform((value) => (typeof value === "object" ? String(value["#text"] ?? "") : String(value)));

const RssItemSchema = z.looseObject({
  title: TextNode.optional(),
  link: TextNode.optional(),
  guid: TextNode.optional(),
  pubDate: TextNode.optional(),
  "dc:date": TextNode.optional(),
  description: TextNode.optional(),
  "content:encoded": TextNode.optional(),
  category: z.array(TextNode).optional(),
});

const RssDocumentSchema = z.object({
  rss: z.looseObject({
    channel: z.looseObject({
      title: TextNode.optional(),
      link: z.union([TextNode, z.array(TextNode)]).optional(),
      item: z.array(z.unknown()).optional(),
    }),
  }),
});

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const ms = Date.parse(value.trim());
  return Number.isNaN(ms) ? null : new Date(ms);
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Parse an RSS 2.0 document. Throws FeedParseError when it is not one. */
export function parseRss(xml: string): RssChannel {
  const body = xml.replace(/^\uFEFF/, "");
  if (!/<rss[\s>]/i.test(body.slice(0, 4096))) {
    throw new FeedParseError("Not an RSS document (no <rss> element)");
  }
  let raw: unknown;
  try {
    raw = parser.parse(body);
  } catch (error) {
    throw new FeedParseError(
      `Invalid RSS XML: ${error instanceof Error ? error.message : "parse error"}`,
      { cause: error },
    );
  }
  const document = RssDocumentSchema.safeParse(raw);
  if (!document.success) {
    throw new FeedParseError("RSS document has no <channel>");
  }
  const channel = document.data.rss.channel;
  const link = Array.isArray(channel.link) ? channel.link[0] : channel.link;
  const items: RssItem[] = [];
  for (const entry of channel.item ?? []) {
    const parsed = RssItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const item = parsed.data;
    items.push({
      title: item.title ?? "",
      link: nonEmpty(item.link),
      guid: nonEmpty(item.guid),
      pubDate: parseDate(item.pubDate ?? item["dc:date"]),
      description: nonEmpty(item.description),
      content: nonEmpty(item["content:encoded"]),
      categories: (item.category ?? []).map((c) => c.trim()).filter(Boolean),
    });
  }
  return { title: channel.title ?? "", link: nonEmpty(link), items };
}

/**
 * Drop stale sticky items: anything published more than `staleDays` before the newest dated item. Items without
 * a date are kept (their age is unknown). Returns the kept items newest first and how many were dropped.
 */
export function dropStaleItems<T extends { pubDate: Date | null }>(
  items: readonly T[],
  staleDays = STALE_NEWS_DAYS,
): { kept: T[]; stale: number } {
  const dated = items.filter((item) => item.pubDate).map((item) => item.pubDate!.getTime());
  if (dated.length === 0) return { kept: [...items], stale: 0 };
  const cutoff = Math.max(...dated) - staleDays * DAY_MS;
  const kept = items.filter((item) => !item.pubDate || item.pubDate.getTime() >= cutoff);
  kept.sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
  return { kept, stale: items.length - kept.length };
}

export interface NewsOptions extends ParseContext {
  /** Summary for one item (default: the description, else content:encoded, as text). */
  summarize?: (item: RssItem) => string | null;
  maxItems?: number;
}

/**
 * News items from an RSS channel: stale sticky items skipped, newest first, kind "news", startsAt = pubDate. An
 * item without a usable https link on the source's allow-list is skipped (news always links to its story).
 */
export function normalizeNews(
  channel: RssChannel,
  options: NewsOptions,
): { items: NormalizedFeedItem[]; stale: number; skipped: number } {
  const { kept, stale } = dropStaleItems(channel.items);
  const items: NormalizedFeedItem[] = [];
  let skipped = 0;
  const base = channel.link ?? undefined;
  for (const item of kept.slice(0, options.maxItems ?? MAX_NEWS_ITEMS)) {
    const title = cleanLine(item.title, TITLE_MAX);
    const url = pickItemUrl(options.source, [item.link, item.guid], base);
    if (!title || !url) {
      skipped++;
      continue;
    }
    const summary = options.summarize
      ? options.summarize(item)
      : summaryFromHtml(item.description ?? item.content);
    items.push({
      source: options.source,
      channel: options.channel,
      externalId: (item.guid ?? item.link ?? url).slice(0, 400),
      kind: "news",
      title,
      url,
      startsAt: item.pubDate,
      endsAt: null,
      allDay: false,
      location: null,
      summaryText: summary,
    });
  }
  return { items, stale, skipped };
}
