import "server-only";
import bcrypt from "bcryptjs";
import {
  normalizeEmail,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_BYTES,
  utf8ByteLength,
} from "@/lib/api/account";
import { COMMON_PASSWORDS_TEXT } from "@/server/auth/common-passwords";

/**
 * Password policy and hashing (PLAN §6.1 W3).
 *
 * Policy (every new password: registration, change, reset):
 *   - 10–72 UTF-8 bytes (bcrypt ignores bytes after 72) and not only whitespace — also enforced by the shared
 *     PasswordSchema in lib/api/account.ts, so the client can say it before submitting;
 *   - not in the bundled list of the 10k most common passwords (compared case-insensitively, whitespace trimmed);
 *   - not the account's own e-mail address or its local part.
 * Existing passwords are never re-checked: legacy accounts (8+ characters under the old rules) keep signing in.
 *
 * Hashes are bcrypt, cost 12. Sign-in compares against DUMMY_PASSWORD_HASH when no account matches, so "unknown
 * e-mail" and "wrong password" take about the same time.
 */

export const BCRYPT_COST = 12;

/** bcrypt hash (cost 12) of a random throwaway password: the timing twin of a real comparison. */
export const DUMMY_PASSWORD_HASH = "$2b$12$gNrJS2r3FIW85WDa5/6Hc..yhwC72fiXejL0onpbw3tQ4XRkRks3a";

let commonPasswords: ReadonlySet<string> | undefined;

/** The bundled list, parsed into a Set on first use (once per server instance). */
export function commonPasswordSet(): ReadonlySet<string> {
  commonPasswords ??= new Set(COMMON_PASSWORDS_TEXT.split("\n"));
  return commonPasswords;
}

export function isCommonPassword(password: string): boolean {
  return commonPasswordSet().has(password.normalize("NFKC").trim().toLowerCase());
}

export interface PasswordContext {
  /** The account's e-mail address (normalised or not). */
  email?: string;
}

/**
 * Why `password` is not acceptable as a new password, or null when it is. Messages are shown under the field and
 * never depend on whether an account exists.
 */
export function passwordProblem(password: string, context: PasswordContext = {}): string | null {
  const bytes = utf8ByteLength(password);
  if (bytes < PASSWORD_MIN_BYTES) return "Use at least 10 characters";
  if (bytes > PASSWORD_MAX_BYTES) return "Use at most 72 bytes";
  if (password.trim().length === 0) return "The password cannot be only spaces";
  if (isCommonPassword(password)) {
    return "This password is on a list of commonly used passwords. Choose something less guessable.";
  }
  if (context.email) {
    const email = normalizeEmail(context.email);
    const candidate = password.normalize("NFKC").trim().toLowerCase();
    const localPart = email.split("@")[0] ?? "";
    if (candidate === email || (localPart.length > 0 && candidate === localPart)) {
      return "Don't use your email address as your password.";
    }
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Compare against a stored hash; a missing hash still costs one comparison (against DUMMY_PASSWORD_HASH). */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    // A malformed stored hash is a failed comparison, not a crash.
    return false;
  }
}
