import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  commonPasswordSet,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isCommonPassword,
  isGuessablePassword,
  passwordCore,
  passwordProblem,
  verifyPassword,
} from "@/server/auth/passwords";

describe("the bundled common-password list", () => {
  it("is the SecLists top-10k, loaded once into a Set", () => {
    const set = commonPasswordSet();
    expect(set.size).toBe(10_001);
    expect(commonPasswordSet()).toBe(set);
    for (const entry of ["password", "123456", "1234567890", "qwertyuiop", "basketball"]) {
      expect(set.has(entry)).toBe(true);
    }
    // Every entry is lower-case and trimmed (the lookup normalises the candidate the same way).
    for (const entry of set) expect(entry).toBe(entry.trim().toLowerCase());
  });

  it("matches case-insensitively, after NFKC and trimming", () => {
    expect(isCommonPassword("QwertyUIOP")).toBe(true);
    expect(isCommonPassword("  basketball ")).toBe(true);
    expect(isCommonPassword("ｂａｓｋｅｔｂａｌｌ")).toBe(true);
    expect(isCommonPassword("correct horse battery staple")).toBe(false);
  });
});

describe("passwordProblem (PLAN §6.1 W3 policy)", () => {
  it("needs 10 to 72 UTF-8 bytes", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("a".repeat(9))).toMatch(/at least 10/);
    expect(passwordProblem("zqvmtkrpwy")).toBeNull();
    const seventyTwo = "pale kayak ".repeat(7).slice(0, 72);
    expect(passwordProblem(seventyTwo)).toBeNull();
    expect(passwordProblem(`${seventyTwo}x`)).toMatch(/at most 72 bytes/);
    // 37 × "é" is 37 characters but 74 bytes: bcrypt would silently ignore the tail.
    expect(passwordProblem("é".repeat(37))).toMatch(/at most 72 bytes/);
    // 5 two-byte letters are 10 bytes.
    expect(passwordProblem("éàüöç")).toBeNull();
  });

  it("rejects all-whitespace passwords", () => {
    expect(passwordProblem(" ".repeat(12))).toMatch(/only spaces/);
    expect(passwordProblem("\t\n".repeat(6))).toMatch(/only spaces/);
  });

  it("rejects passwords from the top-10k list", () => {
    expect(passwordProblem("1234567890")).toMatch(/commonly used/);
    expect(passwordProblem("Basketball")).toMatch(/commonly used/);
  });

  it("rejects the account's own address or its local part", () => {
    const email = "Alex.Wildcat@Davidson.edu";
    expect(passwordProblem("alex.wildcat", { email })).toMatch(/email address/);
    expect(passwordProblem("ALEX.WILDCAT@davidson.edu", { email })).toMatch(/email address/);
    // With digits or symbols around it, too.
    expect(passwordProblem("alex.wildcat 2030", { email })).toMatch(/email address/);
    expect(passwordProblem("!Alex.Wildcat@davidson.edu1", { email })).toMatch(/email address/);
    expect(passwordProblem("alex wildcat's banjo", { email })).toBeNull();
  });

  it("rejects a common password or site word with digits, symbols or letter swaps around it (review regression)", () => {
    // Only 51 of the 10k list's entries are 10+ bytes, so these all passed the list check alone.
    for (const password of [
      "password123",
      "password1234",
      "password12",
      "PASSWORD1234",
      "iloveyou123",
      "wildcats123",
      "Wildcats2027!",
      "davidson2026",
      "MakeItSo2026!",
      "p@ssw0rd123",
      "P@$$w0rd2026",
      "summer2026!",
      "i love you 2026",
      "!!monkey!!2026",
    ]) {
      expect(isGuessablePassword(password), password).toBe(true);
      expect(passwordProblem(password), password).toMatch(/too easy to guess|commonly used/);
    }
  });

  it("rejects short repeats and straight runs", () => {
    for (const password of [
      "aaaaaaaaaa",
      "abababababab",
      "abcabcabcabc",
      "abcdefghij",
      "9876543210",
      "zyxwvutsrq",
    ]) {
      expect(isGuessablePassword(password), password).toBe(true);
    }
  });

  it("still accepts long or unusual passphrases", () => {
    for (const password of [
      "correct horse battery staple",
      "Tr0ub4dor&3xq",
      "pale kayak orbit",
      "wildcats practice at 7am on tuesdays",
      "davidsonwildcatsforever",
      "9 lanterns under Chambers",
    ]) {
      expect(passwordProblem(password), password).toBeNull();
    }
    expect(passwordCore("  Summer2026! ")).toBe("summer");
    expect(passwordCore("2026")).toBe("");
  });
});

describe("hashing", () => {
  it("hashes with bcrypt cost 12 and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("still spends one comparison (against the dummy hash) when there is no stored hash", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    expect(await verifyPassword("anything at all", undefined)).toBe(false);
    expect(compare).toHaveBeenCalledWith("anything at all", DUMMY_PASSWORD_HASH);
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$12\$/);
  });

  it("treats a malformed stored hash as a failed comparison", async () => {
    expect(await verifyPassword("anything at all", "not-a-bcrypt-hash")).toBe(false);
  });
});
