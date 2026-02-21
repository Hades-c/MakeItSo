// Career paths data for the Pathfinder-style career browsing experience

export interface CareerPath {
  id: string;
  title: string;
  icon: string; // Lucide icon name
  description: string;
  tags: string[];
  salaryRange: { min: number; max: number };
  skills: string[];
  whatYoullDo: string[];
  dayInLife: string;
  courses: Array<{
    code: string;
    name: string;
    description: string;
    bestProfessor?: string;
    difficulty: number; // 1-5
  }>;
  summerOpportunities: Array<{
    title: string;
    type: string;
    description: string;
    timing: string;
  }>;
  networking: Array<{
    role: string;
    type: string;
    description: string;
    howToConnect: string;
  }>;
}

export const CAREER_PATH_FILTERS = [
  "All",
  "High Salary",
  "Work-Life Balance",
  "Technical",
  "Analytical",
  "Leadership",
  "Creative",
] as const;

export type CareerFilter = (typeof CAREER_PATH_FILTERS)[number];

const FILTER_MAP: Record<string, CareerFilter[]> = {
  "software-engineering": ["Technical", "High Salary"],
  "data-science": ["Technical", "Analytical", "High Salary"],
  "investment-banking": ["High Salary", "Analytical", "Leadership"],
  "management-consulting": ["High Salary", "Analytical", "Leadership"],
  "product-management": ["Technical", "Leadership"],
  "medicine": ["Analytical", "High Salary"],
  "law": ["Analytical", "Leadership"],
  "marketing": ["Creative", "Leadership"],
  "research-academia": ["Analytical", "Work-Life Balance"],
  "public-policy": ["Leadership", "Work-Life Balance"],
  "entrepreneurship": ["Leadership", "Creative"],
  "journalism": ["Creative", "Work-Life Balance"],
  "environmental-science": ["Analytical", "Work-Life Balance"],
  "ux-design": ["Creative", "Technical"],
  "nonprofit": ["Leadership", "Work-Life Balance"],
  "education": ["Work-Life Balance", "Leadership"],
};

export function filterCareerPaths(paths: CareerPath[], filter: CareerFilter): CareerPath[] {
  if (filter === "All") return paths;
  return paths.filter((p) => FILTER_MAP[p.id]?.includes(filter));
}

