import { z } from "zod";
import {
  ClockTimeSchema,
  CourseCodeSchema,
  HttpsUrlSchema,
  IsoDateSchema,
  SlugSchema,
  SourcedSchema,
  TermCodeSchema,
} from "@/lib/types/common";

/**
 * Curated content (PLAN §4.1.6): typed records W4b converts from the verified `content-prep/*.json` files into
 * `server/content/*.ts`. Every record carries `sources[]` (https URLs) + `verifiedAt` ("YYYY-MM-DD"), and every
 * schema is strict so unvetted fields (bios, locations, notes, ratings, "best professor") cannot slip in.
 * `tests/content.test.ts` (W4b) validates every record against these schemas.
 */

/** A named link with a short description (career resources). */
export const ResourceLinkSchema = z
  .object({ name: z.string().min(1), url: HttpsUrlSchema, description: z.string() })
  .strict();
export type ResourceLink = z.infer<typeof ResourceLinkSchema>;

// ---- Careers -----------------------------------------------------------------------------------------------------

export const CAREER_CLUSTERS = [
  "Technology",
  "Business & Finance",
  "Health",
  "Media & Arts",
  "Law & Government",
  "Research & Education",
  "Social Impact",
  "Science & Environment",
] as const;

/**
 * A career path (24 slugs kept; unknown slug → notFound()). Per-term course availability is computed from the
 * catalog at request time (the snapshot `terms` lists in content-prep are not carried over), and so are alumni
 * (by `Alumnus.careerPathSlugs`). `pay` is BLS data with its own source URL and period.
 */
export const CareerSchema = SourcedSchema.extend({
  slug: SlugSchema,
  name: z.string().min(1),
  cluster: z.enum(CAREER_CLUSTERS),
  summary: z.string().min(1),
  whatYouDo: z.array(z.string().min(1)).min(1),
  departments: z.array(
    z.object({ code: z.string().regex(/^[A-Z]{2,4}$/), name: z.string() }).strict(),
  ),
  relatedPrograms: z.array(
    z
      .object({
        name: z.string(),
        acalogId: z.number().int(),
        type: z.enum(["major", "minor", "interdisciplinary-minor", "other"]),
      })
      .strict(),
  ),
  courses: z.array(
    z.object({ code: CourseCodeSchema, title: z.string(), why: z.string().min(1) }).strict(),
  ),
  pay: z
    .object({
      occupation: z.string(),
      medianAnnual: z.number().int().positive(),
      /** "May 2025". */
      period: z.string(),
      projectedGrowth: z.string(),
      url: HttpsUrlSchema,
    })
    .strict()
    .nullable(),
  davidsonResources: z.array(ResourceLinkSchema),
  externalResources: z.array(ResourceLinkSchema),
  /** Keywords for the Handshake search deep link (Handshake has no documented keyword URL: see HandshakeConfig). */
  handshakeQuery: z.string(),
}).strict();
export type Career = z.infer<typeof CareerSchema>;

// ---- Alumni ------------------------------------------------------------------------------------------------------

/** Hand-entered public profile URL; never fetched by code (PLAN §1). */
export const LINKEDIN_URL_PATTERN = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/$/;

export function isLinkedInUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

/** Displayed alumni fields that need their own non-LinkedIn source (LinkedIn User Agreement §8.2). */
export const ALUMNUS_SOURCED_FIELDS = ["classYear", "majors", "role", "organization"] as const;
export type AlumnusSourcedField = (typeof ALUMNUS_SOURCED_FIELDS)[number];

/**
 * A verified Davidson alumnus (PLAN §1 "Alumni"). Only: name, classYear, majors, role, organization, roleAsOf,
 * linkedinUrl, careerPathSlugs, contactable, sources, verifiedAt (+ id and per-field sources). No location, no
 * bio, nothing sensitive.
 * - A field whose only source is LinkedIn is null here and shown as "see LinkedIn".
 * - `fieldSources[field]` lists the sources for each non-null displayed field; at least one must be non-LinkedIn.
 * - `sources` (all sources for the person) must include at least one non-LinkedIn URL confirming attendance.
 * - `contactable: false` for public figures, trustees, Board members and college officers ("Notable alumni",
 *   no cold email).
 */
