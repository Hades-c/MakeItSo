import "server-only";
import type * as z from "zod";
import type { CareerOnCampusSchema, CareerSummerSchema } from "@/lib/types/content";

/**
 * What to do outside class for each career path (owner request, 2026-10-29: "examples of summer activities or on
 * campus clubs/activities"), merged into the career records by server/content/careers.ts. The hackathon-era
 * `summerOpportunities` and club lists were unsourced and partly invented, so none of that text is reused.
 *
 * On campus: student organizations from the public WildcatSync directory (Campus Labs Engage, read 2026-10-29
 * through its public organization search and each organization's page). Listed only when the organization's
 * status is Active and its page was updated in 2022 or later; the line is a plain paraphrase of that page's own
 * description, without officer names, emails or claims the page does not make.
 *
 * Summers: office programs already curated in server/content/offices.ts, by slug (their name, page, audience,
 * deadlines, source and verifiedAt are the program's own), and national programs read on their official pages on
 * 2026-10-29 (who they are for and when to apply, as those pages say it). A program a career already lists under
 * "At Davidson" or "Beyond Davidson" is not repeated here (tests/content.test.ts).
 *
 * Gaps the owner may fill: sports-management has no summer option of its own beyond the Summer Internship Grants
 * page its "At Davidson" card already links.
 */

type OnCampus = z.input<typeof CareerOnCampusSchema>;
type Summer = z.input<typeof CareerSummerSchema>;

/** The day the WildcatSync pages and the outside programs' pages were read. */
const READ_ON = "2026-10-29";

function org(key: string, name: string, description: string): OnCampus {
  return {
    name,
    url: `https://wildcatsync.davidson.edu/organization/${key}`,
    description,
    source: "wildcatsync",
    verifiedAt: READ_ON,
  };
}

function program(slug: string, description: string): Summer {
  return { kind: "program", program: slug, description };
}

// ---- Student organizations (WildcatSync) ---------------------------------------------------------------------------

