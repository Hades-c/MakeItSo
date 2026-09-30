import { afterEach, describe, expect, it } from "vitest";
import {
  accountDataNames,
  eraseAccountData,
  exportAccountData,
  registerAccountData,
  resetAccountDataRegistry,
} from "@/server/account/erasers";

afterEach(() => {
  resetAccountDataRegistry();
});

describe("account data registry (PLAN §4.1.12)", () => {
  it("exports and erases every registered collection by name", async () => {
    const erased: string[] = [];
    registerAccountData("plans", {
      export: async (userId) => ({ userId, items: 3 }),
      erase: async (userId) => {
        erased.push(`plans:${userId}`);
        return 1;
      },
    });
    registerAccountData("aiusages", {
      export: async () => [],
      erase: async (userId) => {
        erased.push(`aiusages:${userId}`);
        return 4;
      },
    });
    expect(accountDataNames()).toEqual(["aiusages", "plans"]);
    expect(await exportAccountData("u1")).toEqual({
      aiusages: [],
      plans: { userId: "u1", items: 3 },
    });
    expect(await eraseAccountData("u1")).toEqual({ aiusages: 4, plans: 1 });
    expect(erased.sort()).toEqual(["aiusages:u1", "plans:u1"]);
  });

  it("runs every eraser even when one fails, then reports the failure", async () => {
    let ranSecond = false;
    registerAccountData("a-broken", {
      export: async () => null,
      erase: async () => {
        throw new Error("db down");
      },
    });
    registerAccountData("b-fine", {
      export: async () => null,
      erase: async () => {
        ranSecond = true;
        return 2;
      },
    });
    await expect(eraseAccountData("u1")).rejects.toThrow(/a-broken: db down/);
    expect(ranSecond).toBe(true);
  });

  it("replaces a registration with the same name (hot reload) and validates names", () => {
    const handler = { export: async () => 1, erase: async () => 1 };
    registerAccountData("plans", handler);
    registerAccountData("plans", { ...handler });
    expect(accountDataNames()).toEqual(["plans"]);
    expect(() => registerAccountData("Bad Name", handler)).toThrow(TypeError);
  });
});