export const AlumnusSchema = z
  .object({
    id: SlugSchema,
    name: z.string().min(1).max(120),
    classYear: z.number().int().min(1900).max(2100).nullable(),
    majors: z.array(z.string().min(1)).min(1).nullable(),
    role: z.string().min(1).max(160).nullable(),
    organization: z.string().min(1).max(160).nullable(),
    /** When role/organization were last confirmed ("YYYY-MM-DD"); null when both are null. */
    roleAsOf: IsoDateSchema.nullable(),
    linkedinUrl: z
      .string()
      .regex(LINKEDIN_URL_PATTERN, "must be https://www.linkedin.com/in/<slug>/"),
    careerPathSlugs: z.array(SlugSchema),
    contactable: z.boolean(),
    sources: z.array(HttpsUrlSchema).min(1),
    fieldSources: z
      .object({
        classYear: z.array(HttpsUrlSchema).optional(),
        majors: z.array(HttpsUrlSchema).optional(),
        role: z.array(HttpsUrlSchema).optional(),
        organization: z.array(HttpsUrlSchema).optional(),
      })
      .strict(),
    verifiedAt: IsoDateSchema,
  })
  .strict()
  .superRefine((alumnus, ctx) => {
    if (!alumnus.sources.some((url) => !isLinkedInUrl(url))) {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "needs at least one non-LinkedIn source",
      });
    }
    for (const field of ALUMNUS_SOURCED_FIELDS) {
      if (alumnus[field] === null) continue;
      const urls = alumnus.fieldSources[field] ?? [];
      if (!urls.some((url) => !isLinkedInUrl(url))) {
        ctx.addIssue({
          code: "custom",
          path: ["fieldSources", field],
          message: `${field} is shown, so it needs a non-LinkedIn source (else set it to null: "see LinkedIn")`,
        });
      }
    }
    if ((alumnus.role !== null || alumnus.organization !== null) && alumnus.roleAsOf === null) {
      ctx.addIssue({ code: "custom", path: ["roleAsOf"], message: "required when role is shown" });
    }
  });
export type Alumnus = z.infer<typeof AlumnusSchema>;

// ---- Academic calendar -------------------------------------------------------------------------------------------

export const CALENDAR_CATEGORIES = [
  "registration",
  "classes",
  "deadline",
  "break",
  "holiday",
  "exams",
  "advising",
  "ceremony",
  "other",
] as const;

/**
 * One Registrar academic-calendar entry (source tag: REGISTRAR). Dates are America/New_York calendar dates;
 * `time` (24 h ET) is the opening/at time when the Registrar gives one ("WebTree opens Oct 12 at 7 a.m.").
 */
export const CalendarEventSchema = SourcedSchema.extend({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  category: z.enum(CALENDAR_CATEGORIES),
  start: IsoDateSchema,
  end: IsoDateSchema.nullable(),
  time: ClockTimeSchema.nullable(),
  termCode: TermCodeSchema,
  audience: z.string().nullable(),
  description: z.string(),
}).strict();
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

// ---- Offices and their programs ----------------------------------------------------------------------------------

/**
 * A curated opportunity program run by an office (grants, fellowships, courses...). Free-text `deadlineText` is
 * shown verbatim; `deadlines` holds the dates W4b could pin to a year (Due soon uses only these).
 */
export const ProgramSchema = SourcedSchema.extend({
  slug: SlugSchema,
  officeSlug: SlugSchema,
  name: z.string().min(1),
  url: HttpsUrlSchema,
  description: z.string(),
  amount: z.string().nullable(),
  deadlineText: z.string().nullable(),
  deadlines: z.array(z.object({ label: z.string().min(1), date: IsoDateSchema }).strict()),
  audience: z.string().nullable(),
  /** Source tag for the item (curated kind). */
  source: z.enum(["matthews-center", "hurt-hub-programs", "registrar"]),
}).strict();
export type Program = z.infer<typeof ProgramSchema>;

export const OfficeSchema = SourcedSchema.extend({
  slug: SlugSchema,
  name: z.string().min(1),
  url: HttpsUrlSchema,
  description: z.string(),
  services: z.array(z.string()),
  /** Slugs of this office's programs (records in the programs list). */
  programSlugs: z.array(SlugSchema),
}).strict();
export type Office = z.infer<typeof OfficeSchema>;

// ---- Portal links ------------------------------------------------------------------------------------------------

export const PORTAL_LINK_CATEGORIES = [
  "portal",
  "academics",
  "career",
  "campus-life",
  "library",
  "dining",
  "tech",
  "news",
  "athletics",
  "events",
] as const;

/**
 * A link-out to a Davidson platform (quick links, Sources panel "Links"). `source` is set for the platforms with a
 * source tag (HANDSHAKE / DAVIDSON ONE / ATHLETICS appear only on these curated deep links); else null.
 */
export const PortalLinkSchema = SourcedSchema.extend({
  slug: SlugSchema,
  name: z.string().min(1),
  url: HttpsUrlSchema,
  description: z.string(),
  requiresLogin: z.boolean(),
  category: z.enum(PORTAL_LINK_CATEGORIES),
  source: z.enum(["handshake", "davidson-one", "athletics"]).nullable(),
}).strict();
export type PortalLink = z.infer<typeof PortalLinkSchema>;

/** Handshake entry points. No keyword-search URL is documented, so `jobSearchUrlTemplate` stays null until one is. */
export const HandshakeConfigSchema = SourcedSchema.extend({
  baseUrl: HttpsUrlSchema,
  jobSearchUrlTemplate: z.string().nullable(),
}).strict();
export type HandshakeConfig = z.infer<typeof HandshakeConfigSchema>;
