import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  commonPasswordSet,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isCommonPassword,
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
    expect(passwordProblem("zq".repeat(5))).toBeNull();
    expect(passwordProblem("x".repeat(72))).toBeNull();
    expect(passwordProblem("x".repeat(73))).toMatch(/at most 72 bytes/);
    // 37 × "é" is 37 characters but 74 bytes: bcrypt would silently ignore the tail.
    expect(passwordProblem("é".repeat(37))).toMatch(/at most 72 bytes/);
    // 5 × "é" is 10 bytes.
    expect(passwordProblem("é".repeat(5))).toBeNull();
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
    expect(passwordProblem("alex.wildcat 2030", { email })).toBeNull();
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
