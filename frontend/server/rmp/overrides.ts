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
 * `subjects` optionally limits the override to sections of those subject codes. Every entry says who checked it
 * and when; re-check entries when the weekly roster sync changes the matched row (see the Sources panel).
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
    rmp: { firstName: "Lenny", lastName: "Yong" },
    note: "Listed on RateMyProfessors under the English name Lenny, which no nickname table can derive from Lengxob.",
    source:
      "Davidson course API instructor list (Biology) and the RMP roster name form recorded in tests/fixtures/external/ratemyprofessors/cases.json",
    verifiedAt: "2026-09-30",
  },
];
