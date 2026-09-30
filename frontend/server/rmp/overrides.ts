import "server-only";
import { z } from "zod";
import { IsoDateSchema } from "@/lib/types/common";

/**
 * Hand-checked exceptions to the RateMyProfessors matcher (PLAN §5 "Ratings (RMP)": "override table incl. explicit
 * no-match"). An override is applied before any name matching:
 *
 *   rmp: { legacyId }              this instructor IS that RMP profile (preferred once the id is confirmed);
 *   rmp: { firstName, lastName }   this instructor is the Davidson roster row with that name (for a nickname the
 *                                  matcher cannot know, e.g. a preferred English name); it must resolve to exactly
 *                                  one Davidson row, else the instructor is left unmatched (0 rows) or 'review'
 *                                  (2+ rows);
 *   rmp: null                      explicit no-match: never show a rating for this instructor (a known namesake).
 *
 * `instructor` is the name exactly as the Davidson course API sends it (compared after normalizeName), and
 * `subjects` optionally limits the override to sections of those subject codes. Every entry cites the real RMP
 * profile and the course API listing it was checked against, and when. A target missing from the stored roster
 * (a profile RMP removed) leaves the instructor unmatched. Tests use their own table against the synthetic
 * fixture roster (tests/rmp/synthetic-overrides.ts); fixtures never hold real profile ids.
 */

export const RmpOverrideSchema = z
  .object({
    instructor: z.object({ first: z.string().min(1), last: z.string().min(1) }).strict(),
    subjects: z
      .array(z.string().regex(/^[A-Z]{2,4}$/))
      .min(1)
      .optional(),
    rmp: z.union([
      z.object({ legacyId: z.number().int().positive() }).strict(),
      z.object({ firstName: z.string().min(1), lastName: z.string().min(1) }).strict(),
      z.null(),
    ]),
    /** Why the override exists (what the matcher gets wrong). */
    note: z.string().min(1),
    /** Where the fact was checked. */
    source: z.string().min(1),
    verifiedAt: IsoDateSchema,
  })
  .strict();
export type RmpOverride = z.infer<typeof RmpOverrideSchema>;

export const RMP_OVERRIDES: readonly RmpOverride[] = [
  {
    instructor: { first: "Lengxob", last: "Yong" },
    rmp: { legacyId: 3133673 },
    note: "Listed on RateMyProfessors under the English name Lenny, which no nickname table can derive from Lengxob.",
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/3133673 ("Lenny Yong", Biology) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202601/202602: Lengxob Yong teaches BIO 116, 221, 240, 371, 372.',
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Shyam", last: "Gouri Suresh" },
    rmp: { legacyId: 1553730 },
    note: 'RMP lists this instructor by the two-word surname only, as "Suresh Gouri" (this, the profile with most ratings) and "Gouri Suresh" (1643286, a minor duplicate); matching that by rule would mean matching on the surname alone.',
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/1553730 ("Suresh Gouri", Economics) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202601/202602: Shyam Gouri Suresh teaches ECO 203, 232, 295, 337, 495 and SOU 101.',
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Silvi", last: "Toska" },
    rmp: { legacyId: 2225729 },
    note: "Silvi is the preferred form of Silvana; the nickname table does not guess it.",
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/2225729 ("Silvana Toska", Political Science) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202601/202602: Silvi Toska teaches POL 161, 291, 454.',
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Miffy", last: "Tsai" },
    rmp: { legacyId: 2125685 },
    note: "Listed on RateMyProfessors under the given name Yiting; Miffy is the English name in the course API.",
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/2125685 ("Yiting Tsai", Chinese) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202601/202602: Miffy Tsai teaches CHI 101, 102, 295.',
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Gayle", last: "Kaufman" },
    rmp: { legacyId: 507444 },
    note: 'RMP spells the given name "Gale".',
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/507444 ("Gale Kaufman", Sociology) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202602: Gayle Kaufman teaches SOC 201, 390.',
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Odmaa", last: "Narantungalag" },
    rmp: { legacyId: 3044486 },
    note: 'RMP spells the given name "Odma".',
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/3044486 ("Odma Narantungalag", Economics) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202601/202602: Odmaa Narantungalag teaches ECO 202, 341, 495.',
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Kata", last: "Chillag" },
    rmp: { legacyId: 2961947 },
    note: 'RMP spells the surname "Chilag" (department "Medicine" for a public health course).',
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/2961947 ("Kata Chilag", Medicine) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202501/202502: Kata Chillag teaches PBH 280.',
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Fernanda", last: "Villarroel Lamoza" },
    rmp: { legacyId: 3138671 },
    note: 'RMP spells the first surname "Villaroel".',
    source:
      'RateMyProfessors https://www.ratemyprofessors.com/professor/3138671 ("Fernanda Villaroel Lamoza", Interdisciplinary Studies) in the Davidson roster (newSearch.teachers, schoolID U2Nob29sLTM5NjU=) captured 2026-09-30T11:48Z; Davidson course API 202601/202602: Fernanda Villarroel Lamoza teaches AFR 155, 212, 255, 271 and WRI 101.',
    verifiedAt: "2026-09-30",
  },
];
