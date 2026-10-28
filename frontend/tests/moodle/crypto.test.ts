import { describe, expect, it } from "vitest";
import { decryptFeedUrl, encryptFeedUrl, FeedKeyChangedError } from "@/server/moodle/crypto";

/** server/moodle/crypto.ts: the Moodle calendar URL at rest (AES-256-GCM, HKDF key). */

const URL =
  "https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=0123456789abcdef0123456789abcdef01234567&preset_what=all&preset_time=recentupcoming";
const SECRET = { NEXTAUTH_SECRET: "a".repeat(40) };
const OWN_KEY = { ...SECRET, MOODLE_FEED_KEY: "b".repeat(40) };

describe("encryptFeedUrl / decryptFeedUrl", () => {
  it("round-trips, and never stores the URL or its token in the clear", () => {
    const stored = encryptFeedUrl(URL, SECRET);
    expect(stored).toMatch(/^v1\.[\w-]{12}\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(stored).not.toContain("moodle");
    expect(stored).not.toContain("0123456789abcdef");
    expect(decryptFeedUrl(stored, SECRET)).toBe(URL);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptFeedUrl(URL, SECRET)).not.toBe(encryptFeedUrl(URL, SECRET));
  });

  it("derives the key from MOODLE_FEED_KEY when set, else from NEXTAUTH_SECRET", () => {
    const withOwnKey = encryptFeedUrl(URL, OWN_KEY);
    expect(decryptFeedUrl(withOwnKey, OWN_KEY)).toBe(URL);
    // Same NEXTAUTH_SECRET, but the URL was encrypted with MOODLE_FEED_KEY: a different key.
    expect(() => decryptFeedUrl(withOwnKey, SECRET)).toThrow(FeedKeyChangedError);
    // NEXTAUTH_SECRET is not used once MOODLE_FEED_KEY is set.
    expect(decryptFeedUrl(withOwnKey, { ...OWN_KEY, NEXTAUTH_SECRET: "c".repeat(40) })).toBe(URL);
  });

  it("says the key changed when the secret it was stored with is gone", () => {
    const stored = encryptFeedUrl(URL, SECRET);
    expect(() => decryptFeedUrl(stored, { NEXTAUTH_SECRET: "d".repeat(40) })).toThrow(
      FeedKeyChangedError,
    );
  });

  it("refuses a tampered or damaged value without saying what it held", () => {
    const stored = encryptFeedUrl(URL, SECRET);
    const parts = stored.split(".");
    const flipped = parts[4]!.startsWith("A") ? `B${parts[4]!.slice(1)}` : `A${parts[4]!.slice(1)}`;
    const tampered = [...parts.slice(0, 4), flipped].join(".");
    expect(() => decryptFeedUrl(tampered, SECRET)).toThrow(/could not be decrypted/);
    expect(() => decryptFeedUrl("v1.only.three", SECRET)).toThrow(/not in a readable form/);
    expect(() => decryptFeedUrl(URL, SECRET)).toThrow(/not in a readable form/);
    try {
      decryptFeedUrl(tampered, SECRET);
    } catch (error) {
      expect(String(error)).not.toContain("authtoken");
    }
  });

  it("rejects a MOODLE_FEED_KEY shorter than 32 characters", () => {
    expect(() => encryptFeedUrl(URL, { ...SECRET, MOODLE_FEED_KEY: "short" })).toThrow(
      /MOODLE_FEED_KEY must be at least 32 characters/,
    );
  });
});
