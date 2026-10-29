import { describe, expect, it } from "vitest";
import { encryptV1 } from "./helpers";
import { decryptFeedUrl, encryptFeedUrl, FeedKeyChangedError } from "@/server/moodle/crypto";

/** server/moodle/crypto.ts: the Moodle calendar URL at rest (AES-256-GCM, HKDF key). */

const URL =
  "https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=0123456789abcdef0123456789abcdef01234567&preset_what=all&preset_time=recentupcoming";
const SECRET = { NEXTAUTH_SECRET: "a".repeat(40) };
const OWN_KEY = { ...SECRET, MOODLE_FEED_KEY: "b".repeat(40) };
const ME = "64b7f0a1c2d3e4f5a6b7c8d9";
const SOMEONE_ELSE = "64b7f0a1c2d3e4f5a6b7c8da";

describe("encryptFeedUrl / decryptFeedUrl", () => {
  it("round-trips, and never stores the URL or its token in the clear", () => {
    const stored = encryptFeedUrl(URL, ME, SECRET);
    expect(stored).toMatch(/^v2\.[\w-]{12}\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(stored).not.toContain("moodle");
    expect(stored).not.toContain("0123456789abcdef");
    expect(decryptFeedUrl(stored, ME, SECRET)).toEqual({ url: URL, stale: false });
  });

  it("binds the value to its owner: copied onto another student's connection, it does not decrypt", () => {
    const stored = encryptFeedUrl(URL, ME, SECRET);
    expect(() => decryptFeedUrl(stored, SOMEONE_ELSE, SECRET)).toThrow(/could not be decrypted/);
  });

  it("still reads the v1 form, and says to store it again", () => {
    const v1 = encryptV1(URL, SECRET.NEXTAUTH_SECRET);
    expect(decryptFeedUrl(v1, ME, SECRET)).toEqual({ url: URL, stale: true });
    // Rewriting the version tag does not skip the owner check on a v2 value either.
    const v2 = encryptFeedUrl(URL, ME, SECRET);
    expect(() => decryptFeedUrl(v2.replace(/^v2/, "v1"), SOMEONE_ELSE, SECRET)).toThrow(
      /could not be decrypted/,
    );
  });

  it("uses a fresh IV each time", () => {
    expect(encryptFeedUrl(URL, ME, SECRET)).not.toBe(encryptFeedUrl(URL, ME, SECRET));
  });

  it("derives the key from MOODLE_FEED_KEY when set, else from NEXTAUTH_SECRET", () => {
    const withOwnKey = encryptFeedUrl(URL, ME, OWN_KEY);
    expect(decryptFeedUrl(withOwnKey, ME, OWN_KEY).url).toBe(URL);
    // Same NEXTAUTH_SECRET, but the URL was encrypted with MOODLE_FEED_KEY: a different key.
    expect(() => decryptFeedUrl(withOwnKey, ME, SECRET)).toThrow(FeedKeyChangedError);
    // NEXTAUTH_SECRET is not used once MOODLE_FEED_KEY is set.
    expect(
      decryptFeedUrl(withOwnKey, ME, { ...OWN_KEY, NEXTAUTH_SECRET: "c".repeat(40) }).url,
    ).toBe(URL);
  });

  it("says the key changed when the secret it was stored with is gone", () => {
    const stored = encryptFeedUrl(URL, ME, SECRET);
    expect(() => decryptFeedUrl(stored, ME, { NEXTAUTH_SECRET: "d".repeat(40) })).toThrow(
      FeedKeyChangedError,
    );
  });

  it("refuses a tampered or damaged value without saying what it held", () => {
    const stored = encryptFeedUrl(URL, ME, SECRET);
    const parts = stored.split(".");
    const flipped = parts[4]!.startsWith("A") ? `B${parts[4]!.slice(1)}` : `A${parts[4]!.slice(1)}`;
    const tampered = [...parts.slice(0, 4), flipped].join(".");
    expect(() => decryptFeedUrl(tampered, ME, SECRET)).toThrow(/could not be decrypted/);
    expect(() => decryptFeedUrl("v2.only.three", ME, SECRET)).toThrow(/not in a readable form/);
    expect(() => decryptFeedUrl(URL, ME, SECRET)).toThrow(/not in a readable form/);
    try {
      decryptFeedUrl(tampered, ME, SECRET);
    } catch (error) {
      expect(String(error)).not.toContain("authtoken");
    }
  });

  it("rejects a MOODLE_FEED_KEY shorter than 32 characters", () => {
    expect(() => encryptFeedUrl(URL, ME, { ...SECRET, MOODLE_FEED_KEY: "short" })).toThrow(
      /MOODLE_FEED_KEY must be at least 32 characters/,
    );
  });
});
