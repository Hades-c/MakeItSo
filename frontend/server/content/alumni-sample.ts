import "server-only";
import * as z from "zod";
import { HttpsUrlSchema, IsoDateSchema } from "@/lib/types/common";
import { CAREERS, isCareerSlug } from "@/server/content/careers";
import { defineContent, defineContentObject } from "@/server/content/define";

/**
 * The Davidson Connect preview's SAMPLE profiles (owner's request, "Eurekas" tab, 2026-11: an alumni button that shows
 * sample data from the Davidson Connect directory, which is not connected, for pitching). Davidson Connect is
 * the college's alumni platform (DAVIDSON_CONNECT below, sourced); MakeItSo has none of its data. These records show
 * what a connected directory card could look like, and nothing more:
 *
 * - Every person here is FICTIONAL: plain, ordinary invented names (none is a real person we know of, none is in
 *   server/content/alumni.ts), no photos (initials only), and organizations given only as generic descriptors
 *   ("a Charlotte fintech startup"), never a real company's name next to an invented person. Nor a descriptor
 *   that, with the location, singles out one real organization ("a public research university" in Columbia, SC
 *   is the University of South Carolina): the pair must fit several employers there, or the location is a region
 *   ("North Carolina", "the Southeast"; tests/content/alumni-sample.test.ts keeps the pairs once found). Cities, Davidson
 *   majors (checked against the career content's official majors) and career paths are real, so the filters work
 *   as they will.
 * - Every record says `sample: true` (a literal in its schema), every id starts with "sample-", and the record
 *   shape is not the verified Alumnus (AlumnusSchema is strict and rejects it), so they cannot be mixed into real
 *   data by accident.
 * - Isolation (tests/content/alumni-sample-isolation.test.ts): this module is NOT re-exported from
 *   server/content/index.ts, and nothing but the preview page (app/(hub)/alumni/preview) and the career pages'
 *   preview link may import it: never the verified directory, site search, the verified-alumni card, AI prompts
 *   (the cold e-mail looks people up in server/content/alumni.ts only), the account export, or any API route.
 * - Wherever a sample profile is shown it carries the "Sample" label, under the page's non-dismissable
 *   "Davidson Connect preview · sample data" notice.
 *
 * Behind FEATURE_ALUMNI_PREVIEW (and FEATURE_CAREERS): server/features.ts alumniPreviewEnabled. Remove this module
 * and the preview once the real integration lands.
 */

/** Davidson Connect, as the college describes it: the one real-world fact the preview states. */
export const DavidsonConnectSchema = z
  .object({
    name: z.literal("Davidson Connect"),
    /** The college's own description of the platform. */
    sourceUrl: HttpsUrlSchema,
    sourceTitle: z.string().min(1),
    verifiedAt: IsoDateSchema,
  })
  .strict();

export const DAVIDSON_CONNECT = defineContentObject("alumni-sample", DavidsonConnectSchema, {
  name: "Davidson Connect",
  // "Join Davidson Connect, your one-stop platform for alumni career connections and more ... post and apply for
  // jobs, connect with your classmates and fellow alumni, and more." Also www.davidson.edu/offices/career-
  // development/alumni: "Join Davidson Connect, our alumni portal, where you can participate in our mentorship
  // program" (both checked 2026-11-02).
  sourceUrl: "https://www.davidson.edu/alumni-and-families/alumni-careers-networking",
  sourceTitle: "Davidson College, Alumni Careers & Networking",
  verifiedAt: "2026-11-02",
});

/** The industries a sample card names (Davidson Connect-style groupings; the preview's "Industry" filter). */
export const SAMPLE_INDUSTRIES = [
  "Technology",
  "Financial services",
  "Consulting",
  "Health care",
  "Legal",
  "Government & policy",
  "Higher education",
  "K-12 education",
  "Nonprofit",
  "Media & publishing",
  "Marketing & advertising",
  "Environment & energy",
  "Architecture & planning",
  "Sports",
  "Arts & culture",
] as const;
export type SampleIndustry = (typeof SAMPLE_INDUSTRIES)[number];