const ACM = org(
  "acm",
  "Davidson College ACM Student Chapter",
  "The campus chapter of the Association for Computing Machinery: workshops, coding sessions and talks by professionals. No CS major or experience needed.",
);
const HACK = org(
  "hackatdavidson",
  "Hack@Davidson",
  "Davidson’s software and competitive programming club: runs a hackathon, competes in programming contests and builds software year-round. Open to all, no coding experience needed.",
);
const WICS = org(
  "wics",
  "Women in Computer Science",
  "Academic, career and social events that build a supportive community for genders underrepresented in computing; open to any student who shares that aim.",
);
const DISC = org(
  "dcode",
  "Diversity in Science and Computation",
  "A community for students of color in computer science, data science and math, with tech workshops, shared projects and community events.",
);
const DAVIDSON_AI = org(
  "davidsonai",
  "DavidsonAI",
  "Funding, resources and mentorship for student AI projects in any discipline, with hands-on workshops for all experience levels.",
);
const AWM = org(
  "association-for-women-in-mathematics-student-chapt",
  "Association for Women in Mathematics- Student Chapter",
  "Encourages women and girls to study and build careers in the mathematical sciences.",
);
const DIBC = org(
  "dibc",
  "Davidson Investment Banking Club (DIBC)",
  "Helps students navigate investment banking recruiting, working with first-years toward sophomore- and junior-summer internships.",
);
const DIFA = org(
  "davidson-investment-and-finance-association",
  "Davidson Investment and Finance Association",
  "A student-run portfolio that manages part of the college’s endowment, investing in publicly traded stocks; open to all students.",
);
const DAIC = org(
  "davidson-alternative-investments-club",
  "Davidson Alternative Investments Club",
  "Teaches private equity and venture capital fundamentals through modeling, valuation and case work, then connects members with alumni, firms and competitions.",
);
const AWM_CLUB = org(
  "davidsonassestandwealthmanagementclub",
  "Davidson Asset and Wealth Management Club",
  "Prepares students in every class year for asset and wealth management internship recruiting: networking, research, and technical and interview prep with alumni.",
);
const WIB = org(
  "wib",
  "Women in Business",
  "A supportive community for students pursuing careers in business; open to any student.",
);
const PRE_BUSINESS = org(
  "pre-business-society",
  "Pre-Business Society",
  "A network of students pursuing careers in finance, consulting, marketing and entrepreneurship, with networking, career preparation and mentorship.",
);
const PRE_CONSULTING = org(
  "dpcs",
  "Davidson Pre-Consulting Society",
  "Introduces students to management consulting, with alumni and consultant panels and case and behavioral interview preparation.",
);
const ENTREPRENEURSHIP_CLUB = org(
  "davidsonentrepreneurship",
  "Davidson Entrepreneurship Development Club",
  "Works with the Hurt Hub to host events, meet alumni and hold meetings on ideation, fundraising, hiring and scaling a company.",
);
const BLOCKCHAIN = org(
  "davidson-blockchain",
  "Davidson Blockchain",
  "A team-oriented group learning about blockchain and its uses through workshops and guest lectures; it aims to connect members with companies in the industry for research and projects.",
);
const PREMED = org(
  "premedicine-society",
  "Premedicine Society",
  "For students who intend to go to medical school: events with medical school admissions deans, run with the Allied Health Professions office.",
);
const MAPS = org(
  "minority-association-of-pre-medical-students",
  "Minority Association of Pre-Medical Students",
  "Davidson’s MAPS chapter: mentorship, advocacy and community for underrepresented students pursuing careers in medicine.",
);
const EMT = org(
  "davidsonemt",
  "Davidson EMT Club",
  "For students who are EMT-certified or want to be: hands-on experience with the EMS profession and practice of EMT skills.",
);
const RAM = org(
  "ram-davidson",
  "Remote Area Medical: Davidson College Chapter",
  "Takes students to Remote Area Medical’s free pop-up clinics, where they work with patients under licensed providers, and hosts talks on health-care access.",
);
const MOCK_TRIAL = org(
  "mock-trial",
  "Mock Trial",
  "Hands-on knowledge of the practice of law, plus public speaking and debate skills, through scrimmages and American Mock Trial Association competitions.",
);
const MOOT_COURT = org(
  "mootcourt",
  "Davidson Moot Court",
  "Appellate advocacy through simulated cases: practice sessions and competitions in legal research, writing and oral argument.",
);
const DEBATE = org(
  "davidson-college-debate-club",
  "Davidson College Debate Club",
  "Debate in several formats on campus, with plans to compete at invitationals and regional and national competitions; all experience levels welcome.",
);
const POLITICAL_ENGAGEMENT = org(
  "center-for-political-engagement",
  "Center for Political Engagement",
  "Encourages political discourse and participation: runs the Davidson Votes Initiative, works with partisan campus groups and brings speakers to campus.",
);
const NCSL = org(
  "ncsl",
  "North Carolina Student Legislature",
  "Davidson’s chapter of the North Carolina Student Legislature, where students learn the legislative process by taking part in it.",
);
const POLITICAL_REVIEW = org(
  "davidsonpoliticalreview",
  "Davidson Political Review",
  "A multi-partisan student publication of research, opinion and journalism on political and policy issues; any student may submit.",
);
const DELIBERATIVE = org(
  "deliberativecitizenship",
  "Deliberative Citizenship Initiative",
  "A campus-wide project creating spaces where people who disagree can talk productively about difficult issues.",
);
const HAMILTON = org(
  "ahs",
  "Alexander Hamilton Society",
  "Debate and discussion of international relations and national security, with expert speakers and a professional network.",
);
const ALT_BREAKS = org(
  "alternative-breaks",
  "Alternative Breaks",
  "Student-led service-learning trips during academic breaks, working with community partners on pressing social issues.",
);
const HABITAT = org(
  "habitat-for-humanity-campus-chapter",
  "Habitat for Humanity Campus Chapter",
  "Builds homes with Habitat for Humanity in the Charlotte area and volunteers at Habitat ReStore facilities.",
);
const CATS_FOR_A_CAUSE = org(
  "davidson-for-the-kids",
  "'Cats for a Cause",
  "Formerly Davidson for the Kids: brings campus and community together to raise funds and awareness for Levine Children’s Hospital in Charlotte.",
);
const BUDDY_CLUB = org(
  "buddy-club",
  "Buddy Club",
  "Weekly activities with children and young adults with intellectual and developmental disabilities in the Davidson and Charlotte area.",
);
const STEM_ENRICHMENT = org(
  "girlsinstem",
  "STEM Enrichment",
  "Volunteers teach science experiments at local elementary schools to build students’ confidence in STEM; all students welcome.",
);
const STRONG_GIRLS = org(
  "stronggirlsunited",
  "Strong Girls United",
  "Davidson’s chapter, partnered with the Ada Jenkins Center, helps girls grow strong and confident through sport, physical activity and well-being activities.",
);
const DAVIDSONIAN = org(
  "the-davidsonian",
  "The Davidsonian",
  "The college’s independent student newspaper, published since 1914 and printed weekly.",
);
const LIBERTAS = org(
  "libertas-literary-magazine",
  "Libertas Literary Magazine",
  "A quarterly magazine of creative, investigative and scholarly writing by Davidson students, with open events through the year.",
);
const HISTORY_JOURNAL = org(
  "davidsonhistoryjournal",
  "The Davidson History Journal",
  "An online publication, founded by students in 2017, for history-related work by Davidson students.",
);
const HOBART_PARK = org(
  "hobart-park-literary-journal",
  "Hobart Park Literature & Arts Publication",
  "The student-run literature and art publication: a yearly collection of student writing and visual art, edited by students since 1978.",
);
const SUSTAINABILITY_COLLECTIVE = org(
  "the-sustainability-collective",
  "The Sustainability Collective",
  "Supports student-proposed sustainability projects on campus and works with the other campus sustainability groups.",
);
const BEE_CLUB = org(
  "bee-club",
  "Bee Club",
  "Hands-on beekeeping with the campus hives, with a focus on insect ecology, animal husbandry and earth care.",
);
const FISH_WILDLIFE = org(
  "fishandwildlife",
  "Fish and Wildlife Club",
  "Teaches students about wildlife and ecology through fundraisers and volunteer events; a community for outdoors people.",
);
const BIRD_CLUB = org(
  "bird-club",
  "Bird Club",
  "Learn about and observe local birds; no birding experience needed.",
);
const MINDS_DO_MATTER = org(
  "minds-do-matter",
  "Minds Do Matter",
  "A mental health organization focused on awareness, support and education about mental health on campus.",
);
const MISSION_34 = org(
  "live-for-tomorrow-suicide-awareness-and-prevention",
  "Mission 34",
  "Works to end the stigma around mental illness through awareness, education, speakers and suicide-prevention training.",
);
const NEUROSCIENCE = org(
  "davidson-college-neuroscience-club",
  "Davidson College Neuroscience Club",
  "A forum on neuroscience topics such as ethics, neurophilosophy and current research, with chances to meet people who treat and study neurological disorders.",
);
const INTERNATIONAL_ASSOCIATION = org(
  "davidson-international-association",
  "Davidson International Association",
  "A student-run organization that promotes cultural awareness and global interdependence; open to all students.",
);
const REFUGEE_SUPPORT = org(
  "davidson-refugee-support",
  "Davidson Refugee Support",
  "Supports refugees in North Carolina with Refugee Support Services in Charlotte, through events, fundraising and childcare help.",
);
const MSF = org(
  "davidson-college-global-health",
  "Friends of Médecins Sans Frontiéres Davidson College Chapter",
  "Supports the mission of Doctors Without Borders, coordinates volunteering at the Community Free Clinic of Cabarrus County and hosts blood drives.",
);
const HEALTH_JUSTICE = org(
  "health-justice-committee",
  "Health Justice Committee",
  "Engages students with health injustices in the Charlotte-Mecklenburg area through discussion, volunteering and speaker events.",
);
const REAL_ESTATE = org(
  "davidson-real-estate-club",
  "Davidson Real Estate Club",
  "Introduces the real estate industry, from development and brokerage to market analytics and acquisitions, through speakers, networking and case studies.",
);
const SPORT_MANAGEMENT = org(
  "sportsmanagementclub",
  "Sport Management Club",
  "Explores the business side of sports with hands-on learning and events for members; it aims to partner with Charlotte-based sports organizations.",
);
const CLASSICS = org(
  "classicsclub",
  "Davidson Classical History Symposium",
  "The Classics Club: Greek play readings, museum visits and other ways into ancient Mediterranean art, history and culture.",
);
const ANTHROPOLOGY = org(
  "anthro-club",
  "Anthropology Club",
  "Anthropology majors, minors and interested students who host events, lecture series and film screenings about the discipline.",
);
const RESEARCH_COMMUNITY = org(
  "interdisciplinary_research_community",
  "Interdisciplinary Research Community",
  "Discussions across disciplines for students and faculty, and preparation for graduate study.",
);
const FIRST = org(
  "first",
  "FIRST - Fostering Inclusivity & Respect in Science Together",
  "Works to make science at Davidson more welcoming and to engage all students in science.",
);
const BIOLOGY_SOCIETY = org(
  "biologysociety",
  "Davidson College Biology Society",
  "Connects students passionate about biology through peer events and discussion of the challenges facing modern biologists.",
);
const PHYSICS_STUDENTS = org(
  "society-of-physics-students",
  "Society of Physics Students",
  "Supports Davidson’s physics community and introduces students to the professional physics community beyond campus.",
);
const CHEMISTRY_AFFILIATES = org(
  "student-affiliates-american-chemistry-society",
  "Student Affiliates - American Chemistry Society",
  "A community for chemistry students, with practice presenting technical material to chemists.",
);