export const CAREER_PATHS: CareerPath[] = [
  {
    id: "software-engineering",
    title: "Software Engineering",
    icon: "Code2",
    description: "Build the technology that powers modern life — from mobile apps to cloud infrastructure and AI systems.",
    tags: ["Technical", "High Salary"],
    salaryRange: { min: 85000, max: 180000 },
    skills: ["Python", "Data Structures", "System Design", "Git", "Problem Solving"],
    whatYoullDo: [
      "Design and build software applications and systems",
      "Write clean, tested, and maintainable code",
      "Collaborate with cross-functional teams on product features",
      "Debug and optimize performance-critical systems",
      "Participate in code reviews and architectural decisions",
    ],
    dayInLife: "Your morning starts with a standup where your team syncs on priorities. You spend the first half of the day deep in code — maybe building a new API endpoint or refactoring a data pipeline. After lunch, you pair-program with a teammate to work through a tricky bug. You end the day reviewing pull requests and sketching out the architecture for next sprint's feature.",
    courses: [
      { code: "CSC 121", name: "Programming & Problem Solving", description: "Introduction to programming using Python. Covers variables, control flow, functions, and basic data structures.", bestProfessor: "Dr. Ramanujan", difficulty: 2 },
      { code: "CSC 221", name: "Data Structures", description: "Study of fundamental data structures: arrays, linked lists, trees, graphs, hash tables, and their applications.", bestProfessor: "Dr. Ramanujan", difficulty: 3 },
      { code: "CSC 231", name: "Computer Organization", description: "How computers work at the hardware level — digital logic, assembly, memory hierarchy.", bestProfessor: "Dr. Tabor", difficulty: 4 },
      { code: "CSC 321", name: "Analysis of Algorithms", description: "Algorithm design techniques and complexity analysis. Covers sorting, graph algorithms, dynamic programming.", bestProfessor: "Dr. Ramanujan", difficulty: 4 },
      { code: "MAT 150", name: "Discrete Mathematics", description: "Mathematical foundations for CS: logic, sets, combinatorics, graph theory, proof techniques.", bestProfessor: "Dr. Hossain", difficulty: 3 },
      { code: "CSC 371", name: "Software Engineering", description: "Software development methodologies, testing, version control, and team-based project work.", bestProfessor: "Dr. Webber", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "Software Engineering Internship", type: "Internship", description: "Top Davidson destinations: Microsoft, Google, Meta, Red Ventures (Charlotte), LendingTree, and startups in the Hurt Hub network. Apply through Handshake by October.", timing: "Summer after Sophomore or Junior year" },
      { title: "Hurt Hub Startup Fellowship", type: "Fellowship", description: "Work directly with a Charlotte-area startup through the Jay Hurt Hub for Innovation at Davidson. Stipend provided. Great for freshmen/sophomores.", timing: "Summer after Freshman or Sophomore year" },
      { title: "Hackathon Participation", type: "Competition", description: "Join HackDavidson (on campus), HackMIT, PennApps, or HackNC at UNC. Build projects under pressure and win prizes.", timing: "Year-round, especially fall" },
      { title: "CS Research with Davidson Faculty", type: "Research", description: "Work with Dr. Ramanujan (AI), Dr. Mendes (distributed systems), or Dr. Peck (VR) on summer research. Funded through Davidson Research Initiative.", timing: "Summer after Freshman or Sophomore year" },
    ],
    networking: [
      { role: "CS Department Faculty", type: "Faculty", description: "Build relationships with professors for research opportunities and grad school recommendations.", howToConnect: "Attend office hours regularly, especially Dr. Ramanujan and Dr. Tabor" },
      { role: "Davidson CS Alumni in Tech", type: "Alumni", description: "Connect with graduates working at major tech companies for referrals and mentorship.", howToConnect: "Use LinkedIn and Davidson alumni network; attend career fairs" },
      { role: "Career Development Center", type: "Advisor", description: "Get help with resume reviews, interview prep, and internship applications.", howToConnect: "Schedule appointments through the CDC website" },
    ],
  },
  {
    id: "data-science",
    title: "Data Science & Analytics",
    icon: "BarChart3",
    description: "Turn raw data into insights that drive decision-making across industries — from healthcare to finance to tech.",
    tags: ["Technical", "Analytical", "High Salary"],
    salaryRange: { min: 75000, max: 160000 },
    skills: ["Python", "R", "SQL", "Statistics", "Machine Learning", "Data Visualization"],
    whatYoullDo: [
      "Analyze large datasets to uncover patterns and trends",
      "Build predictive models using machine learning techniques",
      "Create dashboards and visualizations to communicate findings",
      "Design experiments and A/B tests to validate hypotheses",
      "Collaborate with stakeholders to define data-driven strategies",
    ],
    dayInLife: "You start your day reviewing overnight model performance metrics and checking data pipelines. Mid-morning, you dive into exploratory data analysis on a new customer dataset, building visualizations to spot trends. After lunch, you present findings to the product team and discuss experiment design. The afternoon is spent refining a classification model and writing documentation for your analysis.",
    courses: [
      { code: "MAT 220", name: "Probability & Statistics I", description: "Introduction to probability theory, random variables, distributions, and statistical inference.", bestProfessor: "Dr. Bowen", difficulty: 3 },
      { code: "CSC 121", name: "Programming & Problem Solving", description: "Learn Python programming fundamentals — the primary language for data science.", bestProfessor: "Dr. Ramanujan", difficulty: 2 },
      { code: "MAT 150", name: "Discrete Mathematics", description: "Logic, combinatorics, and graph theory — mathematical foundations for data analysis.", bestProfessor: "Dr. Hossain", difficulty: 3 },
      { code: "ECO 255", name: "Econometrics", description: "Statistical methods applied to economic data. Regression analysis, hypothesis testing, causal inference.", bestProfessor: "Dr. Smith", difficulty: 4 },
      { code: "CSC 321", name: "Analysis of Algorithms", description: "Understand computational complexity and algorithm efficiency for large-scale data processing.", bestProfessor: "Dr. Ramanujan", difficulty: 4 },
      { code: "MAT 340", name: "Linear Algebra", description: "Vectors, matrices, transformations — essential math for machine learning and dimensionality reduction.", bestProfessor: "Dr. Hossain", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "Data Science Internship", type: "Internship", description: "Apply analytical skills at companies like Amazon, Spotify, or consulting firms.", timing: "Summer after Sophomore or Junior year" },
      { title: "Undergraduate Research Fellowship", type: "Research", description: "Work with faculty on data-driven research projects in biology, economics, or social sciences.", timing: "Summer after Freshman or Sophomore year" },
      { title: "Kaggle Competitions", type: "Competition", description: "Compete in data science challenges to build skills and portfolio projects.", timing: "Year-round" },
    ],
    networking: [
      { role: "Math & CS Faculty", type: "Faculty", description: "Connect with professors who bridge statistics and computing.", howToConnect: "Take cross-listed courses and attend department events" },
      { role: "Industry Data Scientists", type: "Professional", description: "Learn about real-world data science workflows and tools.", howToConnect: "Attend virtual meetups and LinkedIn networking events" },
    ],
  },
  {
    id: "investment-banking",
    title: "Investment Banking",
    icon: "TrendingUp",
    description: "Advise corporations on mergers, acquisitions, and capital raising — the financial engine of global business.",
    tags: ["High Salary", "Analytical", "Leadership"],
    salaryRange: { min: 100000, max: 200000 },
    skills: ["Financial Modeling", "Valuation", "Excel", "Accounting", "Communication"],
    whatYoullDo: [
      "Build detailed financial models for M&A transactions",
      "Conduct industry research and competitive analysis",
      "Prepare pitch books and presentation materials for clients",
      "Analyze company valuations using DCF, comparables, and precedent transactions",
      "Support senior bankers in deal execution and client management",
    ],
    dayInLife: "You arrive early to check market news and update your live models. The morning is spent building a DCF valuation for a potential acquisition target. After a working lunch with your deal team, you refine a pitch deck for a client meeting. Late afternoon brings a call with the client's CFO to discuss deal structure. You end the day reviewing the latest comparable transactions data.",
    courses: [
      { code: "ECO 101", name: "Principles of Economics", description: "Foundation in micro and macroeconomic theory — supply/demand, market structures, GDP.", bestProfessor: "Dr. Griffith", difficulty: 2 },
      { code: "ECO 255", name: "Econometrics", description: "Statistical methods for economic data analysis — regression, hypothesis testing.", bestProfessor: "Dr. Smith", difficulty: 4 },
      { code: "ECO 315", name: "Financial Economics", description: "Asset pricing, portfolio theory, risk management, and capital markets.", bestProfessor: "Dr. Anderson", difficulty: 4 },
      { code: "MAT 110", name: "Calculus I", description: "Limits, derivatives, integrals — the mathematical language of finance.", bestProfessor: "Dr. Bowen", difficulty: 3 },
      { code: "ACC 215", name: "Financial Accounting", description: "Understanding financial statements — balance sheets, income statements, cash flow.", bestProfessor: "Dr. Palmer", difficulty: 3 },
      { code: "ECO 360", name: "Corporate Finance", description: "Capital budgeting, cost of capital, capital structure, and dividend policy.", bestProfessor: "Dr. Anderson", difficulty: 4 },
    ],
    summerOpportunities: [
      { title: "IB Summer Analyst Program", type: "Internship", description: "10-week programs at bulge bracket banks (Goldman Sachs, Morgan Stanley, JPMorgan) or boutiques (Evercore, Lazard).", timing: "Summer after Junior year (apply fall of Junior year)" },
      { title: "Sophomore Diversity Program", type: "Program", description: "Pre-internship programs at major banks for underrepresented students.", timing: "Summer after Sophomore year" },
      { title: "Davidson Finance Club", type: "Club", description: "Practice financial modeling, stock pitches, and networking with alumni in finance.", timing: "Year-round" },
    ],
    networking: [
      { role: "Davidson Alumni on Wall Street", type: "Alumni", description: "Many Davidson graduates work in banking — leverage the alumni network aggressively.", howToConnect: "Email alumni directly; use LinkedIn; attend NYC networking trips" },
      { role: "Economics Department Faculty", type: "Faculty", description: "Get strong recommendations and guidance on breaking into finance.", howToConnect: "Take advanced econ courses and build relationships early" },
      { role: "Career Development Center", type: "Advisor", description: "Resume reviews, mock interviews, and finance-specific career prep.", howToConnect: "Book appointments early in fall semester" },
    ],
  },
  {
    id: "management-consulting",
    title: "Management Consulting",
    icon: "Lightbulb",
    description: "Solve complex business problems for Fortune 500 companies — strategy, operations, and organizational design.",
    tags: ["High Salary", "Analytical", "Leadership"],
    salaryRange: { min: 90000, max: 175000 },
    skills: ["Problem Solving", "Data Analysis", "Presentation", "Strategy", "Leadership"],
    whatYoullDo: [
      "Structure ambiguous business problems into solvable frameworks",
      "Conduct market research and competitive benchmarking",
      "Analyze data to develop strategic recommendations",
      "Present findings to C-suite executives",
      "Lead workstreams and manage junior team members",
    ],
    dayInLife: "Your week alternates between client site (Mon-Thu) and your home office (Fri). On-site days start with a team check-in, then you spend the morning analyzing customer survey data. After lunch with the client's VP of Strategy, you build slides synthesizing your findings. The afternoon is a workshop with client stakeholders to pressure-test your recommendations.",
    courses: [
      { code: "ECO 101", name: "Principles of Economics", description: "Microeconomic and macroeconomic fundamentals for business analysis.", bestProfessor: "Dr. Griffith", difficulty: 2 },
      { code: "MAT 220", name: "Probability & Statistics I", description: "Statistical analysis skills essential for data-driven consulting.", bestProfessor: "Dr. Bowen", difficulty: 3 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Understanding human behavior and decision-making — key for organizational consulting.", bestProfessor: "Dr. Thompson", difficulty: 2 },
      { code: "COM 210", name: "Public Speaking", description: "Develop clear, persuasive communication skills for client presentations.", bestProfessor: "Dr. Williams", difficulty: 2 },
      { code: "PHI 220", name: "Ethics", description: "Frameworks for ethical reasoning — critical for advising organizations responsibly.", bestProfessor: "Dr. Martin", difficulty: 3 },
      { code: "ECO 255", name: "Econometrics", description: "Quantitative analysis and regression modeling for business insights.", bestProfessor: "Dr. Smith", difficulty: 4 },
    ],
    summerOpportunities: [
      { title: "Consulting Summer Analyst", type: "Internship", description: "Intern at MBB (McKinsey, Bain, BCG) or other top firms (Deloitte, Accenture, LEK).", timing: "Summer after Junior year" },
      { title: "Case Competition", type: "Competition", description: "Participate in case competitions to build analytical and presentation skills.", timing: "Fall and Spring semesters" },
      { title: "Non-profit Consulting", type: "Project", description: "Gain real consulting experience by advising local nonprofits on strategy.", timing: "Any summer" },
    ],
    networking: [
      { role: "Davidson Alumni in Consulting", type: "Alumni", description: "Davidson punches above its weight in MBB placements — use the network.", howToConnect: "Request coffee chats via LinkedIn; attend info sessions" },
      { role: "Career Center Consulting Prep", type: "Advisor", description: "Case interview practice, resume workshops, and firm-specific advice.", howToConnect: "Join the consulting prep group early in sophomore year" },
    ],
  },
  {
    id: "product-management",
    title: "Product Management",
    icon: "Layers",
    description: "Define what gets built and why — lead the intersection of business, design, and engineering at tech companies.",
    tags: ["Technical", "Leadership"],
    salaryRange: { min: 90000, max: 170000 },
    skills: ["Strategy", "User Research", "Data Analysis", "Communication", "Technical Fluency"],
    whatYoullDo: [
      "Define product vision and roadmap based on user needs and business goals",
      "Write product requirements and user stories for engineering teams",
      "Analyze user data and feedback to prioritize features",
      "Coordinate cross-functional teams (engineering, design, marketing)",
      "Run experiments and iterate based on metrics",
    ],
    dayInLife: "You start with metrics review — checking overnight usage data and experiment results. Morning standup with your engineering team covers sprint progress. You spend mid-morning interviewing users to validate a new feature concept. After lunch, you work with design on wireframes, then sync with marketing on the upcoming launch. The day ends with a roadmap planning session.",
    courses: [
      { code: "CSC 121", name: "Programming & Problem Solving", description: "Enough technical depth to collaborate effectively with engineers.", bestProfessor: "Dr. Ramanujan", difficulty: 2 },
      { code: "ECO 101", name: "Principles of Economics", description: "Business fundamentals and market dynamics for product strategy.", bestProfessor: "Dr. Griffith", difficulty: 2 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Understand user behavior and cognitive biases for better product design.", bestProfessor: "Dr. Thompson", difficulty: 2 },
      { code: "MAT 220", name: "Probability & Statistics I", description: "Data analysis skills for metrics-driven product decisions.", bestProfessor: "Dr. Bowen", difficulty: 3 },
      { code: "COM 210", name: "Public Speaking", description: "Present product vision clearly to stakeholders and executives.", bestProfessor: "Dr. Williams", difficulty: 2 },
    ],
    summerOpportunities: [
      { title: "APM Program", type: "Internship", description: "Associate Product Manager internships at Google, Meta, Microsoft, or Uber.", timing: "Summer after Junior year" },
      { title: "Startup Internship", type: "Internship", description: "Wear multiple hats at a startup — closer to the product and faster iteration.", timing: "Any summer" },
      { title: "Build a Side Project", type: "Project", description: "Ship a real product (app, website, tool) to demonstrate product thinking.", timing: "Any time" },
    ],
    networking: [
      { role: "Tech Alumni in PM Roles", type: "Alumni", description: "Learn about different PM career paths and get referrals.", howToConnect: "LinkedIn outreach with specific, thoughtful questions" },
      { role: "CS & Design Faculty", type: "Faculty", description: "Bridge technical and creative perspectives.", howToConnect: "Take courses that blend CS with design or business" },
    ],
  },
  {
    id: "medicine",
    title: "Healthcare & Medicine",
    icon: "Heart",
    description: "Diagnose, treat, and prevent disease — from clinical practice to medical research and public health.",
    tags: ["Analytical", "High Salary"],
    salaryRange: { min: 60000, max: 300000 },
    skills: ["Biology", "Chemistry", "Patient Care", "Critical Thinking", "Research Methods"],
    whatYoullDo: [
      "Diagnose and treat patients with evidence-based medicine",
      "Conduct clinical research to advance medical knowledge",
      "Collaborate with interdisciplinary healthcare teams",
      "Communicate complex medical information to patients and families",
      "Stay current with medical literature and continuing education",
    ],
    dayInLife: "Residency days start early with patient rounds at 6 AM, reviewing overnight changes. Morning clinic hours involve seeing patients, ordering labs, and consulting with specialists. You attend a noon conference on the latest treatment protocols. The afternoon is spent in the OR or following up on test results. You end with chart notes and preparing for tomorrow's cases.",
    courses: [
      { code: "BIO 111", name: "Introductory Biology I", description: "Cell biology, genetics, and molecular biology — the foundation of medical science.", bestProfessor: "Dr. Johnson", difficulty: 3 },
      { code: "BIO 112", name: "Introductory Biology II", description: "Ecology, evolution, and organismal biology.", bestProfessor: "Dr. Johnson", difficulty: 3 },
      { code: "CHE 115", name: "General Chemistry I", description: "Atomic structure, bonding, stoichiometry — essential for understanding pharmacology.", bestProfessor: "Dr. Lee", difficulty: 3 },
      { code: "CHE 240", name: "Organic Chemistry I", description: "Carbon chemistry and reaction mechanisms — the gateway to biochemistry.", bestProfessor: "Dr. Lee", difficulty: 5 },
      { code: "BIO 306", name: "Biochemistry", description: "Protein structure, enzyme kinetics, metabolic pathways.", bestProfessor: "Dr. Rodriguez", difficulty: 4 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Understanding the psychological dimensions of patient care.", bestProfessor: "Dr. Thompson", difficulty: 2 },
    ],
    summerOpportunities: [
      { title: "Clinical Shadowing", type: "Experience", description: "Shadow physicians in various specialties to explore interests and build clinical exposure.", timing: "Summer after Freshman year" },
      { title: "Biomedical Research", type: "Research", description: "Work in a research lab at Davidson or an academic medical center.", timing: "Summer after Sophomore year" },
      { title: "Medical Mission Trip", type: "Service", description: "Gain global health experience while serving underserved communities.", timing: "Any summer or winter break" },
      { title: "MCAT Preparation", type: "Preparation", description: "Dedicate time to MCAT study — most students take it summer after Junior year.", timing: "Summer after Junior year" },
    ],
    networking: [
      { role: "Pre-Health Advisor", type: "Advisor", description: "Guidance on pre-med track, med school applications, and gap year planning.", howToConnect: "Schedule regular meetings starting freshman year" },
      { role: "Davidson Pre-Med Alumni", type: "Alumni", description: "Learn about different medical schools and specialties from Davidson graduates.", howToConnect: "Pre-health alumni panels and LinkedIn outreach" },
      { role: "Biology & Chemistry Faculty", type: "Faculty", description: "Strong letters of recommendation and research opportunities.", howToConnect: "Excel in courses and seek out lab opportunities" },
    ],
  },
  {
    id: "law",
    title: "Law",
    icon: "Scale",
    description: "Advocate, negotiate, and shape policy — from corporate law to public interest litigation and government service.",
    tags: ["Analytical", "Leadership"],
    salaryRange: { min: 70000, max: 190000 },
    skills: ["Legal Writing", "Critical Analysis", "Research", "Public Speaking", "Negotiation"],
    whatYoullDo: [
      "Research legal precedents and analyze case law",
      "Draft legal documents, briefs, and contracts",
      "Represent clients in negotiations, mediations, and court proceedings",
      "Advise organizations on legal compliance and risk management",
      "Develop legal strategies for complex disputes",
    ],
    dayInLife: "Your morning begins with reviewing case files and drafting a motion. You spend mid-morning in a client meeting discussing litigation strategy. After lunch, you research precedent cases in Westlaw for a brief due next week. The afternoon includes a deposition and a call with opposing counsel to discuss settlement terms. You end the day reviewing contracts for a corporate client.",
    courses: [
      { code: "POL 101", name: "American Government", description: "The structure and function of U.S. government — constitutional law foundations.", bestProfessor: "Dr. Chen", difficulty: 2 },
      { code: "PHI 220", name: "Ethics", description: "Moral reasoning frameworks essential for legal practice.", bestProfessor: "Dr. Martin", difficulty: 3 },
      { code: "ENG 270", name: "Legal Writing", description: "Persuasive writing and argumentation — the core skill of legal practice.", bestProfessor: "Dr. Harris", difficulty: 3 },
      { code: "POL 315", name: "Constitutional Law", description: "Deep dive into constitutional interpretation and landmark Supreme Court cases.", bestProfessor: "Dr. Chen", difficulty: 4 },
      { code: "HIS 200", name: "American History", description: "Historical context for understanding legal evolution and social justice.", bestProfessor: "Dr. Price", difficulty: 2 },
      { code: "COM 210", name: "Public Speaking", description: "Oral advocacy skills for courtroom and client presentations.", bestProfessor: "Dr. Williams", difficulty: 2 },
    ],
    summerOpportunities: [
      { title: "Law Firm Internship", type: "Internship", description: "Work at a law firm to experience legal practice firsthand.", timing: "Summer after Sophomore or Junior year" },
      { title: "Government Internship", type: "Internship", description: "Intern at the DOJ, state attorney general, or a congressional office.", timing: "Summer after Sophomore year" },
      { title: "Mock Trial Competition", type: "Competition", description: "Develop trial advocacy skills through competitive mock trial.", timing: "Year-round" },
      { title: "LSAT Preparation", type: "Preparation", description: "Study for the LSAT — most students take it junior or senior year.", timing: "Summer after Junior year" },
    ],
    networking: [
      { role: "Pre-Law Advisor", type: "Advisor", description: "Guidance on law school applications and career path options.", howToConnect: "Schedule meetings with the pre-law advisor early" },
      { role: "Davidson Alumni Attorneys", type: "Alumni", description: "Learn about different legal specialties and get application advice.", howToConnect: "Alumni networking events and LinkedIn" },
      { role: "Political Science Faculty", type: "Faculty", description: "Strong recommendations and mentorship in legal thinking.", howToConnect: "Take advanced courses in constitutional law and political theory" },
    ],
  },
  {
    id: "marketing",
    title: "Marketing & Communications",
    icon: "Megaphone",
    description: "Shape how brands connect with audiences through strategy, storytelling, data, and creative campaigns.",
    tags: ["Creative", "Leadership"],
    salaryRange: { min: 50000, max: 120000 },
    skills: ["Storytelling", "Analytics", "Social Media", "Brand Strategy", "Content Creation"],
    whatYoullDo: [
      "Develop marketing strategies and campaign plans",
      "Create compelling content across digital and traditional channels",
      "Analyze campaign performance and optimize based on data",
      "Manage brand identity and messaging consistency",
      "Collaborate with creative teams and external agencies",
    ],
    dayInLife: "Your morning starts with checking campaign analytics and social media engagement. You join a creative brainstorm for an upcoming product launch. Mid-morning, you review copy and design assets for a digital ad campaign. After lunch, you analyze A/B test results and adjust targeting. The afternoon is spent planning content for next month and meeting with an influencer partner.",
    courses: [
      { code: "COM 210", name: "Public Speaking", description: "Clear, persuasive communication — the foundation of marketing.", bestProfessor: "Dr. Williams", difficulty: 2 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Consumer behavior and decision-making psychology.", bestProfessor: "Dr. Thompson", difficulty: 2 },
      { code: "ECO 101", name: "Principles of Economics", description: "Market dynamics and consumer theory.", bestProfessor: "Dr. Griffith", difficulty: 2 },
      { code: "ENG 220", name: "Creative Writing", description: "Storytelling and narrative skills for compelling brand content.", bestProfessor: "Dr. Harris", difficulty: 2 },
      { code: "ART 120", name: "Visual Design", description: "Principles of visual communication and design thinking.", bestProfessor: "Dr. Torres", difficulty: 2 },
      { code: "MAT 220", name: "Probability & Statistics I", description: "Data literacy for measuring marketing effectiveness.", bestProfessor: "Dr. Bowen", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "Marketing Internship", type: "Internship", description: "Work at an agency, brand, or tech company marketing team.", timing: "Summer after Sophomore or Junior year" },
      { title: "Content Creation", type: "Project", description: "Build a personal brand or portfolio through blogging, social media, or video.", timing: "Year-round" },
      { title: "Brand Strategy Case Competition", type: "Competition", description: "Develop a marketing strategy for a real brand challenge.", timing: "Fall or Spring semester" },
    ],
    networking: [
      { role: "Communications Faculty", type: "Faculty", description: "Mentorship in storytelling and media strategy.", howToConnect: "Take communication studies courses and build relationships" },
      { role: "Marketing Alumni", type: "Alumni", description: "Learn about agency vs. in-house vs. startup marketing careers.", howToConnect: "LinkedIn outreach and alumni career panels" },
    ],
  },
  {
    id: "research-academia",
    title: "Research & Academia",
    icon: "Microscope",
    description: "Push the boundaries of human knowledge through original research, teaching, and scholarly publication.",
    tags: ["Analytical", "Work-Life Balance"],
    salaryRange: { min: 55000, max: 130000 },
    skills: ["Research Methods", "Writing", "Critical Analysis", "Teaching", "Grant Writing"],
    whatYoullDo: [
      "Design and conduct original research studies",
      "Publish findings in peer-reviewed journals",
      "Teach courses and mentor students",
      "Apply for grants to fund research programs",
      "Present at academic conferences worldwide",
    ],
    dayInLife: "Your morning starts with writing — working on a journal article or grant proposal. Late morning, you teach an undergraduate seminar. After lunch, you meet with graduate students to discuss their research progress. The afternoon is spent in the lab or analyzing data. You end with reviewing a paper for a journal and preparing for tomorrow's lecture.",
    courses: [
      { code: "MAT 220", name: "Probability & Statistics I", description: "Research methodology and statistical analysis fundamentals.", bestProfessor: "Dr. Bowen", difficulty: 3 },
      { code: "PHI 220", name: "Ethics", description: "Research ethics and responsible scholarship.", bestProfessor: "Dr. Martin", difficulty: 3 },
      { code: "ENG 270", name: "Expository Writing", description: "Academic writing skills for publications and grant proposals.", bestProfessor: "Dr. Harris", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "Faculty Research Assistant", type: "Research", description: "Work directly with Davidson faculty on publishable research.", timing: "Summer after Freshman or Sophomore year" },
      { title: "REU Program", type: "Research", description: "NSF-funded Research Experience for Undergraduates at major universities.", timing: "Summer after Sophomore or Junior year" },
      { title: "Conference Presentation", type: "Experience", description: "Present your research at regional or national academic conferences.", timing: "Junior or Senior year" },
    ],
    networking: [
      { role: "Faculty Mentors", type: "Faculty", description: "Your most important relationships — they'll guide your path to grad school.", howToConnect: "Start research early and maintain long-term mentorship" },
      { role: "Graduate School Alumni", type: "Alumni", description: "Learn about PhD programs and the academic job market.", howToConnect: "Faculty can connect you with their former students" },
    ],
  },
  {
    id: "public-policy",
    title: "Government & Public Policy",
    icon: "Landmark",
    description: "Shape the rules and systems that govern society — from local government to federal policy to international relations.",
    tags: ["Leadership", "Work-Life Balance"],
    salaryRange: { min: 50000, max: 120000 },
    skills: ["Policy Analysis", "Research", "Writing", "Public Speaking", "Data Analysis"],
    whatYoullDo: [
      "Research and analyze policy proposals and their potential impact",
      "Draft legislation, regulations, and policy briefs",
      "Engage with stakeholders and constituents",
      "Manage government programs and budgets",
      "Advocate for policy changes through data and persuasion",
    ],
    dayInLife: "Your morning starts with a briefing on the latest policy developments. You spend the first half reviewing a draft regulation and preparing talking points for your director. After lunch, you attend a committee hearing and take notes on stakeholder testimony. The afternoon is spent analyzing the budgetary impact of a proposed amendment. You end with a call to a state agency partner.",
    courses: [
      { code: "POL 101", name: "American Government", description: "How U.S. government works — the foundation of policy work.", bestProfessor: "Dr. Chen", difficulty: 2 },
      { code: "ECO 101", name: "Principles of Economics", description: "Economic analysis for policy evaluation.", bestProfessor: "Dr. Griffith", difficulty: 2 },
      { code: "POL 250", name: "International Relations", description: "Global politics and international policy frameworks.", bestProfessor: "Dr. Chen", difficulty: 3 },
      { code: "SOC 101", name: "Introduction to Sociology", description: "Understanding social structures that policy aims to address.", bestProfessor: "Dr. Rivera", difficulty: 2 },
      { code: "MAT 220", name: "Probability & Statistics I", description: "Data analysis for evidence-based policymaking.", bestProfessor: "Dr. Bowen", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "Congressional Internship", type: "Internship", description: "Work in a congressional office on Capitol Hill.", timing: "Summer after Sophomore or Junior year" },
      { title: "Think Tank Research", type: "Research", description: "Contribute to policy research at organizations like Brookings or RAND.", timing: "Summer after Junior year" },
      { title: "Local Government Fellowship", type: "Fellowship", description: "Work with local government on community issues.", timing: "Any summer" },
    ],
    networking: [
      { role: "Political Science Faculty", type: "Faculty", description: "Mentorship in policy analysis and connections to policy networks.", howToConnect: "Take advanced political science courses" },
      { role: "Government Alumni", type: "Alumni", description: "Davidson alumni in government and policy roles.", howToConnect: "D.C. networking events and alumni panels" },
    ],
  },
  {
    id: "entrepreneurship",
    title: "Entrepreneurship",
    icon: "Rocket",
    description: "Launch and scale your own ventures — from tech startups to social enterprises to small businesses.",
    tags: ["Leadership", "Creative"],
    salaryRange: { min: 0, max: 200000 },
    skills: ["Business Strategy", "Sales", "Leadership", "Fundraising", "Product Development"],
    whatYoullDo: [
      "Identify market opportunities and validate business ideas",
      "Build minimum viable products and iterate based on feedback",
      "Pitch to investors and secure funding",
      "Recruit and lead a founding team",
      "Manage operations, finances, and growth strategy",
    ],
    dayInLife: "No two days are the same. You might start the morning reviewing user metrics, then hop on a call with a potential investor. Mid-day you're sketching out a new feature with your co-founder. After lunch, you're networking at a startup event, then back to writing copy for your landing page. The evening is spent catching up on emails and planning tomorrow's priorities.",
    courses: [
      { code: "ECO 101", name: "Principles of Economics", description: "Market fundamentals and business economics.", bestProfessor: "Dr. Griffith", difficulty: 2 },
      { code: "CSC 121", name: "Programming & Problem Solving", description: "Technical literacy to build or manage technical products.", bestProfessor: "Dr. Ramanujan", difficulty: 2 },
      { code: "COM 210", name: "Public Speaking", description: "Pitching and presenting to investors and customers.", bestProfessor: "Dr. Williams", difficulty: 2 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Understanding customers, team dynamics, and negotiation.", bestProfessor: "Dr. Thompson", difficulty: 2 },
      { code: "ACC 215", name: "Financial Accounting", description: "Reading financial statements and managing company finances.", bestProfessor: "Dr. Palmer", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "Startup Accelerator", type: "Program", description: "Join programs like Y Combinator, Techstars, or university-affiliated accelerators.", timing: "Summer after Junior year" },
      { title: "Build Your Startup", type: "Project", description: "Use the summer to build and launch your own product.", timing: "Any summer" },
      { title: "Startup Internship", type: "Internship", description: "Work at an early-stage startup to learn how they operate.", timing: "Any summer" },
    ],
    networking: [
      { role: "Entrepreneurship Faculty", type: "Faculty", description: "Guidance on business planning and connecting with the startup ecosystem.", howToConnect: "Take business-related courses and pitch your ideas" },
      { role: "Founder Alumni", type: "Alumni", description: "Learn from Davidson graduates who've built companies.", howToConnect: "Entrepreneurship events and alumni introductions" },
    ],
  },
  {
    id: "ux-design",
    title: "UX Design",
    icon: "Palette",
    description: "Design intuitive, beautiful digital experiences — combining user research, interaction design, and visual craft.",
    tags: ["Creative", "Technical"],
    salaryRange: { min: 70000, max: 140000 },
    skills: ["User Research", "Prototyping", "Visual Design", "Usability Testing", "Figma"],
    whatYoullDo: [
      "Conduct user research to understand needs and pain points",
      "Create wireframes, prototypes, and high-fidelity designs",
      "Run usability tests and iterate on designs",
      "Define design systems and interaction patterns",
      "Collaborate with engineers to implement designs",
    ],
    dayInLife: "Your morning starts with a user interview — observing how someone interacts with your product prototype. You spend mid-morning synthesizing research notes and updating your findings deck. After lunch, you iterate on wireframes in Figma based on feedback. The afternoon involves a design critique with your team and a handoff meeting with engineers. You end the day exploring design inspiration.",
    courses: [
      { code: "ART 120", name: "Visual Design", description: "Foundational design principles — color, typography, layout, composition.", bestProfessor: "Dr. Torres", difficulty: 2 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Cognitive psychology and human behavior for user-centered design.", bestProfessor: "Dr. Thompson", difficulty: 2 },
      { code: "CSC 121", name: "Programming & Problem Solving", description: "Enough code to prototype and communicate with engineers.", bestProfessor: "Dr. Ramanujan", difficulty: 2 },
      { code: "COM 210", name: "Public Speaking", description: "Presenting and defending design decisions to stakeholders.", bestProfessor: "Dr. Williams", difficulty: 2 },
      { code: "ANT 200", name: "Ethnographic Methods", description: "Qualitative research methods for understanding users in context.", bestProfessor: "Dr. Park", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "UX Design Internship", type: "Internship", description: "Design intern at a tech company, agency, or startup.", timing: "Summer after Sophomore or Junior year" },
      { title: "Portfolio Project", type: "Project", description: "Build a UX portfolio with 3-4 complete case studies.", timing: "Junior year onward" },
      { title: "Design Sprint", type: "Workshop", description: "Participate in design sprints or workshops to sharpen skills.", timing: "Year-round" },
    ],
    networking: [
      { role: "Art & Digital Studies Faculty", type: "Faculty", description: "Mentorship in design thinking and creative process.", howToConnect: "Take art and digital studies courses" },
      { role: "UX Designers in Industry", type: "Professional", description: "Learn about UX career paths and portfolio expectations.", howToConnect: "Attend UXPA events, Dribbble meetups, and LinkedIn" },
    ],
  },
  {
    id: "nonprofit",
    title: "Nonprofit & Social Impact",
    icon: "HeartHandshake",
    description: "Drive meaningful change through mission-driven organizations focused on education, health, equity, and the environment.",
    tags: ["Leadership", "Work-Life Balance"],
    salaryRange: { min: 40000, max: 90000 },
    skills: ["Grant Writing", "Program Management", "Fundraising", "Community Engagement", "Leadership"],
    whatYoullDo: [
      "Design and manage programs that serve communities",
      "Write grants and fundraise to sustain operations",
      "Build partnerships with government and private sector",
      "Measure and report on program impact",
      "Advocate for policy change and community needs",
    ],
    dayInLife: "Your morning starts with a team meeting to review program metrics. You spend mid-morning drafting a grant proposal for a foundation. After lunch, you visit a program site and meet with community members. The afternoon is spent preparing a board presentation and coordinating with volunteers. You end with a networking call with a potential corporate partner.",
    courses: [
      { code: "SOC 101", name: "Introduction to Sociology", description: "Understanding social structures, inequality, and community dynamics.", bestProfessor: "Dr. Rivera", difficulty: 2 },
      { code: "ECO 101", name: "Principles of Economics", description: "Economic analysis for nonprofit sustainability.", bestProfessor: "Dr. Griffith", difficulty: 2 },
      { code: "ENG 270", name: "Expository Writing", description: "Clear writing for grants, reports, and communications.", bestProfessor: "Dr. Harris", difficulty: 3 },
      { code: "POL 101", name: "American Government", description: "Government structures and how nonprofits influence policy.", bestProfessor: "Dr. Chen", difficulty: 2 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Understanding human motivation and community behavior.", bestProfessor: "Dr. Thompson", difficulty: 2 },
    ],
    summerOpportunities: [
      { title: "Nonprofit Internship", type: "Internship", description: "Work at organizations like Teach for America, Habitat for Humanity, or local nonprofits.", timing: "Any summer" },
      { title: "Service Learning", type: "Service", description: "Combine community service with academic reflection.", timing: "Year-round" },
      { title: "Social Innovation Fellowship", type: "Fellowship", description: "Design and pilot a social impact project.", timing: "Summer after Sophomore or Junior year" },
    ],
    networking: [
      { role: "Community Engagement Staff", type: "Advisor", description: "Davidson's community engagement office connects students with nonprofits.", howToConnect: "Visit the community engagement office" },
      { role: "Nonprofit Alumni", type: "Alumni", description: "Davidson alumni leading nonprofit organizations.", howToConnect: "Alumni panels and service learning networks" },
    ],
  },
  {
    id: "education",
    title: "Education",
    icon: "GraduationCap",
    description: "Shape the next generation through teaching, curriculum design, and educational leadership at all levels.",
    tags: ["Work-Life Balance", "Leadership"],
    salaryRange: { min: 40000, max: 85000 },
    skills: ["Teaching", "Curriculum Design", "Communication", "Assessment", "Mentorship"],
    whatYoullDo: [
      "Design engaging lesson plans and curriculum",
      "Teach and mentor students of all backgrounds",
      "Assess learning outcomes and adapt instruction",
      "Collaborate with colleagues on school-wide initiatives",
      "Engage with families and community stakeholders",
    ],
    dayInLife: "Your day starts early preparing materials for your first class. You teach three classes in the morning, each with different activities and discussion formats. Lunch is spent tutoring a struggling student. The afternoon includes a faculty meeting, grading, and planning tomorrow's lessons. You end the day coaching the debate team.",
    courses: [
      { code: "EDU 200", name: "Foundations of Education", description: "History, philosophy, and sociology of education in America.", bestProfessor: "Dr. Nelson", difficulty: 2 },
      { code: "PSY 100", name: "Introduction to Psychology", description: "Child development and learning psychology.", bestProfessor: "Dr. Thompson", difficulty: 2 },
      { code: "PSY 230", name: "Developmental Psychology", description: "How children and adolescents develop cognitively and socially.", bestProfessor: "Dr. Thompson", difficulty: 3 },
      { code: "COM 210", name: "Public Speaking", description: "Classroom communication and presentation skills.", bestProfessor: "Dr. Williams", difficulty: 2 },
      { code: "SOC 101", name: "Introduction to Sociology", description: "Understanding educational equity and social context.", bestProfessor: "Dr. Rivera", difficulty: 2 },
    ],
    summerOpportunities: [
      { title: "Teaching Fellowship", type: "Fellowship", description: "Summer teaching programs in underserved schools.", timing: "Summer after Sophomore or Junior year" },
      { title: "Tutoring Program", type: "Service", description: "Tutor local students and develop mentoring relationships.", timing: "Year-round" },
      { title: "Education Research", type: "Research", description: "Research with education studies faculty on teaching methods or policy.", timing: "Summer after Junior year" },
    ],
    networking: [
      { role: "Education Studies Faculty", type: "Faculty", description: "Mentorship and student teaching placement support.", howToConnect: "Take education studies courses and join the education club" },
      { role: "Teacher Alumni", type: "Alumni", description: "Davidson alumni in teaching and educational leadership.", howToConnect: "Alumni panels and Teach for America network" },
    ],
  },
  {
    id: "journalism",
    title: "Media & Journalism",
    icon: "Newspaper",
    description: "Inform the public through investigative reporting, multimedia storytelling, and digital media production.",
    tags: ["Creative", "Work-Life Balance"],
    salaryRange: { min: 40000, max: 95000 },
    skills: ["Writing", "Reporting", "Multimedia Production", "Critical Thinking", "Ethics"],
    whatYoullDo: [
      "Research and report on stories of public interest",
      "Conduct interviews and verify information from multiple sources",
      "Write articles, produce videos, and create multimedia content",
      "Meet deadlines and work under pressure",
      "Develop expertise in a beat (politics, tech, health, etc.)",
    ],
    dayInLife: "Your morning starts with a news meeting where editors discuss the day's stories. You spend mid-morning making calls to sources and reviewing documents for an investigative piece. After lunch, you conduct an interview and begin drafting your article. The afternoon is a race to file before deadline — writing, editing, and adding multimedia. You end with a quick social media post to promote the story.",
    courses: [
      { code: "ENG 220", name: "Creative Writing", description: "Narrative storytelling and developing your writing voice.", bestProfessor: "Dr. Harris", difficulty: 2 },
      { code: "COM 210", name: "Public Speaking", description: "Interview techniques and on-camera communication.", bestProfessor: "Dr. Williams", difficulty: 2 },
      { code: "POL 101", name: "American Government", description: "Understanding government for political reporting.", bestProfessor: "Dr. Chen", difficulty: 2 },
      { code: "PHI 220", name: "Ethics", description: "Media ethics and responsible journalism.", bestProfessor: "Dr. Martin", difficulty: 3 },
      { code: "DIG 200", name: "Digital Media Production", description: "Video, audio, and multimedia production skills.", bestProfessor: "Dr. Foster", difficulty: 2 },
    ],
    summerOpportunities: [
      { title: "Newsroom Internship", type: "Internship", description: "Work at a newspaper, magazine, or digital media outlet.", timing: "Summer after Sophomore or Junior year" },
      { title: "Campus Publication", type: "Experience", description: "Write for The Davidsonian or contribute to campus media.", timing: "Year-round" },
      { title: "Multimedia Portfolio", type: "Project", description: "Build a portfolio of published clips, videos, and multimedia work.", timing: "Junior year onward" },
    ],
    networking: [
      { role: "Communication Studies Faculty", type: "Faculty", description: "Mentorship in media production and journalism ethics.", howToConnect: "Take communication and writing courses" },
      { role: "Journalist Alumni", type: "Alumni", description: "Davidson graduates working in media and journalism.", howToConnect: "Alumni panels and journalism organization events" },
    ],
  },
  {
    id: "environmental-science",
    title: "Environmental Science",
    icon: "TreePine",
    description: "Protect and restore the natural world through research, conservation, policy, and sustainable technology.",
    tags: ["Analytical", "Work-Life Balance"],
    salaryRange: { min: 50000, max: 110000 },
    skills: ["Field Research", "Data Analysis", "GIS", "Policy Writing", "Environmental Law"],
    whatYoullDo: [
      "Conduct field research and environmental monitoring",
      "Analyze environmental data and model ecological systems",
      "Develop sustainability plans for organizations",
      "Advise on environmental policy and regulatory compliance",
      "Communicate science to policymakers and the public",
    ],
    dayInLife: "Your morning starts with a field visit to a wetland restoration site, collecting water samples and monitoring species. Back at the office, you input data and update your GIS maps. After lunch, you analyze soil contamination data for an environmental impact assessment. The afternoon involves a meeting with a state agency on new regulations. You end the day drafting a section of an environmental report.",
    courses: [
      { code: "ENV 101", name: "Environmental Science", description: "Interdisciplinary introduction to environmental systems and challenges.", bestProfessor: "Dr. Wilson", difficulty: 2 },
      { code: "BIO 111", name: "Introductory Biology I", description: "Ecological foundations and biodiversity.", bestProfessor: "Dr. Johnson", difficulty: 3 },
      { code: "CHE 115", name: "General Chemistry I", description: "Chemical processes in environmental systems.", bestProfessor: "Dr. Lee", difficulty: 3 },
      { code: "MAT 220", name: "Probability & Statistics I", description: "Statistical methods for environmental data analysis.", bestProfessor: "Dr. Bowen", difficulty: 3 },
      { code: "POL 250", name: "International Relations", description: "Global environmental policy and climate agreements.", bestProfessor: "Dr. Chen", difficulty: 3 },
    ],
    summerOpportunities: [
      { title: "Environmental Research", type: "Research", description: "Field research with Davidson faculty or at an environmental research station.", timing: "Summer after Sophomore year" },
      { title: "Conservation Internship", type: "Internship", description: "Work with organizations like The Nature Conservancy, EPA, or state agencies.", timing: "Summer after Junior year" },
      { title: "Sustainability Project", type: "Project", description: "Lead a sustainability initiative on campus or in the community.", timing: "Any time" },
    ],
    networking: [
      { role: "Environmental Studies Faculty", type: "Faculty", description: "Research opportunities and connections to environmental organizations.", howToConnect: "Take ENV courses and participate in field trips" },
      { role: "Environmental Alumni", type: "Alumni", description: "Davidson alumni in conservation, policy, and sustainability roles.", howToConnect: "Alumni network and environmental organization events" },
    ],
  },
];
