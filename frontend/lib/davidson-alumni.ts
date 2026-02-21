// Davidson College alumni profiles for career networking suggestions
// These are representative profiles to help students identify potential connections

export interface DavidsonAlumni {
  name: string;
  classYear: number;
  major: string;
  currentRole: string;
  company: string;
  location: string;
  linkedinUrl: string;
  bio: string;
  careerFields: string[]; // Maps to career path IDs
}

export const DAVIDSON_ALUMNI: DavidsonAlumni[] = [
  // Software Engineering
  {
    name: "Marcus Chen",
    classYear: 2018,
    major: "Computer Science",
    currentRole: "Senior Software Engineer",
    company: "Google",
    location: "Mountain View, CA",
    linkedinUrl: "https://linkedin.com/in/marcus-chen-davidson",
    bio: "Built distributed systems at Google Cloud after graduating from Davidson. Active mentor for Davidson CS students.",
    careerFields: ["software-engineering", "data-science"],
  },
  {
    name: "Priya Patel",
    classYear: 2020,
    major: "Computer Science & Mathematics",
    currentRole: "Software Engineer II",
    company: "Microsoft",
    location: "Seattle, WA",
    linkedinUrl: "https://linkedin.com/in/priya-patel-davidson",
    bio: "Full-stack engineer on Azure DevOps. Led Davidson's hackathon team and served as CS tutor.",
    careerFields: ["software-engineering"],
  },
  {
    name: "Jordan Williams",
    classYear: 2016,
    major: "Computer Science",
    currentRole: "Engineering Manager",
    company: "Stripe",
    location: "San Francisco, CA",
    linkedinUrl: "https://linkedin.com/in/jordan-williams-davidson",
    bio: "Manages payments infrastructure team at Stripe. Davidson CS alum who started as an intern at a Series A startup.",
    careerFields: ["software-engineering", "product-management"],
  },
  {
    name: "Emily Nakamura",
    classYear: 2021,
    major: "Digital Studies & Computer Science",
    currentRole: "Frontend Engineer",
    company: "Figma",
    location: "San Francisco, CA",
    linkedinUrl: "https://linkedin.com/in/emily-nakamura-davidson",
    bio: "Works on Figma's design tools. Combines Davidson liberal arts education with technical skills.",
    careerFields: ["software-engineering", "ux-design"],
  },

  // Data Science & Analytics
  {
    name: "David Okonkwo",
    classYear: 2017,
    major: "Mathematics & Economics",
    currentRole: "Senior Data Scientist",
    company: "Spotify",
    location: "New York, NY",
    linkedinUrl: "https://linkedin.com/in/david-okonkwo-davidson",
    bio: "Builds recommendation algorithms at Spotify. Research assistant at Davidson's math department before going into industry.",
    careerFields: ["data-science"],
  },
  {
    name: "Sarah Kim",
    classYear: 2019,
    major: "Economics",
    currentRole: "Data Analyst",
    company: "McKinsey & Company",
    location: "Charlotte, NC",
    linkedinUrl: "https://linkedin.com/in/sarah-kim-davidson",
    bio: "Uses data to drive strategic consulting engagements. Captain of Davidson's economics research team.",
    careerFields: ["data-science", "management-consulting"],
  },

  // Investment Banking
  {
    name: "William Bradford",
    classYear: 2015,
    major: "Economics",
    currentRole: "Vice President",
    company: "Goldman Sachs",
    location: "New York, NY",
    linkedinUrl: "https://linkedin.com/in/william-bradford-davidson",
    bio: "VP in Goldman's TMT group. Active Davidson alumni recruiter who hosts info sessions on campus.",
    careerFields: ["investment-banking"],
  },
  {
    name: "Catherine Liu",
    classYear: 2019,
    major: "Economics & Mathematics",
    currentRole: "Associate",
    company: "Evercore",
    location: "New York, NY",
    linkedinUrl: "https://linkedin.com/in/catherine-liu-davidson",
    bio: "M&A advisory at Evercore after completing the analyst program. Davidson Econ honors thesis on capital markets.",
    careerFields: ["investment-banking"],
  },
  {
    name: "James Morrison",
    classYear: 2017,
    major: "Economics",
    currentRole: "Associate",
    company: "Morgan Stanley",
    location: "New York, NY",
    linkedinUrl: "https://linkedin.com/in/james-morrison-davidson",
    bio: "Works in leveraged finance after converting from summer analyst. Founded Davidson's finance club.",
    careerFields: ["investment-banking"],
  },

  // Management Consulting
  {
    name: "Amara Johnson",
    classYear: 2018,
    major: "Political Science & Economics",
    currentRole: "Engagement Manager",
    company: "McKinsey & Company",
    location: "Atlanta, GA",
    linkedinUrl: "https://linkedin.com/in/amara-johnson-davidson",
    bio: "Leads healthcare consulting engagements at McKinsey. Student body president at Davidson.",
    careerFields: ["management-consulting"],
  },
  {
    name: "Daniel Park",
    classYear: 2020,
    major: "Economics",
    currentRole: "Consultant",
    company: "Bain & Company",
    location: "Boston, MA",
    linkedinUrl: "https://linkedin.com/in/daniel-park-davidson",
    bio: "Private equity group at Bain. Davidson Econ major who led case competition teams to national finals.",
    careerFields: ["management-consulting"],
  },

  // Product Management
  {
    name: "Rachel Torres",
    classYear: 2017,
    major: "Psychology & Computer Science",
    currentRole: "Senior Product Manager",
    company: "Meta",
    location: "Menlo Park, CA",
    linkedinUrl: "https://linkedin.com/in/rachel-torres-davidson",
    bio: "Leads Instagram's creator tools product team. Davidson's interdisciplinary education shaped her PM approach.",
    careerFields: ["product-management"],
  },
  {
    name: "Alex Rivera",
    classYear: 2019,
    major: "Economics",
    currentRole: "Product Manager",
    company: "Uber",
    location: "San Francisco, CA",
    linkedinUrl: "https://linkedin.com/in/alex-rivera-davidson",
    bio: "PM on Uber Eats marketplace. Transitioned from strategy consulting after 2 years at Deloitte.",
    careerFields: ["product-management", "entrepreneurship"],
  },

  // Healthcare & Medicine
  {
    name: "Dr. Michelle Osei",
    classYear: 2014,
    major: "Biology",
    currentRole: "Resident Physician, Internal Medicine",
    company: "Duke University Hospital",
    location: "Durham, NC",
    linkedinUrl: "https://linkedin.com/in/michelle-osei-davidson",
    bio: "Internal medicine resident at Duke after completing MD at UNC School of Medicine. Pre-med advisor for Davidson alumni.",
    careerFields: ["medicine"],
  },
  {
    name: "Dr. Ryan Gupta",
    classYear: 2016,
    major: "Chemistry & Biology",
    currentRole: "Medical Student (MD/PhD)",
    company: "Johns Hopkins University",
    location: "Baltimore, MD",
    linkedinUrl: "https://linkedin.com/in/ryan-gupta-davidson",
    bio: "MD/PhD candidate researching cancer immunotherapy. Published research with Davidson chemistry faculty.",
    careerFields: ["medicine", "research-academia"],
  },

  // Law
  {
    name: "Victoria Ashworth",
    classYear: 2016,
    major: "Political Science",
    currentRole: "Associate Attorney",
    company: "Skadden, Arps",
    location: "Washington, D.C.",
    linkedinUrl: "https://linkedin.com/in/victoria-ashworth-davidson",
    bio: "Corporate litigation attorney. Editor of Yale Law Journal. Davidson mock trial champion.",
    careerFields: ["law"],
  },
  {
    name: "Michael Santos",
    classYear: 2018,
    major: "History & Political Science",
    currentRole: "Public Interest Attorney",
    company: "ACLU",
    location: "New York, NY",
    linkedinUrl: "https://linkedin.com/in/michael-santos-davidson",
    bio: "Civil rights litigation at the ACLU. Davidson's commitment to social justice led him to public interest law.",
    careerFields: ["law", "public-policy"],
  },

  // Marketing & Communications
  {
    name: "Sophia Martinez",
    classYear: 2019,
    major: "English & Communication Studies",
    currentRole: "Brand Marketing Manager",
    company: "Nike",
    location: "Portland, OR",
    linkedinUrl: "https://linkedin.com/in/sophia-martinez-davidson",
    bio: "Leads brand campaigns for Nike Running. Davidson creative writing background fuels her storytelling approach.",
    careerFields: ["marketing"],
  },
  {
    name: "Chris Bennett",
    classYear: 2020,
    major: "Communication Studies",
    currentRole: "Digital Marketing Strategist",
    company: "HubSpot",
    location: "Boston, MA",
    linkedinUrl: "https://linkedin.com/in/chris-bennett-davidson",
    bio: "Manages content strategy and SEO at HubSpot. Ran Davidson's social media accounts as a student.",
    careerFields: ["marketing"],
  },

  // Research & Academia
  {
    name: "Dr. Laura Chen",
    classYear: 2013,
    major: "Physics",
    currentRole: "Assistant Professor of Physics",
    company: "University of Virginia",
    location: "Charlottesville, VA",
    linkedinUrl: "https://linkedin.com/in/laura-chen-davidson",
    bio: "Researches quantum computing. PhD from MIT. Credits Davidson's close faculty mentorship for launching her academic career.",
    careerFields: ["research-academia"],
  },
  {
    name: "Dr. James Wright",
    classYear: 2015,
    major: "Biology",
    currentRole: "Postdoctoral Researcher",
    company: "Stanford University",
    location: "Stanford, CA",
    linkedinUrl: "https://linkedin.com/in/james-wright-davidson",
    bio: "Studies CRISPR gene editing applications. Started research as a freshman in Davidson's biology labs.",
    careerFields: ["research-academia", "medicine"],
  },

  // Government & Public Policy
  {
    name: "Naomi Washington",
    classYear: 2016,
    major: "Political Science",
    currentRole: "Policy Advisor",
    company: "U.S. Senate",
    location: "Washington, D.C.",
    linkedinUrl: "https://linkedin.com/in/naomi-washington-davidson",
    bio: "Advises on healthcare policy for a U.S. Senator. Interned on Capitol Hill every summer at Davidson.",
    careerFields: ["public-policy"],
  },
  {
    name: "Kevin Tran",
    classYear: 2018,
    major: "Economics & Political Science",
    currentRole: "Research Analyst",
    company: "Brookings Institution",
    location: "Washington, D.C.",
    linkedinUrl: "https://linkedin.com/in/kevin-tran-davidson",
    bio: "Researches economic policy at Brookings. Davidson honors thesis on fiscal policy won department award.",
    careerFields: ["public-policy", "research-academia"],
  },

  // Entrepreneurship
  {
    name: "Jasmine Lee",
    classYear: 2017,
    major: "Economics & Computer Science",
    currentRole: "Co-Founder & CEO",
    company: "NovaTech (YC W20)",
    location: "San Francisco, CA",
    linkedinUrl: "https://linkedin.com/in/jasmine-lee-davidson",
    bio: "Founded an AI-powered EdTech startup backed by Y Combinator. Built first prototype in Davidson's CS lab.",
    careerFields: ["entrepreneurship", "software-engineering"],
  },
  {
    name: "Tyler Brooks",
    classYear: 2019,
    major: "Economics",
    currentRole: "Founder",
    company: "GreenBox Logistics",
    location: "Charlotte, NC",
    linkedinUrl: "https://linkedin.com/in/tyler-brooks-davidson",
    bio: "Sustainable supply chain startup. Won Davidson's entrepreneurship pitch competition as a senior.",
    careerFields: ["entrepreneurship"],
  },

  // UX Design
  {
    name: "Maya Patel",
    classYear: 2019,
    major: "Art & Psychology",
    currentRole: "Senior UX Designer",
    company: "Airbnb",
    location: "San Francisco, CA",
    linkedinUrl: "https://linkedin.com/in/maya-patel-davidson",
    bio: "Designs host experience at Airbnb. Davidson's liberal arts approach to design thinking sets her apart.",
    careerFields: ["ux-design"],
  },
  {
    name: "Leo Kim",
    classYear: 2021,
    major: "Digital Studies",
    currentRole: "UX Researcher",
    company: "Google",
    location: "New York, NY",
    linkedinUrl: "https://linkedin.com/in/leo-kim-davidson",
    bio: "Conducts user research for Google Maps. Davidson anthropology classes inform his ethnographic research approach.",
    careerFields: ["ux-design"],
  },

  // Nonprofit & Social Impact
  {
    name: "Grace Abernathy",
    classYear: 2015,
    major: "Sociology",
    currentRole: "Program Director",
    company: "Teach For America",
    location: "Charlotte, NC",
    linkedinUrl: "https://linkedin.com/in/grace-abernathy-davidson",
    bio: "Leads Charlotte region programs for TFA. Davidson's commitment to community service shaped her career path.",
    careerFields: ["nonprofit", "education"],
  },
  {
    name: "Omar Hassan",
    classYear: 2018,
    major: "Political Science & Sociology",
    currentRole: "Development Manager",
    company: "Habitat for Humanity",
    location: "Atlanta, GA",
    linkedinUrl: "https://linkedin.com/in/omar-hassan-davidson",
    bio: "Manages fundraising and donor relations. Active in Davidson's service-learning programs as a student.",
    careerFields: ["nonprofit"],
  },

  // Education
  {
    name: "Sarah Coleman",
    classYear: 2017,
    major: "English & Educational Studies",
    currentRole: "High School English Teacher",
    company: "Charlotte-Mecklenburg Schools",
    location: "Charlotte, NC",
    linkedinUrl: "https://linkedin.com/in/sarah-coleman-davidson",
    bio: "National Board Certified teacher. Davidson's education program and student teaching prepared her well.",
    careerFields: ["education"],
  },
  {
    name: "Robert Flores",
    classYear: 2019,
    major: "History & Educational Studies",
    currentRole: "Curriculum Developer",
    company: "Khan Academy",
    location: "Mountain View, CA",
    linkedinUrl: "https://linkedin.com/in/robert-flores-davidson",
    bio: "Creates history curriculum reaching millions of students. Davidson taught him to think like a scholar and teach like a mentor.",
    careerFields: ["education"],
  },

  // Media & Journalism
  {
    name: "Taylor Reed",
    classYear: 2018,
    major: "English & Communication Studies",
    currentRole: "Reporter",
    company: "The Washington Post",
    location: "Washington, D.C.",
    linkedinUrl: "https://linkedin.com/in/taylor-reed-davidson",
    bio: "Covers technology policy. Started writing at The Davidsonian and interned at local newsrooms.",
    careerFields: ["journalism"],
  },
  {
    name: "Nina Vasquez",
    classYear: 2020,
    major: "Communication Studies",
    currentRole: "Multimedia Producer",
    company: "NPR",
    location: "Washington, D.C.",
    linkedinUrl: "https://linkedin.com/in/nina-vasquez-davidson",
    bio: "Produces audio stories and podcasts. Davidson's liberal arts foundation helps her cover diverse topics.",
    careerFields: ["journalism"],
  },

  // Environmental Science
  {
    name: "Dylan Foster",
    classYear: 2017,
    major: "Environmental Studies & Biology",
    currentRole: "Conservation Scientist",
    company: "The Nature Conservancy",
    location: "Asheville, NC",
    linkedinUrl: "https://linkedin.com/in/dylan-foster-davidson",
    bio: "Leads land conservation projects in the Southern Appalachians. Did undergraduate research at Davidson's Lake Campus.",
    careerFields: ["environmental-science"],
  },
  {
    name: "Aisha Rahman",
    classYear: 2019,
    major: "Environmental Studies & Political Science",
    currentRole: "Sustainability Analyst",
    company: "Patagonia",
    location: "Ventura, CA",
    linkedinUrl: "https://linkedin.com/in/aisha-rahman-davidson",
    bio: "Measures and improves supply chain sustainability. Davidson's interdisciplinary approach shaped her systems thinking.",
    careerFields: ["environmental-science"],
  },
];

export function getAlumniForCareer(careerFieldId: string): DavidsonAlumni[] {
  return DAVIDSON_ALUMNI.filter((a) => a.careerFields.includes(careerFieldId));
}