// ---- Outside summer programs (official pages) ----------------------------------------------------------------------

const REU: Summer = {
  kind: "outside",
  name: "NSF Research Experiences for Undergraduates (REU)",
  by: "National Science Foundation",
  url: "https://www.nsf.gov/funding/initiatives/reu/students",
  description:
    "Research with faculty at host institutions in any area NSF funds, usually in groups of about 10 students; you apply to each site directly, and participants get stipends.",
  eligibility:
    "Undergraduates who are U.S. citizens, permanent residents or U.S. nationals; each site may add criteria.",
  timing: "Most sites run in the summer and take applications January–March.",
  verifiedAt: READ_ON,
};

const PPIA: Summer = {
  kind: "outside",
  name: "PPIA Junior Summer Institute",
  by: "Public Policy and International Affairs Program",
  url: "https://www.ppiaprogram.org/JSI",
  description:
    "A fully funded summer of graduate-level coursework in policy, economics and statistics at Harvard, Princeton or the University of Michigan, with a stipend and housing.",
  eligibility: "Students graduating in December 2027 or between May and August 2028.",
  timing: "Apply by November 6, 2026, 11:59 p.m. ET, for summer 2027.",
  verifiedAt: READ_ON,
};

const SEO_CAREER: Summer = {
  kind: "outside",
  name: "SEO Career",
  by: "Sponsors for Educational Opportunity",
  url: "https://career.seo-usa.org/apply-faq/",
  description:
    "Recruits and prepares high-achieving undergraduates for summer internships in corporate America: financial services, technology, real estate and corporate roles.",
  eligibility:
    "First-years, sophomores and juniors of all majors at four-year U.S. colleges, authorized to work in the U.S.; 3.2 GPA required (3.0 may be considered).",
  timing:
    "Rolling; for summer internships, candidates are reviewed October through April (the class typically closes in mid-April).",
  verifiedAt: READ_ON,
};

