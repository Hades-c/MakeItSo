// Career paths data for the Pathfinder-style career browsing experience

import { VERIFIED_CAREER_CONTENT, type VerifiedCareerContent } from "./career-verified";

// Hand-written, unsourced fields. Courses, pay and Davidson resources come
// from the verified dataset in career-verified.ts (merged below).
interface CareerPathBase {
  id: string;
  title: string;
  icon: string; // Lucide icon name
  description: string;
  tags: string[];
  skills: string[];
  whatYoullDo: string[];
  dayInLife: string;
}

export type CareerPath = CareerPathBase & VerifiedCareerContent;

export const CAREER_PATH_FILTERS = [
  "All",
  "Work-Life Balance",
  "Technical",
  "Analytical",
  "Leadership",
  "Creative",
] as const;

export type CareerFilter = (typeof CAREER_PATH_FILTERS)[number];

const FILTER_MAP: Record<string, CareerFilter[]> = {
  "software-engineering": ["Technical"],
  "data-science": ["Technical", "Analytical"],
  "investment-banking": ["Analytical", "Leadership"],
  "management-consulting": ["Analytical", "Leadership"],
  "product-management": ["Technical", "Leadership"],
  "medicine": ["Analytical"],
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
  "cybersecurity": ["Technical"],
  "financial-planning": ["Analytical", "Work-Life Balance"],
  "psychology-counseling": ["Work-Life Balance", "Analytical"],
  "international-development": ["Leadership", "Work-Life Balance"],
  "architecture-urban-planning": ["Creative", "Analytical"],
  "sports-management": ["Leadership", "Creative"],
  "healthcare-administration": ["Leadership"],
  "arts-museum-curation": ["Creative", "Work-Life Balance"],
};

export function filterCareerPaths(paths: CareerPath[], filter: CareerFilter): CareerPath[] {
  if (filter === "All") return paths;
  return paths.filter((p) => FILTER_MAP[p.id]?.includes(filter));
}

