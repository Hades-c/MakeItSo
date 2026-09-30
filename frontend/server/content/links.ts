import "server-only";
import type { z } from "zod";
import {
  HandshakeConfigSchema,
  PORTAL_LINK_CATEGORIES,
  PortalLinkSchema,
  type HandshakeConfig,
  type PortalLink,
} from "@/lib/types/content";
import { defineContent, defineContentObject, latestVerifiedAt } from "@/server/content/define";

/**
 * Link-outs to Davidson platforms (quick links, the Sources panel's "Links"), converted from
 * content-prep/final_links.json: every URL, redirect and description re-checked on 2026-09-30 (curl, headless
 * Chromium, the T&I and Handshake help-center APIs).
 * - `source` is set only on the platforms with a tag (HANDSHAKE, DAVIDSON ONE, ATHLETICS): those tags appear
 *   only on these curated deep links (PLAN §5 Sources).
 * - Handshake is linked by its documented base URL only. No keyword-search URL is documented (Handshake's help
 *   articles describe search through the in-app search bar only, and /job-search sits behind a Cloudflare
 *   challenge), so `HANDSHAKE.jobSearchUrlTemplate` is null and handshakeUrl() returns the base URL. The
 *   "Davidson Student Login" SAML path is not linked: it embeds an id Davidson has not published as a link.
 * - Banner Self-Service and WebTree were verified to their redirects (their :8443 hosts are campus-only);
 *   Degree Works has no URL of its own, so it links Banner.
 * - Moodle is a plain link-out to the LMS home: no course-site items (PLAN §1).
 */

