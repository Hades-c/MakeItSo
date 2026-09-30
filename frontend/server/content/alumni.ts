import "server-only";
import type { z } from "zod";
import {
  ALUMNUS_SOURCED_FIELDS,
  AlumnusSchema,
  isLinkedInUrl,
  type Alumnus,
} from "@/lib/types/content";
import { defineContent, latestVerifiedAt } from "@/server/content/define";

/**
 * Verified Davidson alumni (PLAN §1 "Alumni", binding), converted from content-prep/final_alumni.json (27 kept by
 * the verifier on 2026-09-30; 26 listed here, see EXCLUDED below) with the LinkedIn rule applied field by field:
 * - Stored: name, classYear, majors, role, organization, roleAsOf, linkedinUrl, careerPathSlugs, contactable,
 *   sources, fieldSources, verifiedAt. No location, bio, notes, industry or minors.
 * - A displayed field (classYear, majors, role, organization) needs a non-LinkedIn source that states it
 *   (fieldSources lists only those). A field whose only evidence is LinkedIn is null here and shown as
 *   "see LinkedIn" (LinkedIn User Agreement §8.2). An archived, cached or proxied copy of a LinkedIn page is
 *   still LinkedIn (restsOnLinkedIn(); checked when the module loads).
 * - careerPathSlugs are kept only where a non-LinkedIn source supports the person's work or stated career
 *   direction in that area; a career grouping inferred from a LinkedIn headline alone would re-use LinkedIn data.
 * - Davidson attendance rests on at least one non-LinkedIn source for everyone listed (a catalog graduate list,
 *   a Convocation program, Davidson News, a trustee/staff page, or the person's own published resume/bio).
 * - contactable=false for public figures, trustees/Board members and college officers ("Notable alumni", no cold
 *   email).
 * - The LinkedIn URL is hand-entered, https://www.linkedin.com/in/<slug>/, and never fetched by code.
 * - Excluded pending the owner (never shown): the six medium-confidence LinkedIn matches, and Sophie Eldridge,
 *   whose two candidate LinkedIn profiles leave the canonical URL unconfirmed (the Sarah Duncan precedent).
 *
 * Every alumni view says "Compiled from public sources · checked <ALUMNI_CHECKED_AT> · Request removal/correction"
 * and is limited to verified @davidson.edu accounts with FEATURE_ALUMNI on (the pages and search enforce it).
 */

const CONVOCATION_2023 = "https://www.davidson.edu/media/9498/download";
const CONVOCATION_2025 = "https://www.davidson.edu/media/13560/download";
const BOARD_OF_TRUSTEES = "https://www.davidson.edu/about/college-leadership/board-trustees";
const SENIOR_LEADERSHIP = "https://www.davidson.edu/about/college-leadership/senior-leadership";
const NEWS_2017_ANALYTICS =
  "https://www.davidson.edu/news/2017/03/13/professor-student-bracketology-collaborations-lead-jobs-internships-new-research";
const NEWS_2024_IMPACT_FELLOWS =
  "https://www.davidson.edu/news/2024/01/31/decade-making-difference-davidson-impact-fellows-reflect-life-changing-work";
const NEWS_2025_PHI_BETA_KAPPA =
  "https://www.davidson.edu/news/2025/02/20/phi-beta-kappa-elects-new-members-2025";
const WBUR_2020_CATS_STATS =
  "https://www.wbur.org/onlyagame/2020/01/17/davidson-college-cats-stats-advanced-analytics";
const MATH_CS_HONORS =
  "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/honors-and-awards";
/**
 * Sebastian Charmot's own Medium post (Dec 27, 2022). Medium answers 403 to scripted fetches; the same text is in
 * his public feed, https://medium.com/feed/@sebastian.charmot (checked 2026-09-30).
 */
const CHARMOT_MEDIUM_LAC_POST =
  "https://medium.com/@sebastian.charmot/making-the-most-of-studying-computer-science-at-a-small-liberal-arts-college-9b9077f7d6e7";