const CAREER_PATH_BASE: CareerPathBase[] = [
  {
    id: "software-engineering",
    title: "Software Engineering",
    icon: "Code2",
    description: "Build the technology that powers modern life — from mobile apps to cloud infrastructure and AI systems.",
    tags: ["Technical"],
    skills: ["Python", "Data Structures", "System Design", "Git", "Problem Solving"],
    whatYoullDo: [
      "Design and build software applications and systems",
      "Write clean, tested, and maintainable code",
      "Collaborate with cross-functional teams on product features",
      "Debug and optimize performance-critical systems",
      "Participate in code reviews and architectural decisions",
    ],
    dayInLife: "Your morning starts with a standup where your team syncs on priorities. You spend the first half of the day deep in code — maybe building a new API endpoint or refactoring a data pipeline. After lunch, you pair-program with a teammate to work through a tricky bug. You end the day reviewing pull requests and sketching out the architecture for next sprint's feature.",
  },
  {
    id: "data-science",
    title: "Data Science & Analytics",
    icon: "BarChart3",
    description: "Turn raw data into insights that drive decision-making across industries — from healthcare to finance to tech.",
    tags: ["Technical", "Analytical"],
    skills: ["Python", "R", "SQL", "Statistics", "Machine Learning", "Data Visualization"],
    whatYoullDo: [
      "Analyze large datasets to uncover patterns and trends",
      "Build predictive models using machine learning techniques",
      "Create dashboards and visualizations to communicate findings",
      "Design experiments and A/B tests to validate hypotheses",
      "Collaborate with stakeholders to define data-driven strategies",
    ],
    dayInLife: "You start your day reviewing overnight model performance metrics and checking data pipelines. Mid-morning, you dive into exploratory data analysis on a new customer dataset, building visualizations to spot trends. After lunch, you present findings to the product team and discuss experiment design. The afternoon is spent refining a classification model and writing documentation for your analysis.",
  },
  {
    id: "investment-banking",
    title: "Investment Banking",
    icon: "TrendingUp",
    description: "Advise corporations on mergers, acquisitions, and capital raising — the financial engine of global business.",
    tags: ["Analytical", "Leadership"],
    skills: ["Financial Modeling", "Valuation", "Excel", "Accounting", "Communication"],
    whatYoullDo: [
      "Build detailed financial models for M&A transactions",
      "Conduct industry research and competitive analysis",
      "Prepare pitch books and presentation materials for clients",
      "Analyze company valuations using DCF, comparables, and precedent transactions",
      "Support senior bankers in deal execution and client management",
    ],
    dayInLife: "You arrive early to check market news and update your live models. The morning is spent building a DCF valuation for a potential acquisition target. After a working lunch with your deal team, you refine a pitch deck for a client meeting. Late afternoon brings a call with the client's CFO to discuss deal structure. You end the day reviewing the latest comparable transactions data.",
  },
  {
    id: "management-consulting",
    title: "Management Consulting",
    icon: "Lightbulb",
    description: "Solve complex business problems for Fortune 500 companies — strategy, operations, and organizational design.",
    tags: ["Analytical", "Leadership"],
    skills: ["Problem Solving", "Data Analysis", "Presentation", "Strategy", "Leadership"],
    whatYoullDo: [
      "Structure ambiguous business problems into solvable frameworks",
      "Conduct market research and competitive benchmarking",
      "Analyze data to develop strategic recommendations",
      "Present findings to C-suite executives",
      "Lead workstreams and manage junior team members",
    ],
    dayInLife: "Your week alternates between client site (Mon-Thu) and your home office (Fri). On-site days start with a team check-in, then you spend the morning analyzing customer survey data. After lunch with the client's VP of Strategy, you build slides synthesizing your findings. The afternoon is a workshop with client stakeholders to pressure-test your recommendations.",
  },
  {
    id: "product-management",
    title: "Product Management",
    icon: "Layers",
    description: "Define what gets built and why — lead the intersection of business, design, and engineering at tech companies.",
    tags: ["Technical", "Leadership"],
    skills: ["Strategy", "User Research", "Data Analysis", "Communication", "Technical Fluency"],
    whatYoullDo: [
      "Define product vision and roadmap based on user needs and business goals",
      "Write product requirements and user stories for engineering teams",
      "Analyze user data and feedback to prioritize features",
      "Coordinate cross-functional teams (engineering, design, marketing)",
      "Run experiments and iterate based on metrics",
    ],
    dayInLife: "You start with metrics review — checking overnight usage data and experiment results. Morning standup with your engineering team covers sprint progress. You spend mid-morning interviewing users to validate a new feature concept. After lunch, you work with design on wireframes, then sync with marketing on the upcoming launch. The day ends with a roadmap planning session.",
  },
  {
    id: "medicine",
    title: "Healthcare & Medicine",
    icon: "Heart",
    description: "Diagnose, treat, and prevent disease — from clinical practice to medical research and public health.",
    tags: ["Analytical"],
    skills: ["Biology", "Chemistry", "Patient Care", "Critical Thinking", "Research Methods"],
    whatYoullDo: [
      "Diagnose and treat patients with evidence-based medicine",
      "Conduct clinical research to advance medical knowledge",
      "Collaborate with interdisciplinary healthcare teams",
      "Communicate complex medical information to patients and families",
      "Stay current with medical literature and continuing education",
    ],
    dayInLife: "Residency days start early with patient rounds at 6 AM, reviewing overnight changes. Morning clinic hours involve seeing patients, ordering labs, and consulting with specialists. You attend a noon conference on the latest treatment protocols. The afternoon is spent in the OR or following up on test results. You end with chart notes and preparing for tomorrow's cases.",
  },
  {
    id: "law",
    title: "Law",
    icon: "Scale",
    description: "Advocate, negotiate, and shape policy — from corporate law to public interest litigation and government service.",
    tags: ["Analytical", "Leadership"],
    skills: ["Legal Writing", "Critical Analysis", "Research", "Public Speaking", "Negotiation"],
    whatYoullDo: [
      "Research legal precedents and analyze case law",
      "Draft legal documents, briefs, and contracts",
      "Represent clients in negotiations, mediations, and court proceedings",
      "Advise organizations on legal compliance and risk management",
      "Develop legal strategies for complex disputes",
    ],
    dayInLife: "Your morning begins with reviewing case files and drafting a motion. You spend mid-morning in a client meeting discussing litigation strategy. After lunch, you research precedent cases in Westlaw for a brief due next week. The afternoon includes a deposition and a call with opposing counsel to discuss settlement terms. You end the day reviewing contracts for a corporate client.",
  },
  {
    id: "marketing",
    title: "Marketing & Communications",
    icon: "Megaphone",
    description: "Shape how brands connect with audiences through strategy, storytelling, data, and creative campaigns.",
    tags: ["Creative", "Leadership"],
    skills: ["Storytelling", "Analytics", "Social Media", "Brand Strategy", "Content Creation"],
    whatYoullDo: [
      "Develop marketing strategies and campaign plans",
      "Create compelling content across digital and traditional channels",
      "Analyze campaign performance and optimize based on data",
      "Manage brand identity and messaging consistency",
      "Collaborate with creative teams and external agencies",
    ],
    dayInLife: "Your morning starts with checking campaign analytics and social media engagement. You join a creative brainstorm for an upcoming product launch. Mid-morning, you review copy and design assets for a digital ad campaign. After lunch, you analyze A/B test results and adjust targeting. The afternoon is spent planning content for next month and meeting with an influencer partner.",
  },
  {
    id: "research-academia",
    title: "Research & Academia",
    icon: "Microscope",
    description: "Push the boundaries of human knowledge through original research, teaching, and scholarly publication.",
    tags: ["Analytical", "Work-Life Balance"],
    skills: ["Research Methods", "Writing", "Critical Analysis", "Teaching", "Grant Writing"],
    whatYoullDo: [
      "Design and conduct original research studies",
      "Publish findings in peer-reviewed journals",
      "Teach courses and mentor students",
      "Apply for grants to fund research programs",
      "Present at academic conferences worldwide",
    ],
    dayInLife: "Your morning starts with writing — working on a journal article or grant proposal. Late morning, you teach an undergraduate seminar. After lunch, you meet with graduate students to discuss their research progress. The afternoon is spent in the lab or analyzing data. You end with reviewing a paper for a journal and preparing for tomorrow's lecture.",
  },
  {
    id: "public-policy",
    title: "Government & Public Policy",
    icon: "Landmark",
    description: "Shape the rules and systems that govern society — from local government to federal policy to international relations.",
    tags: ["Leadership", "Work-Life Balance"],
    skills: ["Policy Analysis", "Research", "Writing", "Public Speaking", "Data Analysis"],
    whatYoullDo: [
      "Research and analyze policy proposals and their potential impact",
      "Draft legislation, regulations, and policy briefs",
      "Engage with stakeholders and constituents",
      "Manage government programs and budgets",
      "Advocate for policy changes through data and persuasion",
    ],
    dayInLife: "Your morning starts with a briefing on the latest policy developments. You spend the first half reviewing a draft regulation and preparing talking points for your director. After lunch, you attend a committee hearing and take notes on stakeholder testimony. The afternoon is spent analyzing the budgetary impact of a proposed amendment. You end with a call to a state agency partner.",
  },
  {
    id: "entrepreneurship",
    title: "Entrepreneurship",
    icon: "Rocket",
    description: "Launch and scale your own ventures — from tech startups to social enterprises to small businesses.",
    tags: ["Leadership", "Creative"],
    skills: ["Business Strategy", "Sales", "Leadership", "Fundraising", "Product Development"],
    whatYoullDo: [
      "Identify market opportunities and validate business ideas",
      "Build minimum viable products and iterate based on feedback",
      "Pitch to investors and secure funding",
      "Recruit and lead a founding team",
      "Manage operations, finances, and growth strategy",
    ],
    dayInLife: "No two days are the same. You might start the morning reviewing user metrics, then hop on a call with a potential investor. Mid-day you're sketching out a new feature with your co-founder. After lunch, you're networking at a startup event, then back to writing copy for your landing page. The evening is spent catching up on emails and planning tomorrow's priorities.",
  },
  {
    id: "ux-design",
    title: "UX Design",
    icon: "Palette",
    description: "Design intuitive, beautiful digital experiences — combining user research, interaction design, and visual craft.",
    tags: ["Creative", "Technical"],
    skills: ["User Research", "Prototyping", "Visual Design", "Usability Testing", "Figma"],
    whatYoullDo: [
      "Conduct user research to understand needs and pain points",
      "Create wireframes, prototypes, and high-fidelity designs",
      "Run usability tests and iterate on designs",
      "Define design systems and interaction patterns",
      "Collaborate with engineers to implement designs",
    ],
    dayInLife: "Your morning starts with a user interview — observing how someone interacts with your product prototype. You spend mid-morning synthesizing research notes and updating your findings deck. After lunch, you iterate on wireframes in Figma based on feedback. The afternoon involves a design critique with your team and a handoff meeting with engineers. You end the day exploring design inspiration.",
  },
  {
    id: "nonprofit",
    title: "Nonprofit & Social Impact",
    icon: "HeartHandshake",
    description: "Drive meaningful change through mission-driven organizations focused on education, health, equity, and the environment.",
    tags: ["Leadership", "Work-Life Balance"],
    skills: ["Grant Writing", "Program Management", "Fundraising", "Community Engagement", "Leadership"],
    whatYoullDo: [
      "Design and manage programs that serve communities",
      "Write grants and fundraise to sustain operations",
      "Build partnerships with government and private sector",
      "Measure and report on program impact",
      "Advocate for policy change and community needs",
    ],
    dayInLife: "Your morning starts with a team meeting to review program metrics. You spend mid-morning drafting a grant proposal for a foundation. After lunch, you visit a program site and meet with community members. The afternoon is spent preparing a board presentation and coordinating with volunteers. You end with a networking call with a potential corporate partner.",
  },
  {
    id: "education",
    title: "Education",
    icon: "GraduationCap",
    description: "Shape the next generation through teaching, curriculum design, and educational leadership at all levels.",
    tags: ["Work-Life Balance", "Leadership"],
    skills: ["Teaching", "Curriculum Design", "Communication", "Assessment", "Mentorship"],
    whatYoullDo: [
      "Design engaging lesson plans and curriculum",
      "Teach and mentor students of all backgrounds",
      "Assess learning outcomes and adapt instruction",
      "Collaborate with colleagues on school-wide initiatives",
      "Engage with families and community stakeholders",
    ],
    dayInLife: "Your day starts early preparing materials for your first class. You teach three classes in the morning, each with different activities and discussion formats. Lunch is spent tutoring a struggling student. The afternoon includes a faculty meeting, grading, and planning tomorrow's lessons. You end the day coaching the debate team.",
  },
  {
    id: "journalism",
    title: "Media & Journalism",
    icon: "Newspaper",
    description: "Inform the public through investigative reporting, multimedia storytelling, and digital media production.",
    tags: ["Creative", "Work-Life Balance"],
    skills: ["Writing", "Reporting", "Multimedia Production", "Critical Thinking", "Ethics"],
    whatYoullDo: [
      "Research and report on stories of public interest",
      "Conduct interviews and verify information from multiple sources",
      "Write articles, produce videos, and create multimedia content",
      "Meet deadlines and work under pressure",
      "Develop expertise in a beat (politics, tech, health, etc.)",
    ],
    dayInLife: "Your morning starts with a news meeting where editors discuss the day's stories. You spend mid-morning making calls to sources and reviewing documents for an investigative piece. After lunch, you conduct an interview and begin drafting your article. The afternoon is a race to file before deadline — writing, editing, and adding multimedia. You end with a quick social media post to promote the story.",
  },
  {
    id: "environmental-science",
    title: "Environmental Science",
    icon: "TreePine",
    description: "Protect and restore the natural world through research, conservation, policy, and sustainable technology.",
    tags: ["Analytical", "Work-Life Balance"],
    skills: ["Field Research", "Data Analysis", "GIS", "Policy Writing", "Environmental Law"],
    whatYoullDo: [
      "Conduct field research and environmental monitoring",
      "Analyze environmental data and model ecological systems",
      "Develop sustainability plans for organizations",
      "Advise on environmental policy and regulatory compliance",
      "Communicate science to policymakers and the public",
    ],
    dayInLife: "Your morning starts with a field visit to a wetland restoration site, collecting water samples and monitoring species. Back at the office, you input data and update your GIS maps. After lunch, you analyze soil contamination data for an environmental impact assessment. The afternoon involves a meeting with a state agency on new regulations. You end the day drafting a section of an environmental report.",
  },
  {
    id: "cybersecurity",
    title: "Cybersecurity",
    icon: "Shield",
    description: "Protect organizations from cyber threats by defending networks, analyzing vulnerabilities, and building secure systems.",
    tags: ["Technical"],
    skills: ["Network Security", "Python", "Risk Analysis", "Cryptography", "Incident Response"],
    whatYoullDo: [
      "Monitor networks and systems for security breaches",
      "Conduct penetration testing and vulnerability assessments",
      "Design and implement security protocols and architectures",
      "Respond to and investigate security incidents",
      "Develop security policies and train employees on best practices",
    ],
    dayInLife: "Your morning starts with reviewing overnight security alerts and threat intelligence feeds. You spend mid-morning conducting a vulnerability scan on a new application before deployment. After lunch, you lead a tabletop exercise simulating a ransomware attack. The afternoon involves analyzing logs from a suspicious login attempt and writing up your findings. You end the day updating firewall rules and patching a newly disclosed vulnerability.",
  },
  {
    id: "financial-planning",
    title: "Financial Planning & Wealth Management",
    icon: "Wallet",
    description: "Help individuals and families build, protect, and grow their wealth through personalized financial strategies.",
    tags: ["Analytical", "Work-Life Balance"],
    skills: ["Financial Analysis", "Client Relations", "Tax Planning", "Investment Strategy", "Communication"],
    whatYoullDo: [
      "Create comprehensive financial plans for clients",
      "Analyze investment portfolios and recommend adjustments",
      "Advise on retirement planning, tax strategy, and estate planning",
      "Build long-term client relationships based on trust",
      "Stay current on financial regulations and market trends",
    ],
    dayInLife: "Your morning starts with reviewing market updates and portfolio performance for today's client meetings. You meet with a young couple to discuss their retirement savings strategy and college planning. After lunch, you analyze a client's tax situation to optimize their year-end strategy. The afternoon involves preparing a financial plan presentation and making follow-up calls. You end the day attending a networking dinner with prospective clients.",
  },
  {
    id: "psychology-counseling",
    title: "Psychology & Counseling",
    icon: "Brain",
    description: "Help people understand themselves, overcome challenges, and improve their mental health through therapy and research.",
    tags: ["Work-Life Balance", "Analytical"],
    skills: ["Active Listening", "Clinical Assessment", "Research Methods", "Empathy", "Case Documentation"],
    whatYoullDo: [
      "Conduct therapy sessions with individuals, couples, or groups",
      "Administer and interpret psychological assessments",
      "Develop treatment plans based on evidence-based approaches",
      "Maintain detailed clinical documentation",
      "Collaborate with other healthcare professionals on patient care",
    ],
    dayInLife: "Your morning begins with reviewing notes from yesterday's sessions and preparing for today's clients. You see three individual therapy clients in the morning, using CBT and mindfulness techniques. After lunch, you lead a group therapy session for anxiety management. The afternoon includes a case consultation with colleagues, writing session notes, and reviewing research literature on a new treatment modality.",
  },
  {
    id: "international-development",
    title: "International Development",
    icon: "Globe",
    description: "Work across borders to reduce poverty, improve governance, and promote sustainable development in communities worldwide.",
    tags: ["Leadership", "Work-Life Balance"],
    skills: ["Cross-Cultural Communication", "Policy Analysis", "Project Management", "Languages", "Data Analysis"],
    whatYoullDo: [
      "Design and manage development programs in partner countries",
      "Conduct field research and needs assessments",
      "Write grants and manage donor relationships",
      "Evaluate program impact using quantitative and qualitative methods",
      "Coordinate with local governments and community organizations",
    ],
    dayInLife: "Your morning starts with a video call to a field office in Nairobi reviewing project milestones. You spend mid-morning editing a grant proposal for USAID. After lunch, you analyze survey data from a maternal health program to measure impact. The afternoon involves a coordination meeting with partner NGOs and drafting a briefing document for your organization's leadership on policy changes in the region.",
  },
  {
    id: "architecture-urban-planning",
    title: "Architecture & Urban Planning",
    icon: "Building2",
    description: "Shape the built environment — design buildings, plan communities, and create spaces where people live, work, and thrive.",
    tags: ["Creative", "Analytical"],
    skills: ["Design Thinking", "CAD Software", "Spatial Analysis", "Sustainability", "Project Management"],
    whatYoullDo: [
      "Design buildings, public spaces, and urban environments",
      "Create architectural drawings, models, and 3D renderings",
      "Conduct site analysis and feasibility studies",
      "Manage construction projects and coordinate with engineers",
      "Develop zoning plans and urban development strategies",
    ],
    dayInLife: "Your morning starts with a design review meeting where the team critiques a mixed-use development concept. You spend mid-morning refining floor plans in Revit and adjusting the building's environmental performance model. After lunch, you visit a construction site to check progress against your drawings. The afternoon involves a meeting with city planners about zoning requirements and sketching alternative façade designs.",
  },
  {
    id: "sports-management",
    title: "Sports Management",
    icon: "Trophy",
    description: "Combine a passion for athletics with business acumen — manage teams, events, brands, and the business side of sports.",
    tags: ["Leadership", "Creative"],
    skills: ["Event Management", "Marketing", "Negotiation", "Analytics", "Public Relations"],
    whatYoullDo: [
      "Manage operations for sports teams and athletic organizations",
      "Negotiate contracts and sponsorship deals",
      "Plan and execute sporting events and fan experiences",
      "Analyze player and team performance data",
      "Build brand partnerships and marketing campaigns",
    ],
    dayInLife: "Your morning starts with a team operations meeting to plan the upcoming home game weekend. You review ticket sales data and adjust pricing strategy. Mid-morning, you join a call with a potential corporate sponsor. After lunch, you coordinate with the events team on logistics for a community outreach program. The afternoon involves reviewing a player contract draft with legal and preparing social media content for the team's channels.",
  },
  {
    id: "healthcare-administration",
    title: "Healthcare Administration",
    icon: "Hospital",
    description: "Lead hospitals, health systems, and healthcare organizations — managing operations, policy, and the business of care delivery.",
    tags: ["Leadership"],
    skills: ["Operations Management", "Healthcare Policy", "Financial Management", "Leadership", "Data Analysis"],
    whatYoullDo: [
      "Oversee daily operations of healthcare facilities and departments",
      "Manage budgets, staffing, and resource allocation",
      "Ensure regulatory compliance and quality standards",
      "Develop strategic plans for organizational growth",
      "Improve patient experience and operational efficiency",
    ],
    dayInLife: "Your morning starts with a leadership huddle reviewing overnight census, patient flow, and any operational issues. You review quarterly budget reports and identify cost-saving opportunities. After lunch, you meet with department heads to discuss quality improvement initiatives. The afternoon involves a compliance review session and planning for a new community health program. You end the day preparing a board presentation on the hospital's strategic plan.",
  },
  {
    id: "arts-museum-curation",
    title: "Arts & Museum Curation",
    icon: "Frame",
    description: "Preserve, interpret, and share cultural heritage — curate exhibitions, manage collections, and connect communities with art and history.",
    tags: ["Creative", "Work-Life Balance"],
    skills: ["Art History", "Research", "Exhibition Design", "Writing", "Collections Management"],
    whatYoullDo: [
      "Research and curate exhibitions that tell compelling stories",
      "Manage and preserve museum collections and archives",
      "Write exhibition labels, catalogs, and educational materials",
      "Collaborate with artists, donors, and community groups",
      "Plan public programs and educational outreach",
    ],
    dayInLife: "Your morning starts reviewing condition reports for artworks arriving on loan. You spend mid-morning in the archives researching a 19th-century textile collection for an upcoming exhibition. After lunch, you walk the galleries with the exhibition designer, discussing layout and lighting. The afternoon involves writing interpretive text for a new installation and meeting with a local school group about an educational partnership. You end the day reviewing a grant application.",
  },
];

export const CAREER_PATHS: CareerPath[] = CAREER_PATH_BASE.map((path) => {
  const verified = VERIFIED_CAREER_CONTENT[path.id];
  if (!verified) throw new Error(`Missing verified career content for ${path.id}`);
  return { ...path, ...verified };
});

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
