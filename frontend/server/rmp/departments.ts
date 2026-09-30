import "server-only";

/**
 * RateMyProfessors department names → Davidson subject codes (PLAN §5 "Ratings (RMP)", §9 "RMP"). Pure.
 *
 * RMP departments are free text chosen by students ("Fine Arts", "Communications", "Science"), so they are mapped
 * to the subject codes of the Davidson course API (`/micro/public/v2/course-schedule/filters/{term}`) BEFORE the
 * matcher compares them with a section's subject. A name maps to every subject its faculty plausibly teach:
 * "Mathematics" → MAT, CSC, DAT (Davidson's Mathematics and Computer Science department), "Fine Arts" → ART, THE,
 * MUS, DAN, FMD, "Science" → the natural sciences, "Medicine" → PBH, BIO.
 *
 * Three kinds of RMP department (classifyDepartment):
 *   specific      maps to subject codes: it can agree or conflict with a section;
 *   generic       empty or a catch-all that says nothing about what the person teaches ("Interdisciplinary
 *                 Studies", "International Studies", "Humanities", "Not Specified", "Other"; the real Davidson
 *                 rows under these teach AFR, LAS, ENV, COM, ARB, REL, ...): never a conflict, never agreement;
 *   unrecognised  a name no rule knows: no evidence either way (the matcher treats it more cautiously than
 *                 generic, see server/rmp/match.ts).
 */

/** Catch-all RMP departments (normalizeDepartment form). */
const GENERIC: ReadonlySet<string> = new Set([
  "interdisciplinary",
  "interdisciplinary studies",
  "international studies",
  "humanities",
  "not specified",
  "other",
  "general",
  "general studies",
  "liberal arts",
  "physical education",
]);

/** Exact department names (after normalizeDepartment) that the keyword rules would get wrong. */
const EXACT: Readonly<Record<string, readonly string[]>> = {
  science: ["BIO", "CHE", "PHY", "ENV", "GENO", "IGEN", "INEU"],
  sciences: ["BIO", "CHE", "PHY", "ENV", "GENO", "IGEN", "INEU"],
  "natural science": ["BIO", "CHE", "PHY", "ENV", "GENO", "IGEN", "INEU"],
  "natural sciences": ["BIO", "CHE", "PHY", "ENV", "GENO", "IGEN", "INEU"],
  "physical science": ["CHE", "PHY"],
  "physical sciences": ["CHE", "PHY"],
  "social science": ["ANT", "ECO", "POL", "PSY", "SOC"],
  "social sciences": ["ANT", "ECO", "POL", "PSY", "SOC"],
};

/** Keyword rules; a department gets the union of every rule it matches. */
const KEYWORDS: readonly (readonly [RegExp, readonly string[]])[] = [
  [/\bafrica/, ["AFR"]],
  [/\banthropolog/, ["ANT"]],
  [/\barab|\bmiddle east/, ["ARB"]],
  [
    /\bfine arts?\b|\bperforming arts?\b|\bvisual and performing\b/,
    ["ART", "THE", "MUS", "DAN", "FMD"],
  ],
  [/\bart\b|\barts\b|\bstudio\b/, ["ART"]],
  [/\bbiolog|\blife science|\becolog|\bmicrobio|\bbotany|\bzoolog/, ["BIO", "GENO", "IGEN"]],
  [/\bgenom|\bgenetic/, ["BIO", "GENO", "IGEN"]],
  [/\bneuro/, ["INEU", "BIO", "PSY"]],
  [/\bbiochem/, ["CHE", "BIO"]],
  [/\bchemi/, ["CHE"]],
  [/\bchinese|\bjapanese|\beast asia|(?<!south )\basian stud/, ["CHI", "EAS"]],
  [/\bclassic|\bgreek|\blatin\b(?! americ)/, ["CLA", "GRE", "LAT"]],
  [/\bcommunicat|\brhetoric|\bspeech\b|\bjournalism/, ["COM"]],
  [/\bcomput|\bprogramming|\bsoftware/, ["CSC", "MAT", "DAT"]],
  [/\bdance/, ["DAN", "THE"]],
  [/\bdata\b/, ["DAT", "MAT", "CSC"]],
  [/\beconom|\bbusiness|\bfinance|\baccounting|\bmanagement/, ["ECO"]],
  [/\beducation|\beducational/, ["EDU"]],
  [/\benglish|\bliteratur|\bwriting|\bcomposition/, ["ENG", "WRI", "LIT"]],
  [/\benviron|\bsustainab/, ["ENV"]],
  [/\bfilm|\bmedia\b|\bdigital|\bcinema/, ["FMD", "FMS", "DIG"]],
  [/\bfrench|\bfrancophone/, ["FRE"]],
  [/\bgender|\bwomen|\bsexuality|\bfeminis/, ["GSS"]],
  [/\bgerman/, ["GER"]],
  [/\bhispanic|\bspanish|\bportuguese/, ["SPA"]],
  [/\bhistor/, ["HIS"]],
  [/\blatin americ|\blatinx|\bcaribbean/, ["LAS"]],
  [/\blinguist/, ["LNG", "MLNG"]],
  [/\blanguage/, ["FRE", "SPA", "GER", "RUS", "CHI", "ARB", "SIL", "LNG", "MLNG"]],
  [/\bmath|\bstatistic|\bcalculus/, ["MAT", "CSC", "DAT"]],
  [/\bmilitary|\brotc\b/, ["MIL"]],
  [/\bmusic/, ["MUS"]],
  [/\bphilosoph|\bethics\b/, ["PHI"]],
  [/\bphysics|\bastronom/, ["PHY"]],
  [/\bpolitic|\bgovernment|\binternational (relations|affairs)|\bpublic policy/, ["POL"]],
  [/\bpsycholog/, ["PSY"]],
  [/\bhealth\b/, ["PBH"]],
  [/\bmedic|\bpre ?med|\bnursing|\bepidemiolog/, ["PBH", "BIO"]],
  [/\breligio|\btheolog|\bbiblical|\bbible\b/, ["REL"]],
  [/\brussian|\bslavic/, ["RUS"]],
  [/\bsociolog/, ["SOC"]],
  [/\bsouth asia/, ["SOU"]],
  [/\btheat|\bdrama\b|\bacting\b/, ["THE", "DAN"]],
];

