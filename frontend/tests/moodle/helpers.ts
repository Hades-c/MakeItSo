import { createCipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * A Moodle feed URL in the v1 stored form (server/moodle/crypto.ts before owner binding: no associated data), built
 * by hand from the documented derivation, for the tests that read it back.
 */
export function encryptV1(url: string, secret: string): string {
  const key = Buffer.from(
    hkdfSync("sha256", secret, "makeitso/moodle-feed-url", "aes-256-gcm v1", 32),
  );
  const id = createHash("sha256").update("makeitso/moodle-key-id").update(key).digest("base64url");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return ["v1", id.slice(0, 12), iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}
