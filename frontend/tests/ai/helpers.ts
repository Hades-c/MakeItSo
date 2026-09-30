import mongoose from "mongoose";
import type { PlanDraft, PlanItem, PlanProgress, PlanView } from "@/lib/types/plan";
import { REQUIREMENT_SLOTS, type RequirementSlot, type SlotStatus } from "@/lib/types/plan";
import { FIXTURE_NOW, insertUser, jsonRequest } from "../w3/helpers";

/**
 * Shared helpers for the W6 (AI) tests. Route tests run the real session code with NextAuth's cookie decoding
 * replaced (the W3 pattern), so every file declares:
 *
 *   const auth = vi.hoisted(() => ({ session: null as Session | null }));
 *   vi.mock("next-auth", async (importOriginal) => ({
 *     ...(await importOriginal<Record<string, unknown>>()),
 *     getServerSession: async () => auth.session,
 *   }));
 *   vi.mock("next/server", async (importOriginal) => ({
 *     ...(await importOriginal<Record<string, unknown>>()),
 *     connection: async () => undefined,
 *   }));
 */

export { errorOf, FIXTURE_NOW, jsonRequest, ORIGIN, sessionFor, stubAuthEnv } from "../w3/helpers";

export const CS_MAJOR = "Major in Computer Science (B.S. Degree)";
export const ECO_MINOR = "Minor in Economics";
/** Free text a student may have in legacy fields: must never reach a model. */
export const SECRET_BIO = "SECRET-BIO-7f3a I love hiking and my GPA is 3.9";

export interface StudentOptions {
  name?: string;
  email?: string;
  verified?: boolean;
  consent?: boolean;
  adult?: boolean;
  raw?: Record<string, unknown>;
}

/** A student account (verified @davidson.edu, consented, 18+ unless told otherwise) with profile fields. */
export async function insertStudent(options: StudentOptions = {}) {
  const at = new Date(FIXTURE_NOW);
  return insertUser({
    name: options.name ?? "Sam Studentname",
    email: options.email,
    raw: {
      emailVerifiedAt: options.verified === false ? null : at,
      sessionVersion: 0,
      graduationYear: 2029,
      majors: [CS_MAJOR, "Not An Official Major"],
      minors: [ECO_MINOR],
      interests: ["software-engineering", "not-a-career"],
      bio: SECRET_BIO,
      careerInterests: [SECRET_BIO],
      ...(options.consent === false ? {} : { aiConsentAt: at }),
      ...(options.adult === false ? {} : { adultAttestedAt: at }),
      ...options.raw,
    },
  });
}

export function aiRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return jsonRequest(path, { body, headers });
}

export async function bodyOf<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---- Plan service stand-ins (W5s builds server/plan in parallel; tests mock its frozen exports) ---------------------

let itemCounter = 0;

export function planItem(
  partial: Partial<PlanItem> & Pick<PlanItem, "courseCode" | "termCode" | "status">,
): PlanItem {
  itemCounter += 1;
  return {
    id: new mongoose.Types.ObjectId().toString(),
    canonicalCode: partial.courseCode,
    title: `Course ${itemCounter}`,
    credits: 1,
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...partial,
  };
}

export function planView(items: PlanItem[]): PlanView {
  return {
    items,
    summer: [],
    deadlines: [],
    manual: { languageExempt: false, pe: { lifetimeActivities: 0, teamSport: false } },
    legacy: false,
    updatedAt: null,
  };
}

/** Progress with `open` slots open and every other slot done. */
export function progressWith(open: readonly RequirementSlot[]): PlanProgress {
  const reqs = Object.fromEntries(
    REQUIREMENT_SLOTS.map((slot) => [slot, open.includes(slot) ? "open" : "done"]),
  ) as Record<RequirementSlot, SlotStatus>;
  return { creditsDone: 8, creditsPlanned: 12, required: 32, reqs, filledBy: {}, warnings: [] };
}

/** An in-memory draft store per student with the saveDraft / listDrafts contract of server/plan. */
export function draftStore() {
  const byUser = new Map<string, PlanDraft[]>();
  const of = (userId: string) => {
    let list = byUser.get(userId);
    if (!list) byUser.set(userId, (list = []));
    return list;
  };
  return {
    of,
    clear: () => byUser.clear(),
    async saveDraft(userId: string, draft: Omit<PlanDraft, "id" | "createdAt" | "status">) {
      const saved: PlanDraft = {
        ...draft,
        id: new mongoose.Types.ObjectId().toString(),
        status: "pending",
        createdAt: new Date(FIXTURE_NOW).toISOString(),
      };
      of(userId).unshift(saved);
      return saved;
    },
    async listDrafts(userId: string) {
      return [...of(userId)];
    },
  };
}
