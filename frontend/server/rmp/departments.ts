import "server-only";

/**
 * RateMyProfessors department names → Davidson subject codes (PLAN §5 "Ratings (RMP)", §9 "RMP"). Pure.
 *
 * RMP departments are free text chosen by students ("Fine Arts", "Communications", "Science"), so they are mapped
 * to the subject codes of the Davidson course API (`/micro/public/v2/course-schedule/filters/{term}`) BEFORE the
 * matcher compares them with a section's subject. A name maps to every subject its faculty plausibly teach:
 * "Mathematics" → MAT, CSC, DAT (Davidson's Mathematics and Computer Science department), "Fine Arts" → ART, THE,
 * MUS, DAN, FMD, "Science" → the natural sciences. An unknown or empty department maps to nothing and never
 * conflicts.
 */

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
  "physical education": [],
  "not specified": [],
  other: [],
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
  [/\bhumanit/, ["HUM"]],
  [/\blatin americ|\blatinx|\bcaribbean/, ["LAS"]],
  [/\blinguist/, ["LNG", "MLNG"]],
  [/\blanguage/, ["FRE", "SPA", "GER", "RUS", "CHI", "ARB", "SIL", "LNG", "MLNG"]],
  [/\bmath|\bstatistic|\bcalculus/, ["MAT", "CSC", "DAT"]],
  [/\bmilitary|\brotc\b/, ["MIL"]],
  [/\bmusic/, ["MUS"]],
  [/\bphilosoph|\bethics\b/, ["PHI"]],
  [/\bphysics|\bastronom/, ["PHY"]],
  [/\bpolitic|\bgovernment|\binternational (relations|studies|affairs)|\bpublic policy/, ["POL"]],
  [/\bpsycholog/, ["PSY"]],
  [/\bhealth\b/, ["PBH"]],
  [/\breligio|\btheolog|\bbiblical|\bbible\b/, ["REL"]],
  [/\brussian|\bslavic/, ["RUS"]],
  [/\bsociolog/, ["SOC"]],
  [/\bsouth asia/, ["SOU"]],
  [/\btheat|\bdrama\b|\bacting\b/, ["THE", "DAN"]],
  [/\binterdisciplin/, ["CIS"]],
];

/**
 * Subjects taught by faculty of many departments (Humanities, the Writing Program, interdisciplinary programs and
 * minors). A section in one of these never produces a department conflict; agreement still counts.
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

/** Davidson subject codes an RMP department name covers (sorted; [] = unknown, never a conflict). */
export function departmentSubjects(department: string | null | undefined): string[] {
  const name = normalizeDepartment(department ?? "");
  if (!name) return [];
  const exact = EXACT[name];
  if (exact) return [...exact].sort();
  const out = new Set<string>();
  for (const [pattern, subjects] of KEYWORDS) {
    if (pattern.test(name)) for (const subject of subjects) out.add(subject);
  }
  return [...out].sort();
}

/**
 * How an RMP department relates to the subjects a section is listed under (its subject, cross-listed siblings'
 * subjects and cross-postings):
 *   agree     the department covers one of them;
 *   neutral   the department is unknown, or every subject is a NEUTRAL_SUBJECTS program, or no subject is known;
 *   conflict  the department is known and covers none of the section's specific subjects.
 */
export type DepartmentRelation = "agree" | "neutral" | "conflict";

export function departmentRelation(
  department: string | null | undefined,
  sectionSubjects: readonly string[],
): DepartmentRelation {
  const covered = departmentSubjects(department);
  const subjects = sectionSubjects.map((subject) => subject.trim().toUpperCase()).filter(Boolean);
  if (covered.some((subject) => subjects.includes(subject))) return "agree";
  if (covered.length === 0) return "neutral";
  if (!subjects.some((subject) => !NEUTRAL_SUBJECTS.has(subject))) return "neutral";
  return "conflict";
}

/** True when two RMP departments could be the same person's (they overlap, or either is unknown). */
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
