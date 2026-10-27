import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * server/syllabi/extract.ts: the file itself is never stored (PLAN-UX §3), so this only checks the logic around
 * the two parsing libraries (file-kind detection, the too-little-text failure, error wrapping) — not pdf-parse's
 * or mammoth's own correctness, which is their job. The libraries are mocked rather than fed hand-built binary
 * fixtures: a byte-perfect synthetic PDF is its own small project, and a real one is too large to commit.
 */

const mocks = vi.hoisted(() => ({
  pdf: vi.fn(),
  extractRawText: vi.fn(),
}));
vi.mock("pdf-parse/lib/pdf-parse.js", () => ({ default: mocks.pdf }));
vi.mock("mammoth", () => ({ default: { extractRawText: mocks.extractRawText } }));

afterEach(() => {
  mocks.pdf.mockReset();
  mocks.extractRawText.mockReset();
});

const { ACCEPTED_TYPES, extractSyllabusText, fileKind, MAX_UPLOAD_BYTES, UnreadableSyllabusError } =
  await import("@/server/syllabi/extract");

describe("fileKind", () => {
  it("accepts a declared MIME type for either kind", () => {
    expect(fileKind("application/pdf", "syllabus")).toBe("pdf");
    expect(
      fileKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "syllabus",
      ),
    ).toBe("docx");
  });

  it("falls back to the file name's extension when the type is generic or missing", () => {
    expect(fileKind("application/octet-stream", "CSC221-syllabus.pdf")).toBe("pdf");
    expect(fileKind("", "CSC221-syllabus.DOCX")).toBe("docx");
    expect(fileKind("application/octet-stream", "CSC221-syllabus.doc")).toBeNull();
    expect(fileKind("text/plain", "notes.txt")).toBeNull();
  });

  it("every accepted MIME type maps to a kind fileKind also finds by name", () => {
    for (const [type, kind] of Object.entries(ACCEPTED_TYPES)) {
      expect(fileKind(type, `file.${kind}`)).toBe(kind);
    }
  });
});

describe("extractSyllabusText", () => {
  it("reads a PDF through pdf-parse", async () => {
    mocks.pdf.mockResolvedValue({ text: "Midterm exam on October 15. ".repeat(3) });
    await expect(extractSyllabusText(Buffer.from("x"), "pdf")).resolves.toContain("Midterm");
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(mocks.extractRawText).not.toHaveBeenCalled();
  });

  it("reads a DOCX through mammoth.extractRawText", async () => {
    mocks.extractRawText.mockResolvedValue({ value: "Final paper due December 3. ".repeat(3) });
    await expect(extractSyllabusText(Buffer.from("x"), "docx")).resolves.toContain("Final paper");
    expect(mocks.extractRawText).toHaveBeenCalledTimes(1);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("wraps a parsing exception as UnreadableSyllabusError", async () => {
    mocks.pdf.mockRejectedValue(new Error("Invalid PDF structure"));
    await expect(extractSyllabusText(Buffer.from("not a pdf"), "pdf")).rejects.toBeInstanceOf(
      UnreadableSyllabusError,
    );
  });

  it("treats too little text (a scanned image, a blank page) as unreadable, not an empty success", async () => {
    mocks.pdf.mockResolvedValue({ text: "   \n\n  " });
    await expect(extractSyllabusText(Buffer.from("x"), "pdf")).rejects.toBeInstanceOf(
      UnreadableSyllabusError,
    );
    mocks.pdf.mockResolvedValue({ text: "short" });
    await expect(extractSyllabusText(Buffer.from("x"), "pdf")).rejects.toBeInstanceOf(
      UnreadableSyllabusError,
    );
  });

  it("UnreadableSyllabusError is a 400 validation_failed naming a scanned-image workaround", () => {
    const error = new UnreadableSyllabusError("too short");
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.message).toMatch(/scanned image/);
  });
});

describe("MAX_UPLOAD_BYTES", () => {
  it("is the 10 MB the upload form and the route both check", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});
