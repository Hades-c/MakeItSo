import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { envSchema, NEXTAUTH_SECRET_PLACEHOLDER } from "@/server/env";

const example = readFileSync(fileURLToPath(new URL("../../.env.example", import.meta.url)), "utf8");
const entries = new Map(
  example
    .split("\n")
    .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1]!, m[2]!]),
);

/** Set by Node, Next.js or Vercel, not by the developer. */
const RUNTIME = ["NODE_ENV", "VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL"];

describe(".env.example", () => {
  it("documents every variable in server/env.ts, and nothing else", () => {
    const schemaKeys = Object.keys(envSchema.shape).filter((key) => !RUNTIME.includes(key));
    expect([...entries.keys()].sort()).toEqual(schemaKeys.sort());
  });

  it("ships the placeholder secret that production rejects", () => {
    expect(entries.get("NEXTAUTH_SECRET")).toBe(NEXTAUTH_SECRET_PLACEHOLDER);
  });

  it("parses as a valid development environment", () => {
    const result = envSchema.safeParse(Object.fromEntries(entries));
    expect(result.success).toBe(true);
  });
});
