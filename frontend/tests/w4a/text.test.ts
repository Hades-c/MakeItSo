import { describe, expect, it } from "vitest";
import {
  cleanLine,
  escapeRegExp,
  foldForSearch,
  htmlToText,
  normalizeText,
  summaryFromHtml,
  truncateText,
} from "@/server/feeds/text";

const ZWSP = String.fromCharCode(0x200b);
const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);
const BELL = String.fromCharCode(7);

describe("htmlToText", () => {
  it("strips tags, keeps block boundaries as line breaks and decodes entities", () => {
    expect(
      htmlToText("<p>Hello <b>world</b></p><p>Tom &amp; Jerry&#8217;s &ndash; caf&eacute;</p>"),
    ).toBe("Hello world\nTom & Jerry’s – café");
    expect(htmlToText("Line one<br>Line two<br/>Line three")).toBe(
      "Line one\nLine two\nLine three",
    );
    expect(htmlToText("<ul><li>One</li><li>Two</li></ul>")).toBe("One\nTwo");
  });

  it("drops scripts, styles, comments and CDATA wrappers; survives '>' inside attributes", () => {
    expect(htmlToText('<script>alert("x")</script><style>p{}</style><!-- hidden -->Visible')).toBe(
      "Visible",
    );
    expect(htmlToText('<a title="a > b" href="/x">Link</a> text')).toBe("Link text");
    expect(htmlToText("<![CDATA[Inside]]>")).toBe("Inside");
  });

  it("leaves plain text alone (a < b is not a tag) and decodes it once", () => {
    expect(htmlToText("a < b and c > d")).toBe("a < b and c > d");
    expect(htmlToText("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("<script>alert(1)</script>");
  });

  it("removes control and invisible characters and normalises spaces", () => {
    expect(htmlToText(`${BOM}Wide${NBSP}${NBSP}space${ZWSP} and${BELL} bell`)).toBe(
      "Wide space and bell",
    );
    expect(normalizeText("a\r\n\r\n\r\n\r\nb  c")).toBe("a\n\nb c");
    expect(htmlToText(null)).toBe("");
  });
});

describe("summaries and lines", () => {
  it("summaries are one line, at most 500 characters, cut at a word with an ellipsis", () => {
    const long = `<p>${"word ".repeat(200)}</p>`;
    const summary = summaryFromHtml(long)!;
    expect(summary.length).toBeLessThanOrEqual(500);
    expect(summary.endsWith("word…")).toBe(true);
    expect(summary).not.toContain("\n");
    expect(summaryFromHtml("<p>  </p>")).toBeNull();
  });

  it("truncateText never splits a surrogate pair", () => {
    const text = `${"a".repeat(8)}😀😀😀`;
    const cut = truncateText(text, 10);
    expect(cut.length).toBeLessThanOrEqual(10);
    expect(/[\uD800-\uDBFF]…$/.test(cut)).toBe(false);
  });

  it("cleanLine makes one-line text within the limit, or empty", () => {
    expect(cleanLine("<b>Title</b>\n  with   break", 300)).toBe("Title with break");
    expect(cleanLine("x".repeat(400), 300)).toHaveLength(300);
    expect(cleanLine(undefined, 300)).toBe("");
  });

  it("foldForSearch drops case and accents; escapeRegExp neutralises operators", () => {
    expect(foldForSearch("Mauzé  Family TERRACE")).toBe("mauze family terrace");
    expect(new RegExp(escapeRegExp("C++ (intro)?")).test("learn C++ (intro)? today")).toBe(true);
  });
});
