import "server-only";
import type { z } from "zod";
import { OfficeSchema, ProgramSchema, type Office, type Program } from "@/lib/types/content";
import {
  defineContent,
  latestVerifiedAt,
  type DayInput,
  davidsonDay,
} from "@/server/content/define";
import type { ContentDeadline } from "@/server/content/academic-calendar";

/**
 * Davidson offices and the opportunity programs they run (grants, fellowships, internships, courses), converted
 * from content-prep/final_offices.json: 20 offices and 122 programs, every name, amount, deadline and eligibility
 * line re-read against the live pages (and the offices' public WildcatSync events) on 2026-09-30.
 * - `amount` and `deadlineText` are exactly as published (shown verbatim); null when the page gives none.
 * - `deadlines` holds only dates Due soon may use: dates the text pins to a year, plus year-less recurring dates
 *   ("Winter Break: by October 1") pinned to their next occurrence after 2026-09-30 within the 2026-27 cycle.
 *   "Opens" dates, "TBD" and "late February" windows stay text-only. tests/content check each pinned day appears
 *   in its program's deadlineText.
 * - `source` is programSourceForOffice(officeSlug): MATTHEWS CENTER, HURT HUB PROGRAMS, REGISTRAR, or DAVIDSON
 *   OFFICES next to the office's own name.
 * - Three internal verification notes were removed from the texts (the Registrar description's pointer to a
 *   scratch file, the Health Center's aside about the employee wellness program, and the Summer Internship Grants
 *   page's stale-year remark); nothing else was edited.
 * - Past-cycle deadlines stay in descriptions only. Staff names appear only where they define an advising or
 *   nominating role; staff change, so the UI should not feature them.
 */

