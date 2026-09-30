import { describe, expect, it } from "vitest";
import {
  cleanLine,
  escapeRegExp,
  foldForSearch,
  HTML_INPUT_MAX,
  htmlToText,
  normalizeText,
  sliceText,
  summaryFromHtml,
  summaryFromText,
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

describe("characters and entities", () => {
  it("keeps zero-width joiners (emoji sequences, Persian and Indic text)", () => {
    const lotus = "Yoga 🧘‍♀️ and ❤️‍🩹 care";
    expect(htmlToText(`<p>${lotus}</p>`)).toBe(lotus);
    expect(cleanLine(lotus, 300)).toBe(lotus);
    expect(htmlToText("می‌خواهم")).toBe("می‌خواهم");
    expect(htmlToText(`a­b⁠c${ZWSP}d`)).toBe("abcd");
  });

  it("decodes only terminated references (strict HTML5), once", () => {
    const url =
      "https://example.edu/f?id=5&section=2&copy=1&times=3&para=x&reg=4&region=us&notify=1";
    expect(htmlToText(url)).toBe(url);
    expect(htmlToText("Pizza &not pasta")).toBe("Pizza &not pasta");
    expect(htmlToText("R&amp;D &copy; 2026 &#8211; caf&eacute;")).toBe("R&D © 2026 – café");
    expect(htmlToText("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(summaryFromText("Use &lt;b&gt; here")).toBe("Use &lt;b&gt; here");
  });
});

describe("markup edge cases", () => {
  it("an unbalanced quote does not swallow the text; unclosed script and style hide the rest", () => {
    expect(htmlToText("<img alt=Dave's>Photo by Dave")).toBe("Photo by Dave");
    expect(htmlToText('<a href="x">One</a> <b title="a<b">two</b>')).toBe('One <b title="atwo');
    expect(htmlToText("Kept<script>var a = 1; <b>not text</b>")).toBe("Kept");
    expect(htmlToText("Kept<select><option>One</option> after")).toBe("Kept One after");
    expect(htmlToText("<![CDATA[never closed")).toBe("<![CDATA[never closed");
    expect(htmlToText("<p>a</p>   \n  <p>b</p>")).toBe("a\nb");
  });
});

describe("linear time on hostile input", () => {
  const inputs: Array<[string, string]> = [
    ["x<y ", "x<y ".repeat(50_000)],
    ["<a", `${"<a".repeat(100_000)}"`],
    ["<p", `${"<p".repeat(100_000)}"`],
    ["<a x='", "<a x='".repeat(35_000)],
    ["<script>", "<script>".repeat(25_000)],
    ["<select>", "<select>".repeat(25_000)],
    ["<!", "<!".repeat(100_000)],
    ["<![CDATA[", "<![CDATA[".repeat(20_000)],
    ["<!--", "<!--".repeat(50_000)],
    ["spaces", `${" ".repeat(200_000)}x<p>y`],
  ];

  it.each(inputs)("htmlToText(%s × n, ~200 KB) finishes within 250 ms", (_label, input) => {
    const started = performance.now();
    htmlToText(input);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("summaries and lines read only a bounded prefix of long values", () => {
    const huge = `<p>${"word ".repeat(1_000_000)}</p>`;
    const started = performance.now();
    expect(summaryFromHtml(huge)!.length).toBeLessThanOrEqual(500);
    expect(cleanLine(huge, 300).length).toBeLessThanOrEqual(300);
    expect(performance.now() - started).toBeLessThan(250);
    expect(sliceText(`${"a".repeat(9)}😀`, 10)).toBe("a".repeat(9));
    expect(HTML_INPUT_MAX).toBe(20_000);
  });
});
