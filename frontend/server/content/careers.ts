import "server-only";
import type * as z from "zod";
import { CAREER_CLUSTERS, CareerSchema, type Career } from "@/lib/types/content";
import { defineContent } from "@/server/content/define";

/**
 * The 24 career paths (PLAN §3 /careers; unknown slug → notFound()), converted from the verified research in
 * content-prep/careers_part1.json + careers_part2.json (re-verified 2026-09-30).
 * - Course codes and titles match the Davidson course API exactly; no professor names anywhere. Per-term
 *   availability is not stored: the careers pages resolve it live through the catalog (getCourseHistory /
 *   validateCourseCodes), so a course that stops running shows "Not offered" instead of a stale claim.
 * - Departments match the live filters endpoint; related programs match the Acalog widget API (ids and major /
 *   minor / interdisciplinary-minor type from each program's cores).
 * - `pay` is the BLS Occupational Outlook Handbook median (May 2025) and 2025-35 projection, with its own URL.
 * - Every Davidson and external resource URL answered HTTP 200 and says what the entry claims.
 * - SOC 226 (Fall 2025), ECO 329 and ART 348 (Spring 2026) were held back until the course-schedule fixture
 *   subsets carried their sections, which they now do, so the offline CI gate (tests/content.test.ts) confirms them.
 */