const PROGRAM_RECORDS = [
  {
    slug: "summer-internship-grants-common-application",
    officeSlug: "matthews-center",
    name: "Summer Internship Grants (common application)",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
    description:
      "Grants for select students in unpaid or low-paying summer internships (income equivalent or less than $4,000), meant to cover cost of living, not wage replacement. Submit ONE common application through Handshake and designate the named grant(s) you want; if not selected for a named grant you are automatically considered for the Career Development Summer Internship Grant. Materials: online application, one-page resume, prospective budget, internship description. Not eligible if you intend to receive academic credit for Explorer 099 or an independent study. 75 students received over $289,000 for summer 2025. Notifications March 31 (round 1) and April 30 (round 2).",
    amount: null,
    deadlineText:
      "February 1 - Application available; March 1 - Application deadline #1; April 1 - Application deadline #2",
    deadlines: [
      {
        label: "Application deadline #1",
        date: "2027-03-01",
      },
      {
        label: "Application deadline #2",
        date: "2027-04-01",
      },
    ],
    audience:
      "Current students with a secured (or in-process) unpaid or low-paying summer internship; undocumented and graduating international students ineligible without DHS work authorization",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "frank-matthews-ii-49-center-for-career-development-summer-internship-grant",
    officeSlug: "matthews-center",
    name: "Frank Matthews II '49 Center for Career Development Summer Internship Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "The Matthews Center Summer Internship Grant assists students with cost-of-living expenses while they participate in unpaid or low-paying summer internships. All named grants below require meeting this grant's requirements too. Apply through the Summer Internship Grants common application in Handshake.",
    amount: "$1,000 -$6,000",
    deadlineText: null,
    deadlines: [],
    audience: "Students in unpaid or low-paying summer internships",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "anne-stanback-81-and-charlotte-kinlock-internship-for-non-profit-leadership",
    officeSlug: "matthews-center",
    name: "Anne Stanback '81 and Charlotte Kinlock Internship for Non-profit Leadership",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Assistance for students with demonstrated financial need pursuing an internship with a 501(c)(3) or 501(c)(4) non-profit organization. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Students with demonstrated financial need interning at a 501(c)(3)/501(c)(4) nonprofit",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "bill-boyd-entrepreneurial-internship-grant",
    officeSlug: "matthews-center",
    name: "Bill Boyd Entrepreneurial Internship Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports internships with organizations of an entrepreneurial mindset, in particular business, sales or leadership roles with small- to medium-sized companies. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Students interning at small- to medium-sized entrepreneurial organizations (business, sales or leadership)",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "boswell-family-experiential-learning-grant",
    officeSlug: "matthews-center",
    name: "Boswell Family Experiential Learning Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports hands-on professional experiences in the corporate/business world: investment banking, investment management, private equity, venture capital, entrepreneurship, management consulting, accounting, corporate finance and/or operations; high-impact certification programs are also eligible. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Students pursuing finance, consulting, accounting or other business internships or certification programs",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "boyd-family-internship-grant",
    officeSlug: "matthews-center",
    name: "Boyd Family Internship Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Assists students in unpaid or low-paying internships focused on education, public service or civic engagement. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning in education, public service or civic engagement",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "butner-family-internship-fund",
    officeSlug: "matthews-center",
    name: "Butner Family Internship Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports meaningful internships across a broad scope of industries that otherwise provide no or minimal funding; preference for internships that support the student's career and professional goals. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students in unfunded or minimally funded internships, any industry",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "carolyn-and-george-cretekos-69-public-service-internship",
    officeSlug: "matthews-center",
    name: "Carolyn and George Cretekos '69 Public Service Internship",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports internships in local, regional, state or federal civil/government service. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning in government/civil service",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dr-randy-nelson-summer-internship-grant",
    officeSlug: "matthews-center",
    name: "Dr. Randy Nelson Summer Internship Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports summer internships in the visual, literary and performing arts. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning in the visual, literary or performing arts",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "gerald-lee-wilson-58-and-virginia-s-wilson-internship-fund-grant",
    officeSlug: "matthews-center",
    name: "Gerald Lee Wilson '58 and Virginia S. Wilson Internship Fund Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports students exhibiting financial need in internships consistent with their career interests; priority to students demonstrating financial need. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students with financial need",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "ginny-newell-78-arts-fund",
    officeSlug: "matthews-center",
    name: "Ginny Newell '78 Arts Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports summer internships in the study and/or support of the visual arts, beyond the scope of North Carolina or the student's hometown. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning in the visual arts outside North Carolina and their hometown",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "hall-family-internship-grants",
    officeSlug: "matthews-center",
    name: "Hall Family Internship Grants",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Assists students in unpaid or low-paying internships with organizations of entrepreneurial mindsets or organizations focused on community and social service. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning at entrepreneurial or community/social-service organizations",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "hasty-smith-internship-grant",
    officeSlug: "matthews-center",
    name: "Hasty/Smith Internship Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Assistance for students pursuing internships or fellowships through the Matthews Center for Career Development. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students pursuing internships or fellowships through the Matthews Center",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "janet-burt-anderson-first-generation-internship-fund",
    officeSlug: "matthews-center",
    name: "Janet Burt Anderson First-generation Internship Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Assistance for summer internships for students who are the first members of their families to attend a four-year college or university. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "First-generation college students",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "juliana-tazewell-porter-memorial-internship-fund",
    officeSlug: "matthews-center",
    name: "Juliana Tazewell Porter Memorial Internship Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Assists outstanding students pursuing summer internships in medicine or another healthcare-related field, with priority given to student-athletes. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning in medicine/healthcare (priority to student-athletes)",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "layendecker-family-internship-fund",
    officeSlug: "matthews-center",
    name: "Layendecker Family Internship Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Financial assistance for unpaid or low-paying internships related to gender and sexuality issues, or summer research in gender and sexuality issues. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning or researching on gender and sexuality issues",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "locke-white-jr-internship-fund",
    officeSlug: "matthews-center",
    name: "Locke White Jr. Internship Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports student internships, with a preference for students pursuing careers in science, technology or medicine. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students pursuing science, technology or medicine careers (preference)",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "macdonald-family-internship-grant",
    officeSlug: "matthews-center",
    name: "MacDonald Family Internship Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports summer internships consistent with the student's career interests. Summer research experiences do not qualify. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students in summer internships (not research)",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "morehead-family-internship-grant",
    officeSlug: "matthews-center",
    name: "Morehead Family Internship Grant",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports high-impact summer internships in a broad scope of industries. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students in high-impact summer internships, any industry",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "pioneer-internship-fund",
    officeSlug: "matthews-center",
    name: "Pioneer Internship Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Created in 2023 by women of the Class of 1977; assists students with financial need, with a preference for internships in non-profit or governmental organizations. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students with financial need (preference for nonprofit or government internships)",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "the-cassell-family-socios-en-salud-partners-in-health-in-peru-internship",
    officeSlug: "matthews-center",
    name: "The Cassell Family Socios En Salud / Partners in Health in Peru Internship",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports students each summer to work with Partners in Health (Socios En Salud) in Lima, Peru (intensive civic-engagement and global health experience); the fund provides $6,000 to cover the selected student's round-trip travel and living expenses for a minimum of 10 weeks. Apply through the Summer Internship Grants common application in Handshake.",
    amount: "$6,000",
    deadlineText: null,
    deadlines: [],
    audience: "Students interning with Partners in Health in Lima, Peru",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "tom-anstrom-internship-fund",
    officeSlug: "matthews-center",
    name: "Tom Anstrom Internship Fund",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Supports internships in progressive public policy, politics or social justice with government agencies, NGOs, political offices or campaigns; work must allow 300 hours during the summer; a cover letter is required. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interning in progressive public policy, politics or social justice",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "weeks-family-visual-arts-internship",
    officeSlug: "matthews-center",
    name: "Weeks Family Visual Arts Internship",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    description:
      "Funds summer internship experiences for students interested in exploring careers in the visual arts. Apply through the Summer Internship Grants common application in Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students exploring visual-arts careers",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "xpl-099-academic-credit-for-internships",
    officeSlug: "matthews-center",
    name: "XPL 099 Academic Credit for Internships",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/xpl-099-academic-credit-internships",
    description:
      "Pass/Fail transcript notation for internships that REQUIRE academic credit. Only for (a) domestic students in unpaid internships where the organization requires credit as a condition of participation (register by emailing careers@davidson.edu) and (b) international students approved for Curricular Practical Training (CPT), who receive CPT authorization in place of the Learning Agreement and register through the international student office. Appears on the transcript but does not count as one of the 32 courses required for graduation. Credit eligibility and credit confirmation letters are requested by email to careers@davidson.edu.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Domestic students in unpaid credit-required internships; international students with CPT",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/xpl-099-academic-credit-internships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-in-washington-diw",
    officeSlug: "matthews-center",
    name: "Davidson in Washington (DIW)",
    url: "https://www.davidson.edu/academic-departments/political-science/internships-careers-and-graduate-school/davidson-washington",
    description:
      "Eight-week summer program for 35 selected students: a government internship in Washington, DC (found with Matthews Center help) plus a Davidson political science seminar, both for course credit. Summer 2027 dates: May 24-July 16, 2027 (tentative). 2027 seminars: 'World Politics in American Politics' (Prof. Besir Ceka) and 'Contested America: Policy Problems and Political Possibilities' (Prof. Graham Bullock). Application form is on Handshake. Listed as an Immersive Internship on the Matthews Center Internships page.",
    amount: null,
    deadlineText: "Friday, November 6, 2026 by 5 p.m.",
    deadlines: [
      {
        label: "Application deadline (5 p.m.)",
        date: "2026-11-06",
      },
    ],
    audience:
      "Rising sophomores, juniors and seniors (preference to more senior students), any major; minimum GPA 2.5",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/academic-departments/political-science/internships-careers-and-graduate-school/davidson-washington",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "east-asia-internship-program-freeman-foundation",
    officeSlug: "matthews-center",
    name: "East Asia Internship Program (Freeman Foundation)",
    url: "https://www.davidson.edu/academic-departments/chinese-studies/internships",
    description:
      "Grants for 6-8-week summer internships with businesses, governments, research institutes and nonprofits in East and Southeast Asia (Brunei, Cambodia, East Timor, Indonesia, Japan, South Korea, Laos, Malaysia, Mongolia, Myanmar, the Philippines, Singapore, Taiwan, Thailand, Vietnam), run with the Matthews Center and the Dean Rusk Program; grants cover airfare, housing and food (cost of living, not wage replacement). Apply on Handshake with a resume, a short essay and a faculty reference form. CAUTION: the official page still describes the summer 2025 cycle ('approximately 20 students a grant up to $6,500'); no 2027 amount or deadline is published, so both are null. Listed as an Immersive Internship on the Matthews Center Internships page.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "First-years, sophomores and juniors of all majors; not eligible if receiving credit for Explorer 099 or an independent study",
    source: "matthews-center",
    sources: ["https://www.davidson.edu/academic-departments/chinese-studies/internships"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-impact-fellows-dif",
    officeSlug: "matthews-center",
    name: "Davidson Impact Fellows (DIF)",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/davidson-impact-fellows",
    description:
      "One-year, post-graduate, experience-based fellowships with partner nonprofit organizations (501(c) organizations; B Corps may be eligible) that receive grants from the College. Established 2013; 100+ Davidson graduates have participated. Core partners include Catawba Lands Conservancy, Catawba Riverkeeper, Charlotte Community Health Clinic, Georgia Justice Project, Habitat for Humanity International, Leading On Opportunity, Mountain Area Health Education Center, Roof Above, Salzburg Global Seminar and Winship Cancer Institute of Emory University. Part of the grant funds the fellow's professional development.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Graduating seniors (post-graduate fellowship)",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/davidson-impact-fellows",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "professional-development-funding-tony-snow-77-professional-development-fund",
    officeSlug: "matthews-center",
    name: "Professional Development Funding (Tony Snow '77 Professional Development Fund)",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming",
    description:
      "Matthews Center support for professional development such as certifications, testing prep, training and conferences. Details are in a Handshake article (login required).",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Current students",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "scholarships-for-tuck-business-bridge-dartmouth-and-vanderbilt-summer-business",
    officeSlug: "matthews-center",
    name: "Scholarships for Tuck Business Bridge (Dartmouth) and Vanderbilt Summer Business Immersion",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
    description:
      "For the Tuck Business Bridge Program and the Vanderbilt University Accelerator Summer Business Immersion Program, scholarships are available annually (details in the Matthews Center Resource Guide).",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students preparing for business, finance or consulting careers",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "health-careers-fair",
    officeSlug: "matthews-center",
    name: "Health Careers Fair",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming",
    description:
      "The Key Programming page says Davidson hosts a Health Careers Fair each year (alongside the Greater Charlotte Law School Fair). No date for the 2026-27 fair was published on an official page as of 2026-09-30.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students interested in health professions schools",
    source: "matthews-center",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "try-it-fund",
    officeSlug: "hurt-hub",
    name: "Try It Fund",
    url: "https://hurthub.davidson.edu/try-it-fund/",
    description:
      "Grant competition for a creative or innovative idea; projects must intend or have the potential to make money (for-profit). Recipients must make substantial progress within 8 weeks, attend orientation and check-ins, document the process and be open to an on-campus presentation. Supported by the Charlie Hinnant '72 Fund and Davidson alums. Fall 2026 window was August 24-September 22, 2026. F-1 awards may be subject to tax (grossed up).",
    amount: "up to $1,000",
    deadlineText:
      "Applications open the first day of each semester and close at 11:59pm EDT the last day of fall or spring break (usually a Sunday); closed in summer. Fall 2026 window (August 24-September 22, 2026) has closed: 'Applications Closed Until Spring 2027'",
    deadlines: [],
    audience: "Currently enrolled Davidson students",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/try-it-fund/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "ai-try-it-fund-applied-ai-lab",
    officeSlug: "hurt-hub",
    name: "AI Try It Fund (Applied AI Lab)",
    url: "https://hurthub.davidson.edu/applied-ai/",
    description:
      "Modeled on the Try It Fund: grants to build an AI-based project or venture; recipients spend eight weeks making progress, connect with mentors and present to the Davidson community. The Applied AI Lab launched in July 2026.",
    amount: "up to $1,000",
    deadlineText: null,
    deadlines: [],
    audience: "Davidson students",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/applied-ai/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-at-neurips-applied-ai-lab",
    officeSlug: "hurt-hub",
    name: "Davidson at NeurIPS (Applied AI Lab)",
    url: "https://hurthub.davidson.edu/applied-ai/",
    description:
      "Each year a cohort of Davidson students travels, fully funded, to the NeurIPS AI research conference; interest is expressed by email from the Applied AI Lab page.",
    amount: "fully funded",
    deadlineText: null,
    deadlines: [],
    audience: "Davidson students",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/applied-ai/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "avinger-impact-fund",
    officeSlug: "hurt-hub",
    name: "Avinger Impact Fund",
    url: "https://hurthub.davidson.edu/avinger-impact-fund/",
    description:
      "Project-based microgrants (formerly the Avinger Scholars Program) paired with a required mentoring program; funds and outcomes expected within 3-4 months. Scored on Entrepreneurial Spirit, Commitment to Growth, Value Proposition, Market Research and Business Strategy. Fall 2026: finalists notified about mid-October; in-person interviews and winners about early to mid-November 2026. Grants are taxable income.",
    amount: "up to $8,000",
    deadlineText: "Applications open September 1, 2026 and close 11:59pm on October 2, 2026",
    deadlines: [
      {
        label: "Applications close (11:59 p.m.)",
        date: "2026-10-02",
      },
    ],
    audience:
      "All students: first-years in spring; sophomores and juniors in fall or spring; seniors in fall",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/avinger-impact-fund/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "nisbet-venture-fund",
    officeSlug: "hurt-hub",
    name: "Nisbet Venture Fund",
    url: "https://hurthub.davidson.edu/nisbet-venture-fund/",
    description:
      "Annual business development program and pitch competition for for-profit ventures (est. 2014), with coaching, required prep sessions and optional mentorship for finalists. Two tracks: Acceleration (7-minute pitch; $25,000 investment by Davidson College as a SAFE with a $5,000,000 post-money valuation cap, paid only to a corporation or LLC; ventures with >$5,000 revenue/VC must use this track; Davidson students/recent alumni must own 50%+ of the equity) and Incubation (4-minute pitch; $5,000 grant; no incorporation needed). Ventures with >$250,000 revenue/VC are ineligible. Finalists notified by early March 2027. Live competition April 20, 2027 at 6:30pm.",
    amount:
      "up to $32,500 in grants and investment ($25,000 Acceleration Track investment structured as a SAFE; $5,000 Incubation Track grant; $2,500 Entrepreneurial Excellence Award)",
    deadlineText:
      "Applications are accepted from late January to late February 2027 at 11:59pm (closing date TBD)",
    deadlines: [],
    audience: "Enrolled Davidson students or alumni from the classes of 2021-2026",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/nisbet-venture-fund/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "ideasprint",
    officeSlug: "hurt-hub",
    name: "IdeaSprint",
    url: "https://hurthub.davidson.edu/ideasprint/",
    description:
      "Month-long, team-based entrepreneurship competition presented by the Davidson Entrepreneurship Club with the Hurt Hub; individuals are placed on teams, paired with a mentor and given a micro-grant. Culminates in a live showcase (audience vote) on November 18, 2026, 6:00-8:00 pm, during Global Entrepreneurship Week. Note: the page's button currently reads 'Applications Closed' while key dates list the deadline as TBD.",
    amount: "$200 micro-grant per team; $1,000 grand prize",
    deadlineText: "Application Deadline: TBD mid-October 2026",
    deadlines: [],
    audience: "All Davidson students; no idea or experience required",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/ideasprint/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-college-consulting-group-dccg",
    officeSlug: "hurt-hub",
    name: "Davidson College Consulting Group (DCCG)",
    url: "https://hurthub.davidson.edu/become-a-student-consultant/",
    description:
      "Paid student consultants (student employees of Davidson College) deliver project-based work for startups and small businesses: market research, marketing strategy, digital development, data analysis. 5-8 hours/week in the academic year; 35-40 hours/week in summer; not work-study; F-1 students eligible (on-campus employment). Academic-year hiring happens in spring (Class of 2027-2029 applications closed in March); the fall 2026 Class of 2030 cycle closed September 27 (finalists Oct 5, interviews Oct 22, offers Oct 27). Summer 2027 details available January 2027.",
    amount: "$15.50 per hour (academic year); $18.00 per hour (summer)",
    deadlineText: null,
    deadlines: [],
    audience:
      "All active Davidson students; summer program open to rising sophomores, juniors and seniors",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/become-a-student-consultant/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "next-level",
    officeSlug: "hurt-hub",
    name: "NEXT Level",
    url: "https://hurthub.davidson.edu/next-level/",
    description:
      "Paid eight-week program for first-generation sophomores: team project work with a community or industry client partner (40 hours of paid project work), Design Thinking, presentation skills, CliftonStrengths coaching and cohort dinners/lunches. About seven hours per week. Two cohorts a year (early September-mid-November; February-mid-April). Interest form, then application with resume and personal statement. Does not affect work study.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "First-generation sophomores (international students eligible)",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/next-level/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "r-craig-and-sheila-yoder-applied-research-fellowship",
    officeSlug: "hurt-hub",
    name: "R. Craig and Sheila Yoder Applied Research Fellowship",
    url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/r-craig-and-sheila-yoder-applied-research-fellowship",
    description:
      "Administered by the Hurt Hub. Supports one student each summer for 10 weeks of full-time research with a Davidson faculty member and an external industry mentor, on processes, products or services with commercialization potential (feasibility study required; going to market is not). Most recent published cycle: applications opened January 21, 2026 and were due February 23, 2026 at 11:59 p.m.; 2027 dates not yet posted.",
    amount:
      "$15/hr, 40 hours per week, 10 weeks ($6,000), and up to $3,000 for supplies, travel, or necessary professional services",
    deadlineText: null,
    deadlines: [],
    audience: "First-years, sophomores and juniors",
    source: "hurt-hub-programs",
    sources: [
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/r-craig-and-sheila-yoder-applied-research-fellowship",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-innovation-fellows-lucid-bots-partnership",
    officeSlug: "hurt-hub",
    name: "Davidson Innovation Fellows (Lucid Bots partnership)",
    url: "https://hurthub.davidson.edu/students/",
    description:
      "12-month paid fellowship for recent Davidson graduates at Lucid Bots (founded by Andrew Ashur '19 at the Hurt Hub) across robotics testing, engineering, software development, data analysis and operations; may be extended for up to five years; Lucid Bots expects to host up to four fellows annually. The partnership also creates a priority pipeline for Lucid Bots internships, posted on Handshake.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Recent Davidson graduates (internships for current students via Handshake)",
    source: "hurt-hub-programs",
    sources: [
      "https://www.davidson.edu/news/2026/04/28/dorm-room-drone-labs-davidson-college-and-lucid-bots-launch-innovation-fellows-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "building-a-lean-startup-course",
    officeSlug: "hurt-hub",
    name: "Building a Lean Startup (course)",
    url: "https://hurthub.davidson.edu/event/building-a-lean-startup-fall-2026/",
    description:
      "7-session non-credit course on Lean Startup methodology taught by Rebecca Weeks Watson, offered twice a year; free to participants. Fall 2026: Wednesdays, Sept 23-Nov 11, 6:45-8:15 pm, Room 208, no class October 14 (already under way). Also available online through DavidsonX.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students, faculty, staff and the public; no business experience required",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/event/building-a-lean-startup-fall-2026/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "techstars-startup-weekend-davidson-nc",
    officeSlug: "hurt-hub",
    name: "Techstars Startup Weekend - Davidson, NC",
    url: "https://hurthub.davidson.edu/event/techstars-startup-weekend-davidson-nc/",
    description:
      "Second annual Techstars Startup Weekend, hosted by the Davidson College Entrepreneurship Club with the Hurt Hub: participants form teams, develop an idea into a product and pitch to judges. Friday October 2 (5:30-10 pm), Saturday October 3 (9 am-9 pm) and Sunday October 4, 2026 (9 am-7:30 pm) at the Hurt Hub; attendance at all three days expected; 18+; open to students and the public; come without a team.",
    amount: "$10 per person (scholarships available)",
    deadlineText: null,
    deadlines: [],
    audience: "All Davidson students (and the general public), 18+",
    source: "hurt-hub-programs",
    sources: ["https://hurthub.davidson.edu/event/techstars-startup-weekend-davidson-nc/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "critical-language-scholarship-cls-program",
    officeSlug: "office-of-fellowships",
    name: "Critical Language Scholarship (CLS) Program",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/critical-language-scholarship-program",
    description:
      "Summer intensive overseas language and cultural immersion (eight to ten weeks) in languages critical to national security. Apply directly to CLS; must also meet with the Office of Education Abroad about travel/credit and Davidson's summer study abroad application.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Currently enrolled undergraduate/graduate U.S. citizens, 18+ by May of program year",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/critical-language-scholarship-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "daad-rise-germany",
    officeSlug: "office-of-fellowships",
    name: "DAAD RISE Germany",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/daad-rise-germany",
    description:
      "Summer STEM research internships at German universities and research institutes (about 300 scholarships; monthly stipend, insurance and travel subsidy). Apply directly to DAAD; meet with Education Abroad about travel.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Undergraduates in biology, chemistry, computer science, physics, earth sciences or engineering with at least 2 years completed by the internship",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/daad-rise-germany",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "fulbright-uk-summer-institutes",
    officeSlug: "office-of-fellowships",
    name: "Fulbright UK Summer Institutes",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/uk-summer-institutes",
    description:
      "Three- to four-week UK summer programs for American undergraduates with little to no travel experience. Apply directly to the program.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "U.S. citizen undergraduates with at least two years of study remaining after the Institute, minimum 3.6 GPA, no or very little study/travel outside North America, 18+ by program start",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/uk-summer-institutes",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "beinecke-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Beinecke Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/beinecke-scholarship",
    description:
      "Graduate-study scholarship for juniors planning research- or creative-focused master's/doctoral study in the arts, humanities or social sciences (not professional degrees). Requires a documented history of need-based aid eligibility. REQUIRES Davidson nomination: Davidson may nominate one junior each year; the Davidson internal deadline is set much earlier than the national one; it is posted in the login-only Fellowships Toolkit and, once announced, as a public Office of Fellowships WildcatSync event (not yet posted for the 2026-27 cycle as of 2026-09-30).",
    amount:
      "$5,000 immediately prior to entering graduate school and an additional $30,000 while attending graduate school",
    deadlineText: null,
    deadlines: [],
    audience: "Juniors (U.S. citizens/nationals) with need-based aid history",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/beinecke-scholarship",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "goldwater-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Goldwater Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/goldwater-scholarships",
    description:
      "Undergraduate scholarship for sophomores and juniors committed to research careers in the natural sciences, mathematics and engineering. REQUIRES Davidson nomination: up to four candidates (five to six if transfer students or U.S. veterans) through Davidson's nominating committee; the Davidson internal deadline is set much earlier than the national one; it is posted in the login-only Fellowships Toolkit and, once announced, as a public Office of Fellowships WildcatSync event (not yet posted for the 2026-27 cycle as of 2026-09-30).",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Matriculated sophomores and juniors (U.S. citizens, nationals, permanent residents); 3.0 minimum GPA; intending a research career in natural science, math or engineering",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/goldwater-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "noaa-hollings-scholarship",
    officeSlug: "office-of-fellowships",
    name: "NOAA Hollings Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/noaa-hollings-scholarship",
    description:
      "Two academic years of support plus a 10-week paid internship at NOAA between the two years. Apply directly to NOAA.",
    amount: "up to $9,500 per year for two academic years",
    deadlineText: null,
    deadlines: [],
    audience: "Sophomores (U.S. citizens)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/noaa-hollings-scholarship",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "truman-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Truman Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/truman-scholarships",
    description:
      "Funding for graduate studies plus leadership training for future public-service leaders (government or nonprofit careers). REQUIRES Davidson nomination (up to four candidates each year). Interested students should consult Prof. Peter Ahrensdorf, Davidson's Truman Faculty Representative, during the spring of their sophomore year.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Juniors are typically eligible (U.S. citizens/nationals)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/truman-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "udall-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Udall Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/udall-scholarships",
    description:
      "For leadership, public service and commitment to Native American nations or the environment. REQUIRES Davidson nomination: up to eight (four environmental; four tribal public policy and Native health combined).",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Sophomores or juniors (U.S. citizens, nationals, permanent residents)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/udall-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "gaither-junior-fellows-program-carnegie-endowment",
    officeSlug: "office-of-fellowships",
    name: "Gaither Junior Fellows Program (Carnegie Endowment)",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/gaither-junior-fellows-program",
    description:
      "Hired as full-time employees of the Carnegie Endowment for International Peace in Washington, DC for 10-12 months, providing research assistance to scholars (international affairs). REQUIRES Davidson nomination: apply through the campus nomination process during the fall semester; up to two nominees; the Director of Fellowships is the nominating official.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating seniors or graduates within the past academic year; F-1 students eligible if work-authorized for the full year",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/gaither-junior-fellows-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "knight-hennessy-scholars",
    officeSlug: "office-of-fellowships",
    name: "Knight-Hennessy Scholars",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/knight-hennessy-scholars",
    description:
      "Full funding for any graduate degree at Stanford (up to three years). Davidson endorsement is accepted but not required; candidates must also apply to the Stanford graduate program.",
    amount: null,
    deadlineText: "October 6, 2026 at 1 p.m. PDT",
    deadlines: [
      {
        label: "Application deadline (1 p.m. PDT)",
        date: "2026-10-06",
      },
    ],
    audience: "Seniors and alumni within six years of their bachelor's degree; all citizenships",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12495815"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "nsf-graduate-research-fellowship-program-grfp",
    officeSlug: "office-of-fellowships",
    name: "NSF Graduate Research Fellowship Program (GRFP)",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/national-science-foundation-graduate-fellowships",
    description:
      "Up to three years of support (over five years) for research-based STEM master's and doctoral study. References are due October 16 by 8 p.m. Eastern Time.",
    amount: null,
    deadlineText: "October 19-23, 2026 (varies by field of study) at 8 p.m. Eastern Time",
    deadlines: [
      {
        label: "Deadlines begin (Oct 19-23 by field, 8 p.m. ET)",
        date: "2026-10-19",
      },
    ],
    audience:
      "Seniors and bachelor's holders not yet in a graduate degree program (U.S. citizens, nationals, permanent residents)",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12722709"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "paul-daisy-soros-fellowships-for-new-americans",
    officeSlug: "office-of-fellowships",
    name: "Paul & Daisy Soros Fellowships for New Americans",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/paul-daisy-soros-fellowships-new-americans",
    description:
      "Graduate funding for 30 immigrants and children of immigrants each year, any field. Apply directly.",
    amount: "up to $90,000 in financial support over two years",
    deadlineText: null,
    deadlines: [],
    audience: "Graduating seniors and alumni under 30 with 'New American' status",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/paul-daisy-soros-fellowships-new-americans",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "thomas-r-pickering-foreign-affairs-graduate-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Thomas R. Pickering Foreign Affairs Graduate Fellowship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/pickering-fellowship-program",
    description:
      "State Department-funded two-year master's funding plus Washington and overseas embassy internships, leading to a Foreign Service career (minimum five-year service commitment). Apply directly.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating seniors and alumni entering a two-year U.S. graduate program; U.S. citizens; minimum 3.2 GPA; must demonstrate financial need for graduate school",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/pickering-fellowship-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "rangel-graduate-fellowship-program",
    officeSlug: "office-of-fellowships",
    name: "Rangel Graduate Fellowship Program",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/rangel-fellowship-program",
    description:
      "Two-year master's funding plus a congressional internship and an overseas embassy internship, leading to Foreign Service appointment. Apply directly.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating seniors and alumni entering a two-year U.S. graduate program; U.S. citizens; minimum 3.2 GPA; must demonstrate financial need for graduate school",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/rangel-fellowship-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "boren-fellowship-graduate",
    officeSlug: "office-of-fellowships",
    name: "Boren Fellowship (graduate)",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/boren-fellowships",
    description:
      "National Security Education Program funding for U.S. graduate students to study less commonly taught languages abroad; one year of federal service required. Davidson endorsement accepted. (Undergraduates should see the Boren Scholarship through Education Abroad.)",
    amount: null,
    deadlineText:
      "Contact the Director of Fellowships to discuss candidacy by December 1 each year",
    deadlines: [
      {
        label: "Contact the Director of Fellowships about candidacy",
        date: "2026-12-01",
      },
    ],
    audience:
      "Seniors and alumni matriculated in or applying to a U.S. graduate degree program (U.S. citizens)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/boren-fellowships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "churchill-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Churchill Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/churchill-scholarship",
    description:
      "One year of master's study (typically MPhil) in math, science or engineering at Churchill College, Cambridge. REQUIRES Davidson nomination (up to two students); apply to Davidson first. Minimum 3.5 GPA for Cambridge admission (3.7 if a first is required); typical competitive GPA 3.9+. The 2026 Davidson nomination application was due September 28, 2026 at 3 p.m. (passed).",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Seniors or graduates within the past 12 months (U.S. citizens)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/churchill-scholarship",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "fulbright-u-s-student-program",
    officeSlug: "office-of-fellowships",
    name: "Fulbright U.S. Student Program",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/fulbright-us-student-program",
    description:
      "Study/Research and English Teaching Assistant awards in 140+ countries. Fulbright strongly encourages endorsement by the home institution; Davidson runs an endorsement process (instructions in the login-only toolkit; alumni must request toolkit access from the Director of Fellowships). The 2026 Davidson endorsement application was due August 26, 2026 at 3 p.m. (passed). Davidson has been named a top producer of Fulbright students 12 times.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating seniors, recent graduates, graduate students and early professionals (U.S. citizens)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/fulbright-us-student-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "gates-cambridge-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Gates Cambridge Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/gates-cambridge-scholarships",
    description:
      "Full-cost scholarships for a full-time postgraduate degree at Cambridge (about 25 awards in the U.S. round). Apply via the Cambridge Graduate Application Portal; separate deadlines for U.S. citizens resident in the U.S.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Seniors and alumni who are citizens of any country outside the UK",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/gates-cambridge-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "luce-scholars-program",
    officeSlug: "office-of-fellowships",
    name: "Luce Scholars Program",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/luce-scholarships",
    description:
      "Yearlong leadership-development fellowship with immersive professional placements in Asia. Apply directly. The 2026 application deadline (September 7, 2026 at 5 p.m. EDT, per the Office of Fellowships' WildcatSync listing) has passed.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating seniors, recent graduates or young professionals under 33 (U.S. citizens or permanent residents)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/luce-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "marshall-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Marshall Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/marshall-scholarships",
    description:
      "Up to 50 awards a year for one to three years of graduate study in the UK in any field. REQUIRES Davidson endorsement through the endorsement committee (unendorsed applications are not considered). The 2026 Davidson endorsement application was due August 31, 2026 at 3 p.m. (extended; passed).",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating seniors and alumni within two years of graduating (U.S. citizens); GPA of at least 3.7; no prior UK degree study",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/marshall-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "mccall-macbain-scholarships",
    officeSlug: "office-of-fellowships",
    name: "McCall MacBain Scholarships",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/mccall-macbain-scholarships",
    description:
      "Fully funded master's or professional degree at McGill University with mentoring and a leadership program. REQUIRES Davidson endorsement (except alumni who graduated more than two years ago). The 2026 application deadline was September 23, 2026 at 4 p.m. ET (passed); endorsement candidates had earlier required advising appointments.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Graduating seniors and alumni",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/mccall-macbain-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "rhodes-scholarship",
    officeSlug: "office-of-fellowships",
    name: "Rhodes Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/rhodes-scholarships",
    description:
      "Full funding for at least two years of study at Oxford. U.S.-constituency candidates REQUIRE Davidson endorsement through the Office of Fellowships (the 2026 endorsement application was due August 31, 2026 at 3 p.m., extended; passed). Non-U.S. constituency eligibility and deadlines vary; Canada-constituency candidates must be certified by Davidson.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating seniors and alumni who are at least 18 and have not reached their 24th birthday on October 1 of the application year; U.S. constituency: U.S. citizens, lawful permanent residents or DACA recipients with a minimum 3.7 GPA",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/rhodes-scholarships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "schwarzman-scholars",
    officeSlug: "office-of-fellowships",
    name: "Schwarzman Scholars",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/schwarzman-scholars",
    description:
      "One-year, fully funded Master's in Global Affairs at Tsinghua University, Beijing, plus a leadership program. Apply directly. The 2026 application deadline (September 9, 2026 at 3 p.m. EDT, per the Office of Fellowships' WildcatSync listing) has passed.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Seniors and alumni of any citizenship who are at least 18 but not yet 29 as of August 1 of their enrollment year",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/schwarzman-scholars",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "w-thomas-smith-scholarship",
    officeSlug: "office-of-fellowships",
    name: "W. Thomas Smith Scholarship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/smith-scholarship",
    description:
      "Davidson-specific award to graduating seniors funding all eligible expenses for full-time enrollment in a graduate degree program at a major university outside the U.S. (a master's program of up to 12 months, or the first academic year of a doctoral program). Candidates must be in the top 10% of the class by cumulative GPA OR have been endorsed or nominated by the Office of Fellowships in the current academic year for the Churchill, Marshall, Rhodes or Fulbright (graduate degree enrollment grants only). The Office of Fellowships emails eligible seniors each spring; they then apply.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Graduating Davidson seniors in the top 10% by cumulative GPA, or endorsed/nominated this year for Churchill, Marshall, Rhodes or Fulbright (graduate degree grants)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/smith-scholarship",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "thomas-j-watson-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Thomas J. Watson Fellowship",
    url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/watson-fellowship",
    description:
      "One year of purposeful independent exploration outside the U.S.; awarded to graduating seniors nominated by one of 41 partner colleges. REQUIRES Davidson nomination (up to four seniors). The Davidson nomination deadline is today (2026-09-30).",
    amount: "$40,000",
    deadlineText: "September 30, 2026 at 3 p.m. EDT (Davidson nomination application)",
    deadlines: [
      {
        label: "Davidson nomination application (3 p.m. EDT)",
        date: "2026-09-30",
      },
    ],
    audience: "Graduating seniors (Class of 2027); no citizenship requirement",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12460064"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "project-horseshoe-farm-community-health-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Project Horseshoe Farm Community Health Fellowship",
    url: "https://wildcatsync.davidson.edu/event/12797363",
    description:
      "Post-graduate community health fellowship (sites in Greensboro and Marion, Alabama and Pomona, California). Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText:
      "Priority Deadline: October 25, 2026; Second Deadline: January 24, 2027; Final Deadline: February 28, 2027",
    deadlines: [
      {
        label: "Priority deadline",
        date: "2026-10-25",
      },
      {
        label: "Second deadline",
        date: "2027-01-24",
      },
      {
        label: "Final deadline",
        date: "2027-02-28",
      },
    ],
    audience: "Graduating seniors / recent graduates, all majors",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12797363"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "princeton-in-africa-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Princeton in Africa Fellowship",
    url: "https://wildcatsync.davidson.edu/event/12722746",
    description:
      "Yearlong paid post-graduate fellowships with organizations across the African continent. Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText: "October 26, 2026 at 11:59 p.m. Eastern Daylight Time",
    deadlines: [
      {
        label: "Application deadline (11:59 p.m. EDT)",
        date: "2026-10-26",
      },
    ],
    audience: "Young professionals or undergraduates graduating by June 2027",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12722746"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "hertz-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Hertz Fellowship",
    url: "https://wildcatsync.davidson.edu/event/12797072",
    description:
      "Up to five years of PhD support in the applied sciences, engineering and mathematics (stipend and full tuition equivalent valued over $250,000). Listed by the Office of Fellowships on WildcatSync.",
    amount: "valued over $250,000",
    deadlineText: "October 30, 2026",
    deadlines: [
      {
        label: "Application deadline",
        date: "2026-10-30",
      },
    ],
    audience:
      "College seniors, first-year graduate students or gap-year applicants who will be first- or second-year PhD students in fall 2027 in the applied physical/biological sciences, math or engineering at a U.S. institution; U.S. citizens or permanent residents",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12797072"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "princeton-in-asia-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Princeton in Asia Fellowship",
    url: "https://wildcatsync.davidson.edu/event/12722581",
    description:
      "One- or two-year immersive work placements with host organizations in Asia. Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText: "November 1, 2026",
    deadlines: [
      {
        label: "Application deadline",
        date: "2026-11-01",
      },
    ],
    audience: "College seniors or recent graduates; no citizenship restriction",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12722581"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "american-scandinavian-foundation-asf-fellowships-for-americans",
    officeSlug: "office-of-fellowships",
    name: "American-Scandinavian Foundation (ASF) Fellowships for Americans",
    url: "https://wildcatsync.davidson.edu/event/12799999",
    description:
      "Research or creative-arts fellowships in the Nordic region for 2027-28. Listed by the Office of Fellowships on WildcatSync.",
    amount:
      "long-term (4-12 months) fellowships of up to $23,000; short-term (1-3 months) fellowships of up to $5,000",
    deadlineText: "November 1, 2026",
    deadlines: [
      {
        label: "Application deadline",
        date: "2026-11-01",
      },
    ],
    audience:
      "Graduate students (preferably dissertation-related) and academic professionals; U.S. citizens or permanent residents who have completed undergraduate study by the project start",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12799999"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "goldwater-summer-research-internship-program",
    officeSlug: "office-of-fellowships",
    name: "Goldwater Summer Research Internship Program",
    url: "https://wildcatsync.davidson.edu/event/12722624",
    description:
      "Summer research internships (distinct from the Goldwater Scholarship) for first- and second-year students, especially those with limited research access; interns are expected to apply for the Goldwater Scholarship the next fall. Listed by the Office of Fellowships on WildcatSync.",
    amount: "$10,500",
    deadlineText: "November 2, 2026 (WildcatSync listing: 'Application Deadline: 11/2/2026')",
    deadlines: [
      {
        label: "Application deadline",
        date: "2026-11-02",
      },
    ],
    audience:
      "Students completing their first or second year by summer 2027 (U.S. citizens or permanent residents)",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12722624"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "mentora-scholars",
    officeSlug: "office-of-fellowships",
    name: "Mentora Scholars",
    url: "https://wildcatsync.davidson.edu/event/12833259",
    description:
      "Fully funded leadership fellowship for college students. Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText:
      "Priority Application Deadline: November 8, 2026; Final Application Deadline: January 17, 2027",
    deadlines: [
      {
        label: "Priority application deadline",
        date: "2026-11-08",
      },
      {
        label: "Final application deadline",
        date: "2027-01-17",
      },
    ],
    audience: "U.S. and Canadian undergraduates and those within one year of their degree",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12833259"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "mississippi-teacher-corps",
    officeSlug: "office-of-fellowships",
    name: "Mississippi Teacher Corps",
    url: "https://wildcatsync.davidson.edu/event/12507062",
    description:
      "Full-scholarship MAT at the University of Mississippi with paid teaching placement (grades 7-12) for non-education majors. Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText:
      "November 15: Early acceptance; February 15: Preferred deadline; April 15: Final deadline (2026-27 cycle)",
    deadlines: [
      {
        label: "Early acceptance",
        date: "2026-11-15",
      },
      {
        label: "Preferred deadline",
        date: "2027-02-15",
      },
      {
        label: "Final deadline",
        date: "2027-04-15",
      },
    ],
    audience:
      "Applicants with an undergraduate degree including 12-18 hours of coursework in math, science, English, social studies or a foreign language, and a minimum 3.0 GPA (or the Praxis Core/ACT 21+ alternative); must pass Praxis II in the subject and show lawful U.S. presence",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12507062"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "lafayette-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Lafayette Fellowship",
    url: "https://wildcatsync.davidson.edu/event/12722629",
    description:
      "Funds one year of master's-level study in France for up to 30 American students (French or English instruction). Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText: "December 1, 2026, 11:59 a.m. EST",
    deadlines: [
      {
        label: "Application deadline (11:59 a.m. EST)",
        date: "2026-12-01",
      },
    ],
    audience:
      "Applicants 27 or younger as of July 1, 2027 with a bachelor's degree from a U.S. institution completed between January 2024 and June 2027 and a GPA of at least 3.70; must also be admitted to a French partner university",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12722629"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "carnegie-mellon-university-cmu-rales-fellows-program",
    officeSlug: "office-of-fellowships",
    name: "Carnegie Mellon University (CMU) Rales Fellows Program",
    url: "https://wildcatsync.davidson.edu/event/12755666",
    description:
      "Funding and support for graduate STEM degrees at CMU. Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText: "Priority Review Application Deadline: December 15, 2026 at 11:59 p.m.",
    deadlines: [
      {
        label: "Priority review deadline (11:59 p.m.)",
        date: "2026-12-15",
      },
    ],
    audience:
      "U.S. citizens, permanent residents or DACA recipients applying to eligible CMU (Pittsburgh) STEM graduate programs who received a Federal Pell Grant or need-based aid as undergraduates, or are first-generation college students",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12755666"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "blakemore-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Blakemore Fellowship",
    url: "https://wildcatsync.davidson.edu/event/12796972",
    description:
      "One academic year of advanced Chinese study at the IUP-Chinese Center at Tsinghua University; covers tuition plus a stipend. Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText: "December 30, 2026 at 11 p.m. Pacific Standard Time",
    deadlines: [
      {
        label: "Application deadline (11 p.m. PST)",
        date: "2026-12-30",
      },
    ],
    audience:
      "U.S. citizens or permanent residents with at least a bachelor's degree by the grant start, pursuing careers that use Chinese, Japanese, Korean, Thai, Vietnamese, Indonesian or Khmer, who have completed at least a third year of college-level language study; full-time study only",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12796972"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "blakemore-freeman-fellowship",
    officeSlug: "office-of-fellowships",
    name: "Blakemore Freeman Fellowship",
    url: "https://wildcatsync.davidson.edu/event/12796949",
    description:
      "One academic year of advanced language study in East or Southeast Asia (Chinese, Japanese, Korean, Indonesian, Khmer, Thai, Vietnamese); covers tuition plus a stipend. Listed by the Office of Fellowships on WildcatSync.",
    amount: null,
    deadlineText: "December 30, 2026, at 11 p.m. Pacific Standard Time",
    deadlines: [
      {
        label: "Application deadline (11 p.m. PST)",
        date: "2026-12-30",
      },
    ],
    audience:
      "U.S. citizens or permanent residents with at least a bachelor's degree by the grant start, pursuing careers that use Chinese, Japanese, Korean, Thai, Vietnamese, Indonesian or Khmer, who have completed at least a third year of college-level language study; full-time study only",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12796949"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-college-fellows-program",
    officeSlug: "office-of-fellowships",
    name: "Davidson College Fellows Program",
    url: "https://www.davidson.edu/offices-and-services/human-resources/work-davidson/fellows-program",
    description:
      "Full-time (40 hours/week), generally one-year staff positions at Davidson for new graduates, in areas such as Alumni and Family Engagement, Annual Fund, College Union, Civic Engagement, Health Services, Human Resources and Technology & Innovation; includes up to $500 in first-year training reimbursement. Positions are posted in the spring on the college jobs site. Listed under 'Keep Exploring' on the Office of Fellowships' Fellowship Opportunities page.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience:
      "Current Davidson seniors graduating in the spring, or graduates out of school no more than two years",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/human-resources/work-davidson/fellows-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "study-abroad-away-application-summer-fall-academic-year-programs",
    officeSlug: "education-abroad",
    name: "Study abroad/away application - Summer, Fall & Academic Year programs",
    url: "https://educationabroad.davidson.edu/index.cfm?FuseAction=Abroad.ViewLink&Parent_ID=0&Link_ID=29971A64-26B9-58D3-F563E6F3964A415B",
    description:
      "Davidson application in the OEAA portal (plus the partner application for partner programs). Applications open mid/late October. Off-Campus Study Notification deadline March 15; Off-Campus Financial Aid Agreement March 15; Pre-Authorization to Transfer Credit Form April 15. Partner deadlines may be earlier than Davidson's.",
    amount: null,
    deadlineText: "February 1",
    deadlines: [
      {
        label: "Application deadline",
        date: "2027-02-01",
      },
    ],
    audience: "Students in good academic, financial and disciplinary standing",
    source: "davidson-offices",
    sources: [
      "https://educationabroad.davidson.edu/index.cfm?FuseAction=Abroad.ViewLink&Parent_ID=0&Link_ID=29971A64-26B9-58D3-F563E6F3964A415B",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "study-abroad-away-application-spring-winter-break-programs",
    officeSlug: "education-abroad",
    name: "Study abroad/away application - Spring & Winter Break programs",
    url: "https://educationabroad.davidson.edu/index.cfm?FuseAction=Abroad.ViewLink&Parent_ID=0&Link_ID=29971A64-26B9-58D3-F563E6F3964A415B",
    description:
      "Applications open early/mid April. Off-Campus Study Notification deadline November 1; Off-Campus Financial Aid Agreement November 15; Pre-Authorization to Transfer Credit Form November 1.",
    amount: null,
    deadlineText: "September 15",
    deadlines: [],
    audience: "Students in good academic, financial and disciplinary standing",
    source: "davidson-offices",
    sources: [
      "https://educationabroad.davidson.edu/index.cfm?FuseAction=Abroad.ViewLink&Parent_ID=0&Link_ID=29971A64-26B9-58D3-F563E6F3964A415B",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "heitz-wagener-study-abroad-scholarship",
    officeSlug: "education-abroad",
    name: "Heitz-Wagener Study Abroad Scholarship",
    url: "https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants",
    description:
      "Travel allowance used after the program ends or during official breaks (not program fees or U.S. round-trip travel). 2-4 stipends each spring; questionnaire is included in all spring semester and academic-year study abroad applications; recipients hear by mid-November.",
    amount: "$1,500",
    deadlineText: null,
    deadlines: [],
    audience:
      "Sophomores and juniors receiving need-based aid studying abroad in the spring semester",
    source: "davidson-offices",
    sources: ["https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "bertis-e-downs-iii-and-eugene-m-downs-sr-education-abroad-fund",
    officeSlug: "education-abroad",
    name: "Bertis E. Downs III and Eugene M. Downs, Sr. Education Abroad Fund",
    url: "https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants",
    description:
      "Supports a credit-bearing summer program for students who have not previously studied abroad for credit; priority when summer is the only option. 1-2 stipends each summer; questionnaire included in all summer study abroad applications; decisions by March 15.",
    amount: "typically $2,000 each",
    deadlineText: null,
    deadlines: [],
    audience: "Students receiving need-based aid applying to a credit-bearing summer program",
    source: "davidson-offices",
    sources: ["https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "stephen-w-keller-memorial-scholarship",
    officeSlug: "education-abroad",
    name: "Stephen W. Keller Memorial Scholarship",
    url: "https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants",
    description:
      "Supports at least four weeks of independent experiential study, travel and cultural engagement in Greece and/or Germany; recipient corresponds with the Keller family. Questionnaire included in spring semester and academic-year study abroad applications. Also listed by the Dean Rusk Program.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students on credit-bearing study abroad, preference for Germany or Greece",
    source: "davidson-offices",
    sources: ["https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "benjamin-a-gilman-international-scholarship-external-oeaa-advising",
    officeSlug: "education-abroad",
    name: "Benjamin A. Gilman International Scholarship (external; OEAA advising)",
    url: "https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants",
    description:
      "U.S. Department of State funding for Federal Pell Grant recipients to study abroad; this cycle covers programs/internships starting December 1, 2026-October 31, 2027 (Maymester, Summer, Fall 2027, AY 2027-28 and Spring 2027).",
    amount: null,
    deadlineText: "Thursday, October 1, 2026, at 11:59 pm Pacific Time",
    deadlines: [
      {
        label: "Application deadline (11:59 p.m. PT)",
        date: "2026-10-01",
      },
    ],
    audience: "Federal Pell Grant recipients",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12577351"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "boren-scholarship-external-oeaa-campus-representative",
    officeSlug: "education-abroad",
    name: "Boren Scholarship (external; OEAA campus representative)",
    url: "https://www.davidson.edu/offices-and-services/education-abroad/scholarships-grants",
    description:
      "Funds intensive language and culture study abroad for U.S. undergraduates; 2027-28 funding may start June 2027-March 1, 2028. Applicants are required to meet with the Boren Campus Representative (OEAA Director).",
    amount: null,
    deadlineText:
      "January 27, 2027 (WildcatSync deadline listing); required meeting with the Boren Campus Representative no later than December 6, 2026",
    deadlines: [
      {
        label: "Required meeting with the Boren Campus Representative",
        date: "2026-12-06",
      },
      {
        label: "Application deadline",
        date: "2027-01-27",
      },
    ],
    audience: "U.S. undergraduates",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12498063"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "douglass-o-connell-global-internship-ciee",
    officeSlug: "education-abroad",
    name: "Douglass-O'Connell Global Internship (CIEE)",
    url: "https://wildcatsync.davidson.edu/event/12723916",
    description:
      "Eight-week summer internship program in Dublin, Ireland (June 16-August 9, 2027) for ten student leaders; requires a Davidson Summer Partner Program application with OEAA in addition to the CIEE application. A workshop and info session (with the Matthews Center) is on October 15, 2026.",
    amount: null,
    deadlineText: "January 8, 2027 (WildcatSync deadline listing)",
    deadlines: [
      {
        label: "Application deadline",
        date: "2027-01-08",
      },
    ],
    audience: "Student leaders applying for summer 2027",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12723916"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "nonprofit-leadership-fellows",
    officeSlug: "civic-engagement",
    name: "Nonprofit Leadership Fellows",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    description:
      "20+ full-time (avg 40 hrs/week) capacity-building positions with nonprofits for nine weeks (May 26-July 24 in the published cycle); Charlotte cohort (housed at Johnson and Wales University) and North Mecklenburg & Lake Norman cohort (Davidson summer housing); includes the Summer Community Leadership Institute. Summer program with community living and a shared curriculum; applications via WildcatSync. Most recent published due dates (year not stated; page describes the summer 2026 cycle): Freedom Schools interns February 2 at 11:59 p.m.; all other programs February 8 at 11:59 p.m.",
    amount: "$3,500 stipend + housing",
    deadlineText: null,
    deadlines: [],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "brenda-h-tapia-cdf-freedom-schools-servant-leader-interns",
    officeSlug: "civic-engagement",
    name: "Brenda H. Tapia CDF Freedom Schools Servant Leader Interns",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    description:
      "6 full-time positions for nine weeks facilitating Children's Defense Fund summer literacy enrichment for K-8 children at Davidson. Summer program with community living and a shared curriculum; applications via WildcatSync. Most recent published due dates (year not stated; page describes the summer 2026 cycle): Freedom Schools interns February 2 at 11:59 p.m.; all other programs February 8 at 11:59 p.m.",
    amount: "$3,500 stipend + housing",
    deadlineText: null,
    deadlines: [],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "community-research-fellows",
    officeSlug: "civic-engagement",
    name: "Community Research Fellows",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    description:
      "3-4 fellows doing place-based community research with Mulliss Center and Data CATS staff (e.g., housing, early childhood education, health) for eight-nine weeks; resume and cover letter required. Summer program with community living and a shared curriculum; applications via WildcatSync. Most recent published due dates (year not stated; page describes the summer 2026 cycle): Freedom Schools interns February 2 at 11:59 p.m.; all other programs February 8 at 11:59 p.m.",
    amount: "$3,500 education award + housing stipend",
    deadlineText: null,
    deadlines: [],
    audience: "Current students with interest in qualitative/quantitative research",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "mulliss-center-for-civic-engagement-and-service-odyssey-interns",
    officeSlug: "civic-engagement",
    name: "Mulliss Center for Civic Engagement and Service Odyssey Interns",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    description:
      "3 full-time summer positions leading three weeklong Service Odyssey pre-orientation experiences and supporting Orientation/Welcome Week programming. Summer program with community living and a shared curriculum; applications via WildcatSync. Most recent published due dates (year not stated; page describes the summer 2026 cycle): Freedom Schools interns February 2 at 11:59 p.m.; all other programs February 8 at 11:59 p.m.",
    amount: "$4,500 stipend + on-campus housing (or equivalent locally)",
    deadlineText: null,
    deadlines: [],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "roy-alexander-internship-with-davidson-lands-conservancy",
    officeSlug: "civic-engagement",
    name: "Roy Alexander Internship with Davidson Lands Conservancy",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    description:
      "One eight-week, 40 hrs/week internship in nonprofit management and environmental conservation; part of the North Mecklenburg & Lake Norman NPLF cohort; resume and cover letter required. Summer program with community living and a shared curriculum; applications via WildcatSync. Most recent published due dates (year not stated; page describes the summer 2026 cycle): Freedom Schools interns February 2 at 11:59 p.m.; all other programs February 8 at 11:59 p.m.",
    amount: "$5,000 stipend",
    deadlineText: null,
    deadlines: [],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "leonard-fund",
    officeSlug: "civic-engagement",
    name: "Leonard Fund",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/leonard-fund",
    description:
      "Supports summer service projects, community internships, service travel or community project development. Common application on WildcatSync (the Grants overview page also links a Kuali form); two parts: proposal narrative (max two pages) and budget.",
    amount: "up to $3,500",
    deadlineText:
      "Early Due Date: Sunday, February 21, 2027, at 11:59 p.m.; Final Due Date: Sunday, March 28, 2027, at 11:59 p.m.",
    deadlines: [
      {
        label: "Early due date (11:59 p.m.)",
        date: "2027-02-21",
      },
      {
        label: "Final due date (11:59 p.m.)",
        date: "2027-03-28",
      },
    ],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/leonard-fund",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "robert-t-stone-fund",
    officeSlug: "civic-engagement",
    name: "Robert T. Stone Fund",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/robert-t-stone-fund",
    description:
      "Supports student-designed environmental service projects, internships or experiences in the summer. Common application on WildcatSync (the Grants overview page also links a Kuali form); two parts: proposal narrative (max two pages) and budget.",
    amount: "up to $5,000",
    deadlineText:
      "Early Due Date: Sunday, February 21, 2027, at 11:59 p.m.; Final Due Date: Sunday, March 28, 2027, at 11:59 p.m.",
    deadlines: [
      {
        label: "Early due date (11:59 p.m.)",
        date: "2027-02-21",
      },
      {
        label: "Final due date (11:59 p.m.)",
        date: "2027-03-28",
      },
    ],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/robert-t-stone-fund",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "ruth-pittard-fund-for-love-in-action",
    officeSlug: "civic-engagement",
    name: "Ruth Pittard Fund for Love in Action",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/ruth-pittard-fund-love-action",
    description:
      "Supports meaningful summer internships, projects or experiences honoring collaboration, community building, service, integrity and love. Common application on WildcatSync (the Grants overview page also links a Kuali form); two parts: proposal narrative (max two pages) and budget.",
    amount: "up to $5,000",
    deadlineText:
      "Early Due Date: Sunday, February 21, 2027, at 11:59 p.m.; Final Due Date: Sunday, March 28, 2027, at 11:59 p.m.",
    deadlines: [
      {
        label: "Early due date (11:59 p.m.)",
        date: "2027-02-21",
      },
      {
        label: "Final due date (11:59 p.m.)",
        date: "2027-03-28",
      },
    ],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/ruth-pittard-fund-love-action",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "kathryn-w-davis-projects-for-peace-grant",
    officeSlug: "civic-engagement",
    name: "Kathryn W. Davis Projects for Peace Grant",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/kathryn-w-davis-projects-peace-grant",
    description:
      "Grant for student-designed projects that promote peace and address root causes of conflict (conflict prevention, resolution or reconciliation); separate application (2-page narrative + budget covering all $10,000). Spring semester only.",
    amount: "$10,000",
    deadlineText: "Wednesday, January 20, 2027, at 11:59 p.m.",
    deadlines: [
      {
        label: "Application deadline (11:59 p.m.)",
        date: "2027-01-20",
      },
    ],
    audience: "Individual students or student groups",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/grants-and-funding-opportunities/kathryn-w-davis-projects-peace-grant",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "bonner-scholars-program",
    officeSlug: "civic-engagement",
    name: "Bonner Scholars Program",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement/signature-programs/bonner-scholars",
    description:
      "Four-year service scholarship program (80 participants; 20 new students a year): 280 service hours annually, two summers of service, weekly meetings, a cornerstone project (first-years plan a Bonner Foundation-funded spring-break service trip) and a senior 'presentation of learning'. Scholarship (beginning with the Class of 2024): $2,500 per semester; $3,000 summer living support; $1,500 summer earnings; $500 senior stipend (total monetary value $23,500). The Bonner Foundation also provides a modest need-based grant that replaces a portion of the Davidson College Grant.",
    amount:
      "$2,500 per semester; $3,000 per summer (living support); $1,500 per summer (earnings); $500 senior stipend",
    deadlineText:
      "Class of 2031 application opens January 31, 2027; first round of review begins June 15, 2027; open until the class is filled",
    deadlines: [],
    audience:
      "Incoming first-year students who demonstrate financial need on their Davidson application (sophomores may be eligible if spots remain); domestic and international students; applicants contacted at their Davidson email",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/civic-engagement/signature-programs/bonner-scholars",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "premedical-prehealth-advisory-committee-pac-evaluation",
    officeSlug: "premed-health-professions",
    name: "Premedical/Prehealth Advisory Committee (PAC) Evaluation",
    url: "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions/premedicalprehealth-advisory-committee",
    description:
      "Committee evaluation letter (cover letter, director's narrative and up to 6 evaluator letters) sent to health professions programs at the student's request. The 2026-2027 application opened Sept. 3, 2026; juniors must meet with the program director before applying; application materials are available only by email from the Program Coordinator. No summer or fall PAC evaluations.",
    amount: null,
    deadlineText: "11:59 p.m. ET on Nov. 1, 2026",
    deadlines: [
      {
        label: "PAC evaluation deadline (11:59 p.m. ET)",
        date: "2026-11-01",
      },
    ],
    audience:
      "Rising juniors and seniors and recent alumni applying to medical, dental, PA, nursing, veterinary and other health programs",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions/premedicalprehealth-advisory-committee",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "greater-charlotte-law-school-fair",
    officeSlug: "prelaw",
    name: "Greater Charlotte Law School Fair",
    url: "https://www.davidson.edu/academic-departments/prelaw/law-school-fair",
    description:
      "Hosted each fall semester by the Matthews Center in the Alvarez College Union; admission representatives from law schools nationwide (the Prelaw page says more than 60). 2026 edition: Thursday October 8, 2026, 10:30 am-12:30 pm, Atrium of the Alvarez College Union; business casual encouraged; open to all class years and majors.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "All students and alumni",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12807625"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "law-school-application-fee-grant-matthews-center-professional-development",
    officeSlug: "prelaw",
    name: "Law school application fee grant (Matthews Center professional development funding)",
    url: "https://www.davidson.edu/academic-departments/prelaw/law-school-resources",
    description:
      "Grant funding to help offset post-graduate application costs such as law school application fees, required subscription purchases and LSAT preparation; talk with a Matthews Center adviser about the process and deadlines.",
    amount: "$500 during their undergraduate studies",
    deadlineText: null,
    deadlines: [],
    audience: "Current students applying to law school",
    source: "davidson-offices",
    sources: ["https://www.davidson.edu/academic-departments/prelaw/law-school-resources"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "peer-academic-coaching-pac",
    officeSlug: "aadr",
    name: "Peer Academic Coaching (PAC)",
    url: "https://www.davidson.edu/offices-and-services/academic-access-disability-resources/academic-access/peer-academic-coaching",
    description:
      "Matches students with peer coaches for time management, organization, note-taking, studying, reading and test-taking; request via the Peer Academic Coaching Interest Form.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Any student wanting to strengthen academic skills",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/academic-access-disability-resources/academic-access/peer-academic-coaching",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "semester-accommodation-request-accommodate",
    officeSlug: "aadr",
    name: "Semester accommodation request (Accommodate)",
    url: "https://www.davidson.edu/offices-and-services/academic-access-disability-resources/disability-resources/requesting-accommodations",
    description:
      "After accommodations are approved, students must submit a 'semester request' in Accommodate every semester. Submit as soon as course registration is finalized; accommodations are not retroactive.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students with approved accommodations",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/academic-access-disability-resources/disability-resources/requesting-accommodations",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "student-assistance-for-financial-emergencies-safe",
    officeSlug: "dean-of-students",
    name: "Student Assistance for Financial Emergencies (SAFE)",
    url: "https://www.davidson.edu/offices-and-services/division-student-life/dean-students/student-assistance-financial-emergencies-safe",
    description:
      "Non-cash, case-by-case assistance for unexpected or unavoidable financial emergencies (e.g., health costs, safety needs, replacing belongings after fire/theft/natural disaster, car repairs, travel for a loved one's death or illness, housing emergencies). Not for tuition/fees/room/board, recurring needs, food (see Lula Bell's), parking tickets, laptops or application fees. One approved request per student per academic year; supporting documentation required; answer expected within five business days. Apply via the SAFE form.",
    amount: "The maximum request amount is of $1000.00",
    deadlineText: null,
    deadlines: [],
    audience: "Actively enrolled students in good standing",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/division-student-life/dean-students/student-assistance-financial-emergencies-safe",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dean-rusk-travel-grants",
    officeSlug: "dean-rusk",
    name: "Dean Rusk Travel Grants",
    url: "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/dean-rusk-travel-grants/application-process",
    description:
      "Grants in four categories (exploratory & reflective, research, service, select study programs) reviewed by the International Education Committee; cover airfare, lodging, meals and ground transportation (rarely external program fees); amounts vary by location and length. Winter break: sophomores, juniors and seniors, minimum two weeks. Summer: first-years, sophomores and juniors, minimum three weeks (a month or longer strongly preferred). Travel is allowed to U.S. State Department Level 1-3 advisory countries (Level 3 requires a waiver); Level 4 countries are not considered. The winter break 2026-2027 application is open. Decisions typically 4-5 weeks after the deadline.",
    amount: null,
    deadlineText:
      "Winter Break: Applications must be submitted by October 1. Summer Break: Applications must be submitted by February 1.",
    deadlines: [
      {
        label: "Winter break applications",
        date: "2026-10-01",
      },
      {
        label: "Summer break applications",
        date: "2027-02-01",
      },
    ],
    audience: "Sophomores-seniors (winter); first-years-juniors (summer)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/dean-rusk-travel-grants/application-process",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "pulitzer-center-fellowship-grant",
    officeSlug: "dean-rusk",
    name: "Pulitzer Center Fellowship Grant",
    url: "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/pulitzer-center-fellowship-grant",
    description:
      "One student each spring is selected for an independent multimedia international reporting project on an under-reported systemic issue, with training and editing support from the Pulitzer Center on Crisis Reporting.",
    amount: null,
    deadlineText:
      "The 2027 application opens December 1; the deadline to submit applications for summer travel is February 1",
    deadlines: [
      {
        label: "Application deadline (summer travel)",
        date: "2027-02-01",
      },
    ],
    audience: "Current students interested in international reporting",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/pulitzer-center-fellowship-grant",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "the-lou-ortmayer-fellowship-grant",
    officeSlug: "dean-rusk",
    name: "The Lou Ortmayer Fellowship Grant",
    url: "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/lou-ortmayer-fellowship-grant",
    description:
      "Supports experiential learning for the rest of the student's Davidson career (including the summer after graduation), preferring international public health, medicine and/or food and water security in developing countries; plus $1,000 for a faculty/staff mentor. Requires a meeting with the Dean Rusk Director before the deadline. 'Application Opens on December 1'; the page's requirements still reference a 'February 1, 2025 deadline' (stale), so no current deadline is recorded.",
    amount: "$15,000",
    deadlineText: null,
    deadlines: [],
    audience: "Sophomores",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/lou-ortmayer-fellowship-grant",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-research-initiative-dri-summer-research-fellowships",
    officeSlug: "undergraduate-research",
    name: "Davidson Research Initiative (DRI) Summer Research Fellowships",
    url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
    description:
      "Summer research training with a faculty/staff mentor in any discipline: up to 10 weeks on campus, 5+5 on/off campus, or up to 10 weeks off campus with a traveling mentor; collaborative 2-4 student proposals accepted. Designated fellowships include two Mimms (biochemistry/genetics/molecular biology/genomics/bioinformatics), one Ross (social sciences/humanities), one Stevens (chemistry) and one Cannon Foundation (any independent research). Most recent published cycle: student submission Sunday, February 1, 2026 at 5 p.m.; mentor agreement February 8, 2026; 2027 dates not yet posted.",
    amount: "$600 per week and up to $1,000 for travel/supplies",
    deadlineText: null,
    deadlines: [],
    audience: "Current first-years, sophomores or juniors (graduating seniors not eligible)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "abernethy-endowment-grant",
    officeSlug: "undergraduate-research",
    name: "Abernethy Endowment Grant",
    url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/abernethy-endowment-grant",
    description:
      "Supports independent research, creative works and experiential learning in the humanities, arts or social sciences, in the U.S. or abroad, academic year or summer, with a faculty mentor (mentor agreements due October 6 / February 6).",
    amount: "Grant awards average about $2,000 but have ranged from $250 to $5900",
    deadlineText: "Winter Break Deadline: October 1; Summer Deadline: February 1",
    deadlines: [
      {
        label: "Winter break deadline",
        date: "2026-10-01",
      },
      {
        label: "Summer deadline",
        date: "2027-02-01",
      },
    ],
    audience: "Current students with humanities, arts or social science projects",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/abernethy-endowment-grant",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidson-research-network-drn",
    officeSlug: "undergraduate-research",
    name: "Davidson Research Network (DRN)",
    url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-network",
    description:
      "Off-campus summer research (about eight weeks) with leading health-science researchers, many of them Davidson alumni (sites include MD Anderson, Duke, UNC, Vanderbilt, Mass General-Harvard, Weill Cornell, WashU and others); pick 3-5 sites from the 2027 DRN Mentor List. Faculty recommendation letters due one week after the deadline. F-1 students must discuss CPT with ISE.",
    amount: "A $6,000 stipend",
    deadlineText: "Friday, October 30, 2026 by 11:59 p.m.",
    deadlines: [
      {
        label: "Application deadline (11:59 p.m.)",
        date: "2026-10-30",
      },
    ],
    audience:
      "Sophomores and juniors planning health-science careers (previous research preferred)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-network",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "kemp-scholars-program",
    officeSlug: "undergraduate-research",
    name: "Kemp Scholars Program",
    url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/kemp-scholars-program",
    description:
      "Independent research of the student's own design in any discipline (U.S. or abroad), with a multidisciplinary non-credit seminar in April and the following fall; immersive unpaid internships that inform research are encouraged. Most recent published deadline: March 20, 2026; 2027 date not yet posted.",
    amount: "typically $3,000 to $7,000",
    deadlineText: null,
    deadlines: [],
    audience: "All non-seniors",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/kemp-scholars-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "research-in-science-experience-rise",
    officeSlug: "undergraduate-research",
    name: "Research in Science Experience (RISE)",
    url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/research-science-experience",
    description:
      "Four- to six-week intensive summer research fellowship in the sciences for rising sophomores interested in science or medicine, designed for students from groups historically excluded from the sciences (minoritized, low-wealth, first-generation and new-majority students); any first-year may apply. Participants present at the Summer Research Symposium in September. Most recent published cycle: program between May 18 and June 26, 2026; application deadline March 6, 2026 (application available at the start of spring semester); 2027 dates not yet posted.",
    amount: "$2,500 fellowship, plus an additional sum to cover on-campus housing",
    deadlineText: null,
    deadlines: [],
    audience: "Davidson first-year students (rising sophomores)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/research-science-experience",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "xpl-199-high-impact-experiential-learning-internship-for-credit",
    officeSlug: "catalyst",
    name: "XPL 199: High Impact Experiential Learning (Internship for Credit)",
    url: "https://www.davidson.edu/catalyst/xpl-199-internship-credit",
    description:
      "Earn academic credit for an internship: work with a host organization 8-10 hours a week and attend a weekly reflection seminar. Apply for permission to register during the WebTree registration period (for spring 2027: October 12-November 3, 2026, per the Registrar's calendar); deadlines are in the Catalyst WildcatSync portal. Fall 2026 sections include a Pre-Health section (XPL 199 B).",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Current students",
    source: "davidson-offices",
    sources: ["https://www.davidson.edu/catalyst/xpl-199-internship-credit"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "sustainability-scholars",
    officeSlug: "catalyst",
    name: "Sustainability Scholars",
    url: "https://www.davidson.edu/offices-and-services/sustainability-office/sustainability-scholars",
    description:
      "Summer program that places each scholar with a private, public or nonprofit community institution for a discrete sustainability project, with group meetings on community-scale environmental action (emphasis on climate change); 2026 placements included the City of Charlotte Office of Sustainability & Resilience. Listed under Internships on the Catalyst page. No stipend or deadline is published.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Students of varying majors and class years",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/sustainability-office/sustainability-scholars",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "student-spike-grants",
    officeSlug: "arts-creative-engagement",
    name: "Student Spike! Grants",
    url: "https://www.davidson.edu/offices-and-services/arts-creative-engagement/student-spike-grants",
    description:
      "Funds student-driven, student-led, student-performed extracurricular art in any genre; individual or group; no clubs/organizations, long-term equipment or outside professionals; apply directly to DACE; project must be completed before May 5.",
    amount: "up to $1,500 per grant",
    deadlineText: null,
    deadlines: [],
    audience: "Students of all majors",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/arts-creative-engagement/student-spike-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "air-artistic-independent-research-grants",
    officeSlug: "arts-creative-engagement",
    name: "AIR (Artistic Independent Research) Grants",
    url: "https://www.davidson.edu/offices-and-services/arts-creative-engagement/artistic-independent-research-grants",
    description:
      "Supports art-based independent studies or projects in a creative-genre class; requires an assigned faculty advisor (meet before applying); project completed before the end of the semester.",
    amount: "up to $500 per grant",
    deadlineText: null,
    deadlines: [],
    audience: "Students of all majors",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/arts-creative-engagement/artistic-independent-research-grants",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "magic-micro-arts-grant-for-independent-creatives",
    officeSlug: "arts-creative-engagement",
    name: "MAGIC (Micro Arts Grant for Independent Creatives)",
    url: "https://www.davidson.edu/offices-and-services/arts-creative-engagement/micro-arts-grant-independent-creatives-magic",
    description:
      "Small, flexible summer art projects. Most recent published cycle: apply by 11:59 p.m. Wednesday, May 6, 2026; projects completed by December 11, 2026. Next cycle not yet posted.",
    amount:
      "up to $300 per grant (up to $400 if presenting or displaying work at the beginning of the fall semester)",
    deadlineText: null,
    deadlines: [],
    audience: "Students, faculty and staff",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/arts-creative-engagement/micro-arts-grant-independent-creatives-magic",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "arts-fellows",
    officeSlug: "arts-creative-engagement",
    name: "Arts Fellows",
    url: "https://www.davidson.edu/offices-and-services/arts-creative-engagement/arts-fellows",
    description:
      "Paid internship program in arts administration, programming and advocacy under the DACE director; the Arts Fellows award up to $15,000 annually to student arts projects across campus.",
    amount: null,
    deadlineText: null,
    deadlines: [],
    audience: "Current students",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/arts-creative-engagement/arts-fellows",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "alvarez-access-fund-alvarez-grant-program",
    officeSlug: "international-student-engagement",
    name: "Alvarez Access Fund (Alvarez Grant Program)",
    url: "https://www.davidson.edu/offices-and-services/international-student-engagement/grants/alvarez-grant-program",
    description:
      "Funds up to 2 career- or academic-related experiences per year (e.g., living costs during unpaid internships or research, conferences, job shadowing, grad school visits, interviews, course-related costs, grad school or OPT application fees). For the winter cycle, ISE lists an Alvarez Grant Winter Information Session (October 6, 2026, 11 a.m.-12 p.m., Sprinkle Room) and an Alvarez Grant Winter Workshop (October 26, 2026) on WildcatSync; no winter deadline is published.",
    amount:
      "Grant amounts will rarely exceed the standard amount of $1,200 and never exceed $2,000",
    deadlineText: null,
    deadlines: [],
    audience: "Students who are part of Davidson's global community",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/international-student-engagement/grants/alvarez-grant-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "alvarez-guarantee-fund-alvarez-grant-program",
    officeSlug: "international-student-engagement",
    name: "Alvarez Guarantee Fund (Alvarez Grant Program)",
    url: "https://www.davidson.edu/offices-and-services/international-student-engagement/grants/alvarez-grant-program",
    description:
      "Career- or academic-related funding that can be awarded twice during a student's time at Davidson; students who qualify may apply for an Access grant at the same time for a combined maximum of $6,000.",
    amount: "up to $4,000",
    deadlineText: null,
    deadlines: [],
    audience: "Global-community students receiving Davidson College financial aid",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/international-student-engagement/grants/alvarez-grant-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "weinstein-travel-grant",
    officeSlug: "international-student-engagement",
    name: "Weinstein Travel Grant",
    url: "https://www.davidson.edu/offices-and-services/international-student-engagement/grants/weinstein-travel-grant",
    description:
      "Funds immersive, self-designed travel within the United States outside the Charlotte metro area. Grants are competitive; attendance at an information session is required to apply (session #2: October 15, 2026, Sprinkle Room).",
    amount: null,
    deadlineText: "Winter Break Application deadline is October 22nd",
    deadlines: [
      {
        label: "Winter break application deadline",
        date: "2026-10-22",
      },
    ],
    audience: "Students who are part of Davidson's global community",
    source: "davidson-offices",
    sources: ["https://wildcatsync.davidson.edu/event/12737806"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "chidsey-leadership-fellows",
    officeSlug: "chidsey-center",
    name: "Chidsey Leadership Fellows",
    url: "https://www.davidson.edu/offices-and-services/chidsey-center-leadership-development/chidsey-leadership-fellows",
    description:
      "Signature three-year program for 48 students (16 sophomores, 16 juniors, 16 seniors): cohort seminars, coaching and mentoring, and a summer immersion experience. Detailed timeline on WildcatSync.",
    amount: null,
    deadlineText:
      "Interested students should apply in February of their first year at Davidson College",
    deadlines: [],
    audience: "First-year students (apply in February)",
    source: "davidson-offices",
    sources: [
      "https://www.davidson.edu/offices-and-services/chidsey-center-leadership-development/chidsey-leadership-fellows",
    ],
    verifiedAt: "2026-09-30",
  },
] satisfies z.input<typeof ProgramSchema>[];

const OFFICE_RECORDS = [
  {
    slug: "matthews-center",
    name: "Betty and B. Frank Matthews II '49 Center for Career Development (Matthews Center)",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
    description:
      "Davidson's career center (nav label 'Matthews Center for Career Development'; the old /offices-and-services/center-career-development URL redirects here). Helps students secure internships, jobs, fellowships and graduate school through advising, programming, employer engagement and Handshake. Phone 704-894-2132; staff are in Knobloch Campus Center, Suite 201; email careers@davidson.edu. The Matthews Center's WildcatSync profile says it does not use WildcatSync to advertise events; its events, fairs and employer sessions are in Handshake.",
    services: [
      "Handshake (https://davidson.joinhandshake.com/) - the Matthews Center's internal job and internship posting system; also where students request advising appointments and see employer/grad-school events and career fairs",
      "One-on-one career advising appointments (roadmap page: 8:30 a.m.-5 p.m., Monday-Friday) and drop-in advising in the Matthews Center lobby when classes are in session (about 10-15 minutes; morning 9 a.m.-1 p.m., afternoon 1-5 p.m.)",
      "Advising areas shown on the drop-in schedule: Arts, Entertainment, & Technology; Scholar-Athletes; Education, Law, Public & Human Services; Science & Health; International; Exploratory; Business & Finance",
      "Career exploration and assessments at advisers' discretion, including the Myers-Briggs Type Indicator (MBTI) and Strong Interest Inventory (SII); help choosing a major, targeted resumes, interview skills, grad/professional school prep",
      "Law school and medical/dental/health-professions school advising (request through Handshake)",
      "On-Campus Recruiting: employer information sessions and interviews managed in Handshake; application deadlines generally two weeks before interviews; students who cancel with less than two business days' notice may be restricted",
      "Davidson Connect (https://davidsonconnect.com/) - alumni advice, resume reviews, practice interviews, shared-interest groups",
      "Career Treks - Davidson on Wall Street plus two additional city visits annually",
      "Career Advantage - partnership with Davidson Athletics for scholar-athletes",
      "Matthews-funded technical training: AESOP Academy & Advisory (Excel, SQL, project management) and Training the Street (with Wells Fargo; financial statement analysis, valuation, Excel modeling, technical interview prep)",
      "How-To Guides (resumes/CVs, cover letters, personal statements, assessing offers, networking), What Can I Do With This Major, and YouTube programming recordings including the 'Wildcat Ready Series'",
      "Catalyst experiential-learning questions: schedule an Exploratory/General advising appointment in Handshake",
    ],
    programSlugs: [
      "summer-internship-grants-common-application",
      "frank-matthews-ii-49-center-for-career-development-summer-internship-grant",
      "anne-stanback-81-and-charlotte-kinlock-internship-for-non-profit-leadership",
      "bill-boyd-entrepreneurial-internship-grant",
      "boswell-family-experiential-learning-grant",
      "boyd-family-internship-grant",
      "butner-family-internship-fund",
      "carolyn-and-george-cretekos-69-public-service-internship",
      "dr-randy-nelson-summer-internship-grant",
      "gerald-lee-wilson-58-and-virginia-s-wilson-internship-fund-grant",
      "ginny-newell-78-arts-fund",
      "hall-family-internship-grants",
      "hasty-smith-internship-grant",
      "janet-burt-anderson-first-generation-internship-fund",
      "juliana-tazewell-porter-memorial-internship-fund",
      "layendecker-family-internship-fund",
      "locke-white-jr-internship-fund",
      "macdonald-family-internship-grant",
      "morehead-family-internship-grant",
      "pioneer-internship-fund",
      "the-cassell-family-socios-en-salud-partners-in-health-in-peru-internship",
      "tom-anstrom-internship-fund",
      "weeks-family-visual-arts-internship",
      "xpl-099-academic-credit-for-internships",
      "davidson-in-washington-diw",
      "east-asia-internship-program-freeman-foundation",
      "davidson-impact-fellows-dif",
      "professional-development-funding-tony-snow-77-professional-development-fund",
      "scholarships-for-tuck-business-bridge-dartmouth-and-vanderbilt-summer-business",
      "health-careers-fair",
    ],
    sources: ["https://www.davidson.edu/offices-and-services/matthews-center-career-development"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "hurt-hub",
    name: "The Jay Hurt Hub for Innovation and Entrepreneurship",
    url: "https://www.davidson.edu/offices-and-services/jay-hurt-hub-innovation-and-entrepreneurship",
    description:
      "Davidson's innovation and entrepreneurship center in downtown Davidson (its own site, https://hurthub.davidson.edu/, calls it 'The Hurt Hub at Davidson College'). Educational programming, experiential learning, co-working, a mentor network and access to capital for students and recent alumni. 210 Delburg Street, Davidson, NC 28036; hurthub@davidson.edu; 704-894-4482. Per the Hurt Hub, funding ranges $1K-25K; $77,500 was gifted to 31 students in FY 2025. Any currently enrolled student, including F-1 students, may apply for Hurt Hub funding (F-1 tax and OPT rules apply).",
    services: [
      "Chat with the Entrepreneurship Program Manager (booked via Calendly from the Students page)",
      "Alumni Innovator-in-Residence office hours: Keith Kleeman '97 is holding his final office hours on October 6, 7, 15, 16, 21, 23, 27 and 28, 2026 (free for students; Innovation Lab at the Hurt Hub or virtual; sign up via the event's Calendly link). The Students page says office hours with a new Innovator-in-Residence are 'coming soon'.",
      "Courses and workshops: Building a Lean Startup (offered twice a year), design thinking workshops, Applied AI Lab non-credit courses",
      "DavidsonX: free access codes for Davidson students to a curated library of self-paced edX courses",
      "Student spaces: Social Commons lobby, Van Deman Innovation Lab, four reservable student study rooms",
      "Events: professional development workshops, Hub & Spoke lecture series, Hub Club lunches, named lectures (https://hurthub.davidson.edu/events)",
      "Community: Davidson Entrepreneurship Club (DEC; its WildcatSync organization is named 'Davidson Entrepreneurship Development Club', https://wildcatsync.davidson.edu/organization/davidsonentrepreneurship) and Hack@Davidson, a student-hosted weekend hackathon held every year at the Hurt Hub (open to all students, no experience required)",
      "Inclusive co-working space for entrepreneurs and professionals",
    ],
    programSlugs: [
      "try-it-fund",
      "ai-try-it-fund-applied-ai-lab",
      "davidson-at-neurips-applied-ai-lab",
      "avinger-impact-fund",
      "nisbet-venture-fund",
      "ideasprint",
      "davidson-college-consulting-group-dccg",
      "next-level",
      "r-craig-and-sheila-yoder-applied-research-fellowship",
      "davidson-innovation-fellows-lucid-bots-partnership",
      "building-a-lean-startup-course",
      "techstars-startup-weekend-davidson-nc",
    ],
    sources: [
      "https://www.davidson.edu/offices-and-services/jay-hurt-hub-innovation-and-entrepreneurship",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "office-of-fellowships",
    name: "Office of Fellowships",
    url: "https://www.davidson.edu/offices-and-services/fellowships",
    description:
      "Advises Davidson students and alumni applying for nationally competitive fellowships and scholarships (Fulbright, Goldwater, Watson, Rhodes and more), and runs Davidson's endorsement/nomination processes, whose internal deadlines are set much earlier than national deadlines. Director of Fellowships (and Fulbright Program Advisor, Gaither nominating official): Gaylena Merritt. gradfellowships@davidson.edu; Wall 277. Details are in the login-only Fellowships Toolkit, but the office also posts each internal and national deadline as a public WildcatSync event.",
    services: [
      "Advising and essay draft review appointments (https://calendly.com/davidsonfellowships)",
      "Fellowships Toolkit and Deadlines & Events (Davidson login required): https://sites.google.com/davidson.edu/fellowshipstoolkit/home",
      "Opportunities Guide (Davidson login required): https://fellowships.davidson.edu/OppsGuide",
      "Davidson endorsement/nomination committees for Beinecke, Goldwater, Truman, Udall, Gaither, Boren Fellowship, Churchill, Fulbright, Marshall, McCall MacBain, Rhodes and Watson",
      "Fellowship deadline listings (internal endorsement/nomination deadlines as well as national deadlines) and info webinars on WildcatSync, cross-listed under Catalyst. 2026-27 internal deadlines already past: Fulbright endorsement Aug 26, U.S. Rhodes and Marshall endorsement Aug 31 (extended), Churchill nomination Sept 28, Watson nomination Sept 30, 2026 (3 p.m. each)",
    ],
    programSlugs: [
      "critical-language-scholarship-cls-program",
      "daad-rise-germany",
      "fulbright-uk-summer-institutes",
      "beinecke-scholarship",
      "goldwater-scholarship",
      "noaa-hollings-scholarship",
      "truman-scholarship",
      "udall-scholarship",
      "gaither-junior-fellows-program-carnegie-endowment",
      "knight-hennessy-scholars",
      "nsf-graduate-research-fellowship-program-grfp",
      "paul-daisy-soros-fellowships-for-new-americans",
      "thomas-r-pickering-foreign-affairs-graduate-fellowship",
      "rangel-graduate-fellowship-program",
      "boren-fellowship-graduate",
      "churchill-scholarship",
      "fulbright-u-s-student-program",
      "gates-cambridge-scholarship",
      "luce-scholars-program",
      "marshall-scholarship",
      "mccall-macbain-scholarships",
      "rhodes-scholarship",
      "schwarzman-scholars",
      "w-thomas-smith-scholarship",
      "thomas-j-watson-fellowship",
      "project-horseshoe-farm-community-health-fellowship",
      "princeton-in-africa-fellowship",
      "hertz-fellowship",
      "princeton-in-asia-fellowship",
      "american-scandinavian-foundation-asf-fellowships-for-americans",
      "goldwater-summer-research-internship-program",
      "mentora-scholars",
      "mississippi-teacher-corps",
      "lafayette-fellowship",
      "carnegie-mellon-university-cmu-rales-fellows-program",
      "blakemore-fellowship",
      "blakemore-freeman-fellowship",
      "davidson-college-fellows-program",
    ],
    sources: ["https://www.davidson.edu/offices-and-services/fellowships"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "education-abroad",
    name: "Office of Education Abroad & Away (OEAA)",
    url: "https://www.davidson.edu/offices-and-services/education-abroad",
    description:
      "Davidson's study abroad/away office (davidson.edu page titled 'Education Abroad'; portal https://educationabroad.davidson.edu/). Over 125 program options in more than 50 countries, 8 Davidson faculty-led programs, summer, semester, full-year, winter-break and domestic programs, open to all majors. edabroad@davidson.edu; 704-894-2250 / 704-894-2120; office on the first floor of the Duke residence hall.",
    services: [
      "Required advising: every student must meet with an Education Abroad Advisor (appointment, or walk-in hours in Duke Residence Hall, Mon-Thurs 3:30-4:45 p.m. during the academic year) to gain access to the Davidson application",
      "Eligibility: minimum 2.5 GPA, no balance on the student account, no current conduct sanctions (verified at application and before departure)",
      "Program search, credit transfer, passports & visas, financial planning, identity-based resources, pre-departure and returnee support",
      "Workshops and events on WildcatSync (e.g., budget workshops, Passport Day, Education Abroad & Financial Aid info sessions)",
      "Boren Scholarship campus representative and Gilman Scholarship guidance",
    ],
    programSlugs: [
      "study-abroad-away-application-summer-fall-academic-year-programs",
      "study-abroad-away-application-spring-winter-break-programs",
      "heitz-wagener-study-abroad-scholarship",
      "bertis-e-downs-iii-and-eugene-m-downs-sr-education-abroad-fund",
      "stephen-w-keller-memorial-scholarship",
      "benjamin-a-gilman-international-scholarship-external-oeaa-advising",
      "boren-scholarship-external-oeaa-campus-representative",
      "douglass-o-connell-global-internship-ciee",
    ],
    sources: ["https://www.davidson.edu/offices-and-services/education-abroad"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "civic-engagement",
    name: "The William F. and Betty G. Mulliss Center for Civic Engagement",
    url: "https://www.davidson.edu/offices-and-services/civic-engagement",
    description:
      "Connects students with public and nonprofit organizations: introductory service, community-based learning courses, immersive summer internships and fellowships, grants for service projects and leadership experiences. Alvarez College Union, M-F 8:30 a.m.-5 p.m.; 704-894-2420; civicengagement@davidson.edu.",
    services: [
      "Community opportunities list (internships, service, capacity-building with Greater Charlotte and Lake Norman partners): https://sites.google.com/davidson.edu/ccecommunityopportunities/home",
      "Events on WildcatSync (Mulliss Center for Civic Engagement organization)",
      "Community-Based Learning courses (on average about 25 offered each year) and community-based research",
      "Service Saturdays (monthly, 8-10 students) and student-led alternative fall/spring break service trips",
      "Federal Community Service Work-Study placements with local nonprofits",
      "Community Involvement Fair: annual fair with about 50 Greater Charlotte and Lake Norman nonprofit and community organizations in the Alvarez College Union (2026 edition: Tuesday, September 1, 11 a.m.-12:30 p.m.; Student Activities describes it as following the fall Activities Fair)",
      "Grant information sessions plus one-on-one proposal and budget coaching (civicengagement@davidson.edu)",
      "Engaging Democracy: nonpartisan voter-engagement guide (voter registration, and Mecklenburg County key dates for the November 3, 2026 general election; early voting October 15-31, 2026), plus voter-registration drives on WildcatSync (run by the Center for Political Engagement)",
    ],
    programSlugs: [
      "nonprofit-leadership-fellows",
      "brenda-h-tapia-cdf-freedom-schools-servant-leader-interns",
      "community-research-fellows",
      "mulliss-center-for-civic-engagement-and-service-odyssey-interns",
      "roy-alexander-internship-with-davidson-lands-conservancy",
      "leonard-fund",
      "robert-t-stone-fund",
      "ruth-pittard-fund-for-love-in-action",
      "kathryn-w-davis-projects-for-peace-grant",
      "bonner-scholars-program",
    ],
    sources: ["https://www.davidson.edu/offices-and-services/civic-engagement"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "premed-health-professions",
    name: "Premedicine and Allied Health Professions Program",
    url: "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions",
    description:
      "Davidson's health professions advising program (allopathic, osteopathic, dental and veterinary medicine, nursing, PA, pharmacy, optometry, PT, OT and public health). Director of Premedicine and Allied Health: Naila Mamoon (Watson 108B); prehealth@davidson.edu; 704-894-2658. The Matthews Center also has a Science & Health career adviser and offers medical/health-professions school advising via Handshake.",
    services: [
      "Fall director's meeting for first-year and sophomore students on the third Wednesday of September (2026: 'Prehealth Programs Sophomore Meeting' on WildcatSync, Sept 16), then small-group meetings by emailing prehealth@davidson.edu",
      "Mailing list for events, lectures, deadlines and pre-health societies",
      "Workshops and medical/nursing school dean's visits posted on WildcatSync (e.g., personal statement workshops, UNC MED Program open houses)",
      "Clinical course-credit options (XPL 199; BIO 370/371) with Charlotte-area hospital observation",
      "Guidance on shadowing (with the Matthews Center), research (DRI, DRN) and a curated list of external summer and post-bac programs",
      "Health professions school admission guidance (MCAT/DAT timing, AMCAS/AACOMAS/AADSAS/CASPA/VMCAS)",
    ],
    programSlugs: ["premedical-prehealth-advisory-committee-pac-evaluation"],
    sources: [
      "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "prelaw",
    name: "Prelaw Advising",
    url: "https://www.davidson.edu/academic-departments/prelaw",
    description:
      "Prelaw is not a major at Davidson; it is a network of advising, application support and faculty mentorship open to every discipline. Prelaw advisers: Kelli Robinson (Associate Director & Prelaw Advisor, Matthews Center) and Hugh M. Lee, JD '89; several JD-holding faculty/staff serve as on-campus mentors.",
    services: [
      "Prelaw advising for students and alumni: https://www.davidson.edu/academic-departments/prelaw/advising-mentorship (appointments through Handshake via the Matthews Center)",
      "Law school admission panels, alumni connections and law firm recruiting events",
      "Guides to researching and financing law schools (Davidson Google site)",
      "Law-related student organizations such as the Pre-Law Society and Mock Trial Association",
    ],
    programSlugs: [
      "greater-charlotte-law-school-fair",
      "law-school-application-fee-grant-matthews-center-professional-development",
    ],
    sources: ["https://www.davidson.edu/academic-departments/prelaw"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "center-teaching-learning",
    name: "John Crosland Jr. Center for Teaching and Learning (CTL)",
    url: "https://www.davidson.edu/offices-and-services/center-teaching-and-learning",
    description:
      "Free peer tutoring and academic support for all Davidson students (and teaching resources for faculty). 704-894-2294.",
    services: [
      "Peer tutoring in all subjects, free; request appointments through the CTL Tutor Moodle (https://moodle.davidson.edu/course/index.php?categoryid=97); many courses have Embedded Tutors (ETs), who should be your first stop",
      "Drop-in tutoring Sunday-Thursday 8-10 p.m.: Math, Science and Economics Center (Wall 210), Speaking Center (Chambers 1015), Writing Center (Chambers 1046), Research Consultants (Chambers 1027)",
      "Writing Center: consultants by appointment on the Writing Center Moodle (https://moodle.davidson.edu/course/view.php?id=11404) for any stage of writing, including cover letters",
      "Speaking Center: Communication Consultants support speaking across the curriculum, from selecting a topic to delivering a speech, in person or virtually (https://moodle.davidson.edu/course/view.php?id=11403)",
      "Data CATS: data analytics and statistics consulting; drop-in Sunday-Thursday 2-4 p.m. and 7-9 p.m. in Chambers 3146",
      "Multilingual student writing support with the Multilingual Assistant Professor of Practice via the Multilingual Writing Support Moodle (login required)",
      "Library research and digital-media consultants (see Library)",
    ],
    programSlugs: [],
    sources: ["https://www.davidson.edu/offices-and-services/center-teaching-and-learning"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "aadr",
    name: "Academic Access & Disability Resources (AADR)",
    url: "https://www.davidson.edu/offices-and-services/academic-access-disability-resources",
    description:
      "Part of the Student Life Division; provides academic coaching and disability services/accommodations. Watson Life Sciences Building, 3rd floor, Suite 338; Monday-Friday 9 a.m.-5 p.m.; AADR@davidson.edu; 704-894-2724.",
    services: [
      "Academic coaching (time management, studying, note-taking, reading, papers, test-taking): email AADR@davidson.edu or call 704-894-2779",
      "Workshops and presentations on academic skills each semester; Academic Success Toolkit",
      "Register for services in Accommodate (https://davidson-accommodate.symplicity.com/students), then schedule an intake via AADR's Calendly",
      "Academic, housing and dietary accommodations",
    ],
    programSlugs: ["peer-academic-coaching-pac", "semester-accommodation-request-accommodate"],
    sources: ["https://www.davidson.edu/offices-and-services/academic-access-disability-resources"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "student-activities",
    name: "Student Activities",
    url: "https://www.davidson.edu/offices-and-services/student-activities",
    description:
      "Supports 200+ student organizations and campus programming. Staff help organizations with event planning and promotion, recruitment and administrative tasks in WildcatSync (https://wildcatsync.davidson.edu/), Davidson's student engagement platform for organizations, events and forms, and help students launch new organizations. 704-894-2140.",
    services: [
      "WildcatSync organization directory (https://wildcatsync.davidson.edu/organizations) and events",
      "Activities Fair at the beginning of fall semester (with the Mulliss Center for Civic Engagement)",
      "Organizational advising: event planning/promotion, recruitment, administrative tasks in WildcatSync; help launching a new organization",
      "Wildcat Welcome Week, workshops and trainings (event planning, budgeting, WildcatSync)",
      "Student Government Association and Union Board (150+ all-campus events a year, including Spring Frolics and Winterfest); Davidson Outdoors",
      "Pre-professional organizations listed by Student Activities: Davidson Investment and Financial Association (DIFA, manages over $700,000 of the college's endowment), Pre-Business Society, Women in Business, Pre-Law Society, Mock Trial Association, Premedicine Society, Minority Association of Premedical Students (MAPS), Pre-Dental, Pre-Nursing, Pre-Physician Assistant and Pre-Veterinary Societies, Pre-PhDs of Davidson Science (PODS)",
    ],
    programSlugs: [],
    sources: ["https://www.davidson.edu/offices-and-services/student-activities"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "library",
    name: "Davidson College Library",
    url: "https://www.davidson.edu/library",
    description:
      "Library research help, collections and digital scholarship. The library building is closed for renovation from summer 2025 to fall 2027; Lilly Family Gallery is the main collaborative study space (library staff, course reserves, computers, printing, info desk). library@davidson.edu; 704-894-2331.",
    services: [
      "Research appointments with a librarian or peer research consultant, digital project help, archives assistance: https://davidson.libguides.com/research-assistance",
      "During renovation, librarian consultations are held at the Consultation Base, Chambers South Basement room B263; library consultants hold one-on-one consultations Sunday-Thursday 7:00-10:00 p.m. in Chambers 1027",
      "Chat, catalog (Primo), A-Z databases, research guides, citation help, ILLiad interlibrary loan, request-for-pickup",
      "Study-space reservations and events via LibCal (https://davidson.libcal.com/)",
      "Archives & Special Collections; Digital Learning resources and Davidson Domains",
    ],
    programSlugs: [],
    sources: ["https://www.davidson.edu/library"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "registrar",
    name: "Registrar's Office",
    url: "https://www.davidson.edu/offices-and-services/registrar",
    description:
      "Maintains academic records and runs course registration, academic policy, degree certification and advising support. Chambers 1197; M-F 8:30 a.m.-5 p.m.; registrar@davidson.edu; 704-894-2227. Term dates are in the Registrar's academic calendar.",
    services: [
      "Course load: all students take four classes each semester; aside from a handful of two-credit classes, courses are worth one credit (four classes = 16 semester credits elsewhere)",
      "WebTree course registration (https://registrar.davidson.edu/WebTree): preference-based; each senior gets one class, then juniors, sophomores, first-years, over four rounds with random order within class",
      "Registration timing: fall - continuing students enter preferences in early April, new students in June, registration in early July; spring - preferences in October/November with registration immediately following. Spring 2027 (2026-27 Academic Calendar): Student-Adviser Conferences Oct 12-Nov 3; WebTree preferences Oct 12 (7 a.m.)-Nov 3 (5 p.m.), 2026; schedules available on Banner Self-Service Nov 6 (5 p.m.)",
      "Add/Drop: first week of classes on Banner Self-Service, plus a second-week late add/drop via the Add/Drop Permission Form with a $20 late fee and professor permission to add (drops not permitted after the second week); adding late is discouraged",
      "DegreeWorks degree audit and What If scenarios via Banner Self-Service (bannerweb.davidson.edu); refreshed nightly; not a transcript",
      "Course schedule (https://course-schedule.davidson.edu/) and College Catalog (http://catalog.davidson.edu)",
      "Holistic Advising Program for first- and second-year students (about 50 faculty/staff advisers, at least two one-on-one meetings per semester; goal of declaring a major by the end of the second year)",
      "Transcripts, enrollment verification, transfer/AP/IB credit, forms by email from a Davidson account",
    ],
    programSlugs: [],
    sources: ["https://www.davidson.edu/offices-and-services/registrar"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dean-of-students",
    name: "Dean of Students Office",
    url: "https://www.davidson.edu/offices-and-services/division-student-life/dean-students",
    description:
      "Division of Student Life office that advocates for student well-being, success and belonging; oversees CARE & Case Management, the Student Handbook, personal leave logistics and emergency funding.",
    services: [
      "CARE & Case Management: individualized support for complex personal situations; processes include CARE referrals, class absence notification, authorized withdrawal, emergency funding and personal leave",
      "CARE Referral Form for concerns about a student (emergencies: 911 or Davidson College Police 704-892-7773)",
      "Personal Leave & Withdrawal process guidance; Student Handbook; incident reporting; Green Dot bystander intervention; Bias Education and Response",
    ],
    programSlugs: ["student-assistance-for-financial-emergencies-safe"],
    sources: ["https://www.davidson.edu/offices-and-services/division-student-life/dean-students"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "student-health-well-being",
    name: "Center for Student Health & Well-Being (CSHWB)",
    url: "https://www.davidson.edu/offices-and-services/student-health-and-well-being",
    description:
      "Health, counseling, nutrition and health education for all full-time students, in person and virtually. Health Center, 514 N Main Street; Well Cat Center, 439 N Main Street; studenthealth@davidson.edu; 704-894-2300.",
    services: [
      "Appointments for routine health services and counseling; in most cases same-day appointments for urgent needs; Student Health Portal (https://davidson.studenthealthportal.com/)",
      "Counseling with no wait lists: start with a triage consultation in person or book online up to three days in advance; short-term individual treatment model",
      "TimelyCare 24/7 virtual emotional support at no cost",
      "Groups & workshops, Mental Health Ambassadors, nutrition services with college dietitians, and the Health Education Office, which hosts free monthly STI testing provided by Mecklenburg County Public Health (fall 2026: at the Carolina Inn, 215 North Main St.; next dates October 6 and November 10, 2026)",
    ],
    programSlugs: [],
    sources: ["https://www.davidson.edu/offices-and-services/student-health-and-well-being"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dean-rusk",
    name: "Dean Rusk International Studies Program",
    url: "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program",
    description:
      "Internationalizes the Davidson experience through winter and summer travel grants, lectures, performances and the Dean Rusk Global Corps. Located in Duke Hall (across from the Alvarez College Union); 704-894-2554. Students must meet with Dean Rusk staff before submitting any grant application.",
    services: [
      "Required grant advising meetings with the Program Director or Program Fellow (Zoom scheduling links on the Student Grants page)",
      "Writing workshops, info sessions and lectures on WildcatSync",
      "Bliss Photo Contest; Dean Rusk Global Corps student organization",
    ],
    programSlugs: [
      "dean-rusk-travel-grants",
      "pulitzer-center-fellowship-grant",
      "the-lou-ortmayer-fellowship-grant",
    ],
    sources: [
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "undergraduate-research",
    name: "Undergraduate Research (Office of Sponsored Programs)",
    url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research",
    description:
      "Davidson's undergraduate research grants and fellowships. DRI, Abernethy and DRN are administered through the Office of Sponsored Programs (contact: Assistant Dean for Research Development & Director of Sponsored Programs); the Yoder Fellowship is listed under the Hurt Hub.",
    services: [
      "Research grants and fellowships index: https://www.davidson.edu/academics/research-opportunities/undergraduate-research",
      "Department research pages (e.g., Biology, Chemistry, Physics, Psychology) and NSF REU guidance",
      "Technology consultations for research projects via T&I (ti@davidson.edu)",
    ],
    programSlugs: [
      "davidson-research-initiative-dri-summer-research-fellowships",
      "abernethy-endowment-grant",
      "davidson-research-network-drn",
      "kemp-scholars-program",
      "research-in-science-experience-rise",
    ],
    sources: ["https://www.davidson.edu/academics/research-opportunities/undergraduate-research"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "catalyst",
    name: "Catalyst",
    url: "https://www.davidson.edu/catalyst",
    description:
      "Davidson's initiative that centralizes experiential-learning resources: internships, education away, community-based learning, undergraduate research, grants, and graduate fellowships. Run with the Experiential Learning Team (ELAT).",
    services: [
      "Grants and funding resources table by office: https://www.davidson.edu/catalyst/grants-and-funding-resources",
      "Catalyst portal in WildcatSync: https://davidson.campuslabs.com/engage/organization/catalyst",
      "Summer housing resources: https://sites.google.com/davidson.edu/summerhousingresources/home",
    ],
    programSlugs: [
      "xpl-199-high-impact-experiential-learning-internship-for-credit",
      "sustainability-scholars",
    ],
    sources: ["https://www.davidson.edu/catalyst"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "arts-creative-engagement",
    name: "Davidson Arts & Creative Engagement (DACE)",
    url: "https://www.davidson.edu/offices-and-services/arts-creative-engagement",
    description:
      "Integrates the arts into campus life, runs the free DACE Studio (North Basement of Chambers) and offers arts grants funded by Friends of the Arts. 704-894-2101.",
    services: [
      "DACE Studio: free creative resources (sewing machines, paint, canvas, knitting, etc.) during the day and select evenings",
      "Art Cart activities at campus events",
      "Arts-related internship grants are also offered through the Matthews Center (Dr. Randy Nelson; Ginny Newell '78 Arts Fund; Weeks Family Visual Arts)",
    ],
    programSlugs: [
      "student-spike-grants",
      "air-artistic-independent-research-grants",
      "magic-micro-arts-grant-for-independent-creatives",
      "arts-fellows",
    ],
    sources: ["https://www.davidson.edu/offices-and-services/arts-creative-engagement"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "international-student-engagement",
    name: "International Student Engagement (ISE)",
    url: "https://www.davidson.edu/offices-and-services/international-student-engagement",
    description:
      "Supports international students and Davidson's global community (more than 200 students from over 50 countries): F-1 immigration guidance, programming, host families and grants. intlstudents@davidson.edu.",
    services: [
      "F-1 immigration advising: maintaining status, employment, Curricular Practical Training (CPT, required for XPL 099 and off-campus internships/research such as DRN), OPT and STEM OPT",
      "Host Family Program",
      "Summer opportunity planning with the Matthews Center, OEAA and Dean Rusk (e.g., 'Summer Opportunities Planning Workshop', Oct 9, 2026, on WildcatSync)",
    ],
    programSlugs: [
      "alvarez-access-fund-alvarez-grant-program",
      "alvarez-guarantee-fund-alvarez-grant-program",
      "weinstein-travel-grant",
    ],
    sources: ["https://www.davidson.edu/offices-and-services/international-student-engagement"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "chidsey-center",
    name: "Chidsey Center for Leadership Development",
    url: "https://www.davidson.edu/offices-and-services/chidsey-center-leadership-development",
    description:
      "Prepares students to exercise leadership on campus and beyond through the Leadership Fellows program, lectures and initiatives.",
    services: ["Chidsey Leadership Lectures and leadership initiatives/events"],
    programSlugs: ["chidsey-leadership-fellows"],
    sources: [
      "https://www.davidson.edu/offices-and-services/chidsey-center-leadership-development",
    ],
    verifiedAt: "2026-09-30",
  },
] satisfies z.input<typeof OfficeSchema>[];

export const PROGRAMS: readonly Program[] = defineContent(
  "offices:programs",
  ProgramSchema,
  PROGRAM_RECORDS,
  (program) => program.slug,
);

export const OFFICES: readonly Office[] = defineContent(
  "offices",
  OfficeSchema,
  OFFICE_RECORDS,
  (office) => office.slug,
);

export const OFFICES_VERIFIED_AT: string = latestVerifiedAt([...OFFICES, ...PROGRAMS]);

const OFFICE_BY_SLUG = new Map(OFFICES.map((office) => [office.slug, office]));
const PROGRAM_BY_SLUG = new Map(PROGRAMS.map((program) => [program.slug, program]));

export function getOffice(slug: string): Office | undefined {
  return OFFICE_BY_SLUG.get(slug);
}

export function getProgram(slug: string): Program | undefined {
  return PROGRAM_BY_SLUG.get(slug);
}

/** An office's programs, in the office's own order. */
export function programsForOffice(officeSlug: string): Program[] {
  const office = OFFICE_BY_SLUG.get(officeSlug);
  if (!office) return [];
  return office.programSlugs.flatMap((slug) => {
    const program = PROGRAM_BY_SLUG.get(slug);
    return program ? [program] : [];
  });
}

/** Program deadlines on the Davidson days `from`..`to` (inclusive), by date then program name. */
export function programDeadlinesBetween(from: DayInput, to: DayInput): ContentDeadline[] {
  const first = davidsonDay(from);
  const last = davidsonDay(to);
  const items: ContentDeadline[] = [];
  for (const program of PROGRAMS) {
    for (const deadline of program.deadlines) {
      if (deadline.date < first || deadline.date > last) continue;
      items.push({
        id: `program:${program.slug}:${deadline.date}`,
        kind: "program",
        title: program.name,
        label: deadline.label,
        date: deadline.date,
        endDate: null,
        time: null,
        source: program.source,
        url: program.url,
        audience: program.audience,
        termCode: null,
        officeSlug: program.officeSlug,
        verifiedAt: program.verifiedAt,
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