/** "Government & policy" → "government-policy": the industry's URL value. */
export function sampleIndustrySlug(industry: SampleIndustry): string {
  return industry
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The industry a URL value names, or null. */
export function sampleIndustryFromSlug(slug: string | undefined): SampleIndustry | null {
  return SAMPLE_INDUSTRIES.find((industry) => sampleIndustrySlug(industry) === slug) ?? null;
}

/** What a sample alumnus offers students, as a Davidson Connect profile would list it. */
export const SAMPLE_HELP_TOPICS = [
  "Informational chat",
  "Resume review",
  "Job shadowing",
  "Mock interviews",
  "Grad school advice",
] as const;
export type SampleHelpTopic = (typeof SAMPLE_HELP_TOPICS)[number];

/** The Davidson majors the career content names (official Acalog programs): a sample major must be one of them. */
const DAVIDSON_MAJORS: ReadonlySet<string> = new Set(
  CAREERS.flatMap((career) =>
    career.relatedPrograms.filter((p) => p.type === "major").map((p) => p.name),
  ),
);

export const SampleAlumnusSchema = z
  .object({
    id: z.string().regex(/^sample-[a-z0-9]+(?:-[a-z0-9]+)*$/, 'starts with "sample-"'),
    /** Always true: a sample profile can never pass for a real one. */
    sample: z.literal(true),
    name: z.string().min(3),
    classYear: z.number().int().min(1960).max(2026),
    majors: z.array(z.string().min(1)).min(1).max(2),
    role: z.string().min(1),
    /** A generic descriptor ("a regional hospital system"), never a real organization's name. */
    organization: z.string().regex(/^an? \S/, 'a generic descriptor such as "a ..." or "an ..."'),
    /** City or region ("Charlotte, NC"). */
    location: z.string().min(1),
    industry: z.enum(SAMPLE_INDUSTRIES),
    careerPathSlugs: z.array(z.string()).min(1),
    canHelpWith: z.array(z.enum(SAMPLE_HELP_TOPICS)).min(1),
  })
  .strict()
  .superRefine((record, ctx) => {
    for (const major of record.majors) {
      if (!DAVIDSON_MAJORS.has(major)) {
        ctx.addIssue({
          code: "custom",
          path: ["majors"],
          message: `not a Davidson major: ${major}`,
        });
      }
    }
    for (const slug of record.careerPathSlugs) {
      if (!isCareerSlug(slug)) {
        ctx.addIssue({ code: "custom", path: ["careerPathSlugs"], message: `unknown: ${slug}` });
      }
    }
    if (new Set(record.canHelpWith).size !== record.canHelpWith.length) {
      ctx.addIssue({ code: "custom", path: ["canHelpWith"], message: "listed twice" });
    }
  });
export type SampleAlumnus = z.output<typeof SampleAlumnusSchema>;

// Fictional people, all of them. See the rules above before adding one.
const RECORDS: z.input<typeof SampleAlumnusSchema>[] = [
  {
    id: "sample-megan-hollis",
    sample: true,
    name: "Megan Hollis",
    classYear: 2019,
    majors: ["Computer Science"],
    role: "Software engineer",
    organization: "a Charlotte fintech startup",
    location: "Charlotte, NC",
    industry: "Technology",
    careerPathSlugs: ["software-engineering"],
    canHelpWith: ["Resume review", "Mock interviews"],
  },
  {
    id: "sample-marcus-dalton",
    sample: true,
    name: "Marcus Dalton",
    classYear: 2015,
    majors: ["Mathematics", "Economics"],
    role: "Senior data scientist",
    organization: "a regional hospital system",
    location: "Raleigh, NC",
    industry: "Health care",
    careerPathSlugs: ["data-science", "healthcare-administration"],
    canHelpWith: ["Informational chat", "Resume review"],
  },
  {
    id: "sample-priya-raman",
    sample: true,
    name: "Priya Raman",
    classYear: 2017,
    majors: ["Economics"],
    role: "Vice president, investment banking",
    organization: "a mid-sized investment bank",
    location: "New York, NY",
    industry: "Financial services",
    careerPathSlugs: ["investment-banking"],
    canHelpWith: ["Informational chat", "Mock interviews", "Resume review"],
  },
  {
    id: "sample-caroline-ashby",
    sample: true,
    name: "Caroline Ashby",
    classYear: 2020,
    majors: ["Philosophy, Politics, and Economics"],
    role: "Consultant",
    organization: "a global management consulting firm",
    location: "Atlanta, GA",
    industry: "Consulting",
    careerPathSlugs: ["management-consulting"],
    canHelpWith: ["Mock interviews", "Informational chat"],
  },
  {
    id: "sample-jordan-pace",
    sample: true,
    name: "Jordan Pace",
    classYear: 2014,
    majors: ["Computer Science"],
    role: "Senior product manager",
    organization: "a Seattle software company",
    location: "Seattle, WA",
    industry: "Technology",
    careerPathSlugs: ["product-management", "ux-design"],
    canHelpWith: ["Informational chat", "Job shadowing"],
  },
  {
    id: "sample-elena-moreno",
    sample: true,
    name: "Elena Moreno",
    classYear: 2011,
    majors: ["Biology"],
    role: "Physician, internal medicine",
    organization: "an academic medical center",
    location: "the Southeast",
    industry: "Health care",
    careerPathSlugs: ["medicine"],
    canHelpWith: ["Job shadowing", "Grad school advice", "Informational chat"],
  },
  {
    id: "sample-thomas-greer",
    sample: true,
    name: "Thomas Greer",
    classYear: 2009,
    majors: ["History"],
    role: "Associate attorney",
    organization: "a Charlotte law firm",
    location: "Charlotte, NC",
    industry: "Legal",
    careerPathSlugs: ["law"],
    canHelpWith: ["Informational chat", "Grad school advice"],
  },
  {
    id: "sample-hannah-whitlock",
    sample: true,
    name: "Hannah Whitlock",
    classYear: 2018,
    majors: ["Communication Studies"],
    role: "Brand marketing manager",
    organization: "a consumer goods company",
    location: "Atlanta, GA",
    industry: "Marketing & advertising",
    careerPathSlugs: ["marketing"],
    canHelpWith: ["Resume review", "Informational chat"],
  },
  {
    id: "sample-samuel-adeyemi",
    sample: true,
    name: "Samuel Adeyemi",
    classYear: 2012,
    majors: ["Chemistry"],
    role: "Assistant professor of chemistry",
    organization: "a public research university",
    location: "the Southeast",
    industry: "Higher education",
    careerPathSlugs: ["research-academia"],
    canHelpWith: ["Grad school advice", "Informational chat"],
  },
  {
    id: "sample-laura-kim",
    sample: true,
    name: "Laura Kim",
    classYear: 2016,
    majors: ["Political Science"],
    role: "Policy analyst",
    organization: "a state government agency",
    location: "Raleigh, NC",
    industry: "Government & policy",
    careerPathSlugs: ["public-policy"],
    canHelpWith: ["Informational chat", "Resume review"],
  },
  {
    id: "sample-ben-castillo",
    sample: true,
    name: "Ben Castillo",
    classYear: 2013,
    majors: ["Economics"],
    role: "Founder",
    organization: "an early-stage climate software startup",
    location: "Durham, NC",
    industry: "Technology",
    careerPathSlugs: ["entrepreneurship", "environmental-science"],
    canHelpWith: ["Informational chat", "Job shadowing"],
  },
  {
    id: "sample-grace-tillman",
    sample: true,
    name: "Grace Tillman",
    classYear: 2021,
    majors: ["Art", "Psychology"],
    role: "UX designer",
    organization: "a digital product agency",
    location: "Richmond, VA",
    industry: "Technology",
    careerPathSlugs: ["ux-design"],
    canHelpWith: ["Resume review", "Mock interviews"],
  },
  {
    id: "sample-nathan-brooks",
    sample: true,
    name: "Nathan Brooks",
    classYear: 2010,
    majors: ["Sociology"],
    role: "Executive director",
    organization: "a community food nonprofit",
    location: "Asheville, NC",
    industry: "Nonprofit",
    careerPathSlugs: ["nonprofit"],
    canHelpWith: ["Job shadowing", "Informational chat"],
  },
  {
    id: "sample-olivia-hart",
    sample: true,
    name: "Olivia Hart",
    classYear: 2019,
    majors: ["English", "Educational Studies"],
    role: "High school English teacher",
    organization: "a public high school",
    location: "Charlotte, NC",
    industry: "K-12 education",
    careerPathSlugs: ["education"],
    canHelpWith: ["Job shadowing", "Informational chat"],
  },
  {
    id: "sample-daniel-mercer",
    sample: true,
    name: "Daniel Mercer",
    classYear: 2008,
    majors: ["English"],
    role: "Senior editor",
    organization: "a regional news outlet",
    location: "Washington, DC",
    industry: "Media & publishing",
    careerPathSlugs: ["journalism"],
    canHelpWith: ["Resume review", "Informational chat"],
  },
  {
    id: "sample-rachel-nguyen",
    sample: true,
    name: "Rachel Nguyen",
    classYear: 2015,
    majors: ["Environmental Studies", "Biology"],
    role: "Environmental scientist",
    organization: "an environmental consulting firm",
    location: "Raleigh, NC",
    industry: "Environment & energy",
    careerPathSlugs: ["environmental-science"],
    canHelpWith: ["Informational chat", "Grad school advice"],
  },
  {
    id: "sample-kevin-ashford",
    sample: true,
    name: "Kevin Ashford",
    classYear: 2017,
    majors: ["Computer Science", "Mathematics"],
    role: "Security engineer",
    organization: "a large financial services company",
    location: "Charlotte, NC",
    industry: "Financial services",
    careerPathSlugs: ["cybersecurity", "software-engineering"],
    canHelpWith: ["Mock interviews", "Resume review"],
  },
  {
    id: "sample-amanda-foster",
    sample: true,
    name: "Amanda Foster",
    classYear: 2006,
    majors: ["Economics"],
    role: "Certified financial planner",
    organization: "an independent wealth management firm",
    location: "Greenville, SC",
    industry: "Financial services",
    careerPathSlugs: ["financial-planning"],
    canHelpWith: ["Informational chat", "Job shadowing"],
  },
  {
    id: "sample-lauren-pruitt",
    sample: true,
    name: "Lauren Pruitt",
    classYear: 2014,
    majors: ["Psychology"],
    role: "Licensed professional counselor",
    organization: "a university counseling center",
    location: "Nashville, TN",
    industry: "Health care",
    careerPathSlugs: ["psychology-counseling"],
    canHelpWith: ["Grad school advice", "Informational chat"],
  },
  {
    id: "sample-kwame-ofori",
    sample: true,
    name: "Kwame Ofori",
    classYear: 2012,
    majors: ["Anthropology"],
    role: "Program officer",
    organization: "an international development foundation",
    location: "Washington, DC",
    industry: "Nonprofit",
    careerPathSlugs: ["international-development", "nonprofit"],
    canHelpWith: ["Informational chat", "Resume review"],
  },
  {
    id: "sample-claire-dunn",
    sample: true,
    name: "Claire Dunn",
    classYear: 2016,
    majors: ["Environmental Studies"],
    role: "Urban planner",
    organization: "an urban planning firm",
    location: "Charlotte, NC",
    industry: "Architecture & planning",
    careerPathSlugs: ["architecture-urban-planning", "public-policy"],
    canHelpWith: ["Job shadowing", "Grad school advice"],
  },
  {
    id: "sample-tyler-reese",
    sample: true,
    name: "Tyler Reese",
    classYear: 2018,
    majors: ["Economics"],
    role: "Partnerships manager",
    organization: "a professional sports team",
    location: "Charlotte, NC",
    industry: "Sports",
    careerPathSlugs: ["sports-management", "marketing"],
    canHelpWith: ["Informational chat", "Resume review"],
  },
  {
    id: "sample-abigail-stone",
    sample: true,
    name: "Abigail Stone",
    classYear: 2013,
    majors: ["Public Health"],
    role: "Hospital operations manager",
    organization: "a regional hospital system",
    location: "Charlotte, NC",
    industry: "Health care",
    careerPathSlugs: ["healthcare-administration"],
    canHelpWith: ["Job shadowing", "Informational chat"],
  },
  {
    id: "sample-maya-carter",
    sample: true,
    name: "Maya Carter",
    classYear: 2020,
    majors: ["Art"],
    role: "Assistant curator",
    organization: "an art museum",
    location: "Atlanta, GA",
    industry: "Arts & culture",
    careerPathSlugs: ["arts-museum-curation"],
    canHelpWith: ["Informational chat", "Grad school advice"],
  },
  {
    id: "sample-chris-holloway",
    sample: true,
    name: "Chris Holloway",
    classYear: 2022,
    majors: ["Computer Science"],
    role: "Data engineer",
    organization: "a health care analytics company",
    location: "Nashville, TN",
    industry: "Technology",
    careerPathSlugs: ["data-science", "software-engineering"],
    canHelpWith: ["Resume review", "Mock interviews"],
  },
  {
    id: "sample-jessica-lane",
    sample: true,
    name: "Jessica Lane",
    classYear: 2011,
    majors: ["Economics", "Mathematics"],
    role: "Strategy manager",
    organization: "a national retail chain",
    location: "Charlotte, NC",
    industry: "Consulting",
    careerPathSlugs: ["management-consulting", "product-management"],
    canHelpWith: ["Mock interviews", "Informational chat"],
  },
  {
    id: "sample-andrew-kessler",
    sample: true,
    name: "Andrew Kessler",
    classYear: 2023,
    majors: ["Political Science"],
    role: "Legislative aide",
    organization: "a state legislator's office",
    location: "Raleigh, NC",
    industry: "Government & policy",
    careerPathSlugs: ["public-policy", "law"],
    canHelpWith: ["Informational chat", "Job shadowing"],
  },
  {
    id: "sample-natalie-byrd",
    sample: true,
    name: "Natalie Byrd",
    classYear: 2024,
    majors: ["Biology"],
    role: "Clinical research coordinator",
    organization: "an academic medical center",
    location: "North Carolina",
    industry: "Health care",
    careerPathSlugs: ["medicine", "research-academia"],
    canHelpWith: ["Job shadowing", "Grad school advice"],
  },
  {
    id: "sample-luis-serrano",
    sample: true,
    name: "Luis Serrano",
    classYear: 2019,
    majors: ["Film, Media, and Digital Studies"],
    role: "Video producer",
    organization: "a documentary production company",
    location: "New York, NY",
    industry: "Media & publishing",
    careerPathSlugs: ["journalism"],
    canHelpWith: ["Informational chat", "Resume review"],
  },
  {
    id: "sample-kendra-wallace",
    sample: true,
    name: "Kendra Wallace",
    classYear: 2010,
    majors: ["Economics"],
    role: "Development director",
    organization: "a performing arts nonprofit",
    location: "Charlotte, NC",
    industry: "Arts & culture",
    careerPathSlugs: ["nonprofit", "arts-museum-curation"],
    canHelpWith: ["Informational chat", "Job shadowing"],
  },
];

export const SAMPLE_ALUMNI: readonly SampleAlumnus[] = defineContent(
  "alumni-sample",
  SampleAlumnusSchema,
  RECORDS,
  (record) => record.id,
);

/** Whether an id is a sample profile's ("sample-..."): a guard for any code that must never touch one. */
export function isSampleAlumnusId(id: string): boolean {
  return id.startsWith("sample-");
}

/** Newest class first, then by name. */
function byClassYearThenName(a: SampleAlumnus, b: SampleAlumnus): number {
  return b.classYear - a.classYear || a.name.localeCompare(b.name);
}

/** The preview's order (newest class first). */
export function sampleAlumniDirectory(): SampleAlumnus[] {
  return [...SAMPLE_ALUMNI].sort(byClassYearThenName);
}

/** How many sample profiles a career page's preview link leads to. */
export function sampleAlumniCountForCareer(slug: string): number {
  return SAMPLE_ALUMNI.filter((record) => record.careerPathSlugs.includes(slug)).length;
}
