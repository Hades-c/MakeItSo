import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("serves outside services from fixtures", () => {
    expect(process.env.EXTERNAL_MODE).toBe("fixtures");
  });

  it("refuses real network access", async () => {
    await expect(fetch("https://api.davidson.edu/api/public/v2/terms")).rejects.toThrow(
      /Network access in a unit test/,
    );
  });
});
