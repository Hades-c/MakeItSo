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
 *   - not such a password, or a site word (makeitso, davidson, wildcats…), with only digits, symbols or spaces
 *     around it, and not with common letter-for-digit swaps ("Password2026!", "p@ssw0rd99", "Wildcats123").
 *     Only 51 of the 10k list's entries are 10+ bytes, so the list alone hardly constrains a 10-byte minimum;
 *     the "core" check is what makes it bite;
 *   - not one short unit repeated ("aaaaaaaaaa", "abcabcabcabc") or a straight run ("abcdefghij", "9876543210");
 *   - not the account's own e-mail address or its local part (with or without digits and symbols around it).
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

/** Words anyone guessing a MakeItSo / Davidson student's password tries first. */
const SITE_WORDS: ReadonlySet<string> = new Set([
  "makeitso",
  "davidson",
  "davidsoncollege",
  "wildcat",
  "wildcats",
  "gocats",
  "gowildcats",
]);

const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "l",
  "+": "t",
};

/** The password without the digits, symbols and spaces around its letters: "Summer2026!" → "summer". */
export function passwordCore(password: string): string {
  return password
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

function undoLeet(value: string): string {
  return [...value].map((char) => LEET[char] ?? char).join("");
}

/** One unit of at most 4 characters repeated ("aaaaaaaaaa", "abababab"). */
function isShortRepeat(value: string): boolean {
  return /^([\s\S]{1,4})\1+$/u.test(value);
}

/** Every character one code point above (or below) the previous one ("abcdefghij", "0123456789"). */
function isStraightRun(value: string): boolean {
  const codes = [...value].map((char) => char.codePointAt(0) ?? 0);
  if (codes.length < 4) return false;
  const steps = codes.slice(1).map((code, i) => code - (codes[i] ?? 0));
  const step = steps[0];
  return (step === 1 || step === -1) && steps.every((s) => s === step);
}

/** A common password or site word with only digits, symbols, spaces or letter-for-digit swaps added. */
export function isGuessablePassword(password: string): boolean {
  const whole = password.normalize("NFKC").trim().toLowerCase();
  if (isShortRepeat(whole) || isStraightRun(whole)) return true;
  const core = passwordCore(password);
  const candidates = new Set([core, core.replace(/\s+/g, "")]);
  for (const candidate of [...candidates]) candidates.add(undoLeet(candidate));
  const common = commonPasswordSet();
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (common.has(candidate) || SITE_WORDS.has(candidate) || isShortRepeat(candidate)) return true;
  }
  return false;
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
  if (isGuessablePassword(password)) {
    return "This password is too easy to guess: a common password or word with a few numbers or symbols added. Choose something less guessable.";
  }
  if (context.email) {
    const email = normalizeEmail(context.email);
    const candidate = password.normalize("NFKC").trim().toLowerCase();
    const localPart = email.split("@")[0] ?? "";
    const core = passwordCore(password);
    const localCore = passwordCore(localPart);
    if (
      candidate === email ||
      (localPart.length > 0 && candidate === localPart) ||
      (localCore.length > 0 && (core === localCore || core === passwordCore(email)))
    ) {
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
