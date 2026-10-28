import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { readEnv } from "@/server/env";

/**
 * Encryption at rest for a student's Moodle calendar URL (it carries their Moodle authtoken, a capability that
 * reads their Moodle calendar). AES-256-GCM; the key is derived with HKDF-SHA256 from MOODLE_FEED_KEY when set,
 * else from NEXTAUTH_SECRET, with its own salt and info so it is never the session-signing key itself.
 *
 * Stored form: "v1.<keyId>.<iv>.<tag>.<ciphertext>" (base64url). `keyId` is a short hash of the derived key, so a
 * changed key is told apart from a damaged value: decryptFeedUrl throws FeedKeyChangedError, and the student is
 * asked to reconnect. The URL is never logged; errors here never include it.
 */

const VERSION = "v1";
const SALT = "makeitso/moodle-feed-url";
const INFO = "aes-256-gcm v1";

export class FeedKeyChangedError extends Error {
  constructor() {
    super("The saved Moodle link was encrypted with a different key");
    this.name = "FeedKeyChangedError";
  }
}

interface FeedKey {
  key: Buffer;
  id: string;
}

function feedKey(source: Record<string, string | undefined> = process.env): FeedKey {
  const material = readEnv("MOODLE_FEED_KEY", source) ?? readEnv("NEXTAUTH_SECRET", source);
  const key = Buffer.from(hkdfSync("sha256", material, SALT, INFO, 32));
  const id = createHash("sha256").update("makeitso/moodle-key-id").update(key).digest("base64url");
  return { key, id: id.slice(0, 12) };
}

export function encryptFeedUrl(url: string, source?: Record<string, string | undefined>): string {
  const { key, id } = feedKey(source);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, id, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** The URL back. FeedKeyChangedError when the key is not the one it was stored with; Error when damaged. */
export function decryptFeedUrl(
  stored: string,
  source?: Record<string, string | undefined>,
): string {
  const [version, id, iv, tag, ciphertext, ...rest] = stored.split(".");
  if (version !== VERSION || !id || !iv || !tag || !ciphertext || rest.length > 0) {
    throw new Error("The saved Moodle link is not in a readable form");
  }
  const current = feedKey(source);
  if (id !== current.id) throw new FeedKeyChangedError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", current.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("The saved Moodle link could not be decrypted");
  }
}
