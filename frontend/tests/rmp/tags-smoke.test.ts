import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * scripts/rmp-tags-smoke.ts calls RateMyProfessors, so the suite only checks that it refuses to: in CI, without
 * RMP_LIVE_SMOKE=1, and with too many requests. --dry-run prints the tag request and sends nothing.
 */

const run = promisify(execFile);
const FRONTEND = fileURLToPath(new URL("../../", import.meta.url));
const ARGS = ["--experimental-transform-types", "--no-warnings", "scripts/rmp-tags-smoke.ts"];

async function smoke(args: string[], env: Record<string, string>) {
  try {
    const { stdout, stderr } = await run(process.execPath, [...ARGS, ...args], {
      cwd: FRONTEND,
      // No proxy and no live mode switch: a request could not leave the machine anyway.
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env },
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

describe("scripts/rmp-tags-smoke.ts", () => {
  it("never runs in CI, and needs RMP_LIVE_SMOKE=1 to call RateMyProfessors", async () => {
    expect(await smoke([], { CI: "1", RMP_LIVE_SMOKE: "1" })).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("never runs in CI"),
    });
    expect(await smoke([], {})).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("Set RMP_LIVE_SMOKE=1"),
    });
    expect(await smoke(["--requests=10"], { RMP_LIVE_SMOKE: "1" })).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("--requests must be 1-9"),
    });
  });

  it("--dry-run prints the production tag request: ratingTags and paging only", async () => {
    const { code, stdout } = await smoke(["--dry-run"], {});
    expect(code).toBe(0);
    const body = JSON.parse(stdout) as { query: string; variables: Record<string, unknown> };
    expect(body.query).toContain("edges { node { ratingTags } }");
    expect(body.query).not.toMatch(/comment|class|date/i);
    expect(body.variables).toMatchObject({ first: 100, after9000002: "cursor" });
  });
});
