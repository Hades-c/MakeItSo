// Real Davidson College alumni — verified from public sources
// Sources: Davidson College website, Wikipedia, news articles, professional bios

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
  // ===== GOVERNMENT & PUBLIC POLICY =====
  {
    name: "Anthony Foxx",
    classYear: "1993",
    major: "History",
    currentRole: "Professor of Public Leadership; Former U.S. Secretary of Transportation",
    company: "Harvard Kennedy School",
    location: "Cambridge, MA",
    linkedinSearch: buildLinkedInSearch("Anthony Foxx", "Harvard Kennedy School"),
    bio: "Former U.S. Secretary of Transportation (2013-2017) and youngest Mayor of Charlotte. Chairs Davidson's Board of Trustees.",
    careerFields: ["public-policy", "education"],
  },
  {
    name: "Dean Rusk",
    classYear: "1931",
    major: "Political Science",
    currentRole: "U.S. Secretary of State (1961-1969)",
    company: "U.S. Government",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("Dean Rusk Secretary of State Davidson College"),
    bio: "Rhodes Scholar from Davidson who served as Secretary of State under Presidents Kennedy and Johnson.",
    careerFields: ["public-policy"],
  },
  {
    name: "John Spratt",
    classYear: "1964",
    major: "History",
    currentRole: "U.S. Representative for SC-5 (1983-2011)",
    company: "U.S. Congress",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("John Spratt Congress Davidson"),
    bio: "Served 28 years in Congress and chaired the House Budget Committee. Davidson History major.",
    careerFields: ["public-policy"],
  },
  {
    name: "Mary Verner",
    classYear: "1988",
    major: "Medical Anthropology",
    currentRole: "45th Mayor of Spokane, WA (2007-2011)",
    company: "City of Spokane",
    location: "Spokane, WA",
    linkedinSearch: buildLinkedInSearch("Mary Verner", "Spokane"),
    bio: "First female Mayor of Spokane. Davidson grad with a background in medical anthropology.",
    careerFields: ["public-policy"],
  },
  {
    name: "Michael R. Taylor",
    classYear: "1971",
    major: "Political Science",
    currentRole: "Former Deputy Commissioner for Foods",
    company: "FDA",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("Michael Taylor FDA"),
    bio: "Led food safety policy at the FDA (2010-2016). Davidson Political Science major who shaped U.S. food regulation.",
    careerFields: ["public-policy"],
  },

  // ===== HEALTHCARE & MEDICINE =====
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
    name: "Dr. Ketan Bulsara",
    classYear: "1992",
    major: "Biology",
    currentRole: "Professor & Founding Chair of Neurosurgery",
    company: "UConn Health",
    location: "Farmington, CT",
    linkedinSearch: buildLinkedInSearch("Ketan Bulsara", "UConn"),
    bio: "Founded the neurosurgery department at UConn Health. Davidson Biology graduate.",
    careerFields: ["medicine", "research-academia"],
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
  {
    name: "Dr. William Winkenwerder Jr.",
    classYear: "1976",
    major: "Pre-Medicine",
    currentRole: "Chairman; Former Asst. Secretary of Defense for Health Affairs",
    company: "CitiusTech",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("William Winkenwerder", "CitiusTech"),
    bio: "Former Asst. Secretary of Defense for Health Affairs and CEO of Highmark. Now leads healthcare tech.",
    careerFields: ["medicine", "public-policy"],
  },

  // ===== LAW =====
  {
    name: "Thomas W. Ross",
    classYear: "1972",
    major: "Political Science",
    currentRole: "Former President, UNC System; Former NC Superior Court Judge",
    company: "Volcker Alliance",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("Thomas Ross", "Volcker Alliance"),
    bio: "Served as president of both Davidson College and the UNC system. Former NC Superior Court Judge.",
    careerFields: ["law", "education"],
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

  // ===== MEDIA & JOURNALISM =====
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
  {
    name: "Jason McManus",
    classYear: "1956",
    major: "Philosophy & Religion",
    currentRole: "Former Editor-in-Chief, Time Inc. (1987-1994)",
    company: "Time Inc.",
    location: "New York, NY",
    linkedinSearch: buildLinkedInSearch("Jason McManus Time Inc"),
    bio: "Oversaw all 24 Time Inc. magazines as Editor-in-Chief. Davidson Philosophy & Religion major.",
    careerFields: ["journalism"],
  },
  {
    name: "Tony Snow",
    classYear: "1977",
    major: "Philosophy",
    currentRole: "25th White House Press Secretary; Fox News Anchor",
    company: "White House / Fox News",
    location: "Washington, D.C.",
    linkedinSearch: buildLinkedInSearch("Tony Snow White House Press Secretary"),
    bio: "Davidson Philosophy major who became White House Press Secretary and nationally syndicated columnist.",
    careerFields: ["journalism", "public-policy"],
  },
  {
    name: "William R. Ferris",
    classYear: "1964",
    major: "English Literature",
    currentRole: "Former Chairman, National Endowment for the Humanities",
    company: "University of Mississippi",
    location: "Oxford, MS",
    linkedinSearch: buildLinkedInSearch("William Ferris NEH"),
    bio: "7th Chairman of the NEH (1997-2001). Folklorist, author, filmmaker. Davidson English Lit major.",
    careerFields: ["journalism", "research-academia", "public-policy"],
  },

  // ===== EDUCATION & ACADEMIA =====
  {
    name: "Graham T. Allison",
    classYear: "1962",
    major: "Political Science",
    currentRole: "Douglas Dillon Professor of Government",
    company: "Harvard Kennedy School",
    location: "Cambridge, MA",
    linkedinSearch: buildLinkedInSearch("Graham Allison", "Harvard"),
    bio: "Pioneering political scientist and author of 'Essence of Decision.' Davidson undergraduate.",
    careerFields: ["research-academia", "public-policy"],
  },
  {
    name: "Holmes Rolston III",
    classYear: "1953",
    major: "Physics & Mathematics",
    currentRole: "University Distinguished Professor of Philosophy",
    company: "Colorado State University",
    location: "Fort Collins, CO",
    linkedinSearch: buildLinkedInSearch("Holmes Rolston environmental ethics"),
    bio: "'Father of environmental ethics.' Won the 2003 Templeton Prize. Davidson Physics & Math major.",
    careerFields: ["research-academia", "environmental-science"],
  },
  {
    name: "Charles Wright",
    classYear: "1957",
    major: "English",
    currentRole: "Pulitzer Prize-winning Poet; Former U.S. Poet Laureate",
    company: "University of Virginia",
    location: "Charlottesville, VA",
    linkedinSearch: buildLinkedInSearch("Charles Wright poet laureate"),
    bio: "Pulitzer Prize winner and U.S. Poet Laureate. Davidson English major who became one of America's finest poets.",
    careerFields: ["research-academia"],
  },

  // ===== FINANCE & BUSINESS =====
  {
    name: "Stephen P. MacMillan",
    classYear: "1985",
    major: "Economics",
    currentRole: "Chairman, President & CEO",
    company: "Hologic",
    location: "Marlborough, MA",
    linkedinSearch: buildLinkedInSearch("Stephen MacMillan", "Hologic"),
    bio: "Led Stryker as the youngest Fortune 500 CEO. Now heads Hologic. Davidson Economics major.",
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
    name: "Lily Korir",
    classYear: "2023",
    major: "Computer Science & Applied Physics",
    currentRole: "Founder",
    company: "Mulik Dairy Solutions",
    location: "Kenya",
    linkedinSearch: buildLinkedInSearch("Lily Korir", "Mulik Dairy"),
    bio: "Founded a tech-enabled dairy farming startup in Kenya. Recent Davidson CS & Physics graduate.",
    careerFields: ["entrepreneurship", "software-engineering"],
  },
  {
    name: "Ed Van Deman",
    classYear: "1969",
    major: "Mathematics",
    currentRole: "CEO & Co-Founder",
    company: "Forest Systems",
    location: "Charlotte, NC",
    linkedinSearch: buildLinkedInSearch("Ed Van Deman", "Forest Systems"),
    bio: "Fintech pioneer who co-founded Financial Navigator in 1983 and later Forest Systems for family offices.",
    careerFields: ["entrepreneurship", "investment-banking"],
  },
  {
    name: "Elizabeth Brigham",
    classYear: "2004",
    major: "Economics",
    currentRole: "Executive Director, Hurt Hub for Innovation",
    company: "Davidson College",
    location: "Davidson, NC",
    linkedinSearch: buildLinkedInSearch("Elizabeth Brigham", "Davidson College Hurt Hub"),
    bio: "Leads Davidson's innovation hub, connecting students with startups and tech companies.",
    careerFields: ["entrepreneurship", "software-engineering"],
  },

  // ===== DATA SCIENCE =====
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

  // ===== PRODUCT MANAGEMENT =====
  {
    name: "Stephen Curry",
    classYear: "2022",
    major: "Sociology",
    currentRole: "4x NBA Champion; Entrepreneur; Investor",
    company: "Golden State Warriors / Unanimous Media",
    location: "San Francisco, CA",
    linkedinSearch: buildLinkedInSearch("Stephen Curry"),
    bio: "Davidson's most famous athlete. 4x NBA champion, 2x MVP. Returned to complete his Sociology degree in 2022. Also runs Unanimous Media production company.",
    careerFields: ["entrepreneurship", "product-management"],
  },

  // ===== ENVIRONMENTAL SCIENCE =====
  {
    name: "Dr. Mark S. George",
    classYear: "1980",
    major: "Biology",
    currentRole: "Distinguished University Professor of Psychiatry, Radiology, and Neurosciences",
    company: "MUSC",
    location: "Charleston, SC",
    linkedinSearch: buildLinkedInSearch("Mark George", "MUSC"),
    bio: "Pioneer in brain stimulation therapy. Distinguished professor across three departments at MUSC.",
    careerFields: ["medicine", "research-academia"],
  },
];

export const DAVIDSON_ALUMNI = ALL_ALUMNI;

export function getAlumniForCareer(careerFieldId: string): DavidsonAlumni[] {
  return ALL_ALUMNI.filter((a) => a.careerFields.includes(careerFieldId));
}