const RECORDS = [
  {
    slug: "software-engineering",
    name: "Software Engineering",
    cluster: "Technology",
    summary:
      "Software engineers design, build, test, and maintain the programs and systems that people and organizations rely on. At Davidson, the Computer Science major and minor start with introductory programming and build toward algorithms, computer systems, and team-based software design.",
    whatYouDo: [
      "Analyze what users need, then design and develop software to meet those needs",
      "Plan how the pieces of an application or system will work together",
      "Test and maintain programs so they keep working as expected",
      "Document how a system works for future maintenance and upgrades",
    ],
    departments: [
      {
        code: "CSC",
        name: "Computer Science",
      },
      {
        code: "MAT",
        name: "Mathematics",
      },
    ],
    relatedPrograms: [
      {
        name: "Computer Science",
        acalogId: 172,
        type: "major",
      },
      {
        name: "Computer Science",
        acalogId: 172,
        type: "minor",
      },
      {
        name: "Mathematics",
        acalogId: 188,
        type: "minor",
      },
    ],
    courses: [
      {
        code: "CSC 121",
        title: "Programming & Problem Solving",
        why: "Introduces structured programming, including algorithmic thinking, control structures, functions, recursion, and object-oriented programming.",
      },
      {
        code: "CSC 221",
        title: "Data Structures",
        why: "Studies lists, stacks, queues, search trees, and hash tables and how the choice of data structure affects efficiency; a core course for the CS major and minor.",
      },
      {
        code: "MAT 230",
        title: "Sets and Proofs",
        why: "Develops proof-writing skills through proof techniques and elementary set theory; it counts toward the CS major and minor and, with CSC 221, meets the prerequisite for CSC 321.",
      },
      {
        code: "CSC 250",
        title: "Computer Organization",
        why: "Explains how high-level programs become signals on hardware, covering data representation, digital logic, memory, assembly and machine code, and the C language.",
      },
      {
        code: "CSC 321",
        title: "Analysis of Algorithms",
        why: "Covers greedy, divide-and-conquer, and dynamic programming design strategies, advanced data structures, and the analysis of computational complexity.",
      },
      {
        code: "CSC 312",
        title: "Software Design",
        why: "Covers setting requirements, planning, designing, implementing, and testing software, compares approaches such as Scrum, XP, and waterfall, and centers on a semester-long team project.",
      },
      {
        code: "CSC 351",
        title: "Operating Systems",
        why: "Covers how operating systems manage hardware for applications, including task and memory management and input/output services such as file systems, and students develop crucial parts of a modern operating system; requires CSC 221 and CSC 250.",
      },
      {
        code: "CSC 359",
        title: "Networks & Distributed Systems",
        why: "Studies Internet protocols such as IP, TCP, DNS, and HTTP with an emphasis on the algorithms and design choices behind them.",
      },
    ],
    pay: {
      occupation:
        "Software developers (BLS OOH: Software Developers, Quality Assurance Analysts, and Testers)",
      medianAnnual: 135980,
      period: "May 2025",
      projectedGrowth: "10% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (the Betty and B. Frank Matthews II '49 Center for Career Development) helps students pursue internships, jobs, fellowships, and graduate school, offers one-on-one advising, and runs Handshake, the college's internal job and internship posting system.",
      },
      {
        name: "Student Research in Mathematics and Computer Science",
        url: "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/research",
        description:
          "The Mathematics and Computer Science department's overview of student research (summer projects, research with faculty, independent studies, and honors projects), the internal and external grants that support it, and a link to summer opportunities beyond Davidson.",
      },
      {
        name: "Davidson Research Initiative (DRI)",
        url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
        description:
          "Funds summer research fellowships in any discipline for first-years, sophomores, and juniors working closely with a faculty or staff mentor.",
      },
      {
        name: "Jay Hurt Hub for Innovation and Entrepreneurship",
        url: "https://www.davidson.edu/offices-and-services/jay-hurt-hub-innovation-and-entrepreneurship",
        description:
          "Davidson's innovation and entrepreneurship hub offers courses and workshops, coworking space, a mentor network, and access to capital that supports Davidson students and recent alumni developing their ideas.",
      },
    ],
    externalResources: [
      {
        name: "IEEE Computer Society",
        url: "https://www.computer.org/",
        description:
          "A professional society for computing professionals that publishes research, runs conferences, and offers professional certifications.",
      },
      {
        name: "NSF Research Experiences for Undergraduates (REU)",
        url: "https://www.nsf.gov/funding/initiatives/reu",
        description:
          "U.S. National Science Foundation program where undergraduates apply directly to funded summer research sites, including computing sites; participants receive stipends.",
      },
    ],
    handshakeQuery: "software engineer",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page-size=100",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/172",
      "https://catalog.davidson.edu/widget-api/catalog/4/courses?page-size=100",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/188",
      "https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/research",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
      "https://www.davidson.edu/offices-and-services/jay-hurt-hub-innovation-and-entrepreneurship",
      "https://www.computer.org/",
      "https://www.nsf.gov/funding/initiatives/reu",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "data-science",
    name: "Data Science & Analytics",
    cluster: "Technology",
    summary:
      "Data scientists and analysts collect, organize, and analyze data, then use statistics, programming, and visualization to answer questions and inform decisions. At Davidson, the Data Science interdisciplinary minor combines a statistics course and a programming course with electives drawn from several departments.",
    whatYouDo: [
      "Decide which data are available and useful for a project",
      "Collect, categorize, and analyze data",
      "Create, validate, test, and update algorithms and models",
      "Present findings with data visualization and make recommendations to stakeholders",
    ],
    departments: [
      {
        code: "DAT",
        name: "Data Science",
      },
      {
        code: "CSC",
        name: "Computer Science",
      },
      {
        code: "MAT",
        name: "Mathematics",
      },
    ],
    relatedPrograms: [
      {
        name: "Data Science",
        acalogId: 212,
        type: "interdisciplinary-minor",
      },
      {
        name: "Computer Science",
        acalogId: 172,
        type: "major",
      },
      {
        name: "Mathematics",
        acalogId: 188,
        type: "major",
      },
      {
        name: "Applied Mathematics",
        acalogId: 163,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "CSC 110",
        title: "Data Science & Society",
        why: "Introduces programming, data visualization, and statistical analysis in R, with students collecting and presenting data on issues of social and economic justice.",
      },
      {
        code: "CSC 121",
        title: "Programming & Problem Solving",
        why: "Introductory programming course (algorithmic thinking, functions, recursion, object-oriented programming) that satisfies a requirement in the Data Science interdisciplinary minor.",
      },
      {
        code: "MAT 104",
        title: "Introduction to Statistics",
        why: "Introduces how to collect and analyze data and draw conclusions under uncertainty, and satisfies a Data Science minor requirement.",
      },
      {
        code: "DAT 153",
        title: "Database Programming",
        why: "Teaches SQL for exploring, creating, and analyzing relational databases and database design principles, and introduces APIs, ETL processes, and business intelligence systems.",
      },
      {
        code: "DAT 205",
        title: "Statistical Linear Models",
        why: "Applied statistics course on fitting and diagnosing linear models, generalized linear models, ANOVA, and mixed models, ending in a real-data project.",
      },
      {
        code: "CSC 362",
        title: "Data Visualization",
        why: "Covers the theory and design of graphical representations of data, including human visual perception, color map design, and interaction.",
      },
      {
        code: "DAT 342",
        title: "Data Engineering and Analytics",
        why: "Covers building the infrastructure behind the modern data stack, including pipelines, warehouses, and lakehouses that extract, transform, and load data at scale; requires CSC 221 and DAT 153 or CSC 353.",
      },
      {
        code: "CSC 374",
        title: "Deep Learning",
        why: "Covers training neural networks with stochastic gradient descent and implementing architectures from scratch and with deep learning libraries; requires CSC 221 and MAT 150.",
      },
    ],
    pay: {
      occupation: "Data scientists",
      medianAnnual: 120230,
      period: "May 2025",
      projectedGrowth: "35% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/math/data-scientists.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (the Betty and B. Frank Matthews II '49 Center for Career Development) helps students pursue internships, jobs, fellowships, and graduate school, offers one-on-one advising, and runs Handshake, the college's internal job and internship posting system.",
      },
      {
        name: "Technical Skill-Building Partnerships (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
        description:
          "Matthews Center partnerships that build technical skills for careers in business, finance, and tech, including the Matthews Center-funded AESOP Academy & Advisory program for Excel and SQL upskilling.",
      },
      {
        name: "Davidson Research Initiative (DRI)",
        url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
        description:
          "Funds summer research fellowships in any discipline for first-years, sophomores, and juniors working closely with a faculty or staff mentor.",
      },
      {
        name: "Student Research in Mathematics and Computer Science",
        url: "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/research",
        description:
          "The Mathematics and Computer Science department's overview of student research (summer projects, research with faculty, independent studies, and honors projects), the internal and external grants that support it, and a link to summer opportunities beyond Davidson.",
      },
    ],
    externalResources: [
      {
        name: "American Statistical Association: Your Career",
        url: "https://www.amstat.org/your-career",
        description:
          "The ASA's career page, covering its Data Science Professional certification, professional development courses, fellowships and grants, salary information, and the ASA Career Connect job board.",
      },
      {
        name: "NSF Research Experiences for Undergraduates (REU)",
        url: "https://www.nsf.gov/funding/initiatives/reu",
        description:
          "U.S. National Science Foundation program where undergraduates apply directly to funded summer research sites; participants receive stipends.",
      },
    ],
    handshakeQuery: "data science",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page-size=100",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/212",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/172",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/188",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/163",
      "https://catalog.davidson.edu/widget-api/catalog/4/courses?page-size=100",
      "https://www.bls.gov/ooh/math/data-scientists.htm",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
      "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/research",
      "https://www.amstat.org/your-career",
      "https://www.nsf.gov/funding/initiatives/reu",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "investment-banking",
    name: "Investment Banking",
    cluster: "Business & Finance",
    summary:
      "Investment bankers help businesses raise money from investors and advise them on transactions such as mergers, acquisitions, and initial public offerings. At Davidson, relevant preparation includes Economics courses in accounting, finance, and financial markets, and the Matthews Center hosts the Davidson on Wall Street career trek and partners with Wells Fargo on Training the Street finance workshops.",
    whatYouDo: [
      "Connect businesses that need money with investors interested in providing that funding",
      "Advise clients on initial public offerings (IPOs) and mergers and acquisitions",
      "Estimate how much a company is worth before it goes public",
      "Make sure deals meet legal requirements and advise throughout the process so transactions go smoothly",
    ],
    departments: [
      {
        code: "ECO",
        name: "Economics",
      },
    ],
    relatedPrograms: [
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Philosophy, Politics, and Economics",
        acalogId: 214,
        type: "major",
      },
      {
        name: "Applied Mathematics",
        acalogId: 163,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers both microeconomics and macroeconomics, serves as a foundation for further work in economics, and is the prerequisite for ECO 204, ECO 238, and ECO 266.",
      },
      {
        code: "ECO 211",
        title: "Introduction to Accounting",
        why: "Covers valuation of assets, corporation accounts and statements, and the interpretation and analysis of financial statements.",
      },
      {
        code: "ECO 212",
        title: "Intermediate Accounting",
        why: "Works through complex problems in financial accounting with emphasis on theory and the analysis of accounting data; requires ECO 211.",
      },
      {
        code: "ECO 214",
        title: "Introduction to Finance",
        why: "Introduces financial analysis, the time value of money, capital budgeting, and capital structure; requires ECO 211.",
      },
      {
        code: "ECO 204",
        title: "Stats & Basic Econometrics",
        why: "Applies probability and statistics, including hypothesis tests and regression, to economic analysis using spreadsheet software.",
      },
      {
        code: "ECO 238",
        title: "Fin. Mkts, Inst & Policy",
        why: "Examines interest rates, bond and stock markets, market efficiency, financial regulation, and the Federal Reserve.",
      },
      {
        code: "ECO 266",
        title: "Fnce of Buyouts & Acquisitions",
        why: "Studies how firms are bought, sold, restructured, and governed, and builds skills in modeling value, risk, and incentives.",
      },
      {
        code: "ECO 228",
        title: "Financial Economics",
        why: "Covers asset pricing, investment decisions, mergers and acquisitions, and the roles of intermediaries such as investment banks and asset managers.",
      },
    ],
    pay: {
      occupation:
        "Securities, commodities, and financial services sales agents (the OOH page describes investment bankers within this occupation)",
      medianAnnual: 78660,
      period: "May 2025",
      projectedGrowth: "1% (2025-35), slower than average",
      url: "https://www.bls.gov/ooh/sales/securities-commodities-and-financial-services-sales-agents.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (the Betty and B. Frank Matthews II '49 Center for Career Development) helps students pursue internships, jobs, fellowships, and graduate school, offers one-on-one advising, and runs Handshake, the college's internal job and internship posting system.",
      },
      {
        name: "Career Treks: Davidson on Wall Street",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming",
        description:
          "Matthews Center career treks let students explore career paths in cities across the country through seminars, workshops, and networking; the center hosts Davidson on Wall Street and two additional city visits each year.",
      },
      {
        name: "Technical Skill-Building Partnerships (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
        description:
          "Partner programs for finance and business skills, including Training the Street with Wells Fargo (financial statement analysis, valuation, Excel modeling, technical interview prep) and the Tuck Business Bridge Program.",
      },
      {
        name: "Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
        description:
          "Matthews Center grants for unpaid or low-paying summer internships; the Boswell Family Experiential Learning Grant names investment banking among its eligible fields.",
      },
    ],
    externalResources: [
      {
        name: "FINRA Securities Industry Essentials (SIE) Exam",
        url: "https://www.finra.org/registration-exams-ce/qualification-exams/securities-industry-essentials-exam",
        description:
          "FINRA's introductory securities-industry exam; it is open to anyone 18 or older, including students, and association with a firm is not required to take it.",
      },
      {
        name: "FINRA Series 79 Investment Banking Representative Exam",
        url: "https://www.finra.org/registration-exams-ce/qualification-exams/series79",
        description:
          "The qualification exam that, together with the SIE, is required for the Investment Banking Representative registration; candidates must be sponsored by a FINRA member firm to take it.",
      },
    ],
    handshakeQuery: "investment banking",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page-size=100",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/214",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/163",
      "https://catalog.davidson.edu/widget-api/catalog/4/courses?page-size=100",
      "https://www.bls.gov/ooh/sales/securities-commodities-and-financial-services-sales-agents.htm",
      "https://www.bls.gov/ooh/business-and-financial/financial-analysts.htm",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.davidson.edu/academic-departments/philosophy-politics-and-economics/internships-careers-and-graduate-school",
      "https://www.finra.org/registration-exams-ce/qualification-exams/securities-industry-essentials-exam",
      "https://www.finra.org/registration-exams-ce/qualification-exams/series79",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "management-consulting",
    name: "Management Consulting",
    cluster: "Business & Finance",
    summary:
      "Management consultants, also called management analysts, help organizations solve business problems and find ways to run more efficiently. They gather information, analyze data, and present recommendations to managers through reports and presentations.",
    whatYouDo: [
      "Gather and organize information about a client's problem",
      "Interview staff and observe how work gets done",
      "Analyze financial and operational data to develop solutions",
      "Present recommendations to managers in reports and presentations",
    ],
    departments: [
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
      {
        code: "DAT",
        name: "Data Science",
      },
    ],
    relatedPrograms: [
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Philosophy, Politics, and Economics",
        acalogId: 214,
        type: "major",
      },
      {
        name: "Data Science",
        acalogId: 212,
        type: "interdisciplinary-minor",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "minor",
      },
    ],
    courses: [
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers both microeconomics and macroeconomics and is the foundation for further economics courses.",
      },
      {
        code: "ECO 202",
        title: "Intermed Microeconomic Theory",
        why: "Analyzes how individual economic units behave, including cost analysis, market structure, and game theory.",
      },
      {
        code: "ECO 204",
        title: "Stats & Basic Econometrics",
        why: "Applies probability, hypothesis testing, and regression to economic questions using spreadsheet software, with a research paper as a major component.",
      },
      {
        code: "ECO 211",
        title: "Introduction to Accounting",
        why: "Covers asset valuation, corporation accounts and statements, and the interpretation and analysis of financial statements.",
      },
      {
        code: "ECO 214",
        title: "Introduction to Finance",
        why: "Introduces financial analysis, the time value of money, capital budgeting, and capital structure (requires ECO 211).",
      },
      {
        code: "COM 101",
        title: "Princ of Oral Communication",
        why: "Builds effective oral communication through individual presentations informed by classical and contemporary principles.",
      },
      {
        code: "COM 230",
        title: "Organizational Communication",
        why: "Studies how communication creates and sustains organizations, including leadership, workplace collaboration, and crisis communication.",
      },
      {
        code: "DAT 153",
        title: "Database Programming",
        why: "Teaches SQL for exploring and analyzing databases and introduces ETL processes and business intelligence systems.",
      },
    ],
    pay: {
      occupation: "Management Analysts",
      medianAnnual: 101860,
      period: "May 2025",
      projectedGrowth: "10% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/business-and-financial/management-analysts.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (officially the Betty and B. Frank Matthews II '49 Center for Career Development), offering career planning, key programs, employer engagement, and Handshake, its job and internship posting system.",
      },
      {
        name: "Davidson College Consulting Group (The Jay Hurt Hub for Innovation and Entrepreneurship)",
        url: "https://hurthub.davidson.edu/become-a-student-consultant/",
        description:
          "Paid student-consultant program based in the Hurt Hub; small teams do project work for startups and small businesses, such as market research, marketing strategy, and data analysis.",
      },
      {
        name: "Technical Skill-Building Partnerships (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
        description:
          "Matthews Center partner programs, including the Vanderbilt University Accelerator Summer Business Immersion (described as suited to business and consulting careers) and AESOP Academy training in Excel, SQL, and project management.",
      },
      {
        name: "Speaking Center (John Crosland Jr. Center for Teaching and Learning)",
        url: "https://www.davidson.edu/offices-and-services/center-teaching-and-learning/student-resources/speaking-center",
        description:
          "Communication Consultants support speaking across the curriculum, from selecting a topic to delivering a speech, for in-person and virtual settings.",
      },
    ],
    externalResources: [
      {
        name: "O*NET OnLine: Management Analysts (13-1111.00)",
        url: "https://www.onetonline.org/link/summary/13-1111.00",
        description:
          "U.S. Department of Labor-sponsored occupation profile listing tasks, skills, and reported job titles such as Management Consultant.",
      },
    ],
    handshakeQuery: "consulting",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/214",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/212",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/171",
      "https://www.bls.gov/ooh/business-and-financial/management-analysts.htm",
      "https://www.onetonline.org/link/summary/13-1111.00",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/student-career-planning-roadmap",
      "https://hurthub.davidson.edu/become-a-student-consultant/",
      "https://hurthub.davidson.edu/students/",
      "https://www.davidson.edu/offices-and-services/jay-hurt-hub-innovation-and-entrepreneurship",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
      "https://www.davidson.edu/offices-and-services/center-teaching-and-learning/student-resources/speaking-center",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "product-management",
    name: "Product Management",
    cluster: "Technology",
    summary:
      "Product managers help decide what a product should do and how it reaches customers, working with product development, design, marketing, and sales staff. The role mixes market research, analysis of costs and expected returns, and coordination across teams.",
    whatYouDo: [
      "Start market research studies and analyze their findings",
      "Consult with product development staff on product specifications and design",
      "Evaluate the budgets and expected return on investment of product development",
      "Coordinate promotional activities with developers, advertisers, and production managers",
    ],
    departments: [
      {
        code: "CSC",
        name: "Computer Science",
      },
      {
        code: "FMD",
        name: "Film, Media, and Digital Studies",
      },
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Computer Science",
        acalogId: 172,
        type: "major",
      },
      {
        name: "Computer Science",
        acalogId: 172,
        type: "minor",
      },
      {
        name: "Digital Studies",
        acalogId: 211,
        type: "interdisciplinary-minor",
      },
      {
        name: "Data Science",
        acalogId: 212,
        type: "interdisciplinary-minor",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
    ],
    courses: [
      {
        code: "CSC 121",
        title: "Programming & Problem Solving",
        why: "Introductory programming course covering algorithmic thinking, functions, essential data structures, and object-oriented programming.",
      },
      {
        code: "CSC 110",
        title: "Data Science & Society",
        why: "Introduces programming, data visualization, and statistical analysis in R, using data on issues of social and economic justice.",
      },
      {
        code: "CSC 221",
        title: "Data Structures",
        why: "Core course on abstract data types, data structures, and efficient sorting and searching; it is the prerequisite for CSC 312.",
      },
      {
        code: "CSC 312",
        title: "Software Design",
        why: "Covers setting requirements, planning, designing, implementing, and testing software, including Scrum and waterfall, through a semester-long team project.",
      },
      {
        code: "CSC 363",
        title: "Human Computer Interaction",
        why: "Surveys the design, implementation, and evaluation of interactive systems from a human-centered perspective (requires CSC 221 or DIG 245).",
      },
      {
        code: "DIG 245",
        title: "Critical Web Design",
        why: "Students conceptualize, design, and program responsive websites, covering usability, HTML, CSS, and JavaScript.",
      },
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers both microeconomics and macroeconomics and is the foundation for further economics courses.",
      },
      {
        code: "COM 203",
        title: "Communication Research Methods",
        why: "Introduces quantitative and qualitative research methods and ends with students developing their own research proposal.",
      },
    ],
    pay: {
      occupation: "Advertising, Promotions, and Marketing Managers",
      medianAnnual: 165780,
      period: "May 2025",
      projectedGrowth: "6% (2025-35), faster than average",
      url: "https://www.bls.gov/ooh/management/advertising-promotions-and-marketing-managers.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (officially the Betty and B. Frank Matthews II '49 Center for Career Development), offering career planning, key programs, employer engagement, and Handshake, its job and internship posting system.",
      },
      {
        name: "The Jay Hurt Hub for Innovation and Entrepreneurship: student programs",
        url: "https://hurthub.davidson.edu/students/",
        description:
          "Design Thinking Workshops (empathize, define, ideate, prototype, test), the 7-session Building a Lean Startup course, and Hack@Davidson.",
      },
      {
        name: "Davidson College Consulting Group (The Jay Hurt Hub for Innovation and Entrepreneurship)",
        url: "https://hurthub.davidson.edu/become-a-student-consultant/",
        description:
          "Paid student-consultant teams that support startups and small businesses with market research, digital development (including usability improvements and custom tools), and data analysis.",
      },
      {
        name: "Technical Skill-Building Partnerships (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
        description:
          "Matthews Center partner programs, including AESOP Academy training in Excel, SQL, and project management for students heading into business and tech.",
      },
    ],
    externalResources: [
      {
        name: "O*NET OnLine: Marketing Managers (11-2021.00)",
        url: "https://www.onetonline.org/link/summary/11-2021.00",
        description:
          "U.S. Department of Labor-sponsored occupation profile; lists Product Manager among reported job titles, with tasks and skills.",
      },
    ],
    handshakeQuery: "product manager",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/172",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/211",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/212",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/213",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://www.bls.gov/ooh/management/advertising-promotions-and-marketing-managers.htm",
      "https://www.onetonline.org/link/summary/11-2021.00",
      "https://www.onetonline.org/link/details/11-2021.00",
      "https://www.onetonline.org/find/quick?s=product+manager",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://hurthub.davidson.edu/students/",
      "https://hurthub.davidson.edu/become-a-student-consultant/",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "medicine",
    name: "Medicine",
    cluster: "Health",
    summary:
      "Physicians diagnose and treat illness and injury and help patients take care of their health. The path typically involves a bachelor's degree, four years of medical school, and a residency of 3 to 9 years depending on the specialty.",
    whatYouDo: [
      "Take medical histories, examine patients, and order tests",
      "Review test results and recommend a treatment plan",
      "Document findings and treatments in patient charts",
      "Answer patients' questions and advise them on staying healthy",
    ],
    departments: [
      {
        code: "BIO",
        name: "Biology",
      },
      {
        code: "CHE",
        name: "Chemistry",
      },
      {
        code: "PHY",
        name: "Physics",
      },
      {
        code: "PSY",
        name: "Psychology",
      },
      {
        code: "PBH",
        name: "Public Health",
      },
    ],
    relatedPrograms: [
      {
        name: "Biology",
        acalogId: 166,
        type: "major",
      },
      {
        name: "Chemistry",
        acalogId: 168,
        type: "major",
      },
      {
        name: "Neuroscience",
        acalogId: 192,
        type: "interdisciplinary-minor",
      },
      {
        name: "Public Health",
        acalogId: 189,
        type: "major",
      },
      {
        name: "Public Health",
        acalogId: 189,
        type: "interdisciplinary-minor",
      },
      {
        name: "Psychology",
        acalogId: 197,
        type: "major",
      },
    ],
    courses: [
      {
        code: "BIO 115",
        title: "Molecules, Genes, & Cells +Lab",
        why: "Introductory biology with lab on life at the molecular, genetic, and cellular levels; it can be taken before or after BIO 116.",
      },
      {
        code: "BIO 116",
        title: "Evolution,Physiol,Ecology +Lab",
        why: "Introductory biology with lab covering evolution, physiology, and ecological interactions.",
      },
      {
        code: "CHE 115",
        title: "Principles of Chemistry +Lab",
        why: "Covers stoichiometry, chemical thermodynamics, atomic and molecular structure, and chemical equilibria, and is intended for students who plan to take more chemistry.",
      },
      {
        code: "CHE 250",
        title: "Intro to Organic Chem +Lab",
        why: "Introduces the structure, properties, and reactions of organic and bioorganic molecules (requires CHE 115).",
      },
      {
        code: "CHE 230",
        title: "Intro to Biological Chem +Lab",
        why: "Covers proteins, nucleic acids, enzymes, and metabolic pathways (requires CHE 115 and CHE 250).",
      },
      {
        code: "PHY 125",
        title: "Gen Physics +Calc I:Studio+Lab",
        why: "Studio physics with lab on mechanics, fluids, waves, and thermodynamics, designed in part for students planning a degree in medicine.",
      },
      {
        code: "PSY 101",
        title: "General Psychology",
        why: "Surveys learning, perception, motivation, thinking, and social and abnormal behavior, including the biological bases of behavior.",
      },
      {
        code: "BIO 310",
        title: "Human Physiology",
        why: "Upper-level study of human physiology from the molecular to the systemic level, covering the nervous, cardiovascular, respiratory, renal, endocrine, and other systems (requires BIO 115, BIO 116, and CHE 115).",
      },
    ],
    pay: {
      occupation: "Physicians and Surgeons",
      medianAnnual: 275930,
      period: "May 2025",
      projectedGrowth: "4% (2025-35), as fast as average",
      url: "https://www.bls.gov/ooh/healthcare/physicians-and-surgeons.htm",
    },
    davidsonResources: [
      {
        name: "Premedicine and Allied Health Professions",
        url: "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions",
        description:
          "Davidson's pre-health advising program for medicine and other health professions; students attend a fall director's meeting and a small group meeting, then meet individually with the program's advisors to plan a course of study.",
      },
      {
        name: "Premedical/Prehealth Advisory Committee (PAC)",
        url: "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions/premedicalprehealth-advisory-committee",
        description:
          "Committee evaluation, sent with letters of evaluation to medical and other health professions schools, that students can apply for during junior or senior year.",
      },
      {
        name: "Internships, Research & Co-Curricular Experiences (Premedicine and Allied Health Professions)",
        url: "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions/internships-research-co-curricular-experiences",
        description:
          "Clinical-experience courses for credit (XPL 199 and BIO 370/371), shadowing guidance, and links to research opportunities.",
      },
      {
        name: "Summer Internship Grants (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants for students in unpaid or low-paying summer internships, applied for through Handshake.",
      },
    ],
    externalResources: [
      {
        name: "AAMC: Take the MCAT Exam",
        url: "https://students-residents.aamc.org/taking-mcat-exam/take-mcat-exam",
        description:
          "Association of American Medical Colleges page on the Medical College Admission Test, which covers natural and social sciences concepts and scientific problem-solving.",
      },
      {
        name: "AACOM: Become an Osteopathic Medical Doctor",
        url: "https://www.aacom.org/become-a-doctor",
        description:
          "American Association of Colleges of Osteopathic Medicine guide to osteopathic (DO) medical education, including its Choose DO Explorer school database.",
      },
    ],
    handshakeQuery: "clinical research",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/166",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/168",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/192",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/189",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/197",
      "https://www.bls.gov/ooh/healthcare/physicians-and-surgeons.htm",
      "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions",
      "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions/plan-study/requirements-and-courses",
      "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions/premedicalprehealth-advisory-committee",
      "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions/internships-research-co-curricular-experiences",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://students-residents.aamc.org/taking-mcat-exam/take-mcat-exam",
      "https://www.aacom.org/become-a-doctor",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "law",
    name: "Law",
    cluster: "Law & Government",
    summary:
      "Lawyers advise and represent clients on legal proceedings or transactions, from civil and criminal cases to contracts and wills. Lawyers typically need a law degree and a state license, which usually requires passing a bar exam, and most law schools do not require a specific bachelor's degree for entry.",
    whatYouDo: [
      "Advise and represent clients in civil or criminal proceedings",
      "Research and analyze legal issues",
      "Interpret laws, rulings, and regulations for people and businesses",
      "Prepare and file legal documents such as lawsuits, contracts, and wills",
    ],
    departments: [
      {
        code: "POL",
        name: "Political Science",
      },
      {
        code: "PHI",
        name: "Philosophy",
      },
      {
        code: "HIS",
        name: "History",
      },
      {
        code: "ENG",
        name: "English",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Political Science",
        acalogId: 196,
        type: "major",
      },
      {
        name: "Philosophy",
        acalogId: 193,
        type: "major",
      },
      {
        name: "Philosophy",
        acalogId: 193,
        type: "minor",
      },
      {
        name: "Philosophy, Politics, and Economics",
        acalogId: 214,
        type: "major",
      },
      {
        name: "History",
        acalogId: 183,
        type: "major",
      },
      {
        name: "History",
        acalogId: 183,
        type: "minor",
      },
      {
        name: "English",
        acalogId: 176,
        type: "major",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "major",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "minor",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
    ],
    courses: [
      {
        code: "POL 121",
        title: "American Politics",
        why: "Introduces American political processes, institutions, and problems (juniors may enroll only after drop-add; seniors need instructor permission).",
      },
      {
        code: "PHI 102",
        title: "Reason and Argument",
        why: "Introduces reasoning: how to evaluate arguments, spot fallacies, and follow the rules of rational discourse.",
      },
      {
        code: "COM 101",
        title: "Princ of Oral Communication",
        why: "Builds public speaking skills through individual presentations based on classical and contemporary principles of oral communication.",
      },
      {
        code: "POL 227",
        title: "Law, Politics & Society",
        why: "Surveys connections among law, politics, and society, including racial inequality in sentencing, changing interpretations of rights and liberties, and civil procedure.",
      },
      {
        code: "POL 324",
        title: "American Judicial Politics",
        why: "Examines how judges, litigants, attorneys, and interest groups use the courts, and how court decisions shape public policy.",
      },
      {
        code: "POL 327",
        title: "Civil Liberties",
        why: "Analyzes the Constitution's civil-liberties guarantees, with a focus on the Bill of Rights and the 14th Amendment.",
      },
      {
        code: "HIS 355",
        title: "American Legal History",
        why: "Traces law in American history from English settlement to the present, including the legal profession, the regulatory state, and civil rights.",
      },
      {
        code: "ENG 353",
        title: "Shakespeare and the Law",
        why: "Reads Shakespeare alongside court opinions to introduce topics such as contracts, torts, evidence, and criminal law; the description says it will interest prelaw students (first-years need instructor permission).",
      },
    ],
    pay: {
      occupation: "Lawyers",
      medianAnnual: 159670,
      period: "May 2025",
      projectedGrowth: "5% (2025-35), faster than average",
      url: "https://www.bls.gov/ooh/legal/lawyers.htm",
    },
    davidsonResources: [
      {
        name: "Prelaw",
        url: "https://www.davidson.edu/academic-departments/prelaw",
        description:
          "Davidson's prelaw advising and programming, open to students in every major, including law school admission panels, alumni connections, law firm recruiting events, and help with resumes and personal statements.",
      },
      {
        name: "Law School Resources (Prelaw)",
        url: "https://www.davidson.edu/academic-departments/prelaw/law-school-resources",
        description:
          "Guides to choosing and paying for law schools, plus Matthews Center grant funding that students can put toward law school application fees and LSAT preparation.",
      },
      {
        name: "Greater Charlotte Law School Fair",
        url: "https://www.davidson.edu/academic-departments/prelaw/law-school-fair",
        description:
          "A law school admissions fair the Matthews Center hosts on campus each fall, where students and alumni meet representatives from law schools across the country.",
      },
      {
        name: "Prelaw Student Organizations",
        url: "https://www.davidson.edu/academic-departments/prelaw/student-organizations",
        description:
          "Law-related student groups: the Mock Trial Association (competes regionally and nationally), the Prelaw Society (law firm and law school visits, campus speakers), and Moot Court (simulated appellate cases).",
      },
    ],
    externalResources: [
      {
        name: "LSAC: The LSAT",
        url: "https://www.lsac.org/lsat",
        description:
          "The Law School Admission Council's official page on the Law School Admission Test, including test dates and its App OnTrack application-planning tool.",
      },
      {
        name: "O*NET OnLine: Lawyers (23-1011.00)",
        url: "https://www.onetonline.org/link/summary/23-1011.00",
        description:
          "U.S. Department of Labor-sponsored occupation profile listing lawyers' tasks and skills, with reported job titles such as attorney, counsel, and prosecutor.",
      },
    ],
    handshakeQuery: "legal",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/196",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/193",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/214",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/183",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/176",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/171",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://www.bls.gov/ooh/legal/lawyers.htm",
      "https://www.davidson.edu/academic-departments/prelaw",
      "https://www.davidson.edu/academic-departments/prelaw/law-school-resources",
      "https://www.davidson.edu/academic-departments/prelaw/law-school-resources/lsat-preparation",
      "https://www.davidson.edu/academic-departments/prelaw/law-school-fair",
      "https://www.davidson.edu/academic-departments/prelaw/student-organizations",
      "https://www.lsac.org/lsat",
      "https://www.onetonline.org/link/summary/23-1011.00",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "marketing",
    name: "Marketing",
    cluster: "Business & Finance",
    summary:
      "Marketing professionals study consumer preferences, competitors, and business conditions to help organizations understand what products people want, who will buy them, and at what price. Entry-level roles such as market research analyst typically require a bachelor's degree, often in business, communications, or a social science.",
    whatYouDo: [
      "Gather data on consumers, competitors, and market conditions",
      "Measure how well marketing programs and strategies work",
      "Monitor and forecast marketing and sales trends",
      "Turn findings into reports and presentations for clients and managers",
    ],
    departments: [
      {
        code: "COM",
        name: "Communication Studies",
      },
      {
        code: "PSY",
        name: "Psychology",
      },
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "ART",
        name: "Art",
      },
    ],
    relatedPrograms: [
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "major",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "minor",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Psychology",
        acalogId: 197,
        type: "major",
      },
      {
        name: "Art",
        acalogId: 165,
        type: "major",
      },
      {
        name: "Art",
        acalogId: 165,
        type: "minor",
      },
      {
        name: "Film, Media, and Digital Studies",
        acalogId: 213,
        type: "major",
      },
      {
        name: "Digital Studies",
        acalogId: 211,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers both microeconomics and macroeconomics and is the foundation for further economics courses.",
      },
      {
        code: "PSY 101",
        title: "General Psychology",
        why: "Surveys learning, perception, motivation, thinking, and social behavior with an emphasis on scientific methods, and is the listed prerequisite for PSY 232 Social Psychology.",
      },
      {
        code: "COM 101",
        title: "Princ of Oral Communication",
        why: "Builds public speaking skills through individual presentations based on classical and contemporary principles of oral communication.",
      },
      {
        code: "PSY 232",
        title: "Social Psychology",
        why: "Covers how social and situational factors shape thoughts, attitudes, and behavior, including attitude change and persuasion (requires PSY 101).",
      },
      {
        code: "COM 203",
        title: "Communication Research Methods",
        why: "Introduces quantitative and qualitative methods for researching communication problems, ending with students' own research proposals.",
      },
      {
        code: "COM 328",
        title: "Social Media Communication",
        why: "Examines how social media platforms work and how they affect culture, media, politics, and business; intended for Communication Studies majors or minors who have taken a COM elective.",
      },
      {
        code: "ART 111",
        title: "Introduction to Digital Art",
        why: "Uses Adobe Illustrator, Photoshop, Premiere, and After Effects to create 2D and 4D digital art.",
      },
      {
        code: "ECO 204",
        title: "Stats & Basic Econometrics",
        why: "Applies probability and statistics, including hypothesis tests and regression, to economic data using spreadsheet software (requires ECO 101).",
      },
    ],
    pay: {
      occupation: "Market Research Analysts",
      medianAnnual: 78760,
      period: "May 2025",
      projectedGrowth: "7% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/business-and-financial/market-research-analysts.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (officially the Betty and B. Frank Matthews II '49 Center for Career Development) helps students find jobs, internships, fellowships, and graduate programs, and runs Handshake, the college's job and internship posting system.",
      },
      {
        name: "Davidson College Consulting Group (The Jay Hurt Hub for Innovation and Entrepreneurship)",
        url: "https://hurthub.davidson.edu/become-a-student-consultant/",
        description:
          "A paid student-consultant program based in the Hurt Hub; small teams work on projects for startups and small businesses, including business and market research, marketing strategy, content strategy, and copywriting.",
      },
      {
        name: "Communication Studies: Careers, Internships and Graduate School",
        url: "https://www.davidson.edu/academic-departments/communication-studies/careers-internships-and-graduate-school",
        description:
          "The department's page with examples of graduates' jobs (including an analytical consultant at an advertising firm and a market and audience analyst at a marketing firm) and students' internships.",
      },
      {
        name: "Summer Internship Grants (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants toward living costs for students in unpaid or low-paying summer internships; students submit one common application through Handshake.",
      },
    ],
    externalResources: [
      {
        name: "American Marketing Association: Collegiate Hub",
        url: "https://www.ama.org/collegiate-hub/",
        description:
          "The AMA's resources for college students: collegiate chapters, competitions, a Collegiate Career Week, and the International Collegiate Conference.",
      },
      {
        name: "O*NET OnLine: Market Research Analysts and Marketing Specialists (13-1161.00)",
        url: "https://www.onetonline.org/link/summary/13-1161.00",
        description:
          "U.S. Department of Labor-sponsored occupation profile with tasks, skills, and reported job titles such as content strategist, market analyst, and communications specialist.",
      },
    ],
    handshakeQuery: "marketing",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/171",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/197",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/165",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/213",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/211",
      "https://www.bls.gov/ooh/business-and-financial/market-research-analysts.htm",
      "https://www.bls.gov/ooh/management/advertising-promotions-and-marketing-managers.htm",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://hurthub.davidson.edu/become-a-student-consultant/",
      "https://www.davidson.edu/academic-departments/communication-studies/careers-internships-and-graduate-school",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.ama.org/collegiate-hub/",
      "https://www.onetonline.org/link/summary/13-1161.00",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "research-academia",
    name: "Research & Academia",
    cluster: "Research & Education",
    summary:
      "Researchers and professors investigate open questions in their field and share what they find through teaching and publishing. Faculty at 4-year colleges and universities typically need a Ph.D. or other doctorate in their field, and full-time professors are often expected to spend much of their time on original research.",
    whatYouDo: [
      "Conduct original research and publish the findings",
      "Plan and teach courses, and grade student work",
      "Advise students on courses and goals",
      "Serve on academic and administrative committees",
    ],
    departments: [
      {
        code: "WRI",
        name: "Writing Program",
      },
      {
        code: "POL",
        name: "Political Science",
      },
      {
        code: "PSY",
        name: "Psychology",
      },
      {
        code: "BIO",
        name: "Biology",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
      {
        code: "SOC",
        name: "Sociology",
      },
      {
        code: "LAS",
        name: "Latin American, Latinx, and Caribbean Studies",
      },
      {
        code: "ANT",
        name: "Anthropology",
      },
    ],
    relatedPrograms: [
      {
        name: "Psychology",
        acalogId: 197,
        type: "major",
      },
      {
        name: "Sociology",
        acalogId: 201,
        type: "major",
      },
      {
        name: "Political Science",
        acalogId: 196,
        type: "major",
      },
      {
        name: "Biology",
        acalogId: 166,
        type: "major",
      },
      {
        name: "Anthropology",
        acalogId: 162,
        type: "major",
      },
      {
        name: "Latin American, Latinx, and Caribbean Studies",
        acalogId: 187,
        type: "major",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "major",
      },
      {
        name: "Data Science",
        acalogId: 212,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "WRI 202",
        title: "Writing Like a Researcher",
        why: "Practices academic writing across disciplines, from psychology case studies to STEM lab reports, including making scholarly arguments with reputable evidence.",
      },
      {
        code: "POL 182",
        title: "Intro to Research Methods",
        why: "Covers social science research design, hypothesis testing, correlation, and multiple regression (not open to first-year students).",
      },
      {
        code: "PSY 200",
        title: "Research Design & Statistics 1",
        why: "Introduces how to design, test, and communicate research questions in psychological science, including ethics, replicability, and statistical programming (requires PSY 101).",
      },
      {
        code: "BIO 240",
        title: "Biostats for Life Scientists",
        why: "Teaches experimental design and how to apply, interpret, and report statistics for biological research using statistical and graphics software (requires one of BIO 111-116, CHE 115, ENV 101, or ENV 201).",
      },
      {
        code: "COM 203",
        title: "Communication Research Methods",
        why: "Introduces quantitative and qualitative research methods and ends with students developing their own research proposals.",
      },
      {
        code: "SOC 390",
        title: "Qualitative Research Methods",
        why: "Students carry out a semester-long qualitative project using participant observation and in-depth interviews, from research design through coding, analysis, and writing.",
      },
      {
        code: "LAS 303",
        title: "Interdisciplinary Methods",
        why: "Surveys methods such as surveys, interviews, ethnography, and archival research; students develop an original research proposal for possible grant submissions, theses, or independent research.",
      },
      {
        code: "ANT 378",
        title: "Artifacts and Archives",
        why: "Combines archaeological evidence and archival records to study the American South, with hands-on work curating a historic archaeological collection and evaluating sources.",
      },
    ],
    pay: {
      occupation: "Postsecondary Teachers",
      medianAnnual: 85330,
      period: "May 2025",
      projectedGrowth: "7% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/education-training-and-library/postsecondary-teachers.htm",
    },
    davidsonResources: [
      {
        name: "Undergraduate Research",
        url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research",
        description:
          "Davidson's hub for student research with faculty during the year and in summer, linking to research grants and fellowships such as the Davidson Research Initiative, Davidson Research Network, Kemp Scholars, and Research in Science Experience (RISE).",
      },
      {
        name: "Davidson Research Initiative (DRI)",
        url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
        description:
          "Summer research fellowships in any discipline for first-years, sophomores, and juniors working closely with a faculty or staff mentor, with training workshops during the summer.",
      },
      {
        name: "Kemp Scholars Program",
        url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/kemp-scholars-program",
        description:
          "Funds independent research projects of a student's own design in any discipline, on campus or with travel, and brings scholars together in a seminar to present proposals and results; open to non-seniors.",
      },
      {
        name: "Office of Fellowships",
        url: "https://www.davidson.edu/offices-and-services/fellowships",
        description:
          "Advises students and alumni applying for competitive fellowships and scholarships, including the Fulbright U.S. Student Program, Goldwater Scholarship, Watson Fellowship, and Rhodes Scholarship.",
      },
    ],
    externalResources: [
      {
        name: "NSF Research Experiences for Undergraduates (REU)",
        url: "https://www.nsf.gov/funding/initiatives/reu",
        description:
          "U.S. National Science Foundation program where undergraduates apply directly to funded research sites; participants receive stipends.",
      },
      {
        name: "Council on Undergraduate Research (CUR)",
        url: "https://www.cur.org/",
        description:
          "A national organization that supports undergraduate research and runs the National Conference on Undergraduate Research (NCUR), where students can submit abstracts to present their work.",
      },
    ],
    handshakeQuery: "research assistant",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/197",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/201",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/196",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/166",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/162",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/187",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/212",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/171",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/204",
      "https://www.bls.gov/ooh/education-training-and-library/postsecondary-teachers.htm",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/kemp-scholars-program",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/research-science-experience",
      "https://www.davidson.edu/offices-and-services/fellowships",
      "https://www.nsf.gov/funding/initiatives/reu",
      "https://www.cur.org/",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "public-policy",
    name: "Government & Public Policy",
    cluster: "Law & Government",
    summary:
      "People in government and public policy study the problems a community or country faces, weigh possible responses, and help design, carry out, and evaluate what governments do about them. The work happens in legislative offices, government agencies, research organizations, and advocacy groups, and it depends on research, data analysis, and clear writing.",
    whatYouDo: [
      "Research policy questions and analyze data from surveys and other sources",
      "Evaluate how policies and laws affect government, businesses, and people",
      "Track current events, policy decisions, and related issues",
      "Share findings in reports, policy briefs, and presentations",
    ],
    departments: [
      {
        code: "POL",
        name: "Political Science",
      },
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "PPE",
        name: "Philosophy, Politics, and Econ",
      },
      {
        code: "EDU",
        name: "Educational Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Political Science",
        acalogId: 196,
        type: "major",
      },
      {
        name: "Philosophy, Politics, and Economics",
        acalogId: 214,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Educational Studies",
        acalogId: 175,
        type: "minor",
      },
    ],
    courses: [
      {
        code: "POL 121",
        title: "American Politics",
        why: "Introductory analysis of American political processes, institutions, and problems.",
      },
      {
        code: "POL 180",
        title: "Intro to Policy Analysis",
        why: "Introduces policy evaluation methods such as decision, risk, and cost-benefit analysis; students write a white paper advocating a policy intervention.",
      },
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers microeconomics and macroeconomics for understanding domestic and international economic issues and is the foundation for further economics courses.",
      },
      {
        code: "POL 182",
        title: "Intro to Research Methods",
        why: "Teaches research design, hypothesis testing, correlation, and multiple regression for studying political problems; not open to first-year students.",
      },
      {
        code: "EDU 280",
        title: "Intro to Education Policy",
        why: "Introduces major U.S. K-12 education policy issues and the tools researchers use to evaluate policy, with original policy briefs; counts toward the Political Science major.",
      },
      {
        code: "POL 225",
        title: "Public Policy",
        why: "Studies how governmental responses to public needs are formed, implemented, and evaluated, with special topics such as environmental policy and health care.",
      },
      {
        code: "POL 241",
        title: "Comparative Public Policy",
        why: "Examines why policies on the economy, health care, and immigration differ across nations and why similar policies can produce different outcomes.",
      },
      {
        code: "ECO 341",
        title: "Applied Policy Impact Evaluatn",
        why: "Teaches impact evaluation methods for measuring a policy's effects, using Stata, and students conduct their own evaluation; requires ECO 202 and ECO 204.",
      },
    ],
    pay: {
      occupation: "Political scientists",
      medianAnnual: 142080,
      period: "May 2025",
      projectedGrowth: "-2% (2025-35), decline",
      url: "https://www.bls.gov/ooh/life-physical-and-social-science/political-scientists.htm",
    },
    davidsonResources: [
      {
        name: "Davidson in Washington",
        url: "https://www.davidson.edu/academic-departments/political-science/internships-careers-and-graduate-school/davidson-washington",
        description:
          "A Political Science Department summer program (eight weeks) that combines a government internship in Washington, D.C., with a for-credit political science seminar; open to rising sophomores, juniors, and seniors in any major, with applications on Handshake.",
      },
      {
        name: "The Allison S. and Thomas C. Franco Program on Public Policy and Research (Martin Institute for Public Good)",
        url: "https://www.davidson.edu/institute-public-good/public-policy-research",
        description:
          "Supports faculty and student research on issues such as education policy, governance, labor, environmental justice, and public health; its programs include the College Crisis Initiative (C2i) and the Smith Davidson Leadership Initiative, which trains Davidson and Johnson C. Smith University students as public service leaders.",
      },
      {
        name: "Summer Internship Grants (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
        description:
          "Grants that help with living costs during unpaid or low-paying summer internships, with details on Handshake; named funds include the Carolyn and George Cretekos '69 Public Service Internship for local, regional, state, or federal civil or government service.",
      },
      {
        name: "Truman Scholarships (Office of Fellowships)",
        url: "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/truman-scholarships",
        description:
          "Davidson's page for the Truman Scholarship, established by Congress, which funds graduate study for students committed to careers in public service; Davidson nominates up to four candidates each year, usually juniors.",
      },
    ],
    externalResources: [
      {
        name: "Association for Public Policy Analysis & Management (APPAM)",
        url: "https://www.appam.org/",
        description:
          "Professional association dedicated to improving public policy and management through research, analysis, and education; runs an annual research conference and a peer-reviewed journal.",
      },
      {
        name: "NASPAA (Network of Schools of Public Policy, Affairs, and Administration)",
        url: "https://www.naspaa.org/",
        description:
          "Nonprofit membership association and the recognized accreditor of master's programs in public policy, public affairs, and public administration.",
      },
    ],
    handshakeQuery: "policy analyst",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/196",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/214",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/175",
      "https://www.bls.gov/ooh/life-physical-and-social-science/political-scientists.htm",
      "https://www.onetonline.org/link/summary/19-3094.00",
      "https://www.davidson.edu/academic-departments/political-science/internships-careers-and-graduate-school/davidson-washington",
      "https://www.davidson.edu/academic-departments/political-science/internships-careers-and-graduate-school",
      "https://www.davidson.edu/institute-public-good/public-policy-research",
      "https://www.davidson.edu/institute-public-good/public-policy-research/smith-davidson-leadership-initiative",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.davidson.edu/offices-and-services/office-fellowships/fellowship-opportunities/truman-scholarships",
      "https://www.davidson.edu/academic-departments/prelaw",
      "https://www.appam.org/",
      "https://www.appam.org/about-appam/",
      "https://www.naspaa.org/",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "entrepreneurship",
    name: "Entrepreneurship",
    cluster: "Business & Finance",
    summary:
      "Entrepreneurs turn an idea into a new business or venture: they test whether customers want it, plan how it will make money, find funding, and build a team to run it. Davidson's Hurt Hub gives students ways to try this while still in school, through competitions, a non-credit startup course, and grant funding.",
    whatYouDo: [
      "Research the market and competitors to find customers for a product or service",
      "Write a business plan, estimate startup costs, and find funding",
      "Set goals, policies, and procedures for the organization",
      "Oversee finances and budgets, and negotiate contracts and agreements",
    ],
    departments: [
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
      {
        code: "THE",
        name: "Theatre",
      },
      {
        code: "POL",
        name: "Political Science",
      },
    ],
    relatedPrograms: [
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "minor",
      },
    ],
    courses: [
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers microeconomics and macroeconomics and serves as the foundation for further work in economics.",
      },
      {
        code: "ECO 211",
        title: "Introduction to Accounting",
        why: "Covers asset valuation, corporate accounts and statements, and how to interpret and analyze financial statements.",
      },
      {
        code: "ECO 213",
        title: "Cost Accounting",
        why: "Covers cost behavior, cost allocation, product costing, budgeting, and cost-based decision-making; requires ECO 211.",
      },
      {
        code: "ECO 214",
        title: "Introduction to Finance",
        why: "Introduces financial analysis, the time value of money, capital budgeting, and capital structure in private, public, and nonprofit settings; requires ECO 211.",
      },
      {
        code: "COM 101",
        title: "Princ of Oral Communication",
        why: "Students study classical and contemporary principles of effective oral communication and give individual presentations.",
      },
      {
        code: "COM 230",
        title: "Organizational Communication",
        why: "Studies how communication creates and sustains organizations, with topics such as leadership, workplace collaboration, and crisis communication.",
      },
      {
        code: "THE 110",
        title: "Thinking Creatively",
        why: "Introduces skills and strategies of the creative process so students can build their own workflow for generating ideas and carrying them out; open to all disciplines.",
      },
      {
        code: "POL 381",
        title: "Philanthropy & Non-Profit Sect",
        why: "Covers venture philanthropy, social entrepreneurism, and nonprofit management, with a lab in which students allocate $10,000 to local nonprofits.",
      },
    ],
    pay: {
      occupation: "Top executives (BLS pay data exclude self-employed workers)",
      medianAnnual: 108780,
      period: "May 2025",
      projectedGrowth: "5% (2025-35), faster than average",
      url: "https://www.bls.gov/ooh/management/top-executives.htm",
    },
    davidsonResources: [
      {
        name: "The Jay Hurt Hub for Innovation and Entrepreneurship: student programs",
        url: "https://hurthub.davidson.edu/students/",
        description:
          "The Hurt Hub's student page: the IdeaSprint team competition, the 7-session Building a Lean Startup course, Hack@Davidson, advising chats, study space, and student funding opportunities.",
      },
      {
        name: "Try It Fund (Hurt Hub)",
        url: "https://hurthub.davidson.edu/try-it-fund/",
        description:
          "A grant competition that awards Davidson students up to $1,000 to pursue a creative or innovative for-profit idea; applications open the first day of each semester.",
      },
      {
        name: "Nisbet Venture Fund (Hurt Hub)",
        url: "https://hurthub.davidson.edu/nisbet-venture-fund/",
        description:
          "An annual business development program and pitch competition in which Davidson students and recent alumni compete for grants and investment in for-profit ventures, with coaching and mentorship for finalists.",
      },
      {
        name: "Davidson College Consulting Group (Hurt Hub)",
        url: "https://hurthub.davidson.edu/become-a-student-consultant/",
        description:
          "Paid student-consultant teams that work with startups and small businesses on market research, marketing strategy, digital development, and data analysis.",
      },
    ],
    externalResources: [
      {
        name: "U.S. Small Business Administration: Plan your business",
        url: "https://www.sba.gov/counseling/plan-your-business/",
        description:
          "Federal guide to market research and competitive analysis, business plans, startup costs, business credit, and funding.",
      },
      {
        name: "U.S. Small Business Administration: Local assistance",
        url: "https://www.sba.gov/counseling/local-assistance/",
        description:
          "Finder for free or low-cost counseling from SBA resource partners, including Small Business Development Centers and SCORE mentoring.",
      },
    ],
    handshakeQuery: "startup",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/171",
      "https://www.bls.gov/ooh/management/top-executives.htm",
      "https://www.davidson.edu/offices-and-services/jay-hurt-hub-innovation-and-entrepreneurship",
      "https://hurthub.davidson.edu/students/",
      "https://hurthub.davidson.edu/try-it-fund/",
      "https://hurthub.davidson.edu/nisbet-venture-fund/",
      "https://hurthub.davidson.edu/ideasprint/",
      "https://hurthub.davidson.edu/become-a-student-consultant/",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.sba.gov/counseling/plan-your-business/",
      "https://www.sba.gov/counseling/local-assistance/",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "ux-design",
    name: "UX & Interaction Design",
    cluster: "Technology",
    summary:
      "UX (user experience) and interaction designers plan how a website, app, or other digital product looks and works so that people can use it easily, then test their designs with users and refine them. The work combines research into how people think and behave, visual design, and enough technical knowledge to work closely with developers.",
    whatYouDo: [
      "Conduct user research to set design requirements, and use feedback to improve designs",
      "Design and test the layout, functions, and navigation of websites and interfaces for usability",
      "Develop visual design concepts and revise them based on stakeholder feedback",
      "Collaborate with front-end and back-end developers to build the product",
    ],
    departments: [
      {
        code: "CSC",
        name: "Computer Science",
      },
      {
        code: "FMD",
        name: "Film, Media, and Digital Studies",
      },
      {
        code: "ART",
        name: "Art",
      },
      {
        code: "PSY",
        name: "Psychology",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Digital Studies",
        acalogId: 211,
        type: "interdisciplinary-minor",
      },
      {
        name: "Film, Media, and Digital Studies",
        acalogId: 213,
        type: "major",
      },
      {
        name: "Computer Science",
        acalogId: 172,
        type: "major",
      },
      {
        name: "Computer Science",
        acalogId: 172,
        type: "minor",
      },
      {
        name: "Art",
        acalogId: 165,
        type: "minor",
      },
      {
        name: "Psychology",
        acalogId: 197,
        type: "major",
      },
    ],
    courses: [
      {
        code: "ART 111",
        title: "Introduction to Digital Art",
        why: "Introduces digital art production in Adobe Illustrator, Photoshop, Premiere, and After Effects through exercises and critiques; counts toward the Film, Media, and Digital Studies major.",
      },
      {
        code: "PSY 101",
        title: "General Psychology",
        why: "Surveys the psychology of learning, perception, motivation, and thinking, with an emphasis on scientific methods of psychological investigation.",
      },
      {
        code: "CSC 121",
        title: "Programming & Problem Solving",
        why: "Introduces structured programming, algorithmic thinking, functions, and object-oriented programming; it is one of the prerequisites for CSC 221, which CSC 362 and CSC 363 require.",
      },
      {
        code: "DIG 245",
        title: "Critical Web Design",
        why: "Students conceptualize, design, and program responsive websites, covering usability, HTML, CSS, and JavaScript; it is one route into CSC 363.",
      },
      {
        code: "CSC 363",
        title: "Human Computer Interaction",
        why: "Surveys the design, implementation, and evaluation of interactive systems from a human-centered perspective, with web-based practice; requires CSC 221 or DIG 245.",
      },
      {
        code: "COM 203",
        title: "Communication Research Methods",
        why: "Introduces quantitative and qualitative research methods and ends with students developing their own research proposal.",
      },
      {
        code: "DIG 250",
        title: "Game Development",
        why: "Students design and program mobile and console games, with topics including design, usability, and coding in C#.",
      },
      {
        code: "CSC 362",
        title: "Data Visualization",
        why: "Covers the human visual system, color and color map design, interaction, and visualization design; requires CSC 221.",
      },
    ],
    pay: {
      occupation:
        "Web and digital interface designers (part of BLS OOH Web Developers and Digital Designers)",
      medianAnnual: 104000,
      period: "May 2025",
      projectedGrowth:
        "6% (2025-35) for web and digital interface designers; 5% (2025-35), faster than average, for the occupation group as a whole",
      url: "https://www.bls.gov/ooh/computer-and-information-technology/web-developers.htm",
    },
    davidsonResources: [
      {
        name: "The Jay Hurt Hub for Innovation and Entrepreneurship: student programs",
        url: "https://hurthub.davidson.edu/students/",
        description:
          "Includes Design Thinking Workshops that move through all five stages (empathize, define, ideate, prototype, test) in a single session, plus Hack@Davidson, which requires no prior experience.",
      },
      {
        name: "Davidson College Consulting Group (Hurt Hub)",
        url: "https://hurthub.davidson.edu/become-a-student-consultant/",
        description:
          "Paid student-consultant teams whose client projects include customer interviews, customer journey mapping, website audits, and usability improvements for startups and small businesses.",
      },
      {
        name: "Film, Media, and Digital Studies facilities",
        url: "https://www.davidson.edu/academic-departments/film-media-and-digital-studies/facilities",
        description:
          "Studio M, the campus makerspace open to all students (3D printers, laser engravers, VR simulators), and VAC 212, a digital studio with Macs, Adobe Creative Suite, and WACOM tablets open to Art, Art History, and Film, Media, and Digital Studies students.",
      },
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (the Betty and B. Frank Matthews II '49 Center for Career Development) helps students find internships, jobs, fellowships, and graduate programs, and runs Handshake, the college's job and internship posting system.",
      },
    ],
    externalResources: [
      {
        name: "O*NET OnLine: Web and Digital Interface Designers (15-1255.00)",
        url: "https://www.onetonline.org/link/summary/15-1255.00",
        description:
          "U.S. Department of Labor-sponsored occupation profile listing UX and UI job titles, tasks, and skills.",
      },
      {
        name: "User Experience Professionals Association (UXPA International)",
        url: "https://uxpa.org/",
        description:
          "Professional association for usability, user-centered design, and UX practice; publishes the Journal of User Experience and runs webinars and events.",
      },
      {
        name: "Digital.gov: User experience",
        url: "https://digital.gov/topics/user-experience/",
        description:
          "U.S. General Services Administration resources on user-centered design for government websites and digital services, including a human-centered design guide series.",
      },
    ],
    handshakeQuery: "UX designer",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/211",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/213",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/172",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/165",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/197",
      "https://www.bls.gov/ooh/computer-and-information-technology/web-developers.htm",
      "https://www.onetonline.org/link/summary/15-1255.00",
      "https://www.onetonline.org/link/details/15-1255.00",
      "https://hurthub.davidson.edu/students/",
      "https://hurthub.davidson.edu/become-a-student-consultant/",
      "https://www.davidson.edu/academic-departments/film-media-and-digital-studies/facilities",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://uxpa.org/",
      "https://uxpa.org/about-uxpa-international/",
      "https://digital.gov/topics/user-experience/",
      "https://www.davidson.edu/academic-departments/interdisciplinary-studies/majors",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "nonprofit",
    name: "Nonprofit & Social Impact",
    cluster: "Social Impact",
    summary:
      "Nonprofit work often involves running programs that serve a community, raising and managing the money that pays for them, and showing whether those programs are working. At Davidson, preparation can include courses in policy analysis, sociology, and philanthropy, along with summer internships at local nonprofits through the Mulliss Center for Civic Engagement.",
    whatYouDo: [
      "Work with community members to identify the programs and services they need",
      "Run day-to-day program operations and track data on whether programs are effective",
      "Write funding proposals and help raise money from donors",
      "Plan outreach so people know about the organization's services",
    ],
    departments: [
      {
        code: "POL",
        name: "Political Science",
      },
      {
        code: "SOC",
        name: "Sociology",
      },
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "REL",
        name: "Religious Studies",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
      {
        code: "THE",
        name: "Theatre",
      },
    ],
    relatedPrograms: [
      {
        name: "Political Science",
        acalogId: 196,
        type: "major",
      },
      {
        name: "Sociology",
        acalogId: 201,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Philosophy, Politics, and Economics",
        acalogId: 214,
        type: "major",
      },
    ],
    courses: [
      {
        code: "SOC 101",
        title: "Introductory Sociology",
        why: "Introduces the scientific study of how individuals and the groups they belong to influence each other, along with sociology's basic theories and research techniques.",
      },
      {
        code: "POL 180",
        title: "Intro to Policy Analysis",
        why: "Teaches policy evaluation methods such as cost-benefit and risk analysis, with topics that include non-profit and non-governmental organizations, and ends with a policy whitepaper.",
      },
      {
        code: "REL 167",
        title: "Religion and Philanthropy",
        why: "Uses global case studies to examine why religious communities give, and asks whether philanthropy produces long-term social change.",
      },
      {
        code: "COM 230",
        title: "Organizational Communication",
        why: "Studies how communication creates and sustains organizations, including leadership, workplace collaboration, diversity, and crisis communication.",
      },
      {
        code: "POL 381",
        title: "Philanthropy & Non-Profit Sect",
        why: "Covers foundations, giving and volunteerism, social entrepreneurship, and non-profit management, with a lab in which students solicit proposals and award grant funds to local non-profits.",
      },
      {
        code: "ECO 341",
        title: "Applied Policy Impact Evaluatn",
        why: "Teaches impact evaluation methods for measuring how a policy affects people's economic and social outcomes, with hands-on work in Stata; requires ECO 202 and ECO 204.",
      },
      {
        code: "THE 210",
        title: "Leadrshp&Mgt in Arts",
        why: "Introduces the management of non-profit cultural institutions, including leadership, marketing, fundraising, financial management, and board governance.",
      },
    ],
    pay: {
      occupation: "Social and Community Service Managers",
      medianAnnual: 80390,
      period: "May 2025",
      projectedGrowth: "7% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/management/social-and-community-service-managers.htm",
    },
    davidsonResources: [
      {
        name: "The William F. and Betty G. Mulliss Center for Civic Engagement",
        url: "https://www.davidson.edu/offices-and-services/civic-engagement",
        description:
          "Connects students with public and nonprofit organizations in the Charlotte and Lake Norman area through service, community-based learning courses, summer internships, and leadership programs.",
      },
      {
        name: "Nonprofit Leadership Fellows (Mulliss Center for Civic Engagement)",
        url: "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
        description:
          "Full-time summer internships doing capacity-building projects for local nonprofits, such as program management, grant writing, communications, and volunteer management; includes a stipend and housing. Applications are in WildcatSync.",
      },
      {
        name: "Davidson Impact Fellows",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/davidson-impact-fellows",
        description:
          "A Matthews Center for Career Development program that places graduating seniors in one-year, post-graduate fellowships with partner organizations, mainly 501(c) nonprofits, that receive grants from the College.",
      },
      {
        name: "Matthews Center Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants toward living costs for unpaid or low-paying summer internships, applied for through Handshake; the named grants include some for non-profit, public service, and civic engagement internships.",
      },
    ],
    externalResources: [
      {
        name: "National Council of Nonprofits",
        url: "https://www.councilofnonprofits.org/",
        description:
          "A national network of nonprofits that publishes resources on running a nonprofit and on nonprofit advocacy and policy.",
      },
      {
        name: "IRS: Charities and Nonprofits",
        url: "https://www.irs.gov/charities-and-nonprofits",
        description:
          "Official federal guidance on tax-exempt organization types and the rules they operate under.",
      },
      {
        name: "Idealist",
        url: "https://www.idealist.org/",
        description:
          "A job, internship, and volunteer listing site for mission-driven organizations, run by a 501(c)(3) nonprofit.",
      },
    ],
    handshakeQuery: "nonprofit",
    sources: [
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/196",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/201",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/214",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://www.bls.gov/ooh/management/social-and-community-service-managers.htm",
      "https://www.bls.gov/ooh/business-and-financial/fundraisers.htm",
      "https://www.davidson.edu/offices-and-services/civic-engagement",
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/davidson-impact-fellows",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.councilofnonprofits.org/",
      "https://www.irs.gov/charities-and-nonprofits",
      "https://www.idealist.org/",
      "https://www.idealist.org/en/about",
      "https://www.davidson.edu/offices-and-services/civic-engagement/signature-programs/bonner-scholars",
      "https://www.davidson.edu/offices-and-services/civic-engagement/signature-programs/bonner-scholars/application-process",
      "https://www.bls.gov/ooh/management/print/social-and-community-service-managers.htm",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "education",
    name: "Teaching & Education",
    cluster: "Research & Education",
    summary:
      "Education careers include classroom teaching, tutoring, and roles in school leadership and education policy. Davidson has discontinued its teacher education program, so students who want to teach consult Educational Studies faculty about other routes, such as a master's program that leads to a teaching license, an alternative-entry program like Teach For America, or teaching at an independent school.",
    whatYouDo: [
      "Plan lessons and teach students in your subject",
      "Assess students' strengths and weaknesses and grade their work",
      "Adapt instruction and work with individual students to help them improve",
      "Communicate with families about how students are doing",
    ],
    departments: [
      {
        code: "EDU",
        name: "Educational Studies",
      },
      {
        code: "PSY",
        name: "Psychology",
      },
      {
        code: "SPA",
        name: "Hispanic Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Educational Studies",
        acalogId: 175,
        type: "major",
      },
      {
        name: "Educational Studies",
        acalogId: 175,
        type: "minor",
      },
      {
        name: "Psychology",
        acalogId: 197,
        type: "major",
      },
    ],
    courses: [
      {
        code: "EDU 121",
        title: "Foundations of American Educ",
        why: "Traces the history and philosophies behind U.S. educational institutions and the role schools play among other social institutions.",
      },
      {
        code: "EDU 221",
        title: "Schools and Society",
        why: "An introductory course on contemporary educational theory and practice that asks what counts as school success and what parts of society schools reproduce.",
      },
      {
        code: "PSY 242",
        title: "Educational Psychology",
        why: "Covers learning, motivation, child and adolescent development, the exceptional child, and cultural differences as they apply to classrooms; requires PSY 101.",
      },
      {
        code: "PSY 241",
        title: "Child Development",
        why: "Research and theory on cognitive, socio-emotional, and physical development from before birth through middle childhood, with applications to educational settings; requires PSY 101.",
      },
      {
        code: "EDU 280",
        title: "Intro to Education Policy",
        why: "Introduces U.S. K-12 policy issues such as school accountability, school finance, desegregation, and teacher labor markets, and the tools researchers use to evaluate policy.",
      },
      {
        code: "EDU 361",
        title: "Bilingualism & Literacy",
        why: "A community-based learning course on evidence-based ways to support literacy in immigrant school-age children, paired with tutor training through the Augustine Literacy Project.",
      },
      {
        code: "SPA 315",
        title: "Teaching Spa in Elem School",
        why: "Students plan a curriculum, write and teach lessons, and assess learning through the Davidson SK8S (Spanish in K-8 School) program; taught in Spanish.",
      },
      {
        code: "EDU 400",
        title: "Dir Field Placement-Education",
        why: "About eight hours a week in a formal or nonformal school setting, with weekly meetings and a digital portfolio; requires instructor approval.",
      },
    ],
    pay: {
      occupation: "High School Teachers",
      medianAnnual: 72040,
      period: "May 2025",
      projectedGrowth: "0% (2025-35), little or no change",
      url: "https://www.bls.gov/ooh/education-training-and-library/high-school-teachers.htm",
    },
    davidsonResources: [
      {
        name: "Educational Studies: Teaching and Tutoring Opportunities",
        url: "https://www.davidson.edu/academic-departments/educational-studies/teaching-tutoring",
        description:
          "The department's page for teaching and tutoring in local schools, including the Davidson-ALP Partnership (through EDU 361), Davidson Readers literacy tutoring, the Summer Promise program, and education field placements.",
      },
      {
        name: "Educational Studies: Internships, Careers and Graduate School",
        url: "https://www.davidson.edu/academic-departments/educational-studies/internships-careers-and-graduate-school",
        description:
          "Explains the routes into teaching, such as MAT programs that grant a license, Teach For America, Teach Charlotte, and independent-school placement, and lists related fellowships.",
      },
      {
        name: "Brenda H. Tapia CDF Freedom Schools (Mulliss Center for Civic Engagement)",
        url: "https://www.davidson.edu/offices-and-services/civic-engagement/signature-programs/brenda-h-tapia-cdf-freedom-schools",
        description:
          "A summer enrichment program for K-8 students, developed by the Children's Defense Fund, that fosters a love of reading; classes are held at the Ada Jenkins Center in Davidson, and Davidson students are trained to serve as servant leader interns.",
      },
      {
        name: "Office of Fellowships",
        url: "https://www.davidson.edu/offices-and-services/fellowships",
        description:
          "Advises students and alumni applying for fellowships, including the Fulbright U.S. Student Program, which the Educational Studies department highlights for students interested in teaching.",
      },
    ],
    externalResources: [
      {
        name: "NC DPI: Residency Licensure",
        url: "https://www.dpi.nc.gov/educators/educators-licensure/residency-licensure",
        description:
          "North Carolina's alternative route that lets a qualified person teach on a Residency License while completing an approved educator preparation program.",
      },
      {
        name: "TEACH.org",
        url: "https://www.teach.org/",
        description:
          "A 501(c)(3) nonprofit, originally formed by the U.S. Department of Education, with national information on becoming a teacher.",
      },
    ],
    handshakeQuery: "teacher",
    sources: [
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/175",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/197",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/188",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://www.bls.gov/ooh/education-training-and-library/high-school-teachers.htm",
      "https://www.davidson.edu/academic-departments/educational-studies/teaching-tutoring",
      "https://www.davidson.edu/academic-departments/educational-studies/teaching-tutoring/davidson-alp-partnership",
      "https://www.davidson.edu/academic-departments/educational-studies/internships-careers-and-graduate-school",
      "https://www.davidson.edu/offices-and-services/civic-engagement/signature-programs/brenda-h-tapia-cdf-freedom-schools",
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
      "https://www.davidson.edu/offices-and-services/fellowships",
      "https://www.dpi.nc.gov/educators/educators-licensure/residency-licensure",
      "https://www.teach.org/",
      "https://www.teach.org/about",
      "https://www.bls.gov/ooh/education-training-and-library/print/high-school-teachers.htm",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "journalism",
    name: "Journalism & News Media",
    cluster: "Media & Arts",
    summary:
      "Journalists research, report, and write stories that keep the public informed about current events, for newspapers, magazines, websites, and broadcast outlets. Davidson has no journalism major, so students interested in reporting can combine writing, communication, and research-methods courses with work on student media such as The Davidsonian and summer newsroom internships.",
    whatYouDo: [
      "Research assigned topics and build relationships with sources who provide tips and leads",
      "Interview people and analyze information so audiences understand the news",
      "Write and check stories or scripts for print, web, or broadcast",
      "Pitch new story ideas to editors and update stories as news develops",
    ],
    departments: [
      {
        code: "ENG",
        name: "English",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
      {
        code: "CIS",
        name: "Ctr/Interdisciplinary Studies",
      },
      {
        code: "SOC",
        name: "Sociology",
      },
      {
        code: "CSC",
        name: "Computer Science",
      },
      {
        code: "FMD",
        name: "Film, Media, and Digital Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "English",
        acalogId: 176,
        type: "major",
      },
      {
        name: "English",
        acalogId: 176,
        type: "minor",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "major",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "minor",
      },
      {
        name: "Film, Media, and Digital Studies",
        acalogId: 213,
        type: "major",
      },
      {
        name: "Digital Studies",
        acalogId: 211,
        type: "interdisciplinary-minor",
      },
      {
        name: "Film and Media Studies",
        acalogId: 178,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "ENG 201",
        title: "Intro to Creative Nonfiction",
        why: "A reading and writing workshop in nonfiction forms such as memoir, travel, immersion, and personal essays, focused on techniques for telling true stories.",
      },
      {
        code: "COM 201",
        title: "Intro to Communication Studies",
        why: "Surveys how communication works across contexts, including mass communication; required for the Communication Studies major and minor, and non-majors need the chair's permission.",
      },
      {
        code: "CIS 380",
        title: "Contemporary Reportage",
        why: "Compares American, European, and Russian traditions of reportage, with practical reporting assignments, a final reportage piece, and a masterclass on pitching stories to editors; requires WRI 101.",
      },
      {
        code: "SOC 390",
        title: "Qualitative Research Methods",
        why: "Trains students in participant observation and in-depth interviewing through a semester-long field research project.",
      },
      {
        code: "CSC 110",
        title: "Data Science & Society",
        why: "Introduces programming, data visualization, and statistical analysis in R, as students collect, analyze, and present data on social and economic justice issues.",
      },
      {
        code: "FMS 211",
        title: "Filmmaking",
        why: "Takes students from story concept through production and editing as each one produces and screens their own fiction or non-fiction film.",
      },
      {
        code: "COM 328",
        title: "Social Media Communication",
        why: "Examines how social media platforms work and how they affect culture, media, politics, and business; meant for Communication Studies majors or minors who have taken earlier COM electives.",
      },
    ],
    pay: {
      occupation: "News Analysts, Reporters, and Journalists",
      medianAnnual: 62200,
      period: "May 2025",
      projectedGrowth: "-6% (2025-35), decline",
      url: "https://www.bls.gov/ooh/media-and-communication/reporters-correspondents-and-broadcast-news-analysts.htm",
    },
    davidsonResources: [
      {
        name: "Media Organizations (Student Activities)",
        url: "https://www.davidson.edu/offices-and-services/student-activities/student-organizations/media-organizations",
        description:
          "The Student Activities Office's sampling of campus media, including The Davidsonian (the independent student newspaper since 1914), WALT 1610 radio, The Breach, Hobart Park, Libertas, and the Davidson Filmmakers Club.",
      },
      {
        name: "Matthews Center Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants toward living costs for unpaid or low-paying summer internships, applied for through Handshake.",
      },
      {
        name: "Communication Studies: Careers, Internships and Graduate School",
        url: "https://www.davidson.edu/academic-departments/communication-studies/careers-internships-and-graduate-school",
        description:
          "The department's page on where Communication Studies students have worked and interned, including internships at media organizations such as Time Magazine, CBS, and MTV Networks.",
      },
      {
        name: "Writing Center (John Crosland Jr. Center for Teaching and Learning)",
        url: "https://www.davidson.edu/offices-and-services/center-teaching-and-learning/student-resources/writing-center",
        description:
          "Free sessions with trained peer tutors at any stage of a draft, from class assignments to cover letters.",
      },
    ],
    externalResources: [
      {
        name: "Investigative Reporters and Editors (IRE)",
        url: "https://www.ire.org/",
        description:
          "A nonprofit organization for investigative journalists that shares reporting techniques and training.",
      },
      {
        name: "Online News Association (ONA)",
        url: "https://journalists.org/",
        description:
          "A nonprofit membership organization for digital journalists that offers conferences, training, and professional development.",
      },
      {
        name: "Dow Jones News Fund",
        url: "https://dowjonesnewsfund.org/",
        description:
          "A 501(c)(3) nonprofit that runs summer newsroom internship programs, with pre-internship training, for college students.",
      },
    ],
    handshakeQuery: "journalism",
    sources: [
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/176",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/171",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/213",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/211",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/204",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://www.bls.gov/ooh/media-and-communication/reporters-correspondents-and-broadcast-news-analysts.htm",
      "https://www.davidson.edu/offices-and-services/student-activities/student-organizations/media-organizations",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.davidson.edu/academic-departments/communication-studies/careers-internships-and-graduate-school",
      "https://www.davidson.edu/offices-and-services/center-teaching-and-learning/student-resources/writing-center",
      "https://www.ire.org/",
      "https://www.ire.org/about-ire/",
      "https://journalists.org/",
      "https://www.journalists.org/about/",
      "https://dowjonesnewsfund.org/",
      "https://dowjonesnewsfund.org/about/faqs/",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/178",
      "https://www.bls.gov/ooh/media-and-communication/print/reporters-correspondents-and-broadcast-news-analysts.htm",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "environmental-science",
    name: "Environmental Science",
    cluster: "Science & Environment",
    summary:
      "Environmental scientists and specialists conduct research or investigations to protect the environment or human health, collecting and analyzing environmental data and advising governments, businesses, and the public. At Davidson, relevant preparation includes the Environmental Studies major or interdisciplinary minor plus courses in biology, chemistry, statistics, and GIS.",
    whatYouDo: [
      "Plan data collection, then gather and analyze environmental samples and surveys",
      "Identify and assess sources of pollution or other environmental hazards",
      "Develop plans to prevent, control, or address environmental problems",
      "Advise officials, businesses, and the public, and write up findings in reports",
    ],
    departments: [
      {
        code: "ENV",
        name: "Environmental Studies",
      },
      {
        code: "BIO",
        name: "Biology",
      },
      {
        code: "CHE",
        name: "Chemistry",
      },
    ],
    relatedPrograms: [
      {
        name: "Environmental Studies",
        acalogId: 177,
        type: "major",
      },
      {
        name: "Environmental Studies",
        acalogId: 177,
        type: "interdisciplinary-minor",
      },
      {
        name: "Biology",
        acalogId: 166,
        type: "major",
      },
      {
        name: "Chemistry",
        acalogId: 168,
        type: "major",
      },
      {
        name: "Data Science",
        acalogId: 212,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "ENV 101",
        title: "Environmental Science +Lab",
        why: "Introduces how ecosystems work and applies that science to estimate risks and evaluate solutions to environmental problems, with a weekly lab.",
      },
      {
        code: "ENV 102",
        title: "Environmental Social Sciences",
        why: "Teaches qualitative and quantitative social science methods for analyzing interactions between society and the environment.",
      },
      {
        code: "BIO 240",
        title: "Biostats for Life Scientists",
        why: "Covers statistics and experimental design with statistical software and satisfies the methodology requirement of the Environmental Studies Natural Science track.",
      },
      {
        code: "ENV 237",
        title: "Intro to Interdisciplinary GIS",
        why: "Introduces ArcGIS for mapping and analyzing spatial data, with a primary focus on environmental issues such as conservation and environmental justice.",
      },
      {
        code: "CHE 220",
        title: "Intro to Analytical Chem +Lab",
        why: "Teaches quantitative lab analysis, including chromatography and spectroscopy, with environmental applications among others.",
      },
      {
        code: "ENV 220",
        title: "Climate Systems",
        why: "Examines human-caused climate change, climate feedbacks, and options for mitigation and adaptation.",
      },
      {
        code: "BIO 267",
        title: "Environ. Health Disparities",
        why: "Seminar on environmental factors such as air quality, water quality, and exposure to environmental chemicals that disproportionately affect the health of some groups.",
      },
      {
        code: "BIO 321",
        title: "Ecology +Lab",
        why: "Studies how organisms interact with their environment at the population, community, and ecosystem levels, including independent field experiments.",
      },
    ],
    pay: {
      occupation: "Environmental Scientists and Specialists",
      medianAnnual: 82220,
      period: "May 2025",
      projectedGrowth: "6% (2025-35), faster than average",
      url: "https://www.bls.gov/ooh/life-physical-and-social-science/environmental-scientists-and-specialists.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (the Betty and B. Frank Matthews II '49 Center for Career Development), which helps students pursue internships, jobs, fellowships, and graduate school and runs Handshake, the college's internal job and internship posting system.",
      },
      {
        name: "Sustainability Scholars (Sustainability Office)",
        url: "https://www.davidson.edu/offices-and-services/sustainability-office/sustainability-scholars",
        description:
          "Summer internship program that places students with private, public, or nonprofit community partners on a sustainability project, with group discussions focused on climate change.",
      },
      {
        name: "Environmental Studies Research",
        url: "https://www.davidson.edu/academic-departments/environmental-studies/research",
        description:
          "Describes the department's project-driven, field-based courses, the required senior capstone, and summer research funded by faculty grants or college programs.",
      },
      {
        name: "Davidson College Ecological Preserve",
        url: "https://www.davidson.edu/academic-departments/biology/facilities/ecological-preserve",
        description:
          "About 100 acres of forested land next to campus used for teaching and ecological research by students and faculty.",
      },
    ],
    externalResources: [
      {
        name: "U.S. EPA: Students",
        url: "https://www.epa.gov/careers/students",
        description:
          "The Environmental Protection Agency's page on paid internships, student trainee positions, and other opportunities for college students.",
      },
      {
        name: "National Association of Environmental Professionals",
        url: "https://www.naep.org/",
        description:
          "Multidisciplinary association for environmental professionals, covering environmental planning, research, and management across industry, government, and academia.",
      },
    ],
    handshakeQuery: "environmental science",
    sources: [
      "https://www.bls.gov/ooh/life-physical-and-social-science/environmental-scientists-and-specialists.htm",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/177",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/166",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/168",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/212",
      "https://www.davidson.edu/academic-departments/environmental-studies",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/offices-and-services/sustainability-office",
      "https://www.davidson.edu/offices-and-services/sustainability-office/sustainability-scholars",
      "https://www.davidson.edu/academic-departments/environmental-studies/research",
      "https://www.davidson.edu/academic-departments/biology/facilities/ecological-preserve",
      "https://www.epa.gov/careers/students",
      "https://www.naep.org/",
      "https://www.naep.org/about-naep",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "cybersecurity",
    name: "Cybersecurity",
    cluster: "Technology",
    summary:
      "Information security analysts plan and carry out security measures that protect an organization's computer networks and systems. The occupation typically calls for a bachelor's degree in a computer science field plus related work experience, and Davidson's Computer Science systems courses cover security, cryptography, operating systems, and networks.",
    whatYouDo: [
      "Monitor networks for security breaches and investigate when one occurs",
      "Maintain protective tools such as firewalls and data encryption software",
      "Check computer and network systems for vulnerabilities",
      "Document attempted attacks and recommend security standards and improvements",
    ],
    departments: [
      {
        code: "CSC",
        name: "Computer Science",
      },
      {
        code: "MAT",
        name: "Mathematics",
      },
    ],
    relatedPrograms: [
      {
        name: "Computer Science",
        acalogId: 172,
        type: "major",
      },
      {
        name: "Computer Science",
        acalogId: 172,
        type: "minor",
      },
      {
        name: "Mathematics",
        acalogId: 188,
        type: "minor",
      },
    ],
    courses: [
      {
        code: "CSC 121",
        title: "Programming & Problem Solving",
        why: "Introductory programming course covering algorithmic thinking, control structures, functions, recursion, and object-oriented programming.",
      },
      {
        code: "CSC 221",
        title: "Data Structures",
        why: "Covers lists, stacks, queues, search trees, and hash tables and how data structure choices affect efficiency; it is a prerequisite for Computer Security and Applied Cryptography.",
      },
      {
        code: "CSC 250",
        title: "Computer Organization",
        why: "Explains data representation, digital logic, memory, assembly and machine code, and the C language; it is a prerequisite for Computer Security and Operating Systems.",
      },
      {
        code: "MAT 230",
        title: "Sets and Proofs",
        why: "Builds proof-writing skills and is one of the accepted prerequisites for Applied Cryptography.",
      },
      {
        code: "CSC 356",
        title: "Computer Security",
        why: "Covers threat models, security policies, cryptography and public key infrastructure, secure coding, and network, web, operating system, and hardware security.",
      },
      {
        code: "CSC 354",
        title: "Applied Cryptography",
        why: "Analyzes the mathematical foundations of cryptographic protocols and applies them in projects on web privacy, blockchain, and network applications.",
      },
      {
        code: "CSC 351",
        title: "Operating Systems",
        why: "Students develop core parts of a modern operating system, whose responsibilities include memory management, file systems and networking, and authentication and authorization.",
      },
      {
        code: "CSC 359",
        title: "Networks & Distributed Systems",
        why: "Studies core Internet protocols such as IP, TCP, DNS, and HTTP, along with security-related protocols.",
      },
    ],
    pay: {
      occupation: "Information Security Analysts",
      medianAnnual: 129180,
      period: "May 2025",
      projectedGrowth: "21% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/computer-and-information-technology/information-security-analysts.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (the Betty and B. Frank Matthews II '49 Center for Career Development), which helps students pursue internships, jobs, fellowships, and graduate school and runs Handshake, the college's internal job and internship posting system.",
      },
      {
        name: "Davidson Research Initiative",
        url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
        description:
          "Summer research fellowships in any discipline for first-years, sophomores, and juniors, working closely with a faculty mentor.",
      },
      {
        name: "Mathematics and Computer Science Summer Opportunities",
        url: "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/student-involvement/summer-opportunities",
        description:
          "Department list of summer research programs at Davidson and elsewhere, including NSF REUs and the NSA Director's Summer Program in mathematics, cryptology, and communications technology.",
      },
      {
        name: "Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
        description:
          "Matthews Center grants for unpaid or low-paying summer internships; one named fund gives preference to students pursuing careers in science, technology, or medicine.",
      },
    ],
    externalResources: [
      {
        name: "NICE (National Initiative for Cybersecurity Education), NIST",
        url: "https://www.nist.gov/itl/applied-cybersecurity/nice",
        description:
          "NIST program that coordinates cybersecurity education, training, and workforce development; its site links to the NICE Framework and other workforce resources.",
      },
      {
        name: "CyberCorps: Scholarship for Service",
        url: "https://sfs.opm.gov/",
        description:
          "Federal scholarship program, funded through National Science Foundation grants, that supports cybersecurity undergraduate or graduate study at participating institutions in return for government cybersecurity work after graduation. Davidson is not a participating institution, so it applies mainly to graduate study elsewhere.",
      },
    ],
    handshakeQuery: "cybersecurity",
    sources: [
      "https://www.bls.gov/ooh/computer-and-information-technology/information-security-analysts.htm",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/172",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/188",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
      "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/student-involvement/summer-opportunities",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.nist.gov/itl/applied-cybersecurity/nice",
      "https://sfs.opm.gov/",
      "https://sfs.opm.gov/Academia/Institutions",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "financial-planning",
    name: "Financial Planning & Wealth Management",
    cluster: "Business & Finance",
    summary:
      "Personal financial advisors help individuals manage their money and plan for goals such as education and retirement. At Davidson, relevant preparation comes mainly from Economics courses in accounting, finance, statistics, and financial markets; advisors who buy or sell securities or insurance may also need licenses.",
    whatYouDo: [
      "Meet with clients to discuss their financial goals and explain the services offered",
      "Explain investment options and risks, and recommend or select investments",
      "Help clients plan for specific goals such as education or retirement",
      "Monitor client accounts and adjust plans after life changes",
    ],
    departments: [
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "MAT",
        name: "Mathematics",
      },
    ],
    relatedPrograms: [
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Applied Mathematics",
        acalogId: 163,
        type: "interdisciplinary-minor",
      },
      {
        name: "Data Science",
        acalogId: 212,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers both microeconomics and macroeconomics and serves as the foundation for further work in economics.",
      },
      {
        code: "ECO 204",
        title: "Stats & Basic Econometrics",
        why: "Applies probability, hypothesis testing, correlation, and regression to economic analysis using spreadsheet software.",
      },
      {
        code: "ECO 211",
        title: "Introduction to Accounting",
        why: "Covers the valuation of assets and the interpretation and analysis of financial statements.",
      },
      {
        code: "ECO 214",
        title: "Introduction to Finance",
        why: "Introduces financial analysis, the time value of money, capital budgeting, and capital structure.",
      },
      {
        code: "ECO 212",
        title: "Intermediate Accounting",
        why: "Works through complex financial accounting problems with an emphasis on analyzing accounting data.",
      },
      {
        code: "ECO 238",
        title: "Fin. Mkts, Inst & Policy",
        why: "Examines interest rates, bond and stock markets, the efficient markets hypothesis, behavioral finance, and the Federal Reserve.",
      },
      {
        code: "ECO 228",
        title: "Financial Economics",
        why: "Studies how markets allocate capital and share risk, including asset pricing, investment decisions, and the role of asset managers.",
      },
    ],
    pay: {
      occupation: "Personal Financial Advisors",
      medianAnnual: 105070,
      period: "May 2025",
      projectedGrowth: "1% (2025-35), slower than average",
      url: "https://www.bls.gov/ooh/business-and-financial/personal-financial-advisors.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center (the Betty and B. Frank Matthews II '49 Center for Career Development), which helps students pursue internships, jobs, fellowships, and graduate school and runs Handshake, the college's internal job and internship posting system.",
      },
      {
        name: "Technical Skill-Building Partnerships",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
        description:
          "Matthews Center partner programs for finance and business skills, including Training the Street workshops (financial statement analysis, valuation, Excel modeling) with Wells Fargo.",
      },
      {
        name: "Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
        description:
          "Matthews Center grants for unpaid or low-paying summer internships; the Boswell Family Experiential Learning Grant covers fields such as investment management and accounting and certain certification programs.",
      },
      {
        name: "Economics: Internships, Careers and Graduate School",
        url: "https://www.davidson.edu/academic-departments/economics/internships-careers-and-graduate-school",
        description:
          "Economics Department page on internships, recent graduate employers, and graduate programs in accounting and finance.",
      },
    ],
    externalResources: [
      {
        name: "CFP Board: How to Become a CFP Professional",
        url: "https://www.cfp.net/certification-process",
        description:
          "CFP Board's explanation of the four CFP certification requirements (education, exam, experience, and ethics), including coursework through a CFP Board Registered Program plus a bachelor's degree.",
      },
      {
        name: "FINRA: Qualification Exams",
        url: "https://www.finra.org/registration-exams-ce/qualification-exams",
        description:
          "FINRA's overview of the qualifying exams, including the Securities Industry Essentials (SIE) exam, that securities professionals must pass to become registered.",
      },
      {
        name: "Financial Planning Association",
        url: "https://www.financialplanningassociation.org/",
        description:
          "Membership organization for CFP professionals and others in financial planning, offering learning, practice support, advocacy, and networking.",
      },
    ],
    handshakeQuery: "wealth management",
    sources: [
      "https://www.bls.gov/ooh/business-and-financial/personal-financial-advisors.htm",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/163",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/212",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/technical-skill-building-partnerships",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.davidson.edu/academic-departments/economics/internships-careers-and-graduate-school",
      "https://www.cfp.net/certification-process",
      "https://www.finra.org/registration-exams-ce/qualification-exams",
      "https://www.financialplanningassociation.org/",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "psychology-counseling",
    name: "Psychology & Counseling",
    cluster: "Health",
    summary:
      "Psychologists study how people think, feel, and behave, and clinical and counseling psychologists assess, diagnose, and treat mental, emotional, and behavioral disorders; mental health counselors advise people on issues such as addiction and depression. Clinical and counseling psychologists typically need a Ph.D. or Psy.D., while the typical entry-level education for mental health counselors is a master's degree.",
    whatYouDo: [
      "Assess clients' mental health and behavior through interviews, observation, and testing",
      "Develop treatment goals and plans with clients and, when needed, their families",
      "Teach clients coping skills and ways to change behavior",
      "Study behavior through research and write up findings in reports and papers",
    ],
    departments: [
      {
        code: "PSY",
        name: "Psychology",
      },
      {
        code: "PBH",
        name: "Public Health",
      },
      {
        code: "EDU",
        name: "Educational Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Psychology",
        acalogId: 197,
        type: "major",
      },
      {
        name: "Neuroscience",
        acalogId: 192,
        type: "interdisciplinary-minor",
      },
      {
        name: "Public Health",
        acalogId: 189,
        type: "interdisciplinary-minor",
      },
      {
        name: "Educational Studies",
        acalogId: 175,
        type: "minor",
      },
    ],
    courses: [
      {
        code: "PSY 101",
        title: "General Psychology",
        why: "Surveys learning, perception, motivation, intelligence, thinking, and social and abnormal behavior; the catalog lists it as the prerequisite for all other psychology courses.",
      },
      {
        code: "PSY 200",
        title: "Research Design & Statistics 1",
        why: "Introduces how psychological research questions are designed, tested, and communicated; the catalog lists it as a prerequisite for all 300-level psychology courses.",
      },
      {
        code: "PSY 231",
        title: "Abnormal Psychology",
        why: "Covers the characteristics, causes, and treatment of conditions such as anxiety disorders, depression, and schizophrenia; the catalog lists PSY 231 or 234 as a prerequisite for the Davidson-Broughton summer practicum.",
      },
      {
        code: "PSY 240",
        title: "Psychological Interventions",
        why: "Evaluates interventions ranging from individual therapy to family and community programs, with a practical component in which students apply them.",
      },
      {
        code: "PSY 220",
        title: "Health Psychology",
        why: "Examines health and illness through a biopsychosocial model that weighs medical, psychological, social, and cultural factors.",
      },
      {
        code: "PSY 243",
        title: "Adolescent Development",
        why: "Examines cognitive and moral development, identity formation, and social relationships during adolescence.",
      },
      {
        code: "PSY 235",
        title: "Cultural Psychology",
        why: "Examines how psychological processes such as motivation, memory, and prejudice relate to diverse sociocultural contexts.",
      },
      {
        code: "PSY 356",
        title: "Adv Sem: PTSD",
        why: "Advanced seminar on how trauma affects thoughts, emotions, and behavior and on evidence-based PTSD treatments, including trauma-focused psychotherapies.",
      },
    ],
    pay: {
      occupation: "Psychologists",
      medianAnnual: 99110,
      period: "May 2025",
      projectedGrowth: "6% (2025-35), faster than average",
      url: "https://www.bls.gov/ooh/life-physical-and-social-science/psychologists.htm",
    },
    davidsonResources: [
      {
        name: "Davidson-Broughton Program",
        url: "https://www.davidson.edu/academic-departments/psychology/internships-careers-and-graduate-school/davidson-broughton-program",
        description:
          "Psychology department's 8-week summer internship at Broughton Hospital, a state psychiatric facility in Morganton, N.C.; students work alongside hospital professionals as observers in patient treatment programs and earn credit for PSY 290 Practicum in Psychology.",
      },
      {
        name: "Internships, Careers and Graduate School (Psychology)",
        url: "https://www.davidson.edu/academic-departments/psychology/internships-careers-and-graduate-school",
        description:
          "Psychology department advising on practica, internships, graduate school, and careers, including its weekly Psych Snippets newsletter of internship opportunities.",
      },
      {
        name: "Davidson Research Initiative",
        url: "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
        description:
          "Summer research fellowships in any discipline for first-years, sophomores, and juniors, working closely with a faculty or staff mentor.",
      },
      {
        name: "Summer Internship Grants (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants for students in unpaid or low-paying summer internships, applied for through Handshake.",
      },
    ],
    externalResources: [
      {
        name: "American Counseling Association",
        url: "https://www.counseling.org/",
        description:
          "Professional association for counselors with career, practice, and ethics resources, including the ACA Code of Ethics.",
      },
      {
        name: "NBCC: National Certified Counselor",
        url: "https://www.nbcc.org/certification/ncc",
        description:
          "National Board for Certified Counselors page on the NCC credential and its education, training, and examination requirements.",
      },
    ],
    handshakeQuery: "mental health",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/197",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/192",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/189",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/175",
      "https://www.bls.gov/ooh/life-physical-and-social-science/psychologists.htm",
      "https://www.bls.gov/ooh/life-physical-and-social-science/psychologists.htm#tab-4",
      "https://www.bls.gov/ooh/community-and-social-service/substance-abuse-behavioral-disorder-and-mental-health-counselors.htm",
      "https://www.davidson.edu/academic-departments/psychology/internships-careers-and-graduate-school/davidson-broughton-program",
      "https://www.davidson.edu/academic-departments/psychology/internships-careers-and-graduate-school",
      "https://www.davidson.edu/academics/research-opportunities/undergraduate-research/davidson-research-initiative",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.counseling.org/",
      "https://www.nbcc.org/certification/ncc",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page=2",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page=3",
      "https://www.davidson.edu/academic-departments/interdisciplinary-studies/majors",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "international-development",
    name: "International Development",
    cluster: "Social Impact",
    summary:
      "International development professionals plan, run, and evaluate programs meant to reduce poverty and improve health, education, and governance, working for nonprofits, international organizations, governments, and research groups. The work draws on economics, political science, anthropology, public health, and language skills.",
    whatYouDo: [
      "Work with communities and partners to identify needed programs and services",
      "Plan and manage programs, budgets, and reporting for funders",
      "Collect and analyze data to evaluate whether programs are working",
      "Write grant proposals to fund programs",
    ],
    departments: [
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "POL",
        name: "Political Science",
      },
      {
        code: "ANT",
        name: "Anthropology",
      },
      {
        code: "PBH",
        name: "Public Health",
      },
    ],
    relatedPrograms: [
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Political Science",
        acalogId: 196,
        type: "major",
      },
      {
        name: "Anthropology",
        acalogId: 162,
        type: "major",
      },
      {
        name: "Anthropology",
        acalogId: 162,
        type: "minor",
      },
      {
        name: "Public Health",
        acalogId: 189,
        type: "major",
      },
      {
        name: "Philosophy, Politics, and Economics",
        acalogId: 214,
        type: "major",
      },
    ],
    courses: [
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Covers microeconomics and macroeconomics as a foundation for understanding domestic and international economic issues.",
      },
      {
        code: "POL 140",
        title: "Comparative Politics",
        why: "Introduces the comparative study of political institutions, public policy challenges, and political trends in countries and regions around the world.",
      },
      {
        code: "POL 180",
        title: "Intro to Policy Analysis",
        why: "Teaches policy evaluation methods such as cost-benefit and risk analysis, with topics that include non-governmental organizations and foreign direct investment; students write a policy whitepaper.",
      },
      {
        code: "PBH 280",
        title: "Foundations of Global Health",
        why: "Analyzes global health challenges, key actors and institutions, and what it takes to design and implement effective health programs and policies in different contexts (requires PBH 110).",
      },
      {
        code: "ECO 288",
        title: "Int'l Political Economy",
        why: "Examines how political and economic forces interact internationally, including trade, financial crises, international financial institutions, and income inequality (requires ECO 101).",
      },
      {
        code: "POL 241",
        title: "Comparative Public Policy",
        why: "Examines how and why economic, health care, and immigration policies differ across nations and the challenges developed and developing states face in implementing public policy.",
      },
      {
        code: "ANT 360",
        title: "Development & Sustainability",
        why: "Examines development and sustainability through environmental anthropology and anthropological approaches to development theory, including environmental justice.",
      },
      {
        code: "ECO 341",
        title: "Applied Policy Impact Evaluatn",
        why: "Teaches policy impact evaluation methods and has students run their own evaluation in Stata (requires ECO 202 and ECO 204).",
      },
    ],
    pay: {
      occupation: "Social and Community Service Managers",
      medianAnnual: 80390,
      period: "May 2025",
      projectedGrowth: "7% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/management/social-and-community-service-managers.htm",
    },
    davidsonResources: [
      {
        name: "Dean Rusk Travel Grants",
        url: "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/dean-rusk-travel-grants",
        description:
          "Dean Rusk International Studies Program grants for winter-break (sophomores through seniors) and summer (first-years through juniors) projects abroad in four categories: exploratory and reflective, research, service, and select study programs; awards cover airfare, lodging, meals, and ground transportation.",
      },
      {
        name: "Education Abroad",
        url: "https://www.davidson.edu/offices-and-services/education-abroad",
        description:
          "Davidson's study abroad office, with summer, semester, and full-year programs, faculty-led programs, language study, and study abroad scholarships and grants.",
      },
      {
        name: "Office of Fellowships",
        url: "https://www.davidson.edu/offices-and-services/fellowships",
        description:
          "Advises Davidson students and alumni through applications for fellowships and scholarships such as the Fulbright U.S. Student Program and the Watson Fellowship.",
      },
      {
        name: "Summer Internship Grants (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants for students in unpaid or low-paying summer internships, applied for through Handshake.",
      },
    ],
    externalResources: [
      {
        name: "Fulbright U.S. Student Program",
        url: "https://us.fulbrightonline.org/",
        description:
          "Funds U.S. citizens to study, conduct research, or teach English abroad; awards are open in all academic disciplines.",
      },
      {
        name: "ReliefWeb Jobs",
        url: "https://reliefweb.int/jobs",
        description:
          "Job listings from the humanitarian information service run by the UN Office for the Coordination of Humanitarian Affairs (OCHA).",
      },
    ],
    handshakeQuery: "international development",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/196",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/162",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/189",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/214",
      "https://www.bls.gov/ooh/management/social-and-community-service-managers.htm",
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program",
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants",
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/international-travel-grants/student-grants/dean-rusk-travel-grants",
      "https://www.davidson.edu/offices-and-services/dean-rusk-international-studies-program/global-corps",
      "https://www.davidson.edu/offices-and-services/education-abroad",
      "https://www.davidson.edu/offices-and-services/fellowships",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.davidson.edu/offices-and-services/civic-engagement/community-based-experiential-learning/fellowships-and-internships",
      "https://us.fulbrightonline.org/",
      "https://reliefweb.int/jobs",
      "https://reliefweb.int/about",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page=2",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page=3",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "architecture-urban-planning",
    name: "Architecture & Urban Planning",
    cluster: "Media & Arts",
    summary:
      "Architects plan and design houses, offices, and other structures, and urban and regional planners develop plans for how land and public facilities are used in cities, counties, and regions. Becoming a licensed architect typically involves an architecture degree, a paid internship, and the Architect Registration Examination, while planners typically need a master's degree in urban and regional planning or a related field.",
    whatYouDo: [
      "Meet with clients and community stakeholders to set goals and requirements for a project",
      "Prepare scaled drawings and plans with software or by hand",
      "Gather and analyze data on land use, population, and the environment",
      "Review site plans against zoning rules and building codes, and visit worksites to check construction",
    ],
    departments: [
      {
        code: "ART",
        name: "Art",
      },
      {
        code: "ENV",
        name: "Environmental Studies",
      },
      {
        code: "SOC",
        name: "Sociology",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Art",
        acalogId: 165,
        type: "major",
      },
      {
        name: "Art",
        acalogId: 165,
        type: "minor",
      },
      {
        name: "Environmental Studies",
        acalogId: 177,
        type: "major",
      },
      {
        name: "Environmental Studies",
        acalogId: 177,
        type: "interdisciplinary-minor",
      },
      {
        name: "Sociology",
        acalogId: 201,
        type: "major",
      },
      {
        name: "Center for Interdisciplinary Studies",
        acalogId: 167,
        type: "other",
      },
    ],
    courses: [
      {
        code: "ART 101",
        title: "Basic Drawing",
        why: "Builds drawing skills and critical awareness across a variety of media, with no prior experience required.",
      },
      {
        code: "ART 109",
        title: "Basic Sculpture",
        why: "Hands-on introduction to three-dimensional work through woodworking, welding, mold-making, bronze casting, and 3D printing, with no prior experience required.",
      },
      {
        code: "ART 248",
        title: "From Agra to Istanbul",
        why: "Architecture history option: examines Islamic art and architecture from the Indian subcontinent to the eastern Mediterranean, including monumental religious and secular architecture.",
      },
      {
        code: "ENV 214",
        title: "Energy,Environ,EnginDesign+Lab",
        why: "Introduces engineering design through energy and the environment; student teams build computer-controlled models of solar-powered buildings (cross-listed as PHY 214; no math or science prerequisites).",
      },
      {
        code: "ENV 237",
        title: "Intro to Interdisciplinary GIS",
        why: "Introduces ArcGIS for mapping and analyzing spatial data such as demographics and land-use history (requires an introductory ENV course or instructor permission).",
      },
      {
        code: "SOC 250",
        title: "Housing",
        why: "Examines housing policy and neighborhood effects, including a unit in which students investigate housing in Charlotte neighborhoods.",
      },
      {
        code: "SOC 227",
        title: "Urban Sociology",
        why: "Studies how megacities in the global South change, including uneven development, displacement, gentrification, and urban governance.",
      },
      {
        code: "COM 360",
        title: "Rhetorics of Space/Place",
        why: "Examines how public spaces such as monuments, capitols, infrastructure, and new urbanist developments communicate and shape civic life.",
      },
    ],
    pay: {
      occupation: "Architects",
      medianAnnual: 99280,
      period: "May 2025",
      projectedGrowth: "4% (2025-35), as fast as average",
      url: "https://www.bls.gov/ooh/architecture-and-engineering/architects.htm",
    },
    davidsonResources: [
      {
        name: "Sustainability Scholars",
        url: "https://www.davidson.edu/offices-and-services/sustainability-office/sustainability-scholars",
        description:
          "Sustainability Office summer program that places students with private, public, or nonprofit organizations on community-scale sustainability projects; 2026 hosts included the City of Charlotte Office of Sustainability & Resilience, the Town of Davidson, and BikeWalk NC.",
      },
      {
        name: "Education Abroad",
        url: "https://www.davidson.edu/offices-and-services/education-abroad",
        description:
          "Davidson's study abroad office, with summer, semester, and full-year programs in more than 50 countries and study abroad scholarships and grants.",
      },
      {
        name: "Center for Interdisciplinary Studies: Majors",
        url: "https://www.davidson.edu/academic-departments/interdisciplinary-studies/majors",
        description:
          "Explains student-designed majors, created in close consultation with at least two faculty members, for students whose interests no existing major covers; it advises starting the process no later than fall of sophomore year.",
      },
      {
        name: "Summer Internship Grants (Matthews Center)",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants for students in unpaid or low-paying summer internships, applied for through Handshake.",
      },
    ],
    externalResources: [
      {
        name: "NCARB: Become an Architect",
        url: "https://www.ncarb.org/become-architect",
        description:
          "National Council of Architectural Registration Boards guide to the steps to earning an architecture license, with a tool showing each state's licensing requirements.",
      },
      {
        name: "NAAB Accredited Programs",
        url: "https://www.naab.org/home",
        description:
          "National Architectural Accrediting Board, which accredits professional architecture degree programs and publishes a program directory.",
      },
      {
        name: "American Planning Association: Choosing the Planning Profession",
        url: "https://www.planning.org/choosingplanning/",
        description:
          "American Planning Association guide to what planners do, where they work, the skills they need, and planning degrees and schools.",
      },
    ],
    handshakeQuery: "architecture",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/165",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/177",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/201",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/167",
      "https://www.bls.gov/ooh/architecture-and-engineering/architects.htm",
      "https://www.bls.gov/ooh/architecture-and-engineering/architects.htm#tab-4",
      "https://www.bls.gov/ooh/life-physical-and-social-science/urban-and-regional-planners.htm",
      "https://www.bls.gov/ooh/life-physical-and-social-science/urban-and-regional-planners.htm#tab-4",
      "https://www.davidson.edu/offices-and-services/sustainability-office/sustainability-scholars",
      "https://www.davidson.edu/offices-and-services/education-abroad",
      "https://www.davidson.edu/academic-departments/art-department/research-and-creative-activity",
      "https://www.davidson.edu/academic-departments/art-department/major-and-minor",
      "https://www.davidson.edu/academic-departments/art-department/education-abroad",
      "https://www.davidson.edu/academic-departments/interdisciplinary-studies/majors",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.ncarb.org/become-architect",
      "https://www.naab.org/home",
      "https://www.planning.org/choosingplanning/",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page=2",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs?page=3",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "sports-management",
    name: "Sports Management",
    cluster: "Business & Finance",
    summary:
      "Sports management is the business side of athletics: running events and venues, selling tickets and sponsorships, handling communications, and supporting teams and athletes in college and professional sports. At Davidson, preparation can include courses in economics, accounting, and communication, sport-focused electives when they are offered, and leadership and student jobs in club and intramural sports.",
    whatYouDo: [
      "Plan game days, tournaments, and other events, including venues, staff, and budgets",
      "Sell tickets, sponsorships, and partnerships",
      "Run team or athletic department communications, social media, and fan engagement",
      "Handle scheduling, travel, and day-to-day operations for teams and athletes",
    ],
    departments: [
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "COM",
        name: "Communication Studies",
      },
      {
        code: "SOC",
        name: "Sociology",
      },
      {
        code: "EDU",
        name: "Educational Studies",
      },
    ],
    relatedPrograms: [
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "major",
      },
      {
        name: "Communication Studies",
        acalogId: 171,
        type: "minor",
      },
      {
        name: "Sociology",
        acalogId: 201,
        type: "major",
      },
      {
        name: "Educational Studies",
        acalogId: 175,
        type: "minor",
      },
      {
        name: "Data Science",
        acalogId: 212,
        type: "interdisciplinary-minor",
      },
    ],
    courses: [
      {
        code: "ECO 101",
        title: "Introductory Economics",
        why: "Introduces the theories and institutions that organize economic activity, covering both microeconomics and macroeconomics, and is the foundation for further economics courses.",
      },
      {
        code: "ECO 211",
        title: "Introduction to Accounting",
        why: "Covers asset valuation, corporate accounts and statements, and how to interpret and analyze financial statements.",
      },
      {
        code: "ECO 204",
        title: "Stats & Basic Econometrics",
        why: "Applies probability and statistics, including hypothesis tests and regression, to economic analysis using spreadsheet software; requires ECO 101.",
      },
      {
        code: "COM 230",
        title: "Organizational Communication",
        why: "Studies how communication creates and sustains organizations, including leadership, workplace collaboration, and crisis communication.",
      },
      {
        code: "EDU 292",
        title: "Theory of Sports Coaching",
        why: "Surveys theory and research on coaching sports in secondary schools and colleges, including coaching philosophy, communication, skill development, and team management.",
      },
      {
        code: "COM 328",
        title: "Social Media Communication",
        why: "Examines how social media platforms work and their effects on culture, media, politics, and business; intended for Communication Studies majors or minors who have taken earlier Communication Studies electives.",
      },
      {
        code: "SOC 226",
        title: "Sociology of Sport",
        why: "Examines sport as a social institution, from youth and college sports (including Title IX and pay for college athletes) to professional sports, media portrayals, and sport activism.",
      },
      {
        code: "ECO 329",
        title: "Sports Economics",
        why: "Covers the structure of the professional sports industry, public finance of stadiums and team ownership, labor markets in pro sports, and the economics of NCAA athletics; requires ECO 202 and ECO 205.",
      },
    ],
    pay: {
      occupation: "Meeting, Convention, and Event Planners",
      medianAnnual: 61160,
      period: "May 2025",
      projectedGrowth: "6% (2025-35), faster than average",
      url: "https://www.bls.gov/ooh/business-and-financial/meeting-convention-and-event-planners.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center. It runs Handshake, the college's job and internship posting system, and helps students find internships, jobs, fellowships, and graduate programs.",
      },
      {
        name: "Matthews Center Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
        description:
          "Grants toward living costs for students in unpaid or low-paying summer internships, applied for through Handshake.",
      },
      {
        name: "Club Sports (Physical Education, Recreation & Wellness)",
        url: "https://www.davidson.edu/academic-departments/physical-education-recreation-wellness/club-sports",
        description:
          "Student-led club teams; club officers organize and oversee their clubs and build leadership, financial, and management skills. Registration is through WildcatSync.",
      },
      {
        name: "Intramural Sports (student employment)",
        url: "https://www.davidson.edu/academic-departments/physical-education-recreation-wellness/intramural-sports",
        description:
          "Student jobs in the Intramural Sports program: student officials for fall flickerball and flag football and spring 5-on-5 basketball, and, after at least one semester in the program, site supervisors who work all sports year-round; openings are posted on Handshake.",
      },
    ],
    externalResources: [
      {
        name: "NCAA Market",
        url: "https://ncaamarket.ncaa.org/",
        description: "The NCAA's job board for positions in college athletics.",
      },
      {
        name: "National Association of Collegiate Directors of Athletics (NACDA)",
        url: "https://nacda.com/sports/2018/7/17/nacda-nacda-overview-html.aspx",
        description:
          "The professional association for college athletics administrators, offering education and networking; it also runs an August-to-June internship program for people, typically recent graduates, who want to work in college athletics administration.",
      },
    ],
    handshakeQuery: "sports management",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/171",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/201",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/175",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/212",
      "https://www.bls.gov/ooh/business-and-financial/meeting-convention-and-event-planners.htm",
      "https://www.bls.gov/ooh/entertainment-and-sports/coaches-and-scouts.htm",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.davidson.edu/academic-departments/physical-education-recreation-wellness/club-sports",
      "https://www.davidson.edu/academic-departments/physical-education-recreation-wellness/intramural-sports",
      "https://www.davidson.edu/athletics",
      "https://www.davidson.edu/news/2022/04/08/davidson-sports-cats-stats-student-fan-section-and-pep-band",
      "https://www.davidson.edu/academic-departments/mathematics-and-computer-science/research",
      "https://ncaamarket.ncaa.org/",
      "https://nacda.com/sports/2018/7/17/foundation-nacda-current-interns-html.aspx",
      "https://nacda.com/sports/2018/7/17/nacda-nacda-overview-html.aspx",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "healthcare-administration",
    name: "Healthcare Administration",
    cluster: "Health",
    summary:
      "Healthcare administrators, whom the BLS calls medical and health services managers, plan, direct, and coordinate medical and health services, including budgets, staffing, records, and compliance with health laws, mostly in hospitals, nursing homes, and group medical practices. At Davidson, preparation can include the Public Health major or minor, courses in health economics and accounting, and summer internship grants for unpaid or low-paying internships, including a fund for healthcare-related internships.",
    whatYouDo: [
      "Prepare and monitor budgets and oversee finances such as patient fees and billing",
      "Recruit, train, supervise, and schedule staff",
      "Make sure the facility follows health care laws and regulations",
      "Set goals for the efficiency and quality of care and keep records of the services provided",
    ],
    departments: [
      {
        code: "PBH",
        name: "Public Health",
      },
      {
        code: "ECO",
        name: "Economics",
      },
      {
        code: "SOC",
        name: "Sociology",
      },
      {
        code: "POL",
        name: "Political Science",
      },
    ],
    relatedPrograms: [
      {
        name: "Public Health",
        acalogId: 189,
        type: "major",
      },
      {
        name: "Public Health",
        acalogId: 189,
        type: "interdisciplinary-minor",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "major",
      },
      {
        name: "Economics",
        acalogId: 174,
        type: "minor",
      },
      {
        name: "Sociology",
        acalogId: 201,
        type: "major",
      },
    ],
    courses: [
      {
        code: "PBH 110",
        title: "Introduction to Public Health",
        why: "Introduces the core disciplines of public health, including epidemiology and biostatistics, social and behavioral health, and health policy, law, and regulation.",
      },
      {
        code: "PBH 250",
        title: "Public Health Methods",
        why: "Builds skills in public health methods such as quantitative health data analysis, health surveys, policy analysis, and health communications; requires PBH 110.",
      },
      {
        code: "ECO 211",
        title: "Introduction to Accounting",
        why: "Covers asset valuation, corporate accounts and statements, and how to interpret and analyze financial statements.",
      },
      {
        code: "SOC 232",
        title: "Medical Sociology",
        why: "Uses social science research to analyze health, illness, and the health services industry, including differences in experience by gender, race, class, and age.",
      },
      {
        code: "ECO 322",
        title: "Health Economics",
        why: "Applies economic analysis to U.S. markets for medical care and health insurance, compares health care systems internationally, and examines reform proposals; requires ECO 101, 202, and 204.",
      },
      {
        code: "PBH 252",
        title: "Health System Ethics",
        why: "Asks what makes a health system function, how governments prioritize health programs and services, and how the economics of health care affects health systems.",
      },
      {
        code: "POL 225",
        title: "Public Policy",
        why: "Covers how governments form, carry out, and evaluate policy responses to public needs, with special topics such as health care and environmental policy.",
      },
    ],
    pay: {
      occupation: "Medical and Health Services Managers",
      medianAnnual: 123860,
      period: "May 2025",
      projectedGrowth: "24% (2025-35), much faster than average",
      url: "https://www.bls.gov/ooh/management/medical-and-health-services-managers.htm",
    },
    davidsonResources: [
      {
        name: "Matthews Center for Career Development",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
        description:
          "Davidson's career center. It runs Handshake, the college's job and internship posting system, and helps students find internships, jobs, fellowships, and graduate programs.",
      },
      {
        name: "Matthews Center Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
        description:
          "Grants toward living costs for unpaid or low-paying summer internships, applied for through Handshake. The named grants include the Juliana Tazewell Porter Memorial Internship Fund for internships in medical or other healthcare-related fields, with priority for student-athletes.",
      },
      {
        name: "Davidson College Public Health Experiential Learning Grant (Department of Public Health)",
        url: "https://www.davidson.edu/academic-departments/public-health/student-involvement",
        description:
          "Funding for students in unpaid or low-paying experiential learning related to public health policy, programs, or research.",
      },
      {
        name: "Premedicine and Allied Health Professions",
        url: "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions",
        description:
          "Davidson's pre-health advising program. Its director and advisors provide information on the health professions, including public health, and meet with students to plan a course of study.",
      },
    ],
    externalResources: [
      {
        name: "American College of Healthcare Executives: Start Your Career",
        url: "https://www.ache.org/Career-Resources/Start-Your-Career",
        description:
          "The professional society for healthcare leaders; this page has a guide to healthcare management careers and lists student internships, fellowships, and scholarships.",
      },
      {
        name: "Commission on Accreditation of Healthcare Management Education (CAHME)",
        url: "https://cahme.org/accreditation/accredited-certified-programs/",
        description:
          "The accrediting body for healthcare management education; this page lists universities with CAHME-accredited programs and links to its program search tool, for students considering a graduate healthcare management degree.",
      },
    ],
    handshakeQuery: "healthcare administration",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/189",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/174",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/201",
      "https://www.bls.gov/ooh/management/medical-and-health-services-managers.htm",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.davidson.edu/academic-departments/public-health",
      "https://www.davidson.edu/academic-departments/public-health/student-involvement",
      "https://www.davidson.edu/academic-departments/premedicine-and-allied-health-professions",
      "https://www.ache.org/Career-Resources/Start-Your-Career",
      "https://www.ache.org/Career-Resources/Start-Your-Career/Opportunities-for-Students",
      "https://cahme.org/about/why-cahme-matters-to-students/",
      "https://www.cahme.org/",
      "https://cahme.org/accreditation/accredited-certified-programs/",
      "https://advance.cahme.org/",
    ],
    verifiedAt: "2026-09-30",
  },
  {
    slug: "arts-museum-curation",
    name: "Museums, Curation & Archives",
    cluster: "Media & Arts",
    summary:
      "Curators, archivists, and other museum workers acquire, preserve, and research collections of art, artifacts, and historical records, and share them with the public through exhibitions, tours, and programs. At Davidson, students can study art history, archaeology, and archival research, and can learn about this work through the Van Every/Smith Galleries and the Archives & Special Collections.",
    whatYouDo: [
      "Acquire, catalog, and preserve artworks, artifacts, or historical records",
      "Research collections and choose the themes and design of exhibits",
      "Lead tours, workshops, and other public programs",
      "Organize and classify archival materials and safeguard records by making digital copies",
    ],
    departments: [
      {
        code: "ART",
        name: "Art",
      },
      {
        code: "ANT",
        name: "Anthropology",
      },
      {
        code: "CLA",
        name: "Classics",
      },
      {
        code: "AFR",
        name: "Africana Studies",
      },
      {
        code: "THE",
        name: "Theatre",
      },
    ],
    relatedPrograms: [
      {
        name: "Art",
        acalogId: 165,
        type: "major",
      },
      {
        name: "Art",
        acalogId: 165,
        type: "minor",
      },
      {
        name: "History",
        acalogId: 183,
        type: "major",
      },
      {
        name: "History",
        acalogId: 183,
        type: "minor",
      },
      {
        name: "Anthropology",
        acalogId: 162,
        type: "major",
      },
      {
        name: "Anthropology",
        acalogId: 162,
        type: "minor",
      },
      {
        name: "Classics",
        acalogId: 170,
        type: "major",
      },
    ],
    courses: [
      {
        code: "ART 232",
        title: "20th-c. Art: Post-Impr to PoMo",
        why: "Surveys how European, North American, and global artists responded to 20th-century modernization, from post-impressionism to postmodernism; open to all students with no prerequisites, and it counts toward the Art major and minor.",
      },
      {
        code: "ART 104",
        title: "Asian Art After 1000",
        why: "Surveys the arts of China, Japan, Korea, and India from 1000 C.E. to the present and counts toward the art history emphasis of the Art major and minor.",
      },
      {
        code: "CLA 140",
        title: "Anc Medit Art & Archaeology",
        why: "Investigates the art, archaeology, and architecture of ancient Greece and Italy and introduces current practices and issues in archaeology and art history.",
      },
      {
        code: "ANT 378",
        title: "Artifacts and Archives",
        why: "Combines archaeological evidence and archival records from the American South, with hands-on experience curating a historic archaeological collection and a critical look at public history and commemoration.",
      },
      {
        code: "AFR 224",
        title: "Race and Campus Histories",
        why: "Studies how colleges and universities reckon with slavery in their pasts, with trips to university archives and a final project on telling fuller institutional histories.",
      },
      {
        code: "THE 210",
        title: "Leadrshp&Mgt in Arts",
        why: "Introduces the management of non-profit cultural institutions, including leadership, marketing, fundraising, financial management, and board governance.",
      },
      {
        code: "ART 348",
        title: "Buying and Collecting Art",
        why: "A project-based course in curatorial and collection practice: students research artworks, work with gallery owners, acquire works under the Galleries' acquisition policy, and mount an exhibition; requires two art history courses.",
      },
    ],
    pay: {
      occupation: "Archivists, Curators, and Museum Workers",
      medianAnnual: 60330,
      period: "May 2025",
      projectedGrowth: "4% (2025-35), as fast as average",
      url: "https://www.bls.gov/ooh/education-training-and-library/curators-museum-technicians-and-conservators.htm",
    },
    davidsonResources: [
      {
        name: "Van Every/Smith Galleries (Art Galleries at Davidson College)",
        url: "https://www.davidson.edu/offices-and-services/art-galleries",
        description:
          "The college's art galleries, which hold a permanent collection of more than 4,000 works and involve students through internships, artist residencies, lectures, workshops, and public programs.",
      },
      {
        name: "Archives & Special Collections",
        url: "https://www.davidson.edu/offices-and-services/archives-and-special-collections",
        description:
          "Collects and preserves the college's records, local manuscript collections, rare books, and music collections, and supports student research with primary sources through instruction and reference help.",
      },
      {
        name: "Arts Fellows (Davidson Arts & Creative Engagement)",
        url: "https://www.davidson.edu/offices-and-services/arts-creative-engagement/arts-fellows",
        description:
          "A paid internship program run by Davidson Arts & Creative Engagement (DACE) that focuses on arts administration, creating and sharing passion for the arts, and arts advocacy; fellows lead student-centered arts programs.",
      },
      {
        name: "Matthews Center Summer Internship Grants",
        url: "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
        description:
          "Grants toward living costs for unpaid or low-paying summer internships, applied for through Handshake. The named grants include the Ginny Newell '78 Arts Fund and the Weeks Family Visual Arts Internship for visual-arts internships, and a separate grant for internships in the visual, literary, and performing arts.",
      },
    ],
    externalResources: [
      {
        name: "American Alliance of Museums: Career Management",
        url: "https://www.aam-us.org/topic/career-management/",
        description:
          "Career resources from the national museum association, including JobHQ, its museum job board.",
      },
      {
        name: "Society of American Archivists: Explore a Career in Archives",
        url: "https://www2.archivists.org/careers/beanarchivist",
        description:
          "From the national professional association for archivists: where archivists work and the usual education path, which for most entry-level jobs is an undergraduate and a graduate degree with archival coursework and a practicum.",
      },
      {
        name: "Smithsonian Internships",
        url: "https://internships.si.edu/",
        description:
          "The Smithsonian's central office for internships and fellowships across its museums, research centers, and zoo.",
      },
    ],
    handshakeQuery: "museum",
    sources: [
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202501",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202502",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
      "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202602",
      "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602",
      "https://catalog.davidson.edu/widget-api/catalog/4/programs",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/165",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/183",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/162",
      "https://catalog.davidson.edu/widget-api/catalog/4/program/170",
      "https://www.bls.gov/ooh/education-training-and-library/curators-museum-technicians-and-conservators.htm",
      "https://www.davidson.edu/offices-and-services/art-galleries",
      "https://www.davidson.edu/offices-and-services/archives-and-special-collections",
      "https://www.davidson.edu/offices-and-services/archives-and-special-collections/learn-about-archives-special-collections",
      "https://www.davidson.edu/offices-and-services/arts-creative-engagement",
      "https://www.davidson.edu/offices-and-services/arts-creative-engagement/arts-fellows",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants",
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development/key-programming/internships/summer-internship-grants/available-grants",
      "https://www.aam-us.org/topic/career-management/",
      "https://www2.archivists.org/",
      "https://www2.archivists.org/about",
      "https://internships.si.edu/",
      "https://www2.archivists.org/careers/beanarchivist",
    ],
    verifiedAt: "2026-09-30",
  },
] satisfies z.input<typeof CareerSchema>[];

export const CAREERS: readonly Career[] = defineContent(
  "careers",
  CareerSchema,
  RECORDS,
  (career) => career.slug,
);

export const CAREER_SLUGS: readonly string[] = Object.freeze(CAREERS.map((career) => career.slug));

const BY_SLUG = new Map(CAREERS.map((career) => [career.slug, career]));

/** The career path for a URL slug, or undefined (the page then calls notFound()). */
export function getCareer(slug: string): Career | undefined {
  return BY_SLUG.get(slug);
}

export function isCareerSlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export type CareerCluster = (typeof CAREER_CLUSTERS)[number];

/** Careers grouped by cluster, in CAREER_CLUSTERS order (empty clusters left out); careers keep list order. */
export function careersByCluster(): { cluster: CareerCluster; careers: Career[] }[] {
  return CAREER_CLUSTERS.map((cluster) => ({
    cluster,
    careers: CAREERS.filter((career) => career.cluster === cluster),
  })).filter((group) => group.careers.length > 0);
}

/** Every course code the career paths name, sorted and unique (for one validateCourseCodes / history call). */
export function careerCourseCodes(): string[] {
  return [
    ...new Set(CAREERS.flatMap((career) => career.courses.map((course) => course.code))),
  ].sort();
}