const DOW_JONES_NEWS_FUND: Summer = {
  kind: "outside",
  name: "Dow Jones News Fund internships",
  by: "Dow Jones News Fund",
  url: "https://dowjonesnewsfund.org/djnfinternships/",
  description:
    "Paid 10- to 12-week summer internships at media companies after a one-week training program, in business reporting, data journalism, digital media, audience engagement and editing.",
  eligibility:
    "Full-time sophomores, juniors, seniors and graduate students as of November 11, 2026 (December graduates included).",
  timing: "Apply by November 11, 2026, for summer 2027.",
  verifiedAt: READ_ON,
};

const BREAKTHROUGH: Summer = {
  kind: "outside",
  name: "Breakthrough Teaching Fellowship",
  by: "Breakthrough Collaborative",
  url: "https://breakthroughcollaborative.org/apply-fellow/",
  description:
    "A nine-week summer teaching residency with a living stipend: 100+ hours of training, then teaching students from underserved communities at one of 25 sites.",
  eligibility: "Undergraduates of all majors; no education coursework required.",
  timing: "Early deadline January 14, 2027; regular deadline February 25, 2027.",
  verifiedAt: READ_ON,
};

const LSAC_SUMMER_PATHWAYS: Summer = {
  kind: "outside",
  name: "Summer pathway programs for prospective law students",
  by: "Law School Admission Council",
  url: "https://www.lsac.org/discover-law/access-and-community-law-school/summer-pathway-programs",
  description:
    "LSAC’s list of summer programs that help prospective law students prepare, from admission seminars to pre-law institutes.",
  eligibility:
    "Programs for students from underrepresented groups; each listing says who it is for, and most say what it costs.",
  timing: null,
  verifiedAt: READ_ON,
};