const LINK_RECORDS = [
  {
    slug: "davidson-one",
    name: "Davidson One",
    url: "https://one.davidson.edu/campusm/home#select-profile",
    description:
      "Davidson's official web and mobile hub, built on Ex Libris campusM. The profile picker offers Faculty/Staff, Students and Guests. The Students profile needs your Davidson email and password and shows remaining meal swipes, dining dollars and declining balance, dining menus and hours, on-campus events (WildcatSync, Athletics, Hub and public events), LaundryView status and your course schedule. It also links to Davidson email, Moodle, Banner, WildcatSync and library resources; each of those needs its own first sign-in. Apps: iOS https://apps.apple.com/us/app/davidson-one/id1612631297, Android https://play.google.com/store/apps/details?id=com.ombiel.campusm.davidson.",
    requiresLogin: true,
    category: "portal",
    source: "davidson-one",
    sources: [
      "https://support.ti.davidson.edu/hc/en-us/articles/10142085579671-Davidson-One-for-Students",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "webtree",
    name: "WebTree (course preferences)",
    url: "https://registrar.davidson.edu/WebTree",
    description:
      "Davidson's student-designed course preference and registration system. For each slot you name the class you want most, then a fallback in case it is full. After WebTree closes, batch runs give each student one course per round (seniors first, then juniors, sophomores and first-years, in random order within each class) for four rounds, and the results go into Banner. Sign-in uses SSO and Duo. The first sign-in each semester also asks for a PIN: continuing students get it from their adviser, and new students and students on leave use the last four digits of their ID. Spring 2027 preferences: Oct. 12, 2026 (7 a.m.) to Nov. 3 (5 p.m.). Schedules appear in Banner Self-Service Nov. 6, and Banner add/drop runs Nov. 9 (7 a.m.) to Nov. 13 (5 p.m.).",
    requiresLogin: true,
    category: "academics",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/registrar/new-student-resources/course-registration/webtree-directions",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "banner-self-service",
    name: "Banner Self-Service (BannerWeb)",
    url: "https://bannerweb.davidson.edu/",
    description:
      "Banner Self-Service 9, Davidson's student records system. Students use it for add/drop during approved periods (you need each course's five-digit CRN), current and past schedules, grades and GPA, holds, action items, student billing (Nelnet), financial aid, transcript information and the Degree Works link. Sign in with your Davidson email, password and Duo, then open the four-square menu > Student Services. Courses that need permission or an exception can't be added here and go through the Registrar. This is a different system from WebTree.",
    requiresLogin: true,
    category: "academics",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/registrar/student-schedules-grades-adddrop",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "degree-works",
    name: "Degree Works",
    url: "https://bannerweb.davidson.edu/",
    description:
      "Degree audit and advising tool. It shows which Ways of Knowing, major and minor requirements are done and which remain, including AP, IB, transfer and study-abroad credit, and it offers What If scenarios, which are not saved. Data refreshes nightly from Banner. It is not a transcript. There is no standalone URL: sign in to Banner Self-Service, then four-square menu > Student Services > Degree Works.",
    requiresLogin: true,
    category: "academics",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/registrar/student-schedules-grades-adddrop/degreeworks",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "moodle",
    name: "Moodle",
    url: "https://moodle.davidson.edu/",
    description:
      "Davidson's learning management system: class materials, assignments and submissions, quizzes, forums and the gradebook. Sign in with your Davidson email and Duo. The site root opens a guest dashboard, and courses need sign-in. Since Feb. 1, 2021, Davidson's Moodle does not support the Moodle mobile app; T&I says to use the Open LMS app (https://apps.apple.com/us/app/open-lms/id1553337282) or a mobile browser.",
    requiresLogin: true,
    category: "academics",
    source: null,
    sources: ["https://support.ti.davidson.edu/hc/en-us/articles/4588057604247-Moodle-Overview"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "handshake",
    name: "Handshake (Davidson)",
    url: "https://davidson.joinhandshake.com/",
    description:
      "Davidson's Handshake site. The Matthews Center calls Handshake its internal job and internship posting system and the 'primary gateway to Davidson-specific career opportunities.' HR's student-employment page says students also find and apply for on-campus jobs here, including work-study jobs. When you're signed out, the site redirects to davidson.joinhandshake.com/login.",
    requiresLogin: true,
    category: "career",
    source: "handshake",
    sources: ["https://www.davidson.edu/offices-and-services/matthews-center-career-development"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "handshake-appointments",
    name: "Career Advising Appointments (Handshake)",
    url: "https://davidson.joinhandshake.com/appointments",
    description:
      "Book a one-on-one appointment with a Matthews Center career adviser, including prelaw and premed advising, through Handshake. Appointments run 8:30 a.m. to 5 p.m., Monday to Friday. Drop-in advising is held in the Matthews Center lobby when classes are in session. Redirects to the Handshake login when you're signed out.",
    requiresLogin: true,
    category: "career",
    source: "handshake",
    sources: [
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/student-career-planning-roadmap",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "matthews-center",
    name: "Matthews Center for Career Development",
    url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
    description:
      "The Betty and B. Frank Matthews II '49 Center for Career Development, Davidson's career office for advising, programs, employer engagement and the official Handshake link. Phone 704-894-2132.",
    requiresLogin: false,
    category: "career",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/matthews-center-career-development"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "student-jobs",
    name: "Find a Student Job (on campus)",
    url: "https://www.davidson.edu/offices-and-services/human-resources/student-employment/find-student-job",
    description:
      "HR's guide to on-campus jobs. Work-study recipients get priority from mid-July through the first week of September, and they and other students apply for jobs through Handshake. The page also covers research assistant, tutor and civic engagement positions.",
    requiresLogin: false,
    category: "career",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/human-resources/student-employment/find-student-job",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "wildcatsync",
    name: "WildcatSync",
    url: "https://wildcatsync.davidson.edu/",
    description:
      "Davidson's student organization, event and news platform, run on Campus Labs Engage. T&I says all student news and events should be posted here. The public events list (https://wildcatsync.davidson.edu/events, 232 upcoming events on 2026-09-30) and the organization pages open without signing in. Sign-in goes through Campus Labs' identity service.",
    requiresLogin: false,
    category: "campus-life",
    source: null,
    sources: [
      "https://support.ti.davidson.edu/hc/en-us/articles/10140928707351-Submitting-a-Student-News-Events-Item-Through-Davidson-One",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "library",
    name: "Davidson College Library",
    url: "https://www.davidson.edu/library",
    description:
      "Library home page. The library building (listed on LibCal as E.H. Little Library) is closed for renovation from summer 2025 to fall 2027. It will reopen in fall 2027 as the George Lawrence Abernethy Library. Meanwhile, Lilly Family Gallery is the main study space, with library staff, course reserves, computers, a laptop kiosk, scanners, printers and the information desk. Links to the catalog, databases, research guides, ILLiad, chat and research appointments.",
    requiresLogin: false,
    category: "library",
    source: null,
    sources: ["https://www.davidson.edu/library"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "library-hours",
    name: "Library Hours (LibCal)",
    url: "https://davidson.libcal.com/hours",
    description:
      "Official hours for library locations, including Lilly Family Gallery (24 hours on 2026-09-30), the Music Library in Sloan 101, Tomlinson Hall, and Archives & Special Collections. The same hours appear at https://www.davidson.edu/library/about-library/library-hours.",
    requiresLogin: false,
    category: "library",
    source: null,
    sources: ["https://www.davidson.edu/library"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "library-study-rooms",
    name: "Reserve Library Study Spaces (LibCal)",
    url: "https://davidson.libcal.com/r/new",
    description:
      "LibCal room booking, linked as 'Reserve Study Spaces' on the library's construction page. During the renovation, Chambers classrooms 2130 and 2164 can be reserved 24/7 for group study, and the Music Library's group study alcoves can also be reserved.",
    requiresLogin: false,
    category: "library",
    source: null,
    sources: ["https://www.davidson.edu/library/using-library-during-construction"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "library-catalog",
    name: "Library Catalog (Primo)",
    url: "https://davidson.primo.exlibrisgroup.com/discovery/search?vid=01DCOLL_INST:01DCOLL&lang=en",
    description:
      "Library catalog search, linked from the library home page as 'Access the Catalog'.",
    requiresLogin: false,
    category: "library",
    source: null,
    sources: ["https://www.davidson.edu/library"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "course-catalog",
    name: "College Catalog 2026-2027",
    url: "https://catalog.davidson.edu/index.php?catoid=28",
    description:
      "The official 2026-2027 College Catalog (Acalog / Modern Campus Catalog, catoid=28), which is the default on catalog.davidson.edu. Covers policies, regulations, requirements, academic fields and course descriptions.",
    requiresLogin: false,
    category: "academics",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/registrar/college-catalog"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "course-catalog-course-descriptions",
    name: "Course Descriptions (2026-2027 Catalog)",
    url: "https://catalog.davidson.edu/content.php?catoid=28&navoid=1341",
    description:
      "Paginated, alphabetical list of every course in the 2026-27 catalog, filterable by prefix, code and keyword. The matching Academic Fields page is https://catalog.davidson.edu/content.php?catoid=28&navoid=1340.",
    requiresLogin: false,
    category: "academics",
    source: null,
    sources: ["https://catalog.davidson.edu/index.php?catoid=28"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "course-schedule",
    name: "Course Schedule",
    url: "https://course-schedule.davidson.edu/#/",
    description:
      "The Registrar's public schedule of classes, browsable by department and term (Fall 2025 through Spring 2027 as of 2026-09-30). Columns: course and section, CRN, title, credits, days, time, room, instructor, notes, graduation requirements and seats left. The app's own links (not officially documented) use https://course-schedule.davidson.edu/#/schedule?departments={SUBJECT} and https://course-schedule.davidson.edu/#/print?offset=0&term_code={TERM}, where 202601 is Fall 2026 and 202602 is Spring 2027. Adding &term_code={TERM} to a department link switches the term; without it the current term loads.",
    requiresLogin: false,
    category: "academics",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/registrar/course-offerings"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "registrar",
    name: "Registrar's Office",
    url: "https://www.davidson.edu/offices-and-services/registrar",
    description:
      "Registrar home page, with sections for academic calendars, course registration and WebTree, schedules/grades/add-drop, Degree Works, graduation requirements, transcripts, transfer credit, and record requests and forms. Email registrar@davidson.edu, phone 704-894-2227. Office in Chambers 1197, open Monday-Friday 8:30 a.m.-5 p.m.",
    requiresLogin: false,
    category: "academics",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/registrar"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "graduation-requirements",
    name: "Graduation Requirements",
    url: "https://www.davidson.edu/offices-and-services/registrar/graduation-requirements",
    description:
      "Official graduation requirements: 32 credits, a 2.0 GPA in the major, Ways of Knowing, the Writing (COMP), Language (FRLG), Cultural Diversity (CULT) and Justice, Equality, and Community (JEC) requirements, and the rest listed on the page.",
    requiresLogin: false,
    category: "academics",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/registrar"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "academic-calendar-2026-27",
    name: "Academic Calendar 2026-2027",
    url: "https://www.davidson.edu/offices-and-services/registrar/academic-calendars/2026-2027",
    description:
      "Official 2026-27 academic calendar (updated 3/10/2026). Remaining fall dates: student-adviser conferences Oct. 12-Nov. 3, WebTree Oct. 12-Nov. 3, Thanksgiving break from Nov. 20 (4:20 p.m.) with classes resuming Nov. 30, classes end Dec. 8, final assessments Dec. 10, 11, 14 and 15.",
    requiresLogin: false,
    category: "academics",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/registrar/academic-calendars"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dining-hours",
    name: "Dining Locations & Hours",
    url: "https://www.davidson.edu/offices-and-services/dining/dining-locations-hours",
    description:
      "Today's and this week's hours for Vail Commons, Davis Café, The Commons Market, Chick-fil-A, Wildcat Den and Qdoba, with a link to each location's page.",
    requiresLogin: false,
    category: "dining",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/dining"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dining-menu-vail",
    name: "Vail Commons Menu",
    url: "https://usa.jamix.cloud/menu/?anro=98579&k=2&mt=8",
    description:
      "Daily menu for Vail Commons, the main dining hall, on JAMIX. It opens on today's date; tap 'View menus' to see it. Linked as 'Vail Commons Menu' from the official Vail Commons page.",
    requiresLogin: false,
    category: "dining",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/dining/dining-locations-hours/vail-commons",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dining-menu-davis-cafe",
    name: "Davis Café Menu",
    url: "https://sites.google.com/davidson.edu/restaurant/menus/davis-caf%C3%A9",
    description:
      "Menu for Davis Café (third floor of the Alvarez College Union) on Dining Services' public Google Site.",
    requiresLogin: false,
    category: "dining",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/dining/dining-locations-hours/davis-cafe",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dining-menu-wildcat-den",
    name: "Wildcat Den Menu",
    url: "https://sites.google.com/davidson.edu/restaurant/menus/wildcat-den",
    description:
      "Menu for Wildcat Den (ground level of Baker Sports Complex) on Dining Services' Google Site.",
    requiresLogin: false,
    category: "dining",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/dining/dining-locations-hours/wildcat-den",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dining-menu-qdoba",
    name: "Qdoba Menu",
    url: "https://sites.google.com/davidson.edu/restaurant/menus/qdoba",
    description:
      "Menu for the on-campus Qdoba in the Stowe Tennis House, on Dining Services' Google Site.",
    requiresLogin: false,
    category: "dining",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/dining/dining-locations-hours/qdoba"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "dining-menu-chick-fil-a",
    name: "Chick-fil-A Menu",
    url: "https://sites.google.com/davidson.edu/restaurant/menus/chick-fil-a",
    description:
      "Menu for the on-campus Chick-fil-A at 119 Patterson Court Circle, on Dining Services' Google Site.",
    requiresLogin: false,
    category: "dining",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/dining-services/dining-locations/chick-fil-a",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "catcard",
    name: "CatCard - Manage Your Account",
    url: "https://catcard.davidson.edu/login.php?cid=67&",
    description:
      "Check dining dollars and Flex Dollars, and add money to Flex Dollars. Redirects to Davidson's Microsoft sign-in.",
    requiresLogin: true,
    category: "campus-life",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/catcard-services"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "catcard-services",
    name: "CatCard Services",
    url: "https://www.davidson.edu/offices-and-services/catcard-services",
    description:
      "CatCard office page, covering meal plan sign-up forms, CatCard features (ID, building access, meal plans, library card, printing, Flex Dollars) and lost or stolen cards. Phone 704-894-2951. Knobloch Campus Center, 2nd Floor Atrium, Monday-Friday 8:30 a.m.-4:30 p.m.",
    requiresLogin: false,
    category: "campus-life",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/catcard-services"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "email",
    name: "Davidson Email (Outlook on the web)",
    url: "https://outlook.davidson.edu/",
    description:
      "Davidson email and calendar run on Microsoft Outlook. Davidson uses Google Drive for files but not Gmail for email. outlook.davidson.edu redirects to outlook.office365.com (then /mail/). Sign in with your Davidson email, password and Duo.",
    requiresLogin: true,
    category: "tech",
    source: null,
    sources: [
      "https://support.ti.davidson.edu/hc/en-us/articles/115010656068-Access-Your-Davidson-Email-Online",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "microsoft-365",
    name: "Microsoft 365 (Office 365)",
    url: "https://office365.davidson.edu/",
    description:
      "Web access to Word, Excel, PowerPoint, Outlook, OneDrive, OneNote and Teams with your Davidson account. It redirects to portal.office.com.",
    requiresLogin: true,
    category: "tech",
    source: null,
    sources: [
      "https://support.ti.davidson.edu/hc/en-us/articles/4688462976663-Office-365-Overview",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "ti-support-center",
    name: "T&I Support Center (help desk)",
    url: "https://support.ti.davidson.edu/hc/en-us",
    description:
      "Technology & Innovation knowledge base and help desk. Email ti@davidson.edu or call 704-894-2900. Submit a request at https://support.ti.davidson.edu/hc/en-us/requests/new?ticket_form_id=430608. Drop-in support at T&I Main, 213 N. Main Street, Monday-Friday 8:00 am-5:00 pm (closed 12:30-1:30). For urgent problems after hours, check the status page first; if the issue isn't listed, call 704-894-2900.",
    requiresLogin: false,
    category: "tech",
    source: null,
    sources: [
      "https://www.davidson.edu/offices-and-services/technology-innovation/services/it-professional-services",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "duo-help",
    name: "Duo Multifactor Authentication Help",
    url: "https://support.ti.davidson.edu/hc/en-us/articles/360045091454-Using-Duo-Multifactor-Authentication",
    description:
      "Duo is required for all Davidson single sign-on apps (Office 365, Google Drive/G Suite, Moodle, Zoom and others) and for Banner and off-campus VPN. Covers Duo Push, hardware tokens, lockouts after 10 failed logins, and lost or new phones. For a lost or new phone, call T&I at 704-894-2900.",
    requiresLogin: false,
    category: "tech",
    source: null,
    sources: [
      "https://support.ti.davidson.edu/hc/en-us/articles/360045091454-Using-Duo-Multifactor-Authentication",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "password-reset",
    name: "Password Reset & Account Recovery",
    url: "https://support.ti.davidson.edu/hc/en-us/articles/4424825732631-Password-Reset-and-Account-Recovery",
    description:
      "T&I instructions for resetting a password. If you know your current password, use changepassword.davidson.edu. If you forgot it, use forgotpassword.davidson.edu, which redirects to Microsoft password reset. Passwords need at least 14 characters and cannot be reused.",
    requiresLogin: false,
    category: "tech",
    source: null,
    sources: [
      "https://support.ti.davidson.edu/hc/en-us/articles/4424825732631-Password-Reset-and-Account-Recovery",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "ti-status",
    name: "T&I Service Status",
    url: "https://davidson.statuspage.io/",
    description:
      "'Davidson College Status' page listing reported outages. The T&I home page links it as 'Reported Outages'; it is also at status.ti.davidson.edu.",
    requiresLogin: false,
    category: "tech",
    source: null,
    sources: ["https://www.davidson.edu/offices-and-services/technology-innovation"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "davidsonian",
    name: "The Davidsonian",
    url: "https://thedavidsonian.news/",
    description:
      "Davidson's independent student newspaper, founded April 1, 1914, which prints weekly. The correct domain is thedavidsonian.news. Never link davidsonian.com: it is an unrelated online-casino spam site titled 'New Online Casinos Canada'.",
    requiresLogin: false,
    category: "news",
    source: null,
    sources: ["https://wildcatsync.davidson.edu/organization/the-davidsonian"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "athletics-schedule",
    name: "Davidson Athletics Composite Schedule",
    url: "https://davidsonwildcats.com/calendar",
    description:
      "Official Davidson Wildcats schedule covering all sports, titled 'Composite Schedule - Davidson College Athletics'. davidsonwildcats.com is the site davidson.edu/athletics links as the 'Davidson Wildcats Website'.",
    requiresLogin: false,
    category: "athletics",
    source: "athletics",
    sources: ["https://www.davidson.edu/athletics"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "hurt-hub-events",
    name: "Hurt Hub Events",
    url: "https://hurthub.davidson.edu/events/",
    description:
      "Events calendar for The Hurt Hub at Davidson, the college's innovation and entrepreneurship center.",
    requiresLogin: false,
    category: "events",
    source: null,
    sources: ["https://hurthub.davidson.edu/"],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "events-digest-subscribe",
    name: "Davidson Events Digest (subscribe)",
    url: "https://davidson.us6.list-manage.com/subscribe?u=a06862fb4e666d96846f036ba&id=2ac4133186",
    description:
      "Mailchimp sign-up form for the Davidson Events Digest, a weekly email of upcoming public events at Davidson College.",
    requiresLogin: false,
    category: "events",
    source: null,
    sources: ["https://www.davidson.edu/news-events"],
    verifiedAt: "2026-09-30",
  },
] satisfies z.input<typeof PortalLinkSchema>[];

const HANDSHAKE_RECORD = {
  baseUrl: "https://davidson.joinhandshake.com/",
  jobSearchUrlTemplate: null,
  sources: [
    "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
    "https://www.davidson.edu/offices-and-services/human-resources/student-employment/find-student-job",
  ],
  verifiedAt: "2026-09-30",
} satisfies z.input<typeof HandshakeConfigSchema>;

export const PORTAL_LINKS: readonly PortalLink[] = defineContent(
  "links",
  PortalLinkSchema,
  LINK_RECORDS,
  (link) => link.slug,
);

export const HANDSHAKE: HandshakeConfig = defineContentObject(
  "links:handshake",
  HandshakeConfigSchema,
  HANDSHAKE_RECORD,
);

export const LINKS_VERIFIED_AT: string = latestVerifiedAt([...PORTAL_LINKS, HANDSHAKE]);

const BY_SLUG = new Map(PORTAL_LINKS.map((link) => [link.slug, link]));

export function getLink(slug: string): PortalLink | undefined {
  return BY_SLUG.get(slug);
}

export type PortalLinkCategory = (typeof PORTAL_LINK_CATEGORIES)[number];

/** Links grouped by category, in PORTAL_LINK_CATEGORIES order (empty categories left out). */
export function linksByCategory(): { category: PortalLinkCategory; links: PortalLink[] }[] {
  return PORTAL_LINK_CATEGORIES.map((category) => ({
    category,
    links: PORTAL_LINKS.filter((link) => link.category === category),
  })).filter((group) => group.links.length > 0);
}

/** The curated link that carries a platform tag (for the Sources panel's "Links"). */
export function linkForSource(source: NonNullable<PortalLink["source"]>): PortalLink | undefined {
  return PORTAL_LINKS.find((link) => link.source === source);
}

/**
 * Where a "Search Handshake" button goes. Handshake documents no keyword URL, so this is the Davidson Handshake
 * base URL whatever the keywords (the page shows the career's `handshakeQuery` for the student to type). Once
 * `jobSearchUrlTemplate` is documented and set, its `{query}` is filled with the encoded keywords.
 */
export function handshakeUrl(keywords?: string): string {
  const template = HANDSHAKE.jobSearchUrlTemplate;
  const query = keywords?.trim();
  if (!template || !query) return HANDSHAKE.baseUrl;
  return template.replace("{query}", encodeURIComponent(query));
}