/**
 * Subjects taught by faculty of many departments (Humanities, the Writing Program, interdisciplinary programs and
 * minors). A section listed only under these says nothing about its instructor's home department: it never
 * produces a department conflict, and it never lets a non-exact name match through on its own (the matcher then
 * uses the instructor's other sections in the term, see server/rmp/match.ts). Agreement still counts (RMP "Film"
 * agrees with an FMS section).
 */
export const NEUTRAL_SUBJECTS: ReadonlySet<string> = new Set([
  "CIS",
  "DAT",
  "DIG",
  "EAS",
  "FMD",
  "FMS",
  "GENO",
  "GSS",
  "HUM",
  "IGEN",
  "INEU",
  "LAS",
  "LIT",
  "PPE",
  "SIL",
  "SOU",
  "WRI",
  "XPL",
]);

export function normalizeDepartment(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DepartmentKind = "specific" | "generic" | "unrecognised";

export interface DepartmentClass {
  kind: DepartmentKind;
  /** Davidson subject codes the department covers (sorted; [] unless specific). */
  subjects: string[];
}

/** What an RMP department name says about the subjects its teacher teaches. */
export function classifyDepartment(department: string | null | undefined): DepartmentClass {
  const name = normalizeDepartment(department ?? "");
  if (!name || GENERIC.has(name)) return { kind: "generic", subjects: [] };
  const exact = EXACT[name];
  const out = new Set<string>(exact ?? []);
  if (!exact) {
    for (const [pattern, subjects] of KEYWORDS) {
      if (pattern.test(name)) for (const subject of subjects) out.add(subject);
    }
  }
  return out.size > 0
    ? { kind: "specific", subjects: [...out].sort() }
    : { kind: "unrecognised", subjects: [] };
}

/** Davidson subject codes an RMP department name covers (sorted; [] = generic or unrecognised). */
export function departmentSubjects(department: string | null | undefined): string[] {
  return classifyDepartment(department).subjects;
}

function codes(subjects: readonly string[] | null | undefined): string[] {
  return (subjects ?? []).map((subject) => subject.trim().toUpperCase()).filter(Boolean);
}

/** True when some subject is not a NEUTRAL_SUBJECTS program. */
export function hasSpecificSubject(subjects: readonly string[]): boolean {
  return codes(subjects).some((subject) => !NEUTRAL_SUBJECTS.has(subject));
}

/**
 * How an RMP department relates to the subjects a section is listed under (its subject, cross-listed siblings'
 * subjects and cross-postings) and, when those are all NEUTRAL_SUBJECTS programs (or unknown), to the subjects
 * the instructor teaches elsewhere in the term (`homeSubjects`, from the catalog):
 *   agree         a specific department covering one of the section's subjects (or, for an all-neutral section,
 *                 one of the home subjects);
 *   conflict      a specific department covering none of the section's specific subjects (or, for an
 *                 all-neutral section, none of the specific home subjects);
 *   unknown       a specific department, but nothing specific to compare it with (all-neutral or no section
 *                 subjects, and no specific home subject);
 *   generic       an empty or catch-all department (Interdisciplinary Studies, ...): no evidence either way;
 *   unrecognised  a department no rule maps: no evidence either way.
 */
export type DepartmentRelation = "agree" | "conflict" | "unknown" | "generic" | "unrecognised";

export function departmentRelation(
  department: string | null | undefined,
  sectionSubjects: readonly string[],
  homeSubjects?: readonly string[] | null,
): DepartmentRelation {
  const { kind, subjects: covered } = classifyDepartment(department);
  if (kind !== "specific") return kind;
  const section = codes(sectionSubjects);
  if (covered.some((subject) => section.includes(subject))) return "agree";
  if (hasSpecificSubject(section)) return "conflict";
  const home = codes(homeSubjects);
  if (covered.some((subject) => home.includes(subject))) return "agree";
  return hasSpecificSubject(home) ? "conflict" : "unknown";
}

/** True when two RMP departments could be the same person's (they overlap, or either is generic/unrecognised). */
export function departmentsCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (normalizeDepartment(a ?? "") === normalizeDepartment(b ?? "")) return true;
  const sa = departmentSubjects(a);
  const sb = departmentSubjects(b);
  if (sa.length === 0 || sb.length === 0) return true;
  return sa.some((subject) => sb.includes(subject));
}