const GETTY_MARROW: Summer = {
  kind: "outside",
  name: "Getty Marrow Undergraduate Internships",
  by: "Getty Foundation",
  url: "https://www.getty.edu/projects/getty-marrow-undergraduate-internships/",
  description:
    "Paid, full-time 10-week summer internships at Getty and LA-area museums and arts organizations, in curatorship, conservation, education and more.",
  eligibility:
    "Undergraduates who attend college in, or are permanent residents of, LA County; U.S. citizens, permanent residents or DACA recipients.",
  timing: "Full-time for 10 weeks between June and August.",
  verifiedAt: READ_ON,
};

// ---- By career path --------------------------------------------------------------------------------------------------

export interface CareerActivities {
  onCampus?: OnCampus[];
  summer?: Summer[];
}

export const CAREER_ACTIVITIES: Readonly<Record<string, CareerActivities>> = {
  "software-engineering": {
    onCampus: [ACM, HACK, WICS, DISC],
    summer: [
      REU,
      program(
        "locke-white-jr-internship-fund",
        "A Matthews Center grant for a summer internship, with preference for students headed for science, technology or medicine.",
      ),
      program(
        "daad-rise-germany",
        "Summer research internships at German universities and research institutes, including computer science, with a monthly stipend.",
      ),
      SEO_CAREER,
    ],
  },
  "data-science": {
    onCampus: [DAVIDSON_AI, DISC, AWM],
    summer: [
      REU,
      program(
        "community-research-fellows",
        "A summer of place-based community research (housing, early childhood education, health) with Mulliss Center and Data CATS staff.",
      ),
      program(
        "locke-white-jr-internship-fund",
        "A Matthews Center grant for a summer internship, with preference for students headed for science, technology or medicine.",
      ),
    ],
  },
  "investment-banking": {
    onCampus: [DIBC, DIFA, DAIC, WIB],
    summer: [SEO_CAREER],
  },
  "management-consulting": {
    onCampus: [PRE_CONSULTING, PRE_BUSINESS, WIB],
    summer: [
      program(
        "bill-boyd-entrepreneurial-internship-grant",
        "A Matthews Center grant for an internship in business, sales or leadership roles at small- to medium-sized companies.",
      ),
    ],
  },
  "product-management": {
    onCampus: [HACK, ENTREPRENEURSHIP_CLUB, DAVIDSON_AI],
    summer: [
      program(
        "r-craig-and-sheila-yoder-applied-research-fellowship",
        "Ten weeks of paid, full-time research with a faculty member and an industry mentor on a product or service with commercialization potential.",
      ),
      program(
        "bill-boyd-entrepreneurial-internship-grant",
        "A Matthews Center grant for an internship in business, sales or leadership roles at small- to medium-sized companies.",
      ),
      SEO_CAREER,
    ],
  },
  medicine: {
    onCampus: [PREMED, MAPS, EMT, RAM],
    summer: [
      program(
        "juliana-tazewell-porter-memorial-internship-fund",
        "A Matthews Center grant for a summer internship in medicine or another healthcare field.",
      ),
      program(
        "research-in-science-experience-rise",
        "Four to six weeks of paid summer science research on campus for rising sophomores interested in science or medicine.",
      ),
      program(
        "davidson-research-initiative-dri-summer-research-fellowships",
        "Paid summer research with a faculty or staff mentor, in any discipline, on or off campus.",
      ),
      program(
        "the-cassell-family-socios-en-salud-partners-in-health-in-peru-internship",
        "Ten or more weeks with Partners in Health (Socios En Salud) in Lima, Peru, with travel and living costs covered.",
      ),
    ],
  },
  law: {
    onCampus: [MOCK_TRIAL, MOOT_COURT, DEBATE],
    summer: [
      LSAC_SUMMER_PATHWAYS,
      program(
        "davidson-in-washington-diw",
        "Eight weeks in Washington, DC: a government internship plus a Davidson political science seminar, both for credit.",
      ),
      program(
        "carolyn-and-george-cretekos-69-public-service-internship",
        "A Matthews Center grant for an internship in local, state or federal government service.",
      ),
    ],
  },
  marketing: {
    onCampus: [PRE_BUSINESS, WIB],
    summer: [
      program(
        "bill-boyd-entrepreneurial-internship-grant",
        "A Matthews Center grant for an internship in business, sales or leadership roles at small- to medium-sized companies.",
      ),
      program(
        "hall-family-internship-grants",
        "A Matthews Center grant for an unpaid or low-paying internship with an entrepreneurial or community-service organization.",
      ),
    ],
  },
  "research-academia": {
    onCampus: [RESEARCH_COMMUNITY, FIRST, BIOLOGY_SOCIETY, PHYSICS_STUDENTS, CHEMISTRY_AFFILIATES],
    summer: [
      REU,
      program(
        "goldwater-summer-research-internship-program",
        "Paid summer research internships for first- and second-year students, especially those with limited access to research.",
      ),
      program(
        "abernethy-endowment-grant",
        "Funds independent research or creative work in the humanities, arts or social sciences, in the U.S. or abroad, with a faculty mentor.",
      ),
      program(
        "research-in-science-experience-rise",
        "Four to six weeks of paid summer science research on campus for rising sophomores interested in science or medicine.",
      ),
      program(
        "daad-rise-germany",
        "Summer research internships at German universities and research institutes in the sciences and engineering, with a monthly stipend.",
      ),
    ],
  },
  "public-policy": {
    onCampus: [POLITICAL_ENGAGEMENT, NCSL, POLITICAL_REVIEW, DELIBERATIVE],
    summer: [
      PPIA,
      program(
        "carolyn-and-george-cretekos-69-public-service-internship",
        "A Matthews Center grant for an internship in local, state or federal government service.",
      ),
      program(
        "tom-anstrom-internship-fund",
        "A Matthews Center grant for an internship in progressive public policy, politics or social justice.",
      ),
    ],
  },
  entrepreneurship: {
    onCampus: [ENTREPRENEURSHIP_CLUB, BLOCKCHAIN, DAIC],
    summer: [
      program(
        "r-craig-and-sheila-yoder-applied-research-fellowship",
        "Ten weeks of paid, full-time research with a faculty member and an industry mentor on a product or service with commercialization potential.",
      ),
      program(
        "bill-boyd-entrepreneurial-internship-grant",
        "A Matthews Center grant for an internship in business, sales or leadership roles at small- to medium-sized companies.",
      ),
      program(
        "hall-family-internship-grants",
        "A Matthews Center grant for an unpaid or low-paying internship with an entrepreneurial or community-service organization.",
      ),
    ],
  },
  "ux-design": {
    onCampus: [HACK, ACM],
    summer: [
      program(
        "locke-white-jr-internship-fund",
        "A Matthews Center grant for a summer internship, with preference for students headed for science, technology or medicine.",
      ),
      REU,
    ],
  },
  nonprofit: {
    onCampus: [ALT_BREAKS, HABITAT, CATS_FOR_A_CAUSE, BUDDY_CLUB],
    summer: [
      program(
        "anne-stanback-81-and-charlotte-kinlock-internship-for-non-profit-leadership",
        "A Matthews Center grant for students with financial need interning at a nonprofit organization.",
      ),
      program(
        "pioneer-internship-fund",
        "A Matthews Center grant for students with financial need, with preference for nonprofit or government internships.",
      ),
      program(
        "community-research-fellows",
        "A summer of place-based community research (housing, early childhood education, health) with Mulliss Center and Data CATS staff.",
      ),
    ],
  },
  education: {
    onCampus: [STEM_ENRICHMENT, STRONG_GIRLS],
    summer: [
      BREAKTHROUGH,
      program(
        "brenda-h-tapia-cdf-freedom-schools-servant-leader-interns",
        "Nine paid weeks facilitating Children’s Defense Fund Freedom Schools literacy enrichment for K-8 children at Davidson.",
      ),
      program(
        "boyd-family-internship-grant",
        "A Matthews Center grant for an unpaid or low-paying internship in education, public service or civic engagement.",
      ),
    ],
  },
  journalism: {
    onCampus: [DAVIDSONIAN, POLITICAL_REVIEW, LIBERTAS, HISTORY_JOURNAL],
    summer: [
      DOW_JONES_NEWS_FUND,
      program(
        "pulitzer-center-fellowship-grant",
        "An independent international reporting project on an under-reported issue, with training and editing support from the Pulitzer Center.",
      ),
    ],
  },
  "environmental-science": {
    onCampus: [SUSTAINABILITY_COLLECTIVE, BEE_CLUB, FISH_WILDLIFE, BIRD_CLUB],
    summer: [
      program(
        "roy-alexander-internship-with-davidson-lands-conservancy",
        "An eight-week, full-time paid internship in nonprofit management and environmental conservation with the Davidson Lands Conservancy.",
      ),
      program(
        "noaa-hollings-scholarship",
        "Two years of scholarship support with a 10-week paid internship at NOAA in the summer between them.",
      ),
      REU,
    ],
  },
  cybersecurity: {
    onCampus: [ACM, HACK, WICS],
    summer: [
      REU,
      program(
        "locke-white-jr-internship-fund",
        "A Matthews Center grant for a summer internship, with preference for students headed for science, technology or medicine.",
      ),
      program(
        "daad-rise-germany",
        "Summer research internships at German universities and research institutes, including computer science, with a monthly stipend.",
      ),
    ],
  },
  "financial-planning": {
    onCampus: [AWM_CLUB, DIFA, WIB],
    summer: [SEO_CAREER],
  },
  "psychology-counseling": {
    onCampus: [MINDS_DO_MATTER, MISSION_34, NEUROSCIENCE],
    summer: [
      program(
        "abernethy-endowment-grant",
        "Funds independent research or creative work in the humanities, arts or social sciences, in the U.S. or abroad, with a faculty mentor.",
      ),
      REU,
      program(
        "community-research-fellows",
        "A summer of place-based community research (housing, early childhood education, health) with Mulliss Center and Data CATS staff.",
      ),
    ],
  },
  "international-development": {
    onCampus: [INTERNATIONAL_ASSOCIATION, REFUGEE_SUPPORT, MSF, HAMILTON],
    summer: [
      program(
        "east-asia-internship-program-freeman-foundation",
        "Grants for six- to eight-week summer internships with businesses, governments, research institutes and nonprofits in East and Southeast Asia.",
      ),
      program(
        "critical-language-scholarship-cls-program",
        "Eight to ten weeks of intensive overseas language study and cultural immersion in a critical language.",
      ),
      program(
        "the-cassell-family-socios-en-salud-partners-in-health-in-peru-internship",
        "Ten or more weeks with Partners in Health (Socios En Salud) in Lima, Peru, with travel and living costs covered.",
      ),
      program(
        "the-lou-ortmayer-fellowship-grant",
        "Funds experiential learning through the rest of your time at Davidson, with preference for international public health, medicine or food and water security.",
      ),
    ],
  },
  "architecture-urban-planning": {
    onCampus: [REAL_ESTATE, HABITAT, SUSTAINABILITY_COLLECTIVE],
    summer: [
      program(
        "community-research-fellows",
        "A summer of place-based community research (housing, early childhood education, health) with Mulliss Center and Data CATS staff.",
      ),
      program(
        "carolyn-and-george-cretekos-69-public-service-internship",
        "A Matthews Center grant for an internship in local, state or federal government service.",
      ),
    ],
  },
  "sports-management": {
    onCampus: [SPORT_MANAGEMENT],
  },
  "healthcare-administration": {
    onCampus: [HEALTH_JUSTICE, RAM, MSF],
    summer: [
      program(
        "juliana-tazewell-porter-memorial-internship-fund",
        "A Matthews Center grant for a summer internship in medicine or another healthcare field.",
      ),
      program(
        "the-cassell-family-socios-en-salud-partners-in-health-in-peru-internship",
        "Ten or more weeks with Partners in Health (Socios En Salud) in Lima, Peru, with travel and living costs covered.",
      ),
      program(
        "the-lou-ortmayer-fellowship-grant",
        "Funds experiential learning through the rest of your time at Davidson, with preference for international public health, medicine or food and water security.",
      ),
    ],
  },
  "arts-museum-curation": {
    onCampus: [CLASSICS, ANTHROPOLOGY, HOBART_PARK],
    summer: [
      program(
        "weeks-family-visual-arts-internship",
        "A Matthews Center grant for a summer internship exploring careers in the visual arts.",
      ),
      program(
        "ginny-newell-78-arts-fund",
        "A Matthews Center grant for a summer internship in the visual arts outside North Carolina and your hometown.",
      ),
      program(
        "dr-randy-nelson-summer-internship-grant",
        "A Matthews Center grant for a summer internship in the visual, literary or performing arts.",
      ),
      GETTY_MARROW,
    ],
  },
};
