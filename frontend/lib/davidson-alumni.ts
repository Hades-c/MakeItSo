// Davidson College alumni — prioritizing recent graduates students can network with
// Sources: Davidson College website, LinkedIn, news articles, Fulbright announcements

export interface DavidsonAlumni {
  name: string;
  classYear: string;
  major: string;
  currentRole: string;
  company: string;
  location: string;
  linkedinSearch: string;
  bio: string;
  careerFields: string[];
}

function buildLinkedInSearch(name: string, company?: string): string {
  const query = company ? `${name} ${company}` : name;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

const ALL_ALUMNI: DavidsonAlumni[] = [
  // ===== MANAGEMENT CONSULTING =====
  {
    name: "Sophie Eldridge",
    classYear: "2023",
    major: "Political Science",
    currentRole: "Business Analyst",
    company: "McKinsey & Company",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Sophie Eldridge", "McKinsey"),
    bio: "Fulbright English Teaching Assistant in Vietnam before joining McKinsey. Magna Cum Laude, led the College Crisis Initiative (C2i) whose research was published by Brookings and cited by NYT and WSJ.",
    careerFields: ["management-consulting", "public-policy"],
  },
  {
    name: "Samuel Waithira",
    classYear: "2024",
    major: "Economics",
    currentRole: "Business Analyst",
    company: "McKinsey & Company",
    location: "Dallas, TX",
    linkedinSearch: buildLinkedInSearch("Samuel Waithira", "McKinsey"),
    bio: "Bonner Scholar with 1,600+ hours of community service. Used a Davis Projects for Peace grant to build a sustainable pig farm at Hosanna Children's Home in Nairobi, Kenya.",
    careerFields: ["management-consulting"],
  },
  {
    name: "Max Shackelford",
    classYear: "2025",
    major: "Economics",
    currentRole: "Business Analyst",
    company: "McKinsey & Company",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("Max Shackelford", "McKinsey"),
    bio: "Active in Davidson Catholic Campus Ministry. Joining McKinsey's DC office after graduation, guided by the Matthews Center for Career Development.",
    careerFields: ["management-consulting"],
  },
  {
    name: "Cate Rhoades",
    classYear: "2024",
    major: "Economics",
    currentRole: "Management Consultant",
    company: "Consulting",
    location: "Charlotte, NC",
    linkedinSearch: buildLinkedInSearch("Cate Rhoades", "Davidson College"),
    bio: "Davidson Economics graduate in management consulting. Leveraged the college's strong MBB recruiting pipeline.",
    careerFields: ["management-consulting"],
  },
  {
    name: "Grant Hearne",
    classYear: "2023",
    major: "Economics",
    currentRole: "Strategy Analyst",
    company: "Deloitte Consulting",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("Grant Hearne", "Deloitte"),
    bio: "Davidson Economics graduate working in Deloitte's strategy and operations practice. Represents Davidson's pipeline into Big 4 consulting.",
    careerFields: ["management-consulting"],
  },
  {
    name: "Steve Shames",
    classYear: "1996",
    major: "Economics",
    currentRole: "Chief Growth & Integration Officer",
    company: "Publicis Groupe US",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Steve Shames", "Publicis"),
    bio: "Leads growth at the world's third-largest communications group. Secretary of Davidson's Board of Trustees.",
    careerFields: ["marketing", "management-consulting"],
  },

  // ===== INVESTMENT BANKING & FINANCE =====
  {
    name: "Louise Dickinson",
    classYear: "2019",
    major: "Economics",
    currentRole: "Investment Banking Analyst",
    company: "Goldman Sachs",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Louise Dickinson", "Goldman Sachs"),
    bio: "Morningstar Scholar at Davidson. Active in Pre-Business Society, Investment and Finance Club, and the Davidson on Wall Street program.",
    careerFields: ["investment-banking"],
  },
  {
    name: "Sarah Duncan",
    classYear: "2015",
    major: "Economics",
    currentRole: "Analyst",
    company: "Goldman Sachs",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Sarah Duncan", "Goldman Sachs"),
    bio: "Started as a Summer Analyst in Goldman's New York office and returned full-time. Returns to campus to recruit and mentor current students.",
    careerFields: ["investment-banking"],
  },
  {
    name: "Anmar Jerjees",
    classYear: "2018",
    major: "Political Science",
    currentRole: "MBA Candidate (Keller Scholar)",
    company: "Duke Fuqua School of Business",
    location: "Durham, NC",
    linkedinSearch: buildLinkedInSearch("Anmar Jerjees", "Duke Fuqua"),
    bio: "Political science major and Arab studies minor. Awarded a full-ride Thomas F. Keller Scholarship to Duke's MBA program.",
    careerFields: ["investment-banking", "management-consulting"],
  },
  {
    name: "Jay Hurt",
    classYear: "1988",
    major: "Economics",
    currentRole: "CEO & Venture Philanthropist",
    company: "The Hurt Co.",
    location: "Davidson, NC",
    linkedinSearch: buildLinkedInSearch("Jay Hurt", "Davidson College"),
    bio: "Donated $5M to create the Hurt Hub for Innovation and Entrepreneurship at Davidson.",
    careerFields: ["investment-banking", "entrepreneurship"],
  },

  // ===== SOFTWARE ENGINEERING & TECH =====
  {
    name: "Sebastian Charmot",
    classYear: "2022",
    major: "Computer Science",
    currentRole: "MS Computer Science",
    company: "Stanford University",
    location: "Stanford, CA",
    linkedinSearch: buildLinkedInSearch("Sebastian Charmot", "Stanford"),
    bio: "Leveraged Davidson's alumni network and career center trips to SF tech companies. Wrote about maximizing CS at a liberal arts college, inspiring future Davidson CS students.",
    careerFields: ["software-engineering", "data-science"],
  },
  {
    name: "Neil Patel",
    classYear: "2020",
    major: "Computer Science",
    currentRole: "Software Engineer",
    company: "Qualtrics",
    location: "Seattle, WA",
    linkedinSearch: buildLinkedInSearch("Neil Patel", "Qualtrics"),
    bio: "Davidson CS grad working in experience management software. Represents the growing pipeline of Davidson engineers in tech.",
    careerFields: ["software-engineering"],
  },
  {
    name: "Lily Korir",
    classYear: "2023",
    major: "Computer Science & Applied Physics",
    currentRole: "Founder",
    company: "Mulik Dairy Solutions",
    location: "Kenya",
    linkedinSearch: buildLinkedInSearch("Lily Korir", "Mulik Dairy"),
    bio: "Founded a tech-enabled dairy farming startup in Kenya. Combined her CS and physics background to solve agricultural challenges.",
    careerFields: ["entrepreneurship", "software-engineering"],
  },
  {
    name: "Elizabeth Brigham",
    classYear: "2004",
    major: "Economics",
    currentRole: "Executive Director, Hurt Hub for Innovation",
    company: "Davidson College",
    location: "Davidson, NC",
    linkedinSearch: buildLinkedInSearch("Elizabeth Brigham", "Davidson College Hurt Hub"),
    bio: "Leads Davidson's innovation hub, connecting students with startups and tech companies. Bridges campus and industry.",
    careerFields: ["entrepreneurship", "software-engineering"],
  },

  // ===== DATA SCIENCE & ANALYTICS =====
  {
    name: "Miles Abbett",
    classYear: "2014",
    major: "Mathematics",
    currentRole: "Analytics Professional",
    company: "Chicago Bulls (NBA)",
    location: "Chicago, IL",
    linkedinSearch: buildLinkedInSearch("Miles Abbett", "Chicago Bulls"),
    bio: "Uses data analytics for the Chicago Bulls. Davidson Math graduate working in sports analytics.",
    careerFields: ["data-science"],
  },
  {
    name: "Ford Higgins",
    classYear: "2014",
    major: "Economics",
    currentRole: "Analyst",
    company: "NBA League Office",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Ford Higgins", "NBA"),
    bio: "Data analyst at the NBA League Office. Davidson Economics graduate in sports analytics.",
    careerFields: ["data-science"],
  },
  {
    name: "Ross Kruse",
    classYear: "2017",
    major: "Economics",
    currentRole: "Analyst",
    company: "NBA League Office",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Ross Kruse", "NBA"),
    bio: "Analyzes officiating and game data at the NBA. Davidson Economics grad in sports analytics.",
    careerFields: ["data-science"],
  },

  // ===== MEDICINE & HEALTHCARE =====
  {
    name: "Rahael Borchers",
    classYear: "2015",
    major: "Biology",
    currentRole: "Resident Physician",
    company: "Hospital of the University of Pennsylvania",
    location: "Philadelphia, PA",
    linkedinSearch: buildLinkedInSearch("Rahael Borchers", "University of Pennsylvania"),
    bio: "Davidson Impact Fellow at Habitat for Humanity before medical school. Now connects housing insecurity and patient health as a practicing physician.",
    careerFields: ["medicine"],
  },
  {
    name: "Bruno Mourao",
    classYear: "2017",
    major: "Biology",
    currentRole: "Neurology Resident",
    company: "Brown University / Rhode Island Hospital",
    location: "Providence, RI",
    linkedinSearch: buildLinkedInSearch("Bruno Mourao", "Brown neurology"),
    bio: "Davidson Impact Fellow at Cabarrus Community Free Clinic. Now a neurology resident focused on access issues for underrepresented patients.",
    careerFields: ["medicine"],
  },
  {
    name: "Dr. Sallie Permar",
    classYear: "1997",
    major: "Biology",
    currentRole: "Chair, Department of Pediatrics; Pediatrician-in-Chief",
    company: "Weill Cornell Medicine / NewYork-Presbyterian",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Sallie Permar", "Weill Cornell"),
    bio: "Leading pediatric researcher and physician. Chair of Pediatrics at one of the nation's top hospitals.",
    careerFields: ["medicine"],
  },
  {
    name: "Dr. Thomas Marshburn",
    classYear: "1982",
    major: "Physics",
    currentRole: "Chief Medical Officer; Retired NASA Astronaut",
    company: "Sierra Space",
    location: "Houston, TX",
    linkedinSearch: buildLinkedInSearch("Thomas Marshburn", "NASA"),
    bio: "Davidson Physics grad who became a NASA astronaut with 3 spaceflights and 337+ days in space.",
    careerFields: ["medicine", "research-academia"],
  },

  // ===== LAW =====
  {
    name: "Emily Palmer",
    classYear: "2017",
    major: "Political Science",
    currentRole: "Deputy District Attorney",
    company: "Los Angeles County District Attorney's Office",
    location: "Los Angeles, CA",
    linkedinSearch: buildLinkedInSearch("Emily Palmer", "LA County DA"),
    bio: "Clerked at the Family Violence and Major Crimes Divisions. Credits her Davidson experience with getting her through law school.",
    careerFields: ["law"],
  },
  {
    name: "Sarah Phillips",
    classYear: "2001",
    major: "Political Science",
    currentRole: "Vice President and General Counsel",
    company: "Davidson College",
    location: "Davidson, NC",
    linkedinSearch: buildLinkedInSearch("Sarah Phillips", "Davidson College"),
    bio: "Davidson alumna who returned as the college's top legal officer and VP.",
    careerFields: ["law"],
  },

  // ===== EDUCATION =====
  {
    name: "TJ Elliott",
    classYear: "2021",
    major: "Biology",
    currentRole: "Science Teacher & Assistant Football Coach",
    company: "East Mecklenburg High School",
    location: "Charlotte, NC",
    linkedinSearch: buildLinkedInSearch("TJ Elliott", "East Mecklenburg"),
    bio: "Joined Teach For America after Davidson and stayed in education. Now teaches science and coaches football in Charlotte-Mecklenburg Schools.",
    careerFields: ["education"],
  },
  {
    name: "Mills Jordan",
    classYear: "2025",
    major: "Political Science",
    currentRole: "Middle School Teacher",
    company: "South Carolina Public Schools",
    location: "South Carolina",
    linkedinSearch: buildLinkedInSearch("Mills Jordan", "Davidson College"),
    bio: "Chidsey Leadership Fellow and Honor Council member. Plans to teach middle school and later draft education policy in South Carolina. Won the Algernon Sydney Sullivan Award.",
    careerFields: ["education", "public-policy"],
  },
  {
    name: "Tim Saintsing",
    classYear: "1998",
    major: "Economics",
    currentRole: "Executive Director",
    company: "KIPP North Carolina",
    location: "Charlotte, NC",
    linkedinSearch: buildLinkedInSearch("Tim Saintsing", "KIPP North Carolina"),
    bio: "Leads one of North Carolina's largest public charter school networks. Advocates for Davidson grads to enter education.",
    careerFields: ["education", "nonprofit"],
  },

  // ===== PUBLIC POLICY & GOVERNMENT =====
  {
    name: "Anthony Foxx",
    classYear: "1993",
    major: "History",
    currentRole: "Professor of Public Leadership; Former U.S. Secretary of Transportation",
    company: "Harvard Kennedy School",
    location: "Cambridge, MA",
    linkedinSearch: buildLinkedInSearch("Anthony Foxx", "Harvard Kennedy School"),
    bio: "Former U.S. Secretary of Transportation (2013-2017) and youngest Mayor of Charlotte. Chairs Davidson's Board of Trustees.",
    careerFields: ["public-policy"],
  },

  // ===== NONPROFIT & PUBLIC SERVICE =====
  {
    name: "Sophia Guevara Cunningham",
    classYear: "2016",
    major: "Economics",
    currentRole: "Vice President, Houston Energy Transition Initiative",
    company: "Greater Houston Partnership",
    location: "Houston, TX",
    linkedinSearch: buildLinkedInSearch("Sophia Guevara Cunningham", "Greater Houston Partnership"),
    bio: "Davidson Impact Fellow who turned a fellowship at a workforce development nonprofit into a career leading Houston's energy transition.",
    careerFields: ["nonprofit", "environmental-science", "public-policy"],
  },
  {
    name: "Evan Magen",
    classYear: "2020",
    major: "Religious Studies",
    currentRole: "Program Staff & Seminary Student",
    company: "Roof Above / Union Presbyterian Seminary",
    location: "Charlotte, NC",
    linkedinSearch: buildLinkedInSearch("Evan Magen", "Roof Above Charlotte"),
    bio: "Davidson Impact Fellow at Roof Above working with homeless men. Pursuing ministry while continuing direct service work in Charlotte.",
    careerFields: ["nonprofit"],
  },

  // ===== RESEARCH, FELLOWSHIPS & ACADEMIA =====
  {
    name: "Tomas Quintero",
    classYear: "2023",
    major: "Biology",
    currentRole: "Fulbright Research Scholar",
    company: "Grupo de Neurociencias de Antioquia (Colombia)",
    location: "Medellín, Colombia",
    linkedinSearch: buildLinkedInSearch("Tomas Quintero", "Davidson College Fulbright"),
    bio: "Fulbright researcher studying Alzheimer's disease in Colombia, employing lab skills developed at Davidson and UT Medical Branch.",
    careerFields: ["research-academia", "medicine"],
  },
  {
    name: "Isabelle Saba",
    classYear: "2023",
    major: "Arabic Studies",
    currentRole: "Fulbright Scholar",
    company: "Al-Balad Theater (Jordan)",
    location: "Amman, Jordan",
    linkedinSearch: buildLinkedInSearch("Isabelle Saba", "Davidson College Fulbright"),
    bio: "Fulbright project on Syrian storytelling, drawing on pastoral care experience and advanced Arabic proficiency. Represents Davidson's global reach.",
    careerFields: ["research-academia", "journalism"],
  },
  {
    name: "Clint Smith",
    classYear: "2010",
    major: "English",
    currentRole: "Author & Staff Writer",
    company: "The Atlantic",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("Clint Smith", "The Atlantic"),
    bio: "Author of #1 NYT bestseller 'How the Word Is Passed' (2021 National Book Critics Circle Award). Poet, essayist, and public intellectual.",
    careerFields: ["journalism", "research-academia"],
  },

  // ===== JOURNALISM & MEDIA =====
  {
    name: "Patricia Cornwell",
    classYear: "1979",
    major: "English",
    currentRole: "Best-selling Crime Fiction Author (Kay Scarpetta series)",
    company: "Independent",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Patricia Cornwell author"),
    bio: "Creator of the Kay Scarpetta series with 100M+ copies sold worldwide. Davidson English major.",
    careerFields: ["journalism"],
  },

  // ===== ENTREPRENEURSHIP =====
  {
    name: "Roger H. Brown",
    classYear: "1978",
    major: "Physics",
    currentRole: "Former President, Berklee College of Music; Co-founder, Bright Horizons",
    company: "Berklee College of Music",
    location: "Boston, MA",
    linkedinSearch: buildLinkedInSearch("Roger Brown", "Berklee"),
    bio: "Co-founded Bright Horizons (childcare giant) and served as Berklee President for 17 years.",
    careerFields: ["entrepreneurship", "education"],
  },
  {
    name: "Stephen Curry",
    classYear: "2022",
    major: "Sociology",
    currentRole: "4x NBA Champion; Entrepreneur; Investor",
    company: "Golden State Warriors / Unanimous Media",
    location: "San Francisco, CA",
    linkedinSearch: buildLinkedInSearch("Stephen Curry"),
    bio: "Davidson's most famous athlete. 4x NBA champion, 2x MVP. Returned to complete his Sociology degree in 2022. Runs Unanimous Media and invests in tech startups.",
    careerFields: ["entrepreneurship", "product-management"],
  },

  // ===== ENVIRONMENTAL SCIENCE =====
  {
    name: "Randolph Lewis",
    classYear: "1991",
    major: "English",
    currentRole: "Co-Founder",
    company: "Pioneer Springs Community School",
    location: "North Carolina",
    linkedinSearch: buildLinkedInSearch("Randolph Lewis", "Pioneer Springs"),
    bio: "Co-founded a K-12 nature-based charter school. Combines education and environmental stewardship.",
    careerFields: ["environmental-science", "education"],
  },

  // ===== MARKETING =====
  {
    name: "Stephen P. MacMillan",
    classYear: "1985",
    major: "Economics",
    currentRole: "Chairman, President & CEO",
    company: "Hologic",
    location: "Marlborough, MA",
    linkedinSearch: buildLinkedInSearch("Stephen MacMillan", "Hologic"),
    bio: "Led Stryker as the youngest Fortune 500 CEO. Now heads Hologic. Davidson Economics major.",
    careerFields: ["investment-banking", "marketing"],
  },

  // ===== UX DESIGN / CREATIVE =====
  {
    name: "Bertis Downs IV",
    classYear: "1978",
    major: "History",
    currentRole: "Entertainment Lawyer & Manager of R.E.M.",
    company: "Independent",
    location: "Athens, GA",
    linkedinSearch: buildLinkedInSearch("Bertis Downs REM"),
    bio: "Manager of rock band R.E.M. and adjunct professor at UGA Law. Bridged arts and law from Davidson.",
    careerFields: ["law", "ux-design"],
  },
];

export const DAVIDSON_ALUMNI = ALL_ALUMNI;

export function getAlumniForCareer(careerFieldId: string): DavidsonAlumni[] {
  return ALL_ALUMNI.filter((a) => a.careerFields.includes(careerFieldId));
}