const RECORDS = [
  {
    id: "samuel-waithira",
    name: "Samuel Waithira",
    classYear: 2024,
    majors: ["Economics"],
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/samuel-waithira-40016a190/",
    careerPathSlugs: [],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=26&navoid=1245",
      "https://www.davidson.edu/news/2024/05/13/class-2024-models-resilience-celebrates-graduation-joy",
      "https://www.davidson.edu/news/2024/05/10/sam-waithira-24-brings-service-leadership-davidson-kenya",
      "https://www.linkedin.com/in/samuel-waithira-40016a190/",
    ],
    fieldSources: {
      classYear: [
        "https://catalog.davidson.edu/content.php?catoid=26&navoid=1245",
        "https://www.davidson.edu/news/2024/05/13/class-2024-models-resilience-celebrates-graduation-joy",
      ],
      majors: [
        "https://www.davidson.edu/news/2024/05/13/class-2024-models-resilience-celebrates-graduation-joy",
        "https://www.davidson.edu/news/2024/05/10/sam-waithira-24-brings-service-leadership-davidson-kenya",
      ],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "max-shackelford",
    name: "Max Shackelford",
    classYear: 2025,
    majors: null,
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/max-shackelford/",
    careerPathSlugs: [],
    contactable: true,
    sources: [
      CONVOCATION_2025,
      NEWS_2025_PHI_BETA_KAPPA,
      "https://www.linkedin.com/in/max-shackelford/",
    ],
    fieldSources: {
      classYear: [CONVOCATION_2025, NEWS_2025_PHI_BETA_KAPPA],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "grant-hearne",
    name: "Grant Hearne",
    classYear: 2023,
    majors: null,
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/grant-hearne-6535b6198/",
    careerPathSlugs: [],
    contactable: true,
    sources: [CONVOCATION_2023, "https://www.linkedin.com/in/grant-hearne-6535b6198/"],
    fieldSources: {
      classYear: [CONVOCATION_2023],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "steve-shames",
    name: "Steve Shames",
    classYear: 1996,
    majors: ["History"],
    role: null,
    organization: "Publicis Groupe",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/steveshames/",
    careerPathSlugs: ["marketing"],
    contactable: false,
    sources: [BOARD_OF_TRUSTEES, "https://www.linkedin.com/in/steveshames/"],
    fieldSources: {
      classYear: [BOARD_OF_TRUSTEES],
      majors: [BOARD_OF_TRUSTEES],
      organization: [BOARD_OF_TRUSTEES],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "louise-dickinson",
    name: "Louise Dickinson",
    classYear: 2020,
    majors: null,
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/louise-dickinson-210762142/",
    careerPathSlugs: [],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=22&navoid=977",
      "https://www.linkedin.com/in/louise-dickinson-210762142/",
    ],
    fieldSources: {
      classYear: ["https://catalog.davidson.edu/content.php?catoid=22&navoid=977"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "anmar-jerjees",
    name: "Anmar Jerjees",
    classYear: 2018,
    majors: ["Political Science"],
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/anmarjerjees/",
    careerPathSlugs: [],
    contactable: true,
    sources: [
      "https://www.davidson.edu/academic-departments/arab-studies/internships-careers-and-graduate-school",
      "https://catalog.davidson.edu/content.php?catoid=20&navoid=857",
      "https://www.linkedin.com/in/anmarjerjees/",
    ],
    fieldSources: {
      classYear: [
        "https://www.davidson.edu/academic-departments/arab-studies/internships-careers-and-graduate-school",
        "https://catalog.davidson.edu/content.php?catoid=20&navoid=857",
      ],
      majors: [
        "https://www.davidson.edu/academic-departments/arab-studies/internships-careers-and-graduate-school",
      ],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "sebastian-charmot",
    name: "Sebastian Charmot",
    classYear: 2022,
    majors: ["Mathematics", "Computer Science"],
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/sebastian-charmot/",
    careerPathSlugs: ["data-science"],
    contactable: true,
    sources: [
      MATH_CS_HONORS,
      "https://www.davidson.edu/news/2022/02/23/class-2022-members-elected-phi-beta-kappa",
      CHARMOT_MEDIUM_LAC_POST,
      "https://github.com/SebastianCharmot",
      "https://www.linkedin.com/in/sebastian-charmot/",
    ],
    fieldSources: {
      classYear: [
        MATH_CS_HONORS,
        "https://www.davidson.edu/news/2022/02/23/class-2022-members-elected-phi-beta-kappa",
      ],
      // His own post: "studying computer science at ... Davidson College '22" and "I also double majored in
      // math"; the honors page gives him the 2022 McGavock Award, "to a particularly outstanding senior
      // Mathematics major". (GitHub states neither major; it backs the data-science grouping only.)
      majors: [CHARMOT_MEDIUM_LAC_POST, MATH_CS_HONORS],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "neil-patel",
    name: "Neil Patel",
    classYear: 2022,
    majors: ["Computer Science"],
    role: "Software Engineer",
    organization: "Qualtrics",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/neilbpatel/",
    careerPathSlugs: ["software-engineering"],
    contactable: true,
    sources: [
      "https://neilbpatel.com/PatelNeilBResume.pdf",
      "https://neilbpatel.com/",
      "https://www.linkedin.com/in/neilbpatel/",
    ],
    fieldSources: {
      classYear: ["https://neilbpatel.com/PatelNeilBResume.pdf"],
      majors: ["https://neilbpatel.com/PatelNeilBResume.pdf"],
      role: ["https://neilbpatel.com/PatelNeilBResume.pdf"],
      organization: ["https://neilbpatel.com/PatelNeilBResume.pdf"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "elizabeth-brigham",
    name: "Elizabeth Brigham",
    classYear: 2004,
    majors: ["English"],
    role: "W. Spencer Mitchem '59 Executive Director of Innovation & Entrepreneurship, Jay Hurt Hub",
    organization: "Davidson College",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/elizabethsbrigham/",
    careerPathSlugs: ["entrepreneurship"],
    contactable: true,
    sources: [
      "https://www.davidson.edu/news/2020/09/29/elizabeth-brigham-leads-hurt-hub",
      "https://hurthub.davidson.edu/about-us/",
      "https://www.davidson.edu/people/elizabeth-smith-brigham",
      "https://www.linkedin.com/in/elizabethsbrigham/",
    ],
    fieldSources: {
      classYear: [
        "https://www.davidson.edu/news/2020/09/29/elizabeth-brigham-leads-hurt-hub",
        "https://hurthub.davidson.edu/about-us/",
      ],
      majors: [
        "https://www.davidson.edu/people/elizabeth-smith-brigham",
        "https://www.davidson.edu/news/2020/09/29/elizabeth-brigham-leads-hurt-hub",
      ],
      role: [
        "https://www.davidson.edu/people/elizabeth-smith-brigham",
        "https://hurthub.davidson.edu/about-us/",
      ],
      organization: ["https://www.davidson.edu/people/elizabeth-smith-brigham"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "miles-abbett",
    name: "Miles Abbett",
    classYear: 2014,
    majors: ["Mathematics"],
    role: "Pro Scout",
    organization: "Charlotte Hornets",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/miles-abbett-1132b167/",
    careerPathSlugs: ["sports-management"],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=15&navoid=550",
      NEWS_2017_ANALYTICS,
      WBUR_2020_CATS_STATS,
      "https://cdn.nba.com/teams/uploads/sites/1610612766/2026/04/2025-26_CHA_MediaGuide_NEW.pdf",
      "https://www.linkedin.com/in/miles-abbett-1132b167/",
    ],
    fieldSources: {
      classYear: [
        "https://catalog.davidson.edu/content.php?catoid=15&navoid=550",
        NEWS_2017_ANALYTICS,
      ],
      majors: [WBUR_2020_CATS_STATS],
      role: [
        "https://cdn.nba.com/teams/uploads/sites/1610612766/2026/04/2025-26_CHA_MediaGuide_NEW.pdf",
      ],
      organization: [
        "https://cdn.nba.com/teams/uploads/sites/1610612766/2026/04/2025-26_CHA_MediaGuide_NEW.pdf",
      ],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "ford-higgins",
    name: "Ford Higgins",
    classYear: 2014,
    majors: ["Mathematics"],
    role: "Data Analyst",
    organization: "Signifyd",
    // The only dated evidence: fordhiggins.com/now, "November 2024 Update: I recently started a new job as a
    // data analyst at Signifyd" (the About page says the same but carries no date). The schema needs a full date.
    roleAsOf: "2024-11-01",
    linkedinUrl: "https://www.linkedin.com/in/wfordh/",
    careerPathSlugs: ["data-science"],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=15&navoid=550",
      NEWS_2017_ANALYTICS,
      "https://github.com/wfordh",
      WBUR_2020_CATS_STATS,
      "https://fordhiggins.com/about.html",
      "https://fordhiggins.com/now",
      "https://www.linkedin.com/in/wfordh/",
    ],
    fieldSources: {
      classYear: [
        "https://catalog.davidson.edu/content.php?catoid=15&navoid=550",
        NEWS_2017_ANALYTICS,
        "https://github.com/wfordh",
      ],
      majors: [WBUR_2020_CATS_STATS],
      role: ["https://fordhiggins.com/about.html", "https://fordhiggins.com/now"],
      organization: ["https://fordhiggins.com/about.html", "https://fordhiggins.com/now"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "ross-kruse",
    name: "Ross Kruse",
    classYear: 2017,
    majors: ["Mathematics", "Computer Science"],
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/rosskruse/",
    careerPathSlugs: ["data-science"],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=19&navoid=786",
      NEWS_2017_ANALYTICS,
      "https://rosskruse.com/",
      "https://www.linkedin.com/in/rosskruse/",
    ],
    fieldSources: {
      classYear: [
        "https://catalog.davidson.edu/content.php?catoid=19&navoid=786",
        NEWS_2017_ANALYTICS,
      ],
      majors: ["https://rosskruse.com/"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "rahael-borchers",
    name: "Rahael Borchers",
    classYear: 2015,
    majors: ["Political Science"],
    role: "Clinical Fellow, Medicine; National Clinician Scholar",
    organization: "UCSF / Zuckerberg San Francisco General Hospital",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/rahael-borchers-75669465/",
    careerPathSlugs: ["medicine", "research-academia"],
    contactable: true,
    sources: [
      "https://profiles.ucsf.edu/rahael.borchers",
      "https://catalog.davidson.edu/content.php?catoid=16&navoid=614",
      NEWS_2024_IMPACT_FELLOWS,
      "https://www.linkedin.com/in/rahael-borchers-75669465/",
    ],
    fieldSources: {
      classYear: [
        "https://profiles.ucsf.edu/rahael.borchers",
        "https://catalog.davidson.edu/content.php?catoid=16&navoid=614",
        NEWS_2024_IMPACT_FELLOWS,
      ],
      majors: ["https://profiles.ucsf.edu/rahael.borchers"],
      role: ["https://profiles.ucsf.edu/rahael.borchers"],
      organization: ["https://profiles.ucsf.edu/rahael.borchers"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "bruno-mourao",
    name: "Bruno Mourao",
    classYear: 2017,
    majors: ["Biology"],
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/bruno-mourao-p-0a260ba8/",
    careerPathSlugs: ["medicine"],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=19&navoid=785",
      NEWS_2024_IMPACT_FELLOWS,
      "https://wcmq.cloud-cme.com/assets/wcmq/Uploads/11202/Documents/11202_Bio.pdf",
      "https://www.doximity.com/pub/bruno-mourao-pacheco-md",
      "https://www.linkedin.com/in/bruno-mourao-p-0a260ba8/",
    ],
    fieldSources: {
      classYear: [
        "https://catalog.davidson.edu/content.php?catoid=19&navoid=785",
        NEWS_2024_IMPACT_FELLOWS,
        "https://wcmq.cloud-cme.com/assets/wcmq/Uploads/11202/Documents/11202_Bio.pdf",
      ],
      majors: ["https://wcmq.cloud-cme.com/assets/wcmq/Uploads/11202/Documents/11202_Bio.pdf"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "sallie-permar",
    name: "Sallie Permar",
    classYear: 1997,
    majors: ["Biology"],
    role: "Chair, Department of Pediatrics; Pediatrician-in-Chief",
    organization: "Weill Cornell Medicine / NewYork-Presbyterian",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/sallie-permar-914721334/",
    careerPathSlugs: ["medicine", "research-academia"],
    contactable: false,
    sources: [
      BOARD_OF_TRUSTEES,
      "https://vivo.weill.cornell.edu/display/cwid-sap4017",
      "https://news.vumc.org/2026/04/07/pediatrics-annual-research-retreat-is-april-10-keynote-speaker-is-weill-cornells-sallie-permar/",
      "https://www.linkedin.com/in/sallie-permar-914721334/",
    ],
    fieldSources: {
      classYear: [BOARD_OF_TRUSTEES],
      majors: [BOARD_OF_TRUSTEES],
      role: [
        BOARD_OF_TRUSTEES,
        "https://vivo.weill.cornell.edu/display/cwid-sap4017",
        "https://news.vumc.org/2026/04/07/pediatrics-annual-research-retreat-is-april-10-keynote-speaker-is-weill-cornells-sallie-permar/",
      ],
      organization: [BOARD_OF_TRUSTEES, "https://vivo.weill.cornell.edu/display/cwid-sap4017"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "thomas-marshburn",
    name: "Thomas Marshburn",
    classYear: 1982,
    majors: ["Physics"],
    role: "Chief Astronaut & VP Mission Integrity",
    organization: "Sierra Space",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/tom-marshburn-5a5a069/",
    careerPathSlugs: ["medicine"],
    contactable: false,
    sources: [
      "https://www.davidson.edu/news/2017/06/07/astronaut-thomas-h-marshburn-md-82-davidson-houston-and-back",
      "https://www.sierraspace.com/leadership/tom-marshburn/",
      "https://www.linkedin.com/in/tom-marshburn-5a5a069/",
    ],
    fieldSources: {
      classYear: [
        "https://www.davidson.edu/news/2017/06/07/astronaut-thomas-h-marshburn-md-82-davidson-houston-and-back",
      ],
      majors: [
        "https://www.sierraspace.com/leadership/tom-marshburn/",
        "https://www.davidson.edu/news/2017/06/07/astronaut-thomas-h-marshburn-md-82-davidson-houston-and-back",
      ],
      role: ["https://www.sierraspace.com/leadership/tom-marshburn/"],
      organization: ["https://www.sierraspace.com/leadership/tom-marshburn/"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "emily-palmer",
    name: "Emily Palmer",
    classYear: 2017,
    majors: ["Political Science"],
    role: null,
    organization: "Los Angeles County District Attorney's Office",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/emily-palmer-605453122/",
    careerPathSlugs: ["law"],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=19&navoid=784",
      "https://web.archive.org/web/20240907210809/https://wildcat-career-news.davidson.edu/alumni-and-networking/how-my-experience-at-davidson-college-helped-get-me-through-law-school/",
      "https://apps.calbar.ca.gov/attorney/Licensee/Detail/333628",
      "https://www.linkedin.com/in/emily-palmer-605453122/",
    ],
    fieldSources: {
      classYear: [
        "https://catalog.davidson.edu/content.php?catoid=19&navoid=784",
        "https://web.archive.org/web/20240907210809/https://wildcat-career-news.davidson.edu/alumni-and-networking/how-my-experience-at-davidson-college-helped-get-me-through-law-school/",
      ],
      majors: [
        "https://web.archive.org/web/20240907210809/https://wildcat-career-news.davidson.edu/alumni-and-networking/how-my-experience-at-davidson-college-helped-get-me-through-law-school/",
      ],
      organization: ["https://apps.calbar.ca.gov/attorney/Licensee/Detail/333628"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "sarah-phillips",
    name: "Sarah Phillips",
    classYear: 2001,
    majors: ["Art"],
    role: "Vice President and General Counsel",
    organization: "Davidson College",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/sarah-phillips-63b289123/",
    careerPathSlugs: ["law"],
    contactable: false,
    sources: [
      "https://nclawyersweekly.com/2013/02/08/sarah-phillips/",
      "https://vimeo.com/124450490",
      SENIOR_LEADERSHIP,
      "https://www.linkedin.com/in/sarah-phillips-63b289123/",
    ],
    fieldSources: {
      classYear: [
        "https://nclawyersweekly.com/2013/02/08/sarah-phillips/",
        "https://vimeo.com/124450490",
      ],
      majors: ["https://vimeo.com/124450490"],
      role: [SENIOR_LEADERSHIP],
      organization: [SENIOR_LEADERSHIP],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "mills-jordan",
    name: "Mills Jordan",
    classYear: 2025,
    majors: ["Political Science"],
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/mills-jordan/",
    careerPathSlugs: ["education"],
    contactable: true,
    sources: [
      "https://www.davidson.edu/news/2025/05/19/commencement-celebrates-class-2025-world-needs-you",
      CONVOCATION_2025,
      NEWS_2025_PHI_BETA_KAPPA,
      "https://www.linkedin.com/in/mills-jordan/",
    ],
    fieldSources: {
      classYear: [
        "https://www.davidson.edu/news/2025/05/19/commencement-celebrates-class-2025-world-needs-you",
        CONVOCATION_2025,
      ],
      majors: [
        "https://www.davidson.edu/news/2025/05/19/commencement-celebrates-class-2025-world-needs-you",
      ],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "tim-saintsing",
    name: "Tim Saintsing",
    classYear: 1998,
    majors: ["Political Science"],
    role: "Head of Operations and Carolinas Partnerships",
    organization: "Playlab",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/saintsing/",
    careerPathSlugs: ["education", "nonprofit"],
    contactable: false,
    sources: [
      BOARD_OF_TRUSTEES,
      "https://www.playlab.ai/about",
      "https://www.linkedin.com/in/saintsing/",
    ],
    fieldSources: {
      classYear: [BOARD_OF_TRUSTEES],
      majors: [BOARD_OF_TRUSTEES],
      role: [BOARD_OF_TRUSTEES, "https://www.playlab.ai/about"],
      organization: [BOARD_OF_TRUSTEES, "https://www.playlab.ai/about"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "sophia-guevara-cunningham",
    name: "Sophia Guevara Cunningham",
    classYear: 2016,
    majors: ["English"],
    role: "Senior VP, Energy & Executive Director, Houston Energy Transition Initiative",
    organization: "Greater Houston Partnership",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/sophia-guevara/",
    careerPathSlugs: ["public-policy", "environmental-science"],
    contactable: true,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=17&navoid=677",
      NEWS_2024_IMPACT_FELLOWS,
      "https://htxenergytransition.org/team/sophia-cunningham/",
      "https://energycapitalhtx.com/heti-new-executive-director-sophia-cunningham",
      "https://www.linkedin.com/in/sophia-guevara/",
    ],
    fieldSources: {
      classYear: [
        "https://catalog.davidson.edu/content.php?catoid=17&navoid=677",
        NEWS_2024_IMPACT_FELLOWS,
      ],
      majors: ["https://htxenergytransition.org/team/sophia-cunningham/"],
      role: [
        "https://htxenergytransition.org/team/sophia-cunningham/",
        "https://energycapitalhtx.com/heti-new-executive-director-sophia-cunningham",
      ],
      organization: [
        "https://htxenergytransition.org/team/sophia-cunningham/",
        "https://energycapitalhtx.com/heti-new-executive-director-sophia-cunningham",
      ],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "evan-magen",
    name: "Evan Magen",
    classYear: 2020,
    majors: ["Economics"],
    role: "Director of Mission & Community Outreach",
    organization: "Kirk of Kildaire Presbyterian Church",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/evanmagen/",
    careerPathSlugs: ["nonprofit"],
    contactable: true,
    sources: [
      NEWS_2024_IMPACT_FELLOWS,
      "https://www.kirkofkildaire.org/wps-members/evan-magen/",
      "https://www.linkedin.com/in/evanmagen/",
    ],
    fieldSources: {
      classYear: [NEWS_2024_IMPACT_FELLOWS],
      majors: [NEWS_2024_IMPACT_FELLOWS],
      role: ["https://www.kirkofkildaire.org/wps-members/evan-magen/"],
      organization: ["https://www.kirkofkildaire.org/wps-members/evan-magen/"],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "tomas-quintero",
    name: "Tomás Quintero",
    classYear: 2023,
    majors: null,
    role: null,
    organization: null,
    roleAsOf: null,
    linkedinUrl: "https://www.linkedin.com/in/tom%C3%A1s-quintero-590926190/",
    careerPathSlugs: [],
    contactable: true,
    sources: [CONVOCATION_2023, "https://www.linkedin.com/in/tom%C3%A1s-quintero-590926190/"],
    fieldSources: {
      classYear: [CONVOCATION_2023],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "clint-smith",
    name: "Clint Smith",
    classYear: 2010,
    majors: null,
    role: "Staff Writer",
    organization: "The Atlantic",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/clint-smith-a77b3769/",
    careerPathSlugs: ["journalism"],
    contactable: false,
    sources: [
      "https://catalog.davidson.edu/content.php?catoid=11&navoid=365",
      "https://www.clintsmithiii.com/about",
      "https://www.wwno.org/show/louisiana-considered/2026-03-12/new-orleans-native-atlantic-writer-clint-smith-on-latest-work-sea-change-travels-to-cambodia",
      "https://www.linkedin.com/in/clint-smith-a77b3769/",
    ],
    fieldSources: {
      classYear: ["https://catalog.davidson.edu/content.php?catoid=11&navoid=365"],
      role: [
        "https://www.clintsmithiii.com/about",
        "https://www.wwno.org/show/louisiana-considered/2026-03-12/new-orleans-native-atlantic-writer-clint-smith-on-latest-work-sea-change-travels-to-cambodia",
      ],
      organization: [
        "https://www.clintsmithiii.com/about",
        "https://www.wwno.org/show/louisiana-considered/2026-03-12/new-orleans-native-atlantic-writer-clint-smith-on-latest-work-sea-change-travels-to-cambodia",
      ],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "stephen-curry",
    name: "Stephen Curry",
    classYear: 2022,
    majors: ["Sociology"],
    role: "Guard",
    organization: "Golden State Warriors",
    roleAsOf: "2026-09-30",
    linkedinUrl: "https://www.linkedin.com/in/stephencurry30/",
    careerPathSlugs: ["sports-management"],
    contactable: false,
    sources: [
      "https://www.davidson.edu/news/2022/05/15/thirteen-years-after-entering-nba-steph-curry-graduates-class-2022",
      "https://www.nba.com/warriors/news/warriors-sign-guard-stephen-curry-to-contract-extension-20260925",
      "https://www.nba.com/news/stephen-curry-warriors-extension-sept-2026",
      "https://www.linkedin.com/in/stephencurry30/",
    ],
    fieldSources: {
      classYear: [
        "https://www.davidson.edu/news/2022/05/15/thirteen-years-after-entering-nba-steph-curry-graduates-class-2022",
      ],
      majors: [
        "https://www.davidson.edu/news/2022/05/15/thirteen-years-after-entering-nba-steph-curry-graduates-class-2022",
      ],
      role: [
        "https://www.nba.com/warriors/news/warriors-sign-guard-stephen-curry-to-contract-extension-20260925",
        "https://www.nba.com/news/stephen-curry-warriors-extension-sept-2026",
      ],
      organization: [
        "https://www.nba.com/warriors/news/warriors-sign-guard-stephen-curry-to-contract-extension-20260925",
        "https://www.nba.com/news/stephen-curry-warriors-extension-sept-2026",
      ],
    },
    verifiedAt: "2026-09-30",
  },
  {
    id: "stephen-p-macmillan",
    name: "Stephen P. MacMillan",
    classYear: 1985,
    majors: ["Economics"],
    role: "Retired; former Chairman, President & CEO",
    organization: "Hologic",
    roleAsOf: "2026-04-07",
    linkedinUrl: "https://www.linkedin.com/in/stephenmacmillan-2984575a/",
    careerPathSlugs: ["healthcare-administration"],
    contactable: false,
    sources: [
      "https://www.davidson.edu/news/2020/03/20/front-line-against-pandemic-qa-hologic-ceo-steve-macmillan-85-rapid-covid-19-test",
      "https://www.sec.gov/Archives/edgar/data/310764/000031076403000013/syk8kex99.htm",
      "https://www.hologic.com/about/press-release/hologic-chief-executive-officer-steve-macmillan-retire-upon-close-go-private",
      "https://www.sec.gov/Archives/edgar/data/859737/000119312526144632/d135035d8k.htm",
      "https://www.linkedin.com/in/stephenmacmillan-2984575a/",
    ],
    fieldSources: {
      classYear: [
        "https://www.davidson.edu/news/2020/03/20/front-line-against-pandemic-qa-hologic-ceo-steve-macmillan-85-rapid-covid-19-test",
      ],
      majors: [
        "https://www.sec.gov/Archives/edgar/data/310764/000031076403000013/syk8kex99.htm",
        "https://www.hologic.com/about/press-release/hologic-chief-executive-officer-steve-macmillan-retire-upon-close-go-private",
      ],
      role: [
        "https://www.sec.gov/Archives/edgar/data/859737/000119312526144632/d135035d8k.htm",
        "https://www.hologic.com/about/press-release/hologic-chief-executive-officer-steve-macmillan-retire-upon-close-go-private",
      ],
      organization: [
        "https://www.sec.gov/Archives/edgar/data/859737/000119312526144632/d135035d8k.htm",
        "https://www.hologic.com/about/press-release/hologic-chief-executive-officer-steve-macmillan-retire-upon-close-go-private",
      ],
    },
    verifiedAt: "2026-09-30",
  },
] satisfies z.input<typeof AlumnusSchema>[];

const EXCLUDED = [
  {
    name: "Jay Hurt",
    reason: "Medium-confidence LinkedIn match: the candidate profile does not mention Davidson.",
  },
  {
    name: "Lily Korir",
    reason:
      "Medium-confidence LinkedIn match: the candidate profile's major conflicts with Davidson's published record.",
  },
  {
    name: "Sarah Duncan",
    reason:
      "Medium-confidence LinkedIn match: two candidate profiles, and the canonical one is unconfirmed.",
  },
  {
    name: "Isabelle Saba",
    reason:
      "Medium-confidence LinkedIn match: the candidate profile shows too little to confirm it is her.",
  },
  {
    name: "Anthony Foxx",
    reason: "Medium-confidence LinkedIn match: two candidate profiles.",
  },
  {
    name: "Roger H. Brown",
    reason: "Medium-confidence LinkedIn match: a common name matched by search snippet only.",
  },
  {
    // Kept by the verifier, held back here on the Sarah Duncan precedent: her Davidson attendance is confirmed
    // (2023 Convocation program, class-secretary page), but which LinkedIn URL is hers is not.
    name: "Sophie Eldridge",
    reason:
      "LinkedIn URL unconfirmed: two candidate profiles, and the canonical one is unconfirmed.",
  },
];

/**
 * True when a URL is LinkedIn or a copy of it: linkedin.com itself, or any URL (an archive snapshot, a search
 * cache, a proxy, the lnkd.in shortener) whose decoded text names LinkedIn. Such a page never counts as the
 * non-LinkedIn source a displayed field or Davidson attendance needs (PLAN §1). Stricter than isLinkedInUrl() in
 * lib/types/content.ts, which checks the host only.
 */
export function restsOnLinkedIn(url: string): boolean {
  if (isLinkedInUrl(url)) return true;
  let text = url;
  try {
    text = decodeURIComponent(url);
  } catch {
    // Malformed escapes: test the raw text.
  }
  return /linkedin\.com|lnkd\.in/i.test(text);
}

/** AlumnusSchema plus the stricter LinkedIn test for attendance and for every field source (used at load). */
export const StrictAlumnusSchema = AlumnusSchema.superRefine((alumnus, ctx) => {
  if (!alumnus.sources.some((url) => !restsOnLinkedIn(url))) {
    ctx.addIssue({
      code: "custom",
      path: ["sources"],
      message: "Davidson attendance needs a source that is not LinkedIn or a copy of it",
    });
  }
  for (const url of alumnus.sources) {
    if (restsOnLinkedIn(url) && url !== alumnus.linkedinUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: `only the hand-entered linkedinUrl may point at LinkedIn: ${url}`,
      });
    }
  }
  for (const field of ALUMNUS_SOURCED_FIELDS) {
    for (const url of alumnus.fieldSources[field] ?? []) {
      if (restsOnLinkedIn(url)) {
        ctx.addIssue({
          code: "custom",
          path: ["fieldSources", field],
          message: `a LinkedIn copy is not a field source (set the field to null): ${url}`,
        });
      }
    }
  }
});

export const ALUMNI: readonly Alumnus[] = defineContent(
  "alumni",
  StrictAlumnusSchema,
  RECORDS,
  (alumnus) => alumnus.id,
);

/** People left out until the owner reviews them (PLAN §8). Names and a reason only; never displayed. */
export const EXCLUDED_PENDING_OWNER: readonly { name: string; reason: string }[] = Object.freeze(
  EXCLUDED.map((entry) => Object.freeze({ ...entry })),
);

/** The date for "checked <date>" on every alumni view. */
export const ALUMNI_CHECKED_AT: string = latestVerifiedAt(ALUMNI);

const BY_ID = new Map(ALUMNI.map((alumnus) => [alumnus.id, alumnus]));

export function getAlumnus(id: string): Alumnus | undefined {
  return BY_ID.get(id);
}

/** Newest class first, then by name; unknown class years last. */
function byClassYearThenName(a: Alumnus, b: Alumnus): number {
  return (b.classYear ?? 0) - (a.classYear ?? 0) || a.name.localeCompare(b.name);
}

/** The directory order (newest class first). */
export function alumniDirectory(): Alumnus[] {
  return [...ALUMNI].sort(byClassYearThenName);
}

/** Alumni on one career path (careers pages), newest class first. */
export function alumniForCareer(slug: string): Alumnus[] {
  return ALUMNI.filter((alumnus) => alumnus.careerPathSlugs.includes(slug)).sort(
    byClassYearThenName,
  );
}

/** Alumni a student may contact (cold email is offered only for these). */
export function contactableAlumni(): Alumnus[] {
  return alumniDirectory().filter((alumnus) => alumnus.contactable);
}

/** "Notable alumni": public figures, trustees and college officers (no cold email). */
export function notableAlumni(): Alumnus[] {
  return alumniDirectory().filter((alumnus) => !alumnus.contactable);
}
