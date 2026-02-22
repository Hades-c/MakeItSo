// Comprehensive Davidson College course data
// Faculty verified against Davidson website (Feb 2026)
// RateMyProfessors data sourced from ratemyprofessors.com (school ID: 3965)

export interface ProfessorRMPData {
  name: string;
  title?: string;
  rmpRating?: number;
  rmpDifficulty?: number;
  rmpNumRatings?: number;
  rmpWouldTakeAgain?: number;
  rmpTags?: string[];
}

export interface CourseInsightsData {
  keyTopics?: string[];
  skillsGained?: string[];
}

export interface SeedCourse {
  code: string;
  name: string;
  description: string;
  credits: number;
  department: string;
  prerequisites: string[];
  offered: ("Fall" | "Spring" | "Summer")[];
  tags: string[];
  majorRequirements?: string[]; // Which major(s) this course is required for
  difficulty: number;
  professor?: string;
  professorRating?: number;
  professorInfo?: ProfessorRMPData;
  courseInsights?: CourseInsightsData;
  careerRelevance: { field: string; relevance: number }[];
}

export const DAVIDSON_COURSES: SeedCourse[] = [
  // ===== COMPUTER SCIENCE =====
  {
    code: "CSC 121", name: "Programming and Problem Solving",
    description: "Introduction to computer science through programming. Topics include variables, control structures, functions, arrays, and object-oriented design.",
    credits: 4, department: "Computer Science", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement"], majorRequirements: ["Computer Science"], difficulty: 2,
    professor: "Dr. Tabitha Peck", professorRating: 2.4,
    professorInfo: {
      name: "Dr. Tabitha Peck",
      title: "Associate Professor of Mathematics and Computer Science",
      rmpRating: 2.4, rmpDifficulty: 4.2, rmpNumRatings: 27, rmpWouldTakeAgain: 35,
      rmpTags: ["Tough grader", "Lots of homework", "Accessible outside class", "Caring", "Clear grading criteria", "Gives good feedback"],
    },
    courseInsights: {
      keyTopics: ["Variables & data types", "Control structures", "Functions & methods", "Arrays & collections", "Object-oriented design", "Debugging"],
      skillsGained: ["Programming fundamentals", "Algorithmic thinking", "Problem decomposition", "Code debugging", "Software design basics"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.9 }, { field: "Data Science & Analytics", relevance: 0.7 }],
  },
  {
    code: "CSC 222", name: "Data Structures",
    description: "Study of fundamental data structures including lists, stacks, queues, trees, and graphs. Algorithm analysis and design.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 121"], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement"], majorRequirements: ["Computer Science"], difficulty: 3,
    professor: "Dr. Raghu Ramanujan", professorRating: 4.5,
    professorInfo: {
      name: "Dr. Raghu Ramanujan",
      title: "Chair & Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.5, rmpDifficulty: 3.5, rmpNumRatings: 23, rmpWouldTakeAgain: 77,
      rmpTags: ["Respected", "Gives good feedback", "Lots of homework", "Tough grader", "Amazing lectures", "Hilarious", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Linked lists", "Stacks & queues", "Binary trees", "Hash tables", "Graphs", "Algorithm complexity analysis"],
      skillsGained: ["Data structure selection", "Algorithm analysis (Big-O)", "Abstract data type design", "Recursive problem solving", "Efficient code implementation"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.95 }, { field: "Data Science & Analytics", relevance: 0.8 }],
  },
  {
    code: "CSC 231", name: "Computer Organization and Assembly",
    description: "Computer architecture, assembly language, digital logic, and machine-level programming.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 121"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Computer Science"], difficulty: 4,
    professor: "Dr. Hammurabi Mendes", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Hammurabi Mendes",
      title: "Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.2, rmpDifficulty: 3.8, rmpNumRatings: 9, rmpWouldTakeAgain: 78,
      rmpTags: ["Inspirational", "Caring", "Accessible outside class", "Hilarious", "Respected", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Digital logic design", "Assembly language", "CPU architecture", "Memory hierarchy", "Instruction set architecture", "Machine-level programming"],
      skillsGained: ["Low-level programming", "Hardware-software interface understanding", "Binary & hex arithmetic", "Systems-level thinking", "Performance optimization"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.7 }],
  },
  {
    code: "CSC 250", name: "Discrete Mathematics",
    description: "Mathematical foundations of computer science including logic, sets, functions, relations, and graph theory.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 121", "MAT 112"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Computer Science", "Mathematics"], difficulty: 3,
    professor: "Dr. Tabitha Peck", professorRating: 2.4,
    professorInfo: {
      name: "Dr. Tabitha Peck",
      title: "Associate Professor of Mathematics and Computer Science",
      rmpRating: 2.4, rmpDifficulty: 4.2, rmpNumRatings: 27, rmpWouldTakeAgain: 35,
      rmpTags: ["Tough grader", "Lots of homework", "Accessible outside class", "Caring", "Clear grading criteria", "Gives good feedback"],
    },
    courseInsights: {
      keyTopics: ["Propositional & predicate logic", "Set theory", "Proof techniques", "Combinatorics", "Graph theory", "Relations & functions"],
      skillsGained: ["Mathematical reasoning", "Formal proof writing", "Logical thinking", "Abstract problem solving", "Theoretical CS foundations"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.6 }, { field: "Data Science & Analytics", relevance: 0.5 }],
  },
  {
    code: "CSC 321", name: "Analysis of Algorithms",
    description: "Design and analysis of algorithms. Topics include sorting, graph algorithms, dynamic programming, and NP-completeness.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222", "CSC 250"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Computer Science"], difficulty: 4,
    professor: "Dr. Raghu Ramanujan", professorRating: 4.5,
    professorInfo: {
      name: "Dr. Raghu Ramanujan",
      title: "Chair & Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.5, rmpDifficulty: 3.5, rmpNumRatings: 23, rmpWouldTakeAgain: 77,
      rmpTags: ["Respected", "Gives good feedback", "Lots of homework", "Tough grader", "Amazing lectures", "Hilarious", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Sorting algorithms", "Graph algorithms", "Dynamic programming", "Greedy algorithms", "NP-completeness", "Divide and conquer"],
      skillsGained: ["Algorithm design patterns", "Complexity analysis", "Optimization strategies", "Computational problem classification", "Technical interview preparation"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.9 }, { field: "Data Science & Analytics", relevance: 0.7 }],
  },
  {
    code: "CSC 341", name: "Operating Systems",
    description: "Operating system concepts including processes, memory management, file systems, and concurrency.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222", "CSC 231"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    professor: "Dr. Hammurabi Mendes", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Hammurabi Mendes",
      title: "Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.2, rmpDifficulty: 3.8, rmpNumRatings: 9, rmpWouldTakeAgain: 78,
      rmpTags: ["Inspirational", "Caring", "Accessible outside class", "Hilarious", "Respected", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Process management", "Memory management", "File systems", "Concurrency & synchronization", "Scheduling algorithms", "Virtual memory"],
      skillsGained: ["Systems programming", "Concurrent programming", "Resource management", "Unix/Linux proficiency", "Low-level debugging"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.8 }],
  },
  {
    code: "CSC 371", name: "Database Systems",
    description: "Design and implementation of database systems. SQL, relational algebra, normalization, and transaction processing.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Tabitha Peck", professorRating: 2.4,
    professorInfo: {
      name: "Dr. Tabitha Peck",
      title: "Associate Professor of Mathematics and Computer Science",
      rmpRating: 2.4, rmpDifficulty: 4.2, rmpNumRatings: 27, rmpWouldTakeAgain: 35,
      rmpTags: ["Tough grader", "Lots of homework", "Accessible outside class", "Caring", "Clear grading criteria", "Gives good feedback"],
    },
    courseInsights: {
      keyTopics: ["SQL & relational algebra", "Database normalization", "Transaction processing", "Indexing & query optimization", "ER modeling", "NoSQL concepts"],
      skillsGained: ["Database design", "SQL proficiency", "Data modeling", "Query optimization", "Backend development foundations"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.85 }, { field: "Data Science & Analytics", relevance: 0.9 }],
  },
  {
    code: "CSC 361", name: "Artificial Intelligence",
    description: "Introduction to AI including search, knowledge representation, machine learning, and neural networks.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    professor: "Dr. Raghu Ramanujan", professorRating: 4.5,
    professorInfo: {
      name: "Dr. Raghu Ramanujan",
      title: "Chair & Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.5, rmpDifficulty: 3.5, rmpNumRatings: 23, rmpWouldTakeAgain: 77,
      rmpTags: ["Respected", "Gives good feedback", "Lots of homework", "Tough grader", "Amazing lectures", "Hilarious", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Search algorithms", "Knowledge representation", "Machine learning basics", "Neural networks", "Natural language processing", "Game-playing AI"],
      skillsGained: ["AI system design", "ML model implementation", "Heuristic search", "Intelligent agent design", "Applied mathematics for AI"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.8 }, { field: "Data Science & Analytics", relevance: 0.95 }],
  },
  {
    code: "CSC 381", name: "Software Engineering",
    description: "Software development methodologies, project management, testing, and team-based development.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Tabitha Peck", professorRating: 2.4,
    professorInfo: {
      name: "Dr. Tabitha Peck",
      title: "Associate Professor of Mathematics and Computer Science",
      rmpRating: 2.4, rmpDifficulty: 4.2, rmpNumRatings: 27, rmpWouldTakeAgain: 35,
      rmpTags: ["Tough grader", "Lots of homework", "Accessible outside class", "Caring", "Clear grading criteria", "Gives good feedback"],
    },
    courseInsights: {
      keyTopics: ["Agile methodologies", "Software testing", "Version control", "Design patterns", "Project management", "Team collaboration"],
      skillsGained: ["Software project management", "Test-driven development", "Code review skills", "Team-based development", "Professional software practices"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.95 }, { field: "Product Management", relevance: 0.6 }],
  },

  // ===== ECONOMICS =====
  {
    code: "ECO 101", name: "Principles of Economics",
    description: "Introduction to micro and macroeconomic concepts including supply and demand, market structures, GDP, and monetary policy.",
    credits: 4, department: "Economics", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Economics"], difficulty: 2,
    professor: "Dr. Fred Smith", professorRating: 4.9,
    professorInfo: {
      name: "Dr. Fred Smith",
      title: "Professor of Economics",
      rmpRating: 4.9, rmpDifficulty: 3.1, rmpNumRatings: 48, rmpWouldTakeAgain: 100,
      rmpTags: ["Accessible outside class", "Respected", "Amazing lectures", "Caring", "Inspirational", "Hilarious"],
    },
    courseInsights: {
      keyTopics: ["Supply & demand", "Market structures", "GDP & economic growth", "Monetary & fiscal policy", "Trade & comparative advantage", "Market failures"],
      skillsGained: ["Economic reasoning", "Market analysis", "Policy evaluation", "Quantitative thinking", "Critical analysis of economic issues"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.8 }, { field: "Consulting", relevance: 0.7 }, { field: "Government & Policy", relevance: 0.6 }],
  },
  {
    code: "ECO 201", name: "Intermediate Microeconomics",
    description: "Consumer theory, producer theory, market structures, game theory, and welfare economics.",
    credits: 4, department: "Economics", prerequisites: ["ECO 101", "MAT 112"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Economics"], difficulty: 3,
    professor: "Dr. Mark Foley", professorRating: 3.8,
    professorInfo: {
      name: "Dr. Mark Foley",
      title: "Chair & Professor of Economics",
      rmpRating: 3.8, rmpDifficulty: 4.1, rmpNumRatings: 38, rmpWouldTakeAgain: 53,
      rmpTags: ["Tough grader", "Accessible outside class", "Amazing lectures", "Caring", "Respected", "Lecture heavy"],
    },
    courseInsights: {
      keyTopics: ["Consumer choice theory", "Production & cost theory", "Game theory", "Market structures", "General equilibrium", "Welfare economics"],
      skillsGained: ["Microeconomic modeling", "Game-theoretic reasoning", "Optimization analysis", "Market structure analysis", "Economic problem solving"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.85 }, { field: "Consulting", relevance: 0.8 }],
  },
  {
    code: "ECO 202", name: "Intermediate Macroeconomics",
    description: "National income accounting, IS-LM model, fiscal and monetary policy, economic growth theories.",
    credits: 4, department: "Economics", prerequisites: ["ECO 101", "MAT 112"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Economics"], difficulty: 3,
    professor: "Dr. Vikram Kumar", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Vikram Kumar",
      title: "Professor of Economics",
      rmpRating: 4.3, rmpDifficulty: 3.6, rmpNumRatings: 32, rmpWouldTakeAgain: 82,
      rmpTags: ["Caring", "Respected", "Lecture heavy", "Gives good feedback", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["National income accounting", "IS-LM model", "Fiscal & monetary policy", "Economic growth models", "Inflation & unemployment", "Open economy macroeconomics"],
      skillsGained: ["Macroeconomic modeling", "Policy analysis", "Economic forecasting basics", "Data interpretation", "Critical evaluation of economic policies"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.85 }, { field: "Government & Policy", relevance: 0.8 }],
  },
  {
    code: "ECO 250", name: "Statistics and Econometrics",
    description: "Statistical methods for economic analysis. Regression analysis, hypothesis testing, and empirical research methods.",
    credits: 4, department: "Economics", prerequisites: ["ECO 101", "MAT 112"], offered: ["Fall", "Spring"],
    tags: ["major-requirement"], majorRequirements: ["Economics"], difficulty: 3,
    professor: "Dr. Angela Cools", professorRating: 4.6,
    professorInfo: {
      name: "Dr. Angela Cools",
      title: "John D. and Catherine T. MacArthur Assistant Professor of Economics",
      rmpRating: 4.6, rmpDifficulty: 3.2, rmpNumRatings: 9, rmpWouldTakeAgain: 100,
      rmpTags: ["Extra credit", "Amazing lectures", "Test heavy", "Accessible outside class", "Caring", "Clear grading criteria"],
    },
    courseInsights: {
      keyTopics: ["Regression analysis", "Hypothesis testing", "Probability theory", "Causal inference", "Panel data methods", "Instrumental variables"],
      skillsGained: ["Statistical analysis", "Econometric modeling", "Data-driven decision making", "Research methodology", "Statistical software proficiency"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.9 }, { field: "Data Science & Analytics", relevance: 0.85 }, { field: "Consulting", relevance: 0.7 }],
  },
  {
    code: "ECO 310", name: "Money and Banking",
    description: "Financial markets and institutions, the Federal Reserve, monetary policy, and banking regulation.",
    credits: 4, department: "Economics", prerequisites: ["ECO 201", "ECO 202"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Vikram Kumar", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Vikram Kumar",
      title: "Professor of Economics",
      rmpRating: 4.3, rmpDifficulty: 3.6, rmpNumRatings: 32, rmpWouldTakeAgain: 82,
      rmpTags: ["Caring", "Respected", "Lecture heavy", "Gives good feedback", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Financial markets", "Banking systems", "Federal Reserve operations", "Monetary policy tools", "Interest rate determination", "Financial regulation"],
      skillsGained: ["Financial market analysis", "Monetary policy evaluation", "Banking system understanding", "Risk assessment", "Financial data interpretation"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.95 }, { field: "Consulting", relevance: 0.6 }],
  },
  {
    code: "ECO 350", name: "International Trade and Finance",
    description: "Trade theory, exchange rates, balance of payments, international monetary systems.",
    credits: 4, department: "Economics", prerequisites: ["ECO 201", "ECO 202"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Caleb Stroup", professorRating: 4.5,
    professorInfo: {
      name: "Dr. Caleb Stroup",
      title: "Associate Professor of Economics",
      rmpRating: 4.5, rmpDifficulty: 4.3, rmpNumRatings: 38, rmpWouldTakeAgain: 90,
      rmpTags: ["Lots of homework", "Caring", "Group projects", "Accessible outside class", "Beware of pop quizzes", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Comparative advantage", "Trade policy", "Exchange rate determination", "Balance of payments", "International monetary systems", "Globalization effects"],
      skillsGained: ["International economic analysis", "Trade policy evaluation", "Exchange rate modeling", "Global market understanding", "Cross-border financial analysis"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.8 }, { field: "Consulting", relevance: 0.75 }, { field: "Government & Policy", relevance: 0.7 }],
  },
  {
    code: "ECO 360", name: "Public Economics",
    description: "Role of government in the economy, taxation, public goods, externalities, and social insurance.",
    credits: 4, department: "Economics", prerequisites: ["ECO 201"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Shyam Gouri Suresh", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Shyam Gouri Suresh",
      title: "James W. Cannon Professor of Economics",
      rmpRating: 4.2, rmpDifficulty: 4.1, rmpNumRatings: 12, rmpWouldTakeAgain: 86,
      rmpTags: ["Accessible outside class", "Lecture heavy", "Gives good feedback", "Caring", "Respected", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Public goods", "Externalities", "Taxation theory", "Social insurance", "Government budgeting", "Cost-benefit analysis"],
      skillsGained: ["Public policy analysis", "Tax policy evaluation", "Welfare analysis", "Government program assessment", "Economic impact analysis"],
    },
    careerRelevance: [{ field: "Government & Policy", relevance: 0.9 }, { field: "Nonprofit & Social Impact", relevance: 0.7 }],
  },

  // ===== MATHEMATICS =====
  {
    code: "MAT 112", name: "Calculus I",
    description: "Limits, derivatives, and integrals of single-variable functions. Applications to optimization and rates of change.",
    credits: 4, department: "Mathematics", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 3,
    professor: "Dr. Heather Blake", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Heather Blake",
      title: "Associate Chair & Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.3, rmpDifficulty: 3.4, rmpNumRatings: 16, rmpWouldTakeAgain: 82,
      rmpTags: ["Accessible outside class", "Tough grader", "Clear grading criteria", "Gives good feedback", "Lots of homework", "Caring"],
    },
    courseInsights: {
      keyTopics: ["Limits & continuity", "Derivatives", "Integration", "Optimization", "Related rates", "Fundamental theorem of calculus"],
      skillsGained: ["Mathematical analysis", "Problem solving", "Quantitative reasoning", "Mathematical modeling", "Analytical thinking"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.6 }, { field: "Data Science & Analytics", relevance: 0.7 }],
  },
  {
    code: "MAT 113", name: "Calculus II",
    description: "Techniques of integration, sequences and series, Taylor series, and parametric equations.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 112"], offered: ["Fall", "Spring"],
    tags: ["core"], difficulty: 3,
    professor: "Dr. Heather Blake", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Heather Blake",
      title: "Associate Chair & Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.3, rmpDifficulty: 3.4, rmpNumRatings: 16, rmpWouldTakeAgain: 82,
      rmpTags: ["Accessible outside class", "Tough grader", "Clear grading criteria", "Gives good feedback", "Lots of homework", "Caring"],
    },
    courseInsights: {
      keyTopics: ["Integration techniques", "Sequences & series", "Taylor series", "Parametric equations", "Polar coordinates", "Convergence tests"],
      skillsGained: ["Advanced integration", "Series analysis", "Mathematical proof techniques", "Approximation methods", "Abstract mathematical reasoning"],
    },
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.6 }],
  },
  {
    code: "MAT 214", name: "Linear Algebra",
    description: "Vector spaces, linear transformations, matrices, determinants, eigenvalues, and diagonalization.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 113"], offered: ["Fall", "Spring"],
    tags: ["major-requirement"], majorRequirements: ["Mathematics", "Computer Science"], difficulty: 3,
    professor: "Dr. Laurie Heyer", professorRating: 3.8,
    professorInfo: {
      name: "Dr. Laurie Heyer",
      title: "John T. Kimbrough Professor of Mathematics and Computer Science",
      rmpRating: 3.8, rmpDifficulty: 3.6, rmpNumRatings: 41, rmpWouldTakeAgain: 43,
      rmpTags: ["Tough grader", "Respected", "Tests are tough", "Lots of homework", "Caring"],
    },
    courseInsights: {
      keyTopics: ["Vector spaces", "Linear transformations", "Matrices & determinants", "Eigenvalues & eigenvectors", "Diagonalization", "Inner product spaces"],
      skillsGained: ["Linear algebraic reasoning", "Matrix computation", "Abstract mathematical structures", "Data transformation understanding", "Foundation for ML/AI"],
    },
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.9 }, { field: "Software Engineering", relevance: 0.5 }],
  },
  {
    code: "MAT 220", name: "Multivariable Calculus",
    description: "Functions of several variables, partial derivatives, multiple integrals, vector calculus.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 113"], offered: ["Fall", "Spring"],
    tags: ["major-requirement"], majorRequirements: ["Mathematics", "Physics"], difficulty: 4,
    professor: "Dr. Heather Blake", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Heather Blake",
      title: "Associate Chair & Associate Professor of Mathematics and Computer Science",
      rmpRating: 4.3, rmpDifficulty: 3.4, rmpNumRatings: 16, rmpWouldTakeAgain: 82,
      rmpTags: ["Accessible outside class", "Tough grader", "Clear grading criteria", "Gives good feedback", "Lots of homework", "Caring"],
    },
    courseInsights: {
      keyTopics: ["Partial derivatives", "Multiple integrals", "Vector fields", "Line & surface integrals", "Green's & Stokes' theorems", "Gradient & divergence"],
      skillsGained: ["Multidimensional analysis", "Vector calculus", "Spatial reasoning", "Advanced mathematical modeling", "Physics applications"],
    },
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.7 }],
  },
  {
    code: "MAT 230", name: "Probability and Statistics",
    description: "Probability theory, random variables, distributions, estimation, and hypothesis testing.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 113"], offered: ["Fall", "Spring"],
    tags: ["major-requirement"], majorRequirements: ["Mathematics"], difficulty: 3,
    professor: "Dr. Tim Chartier", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Tim Chartier",
      title: "Joseph R. Morton Professor of Mathematics and Computer Science",
      rmpRating: 4.4, rmpDifficulty: 3.0, rmpNumRatings: 39, rmpWouldTakeAgain: 88,
      rmpTags: ["Accessible outside class", "Inspirational", "Caring", "Hilarious", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Probability theory", "Random variables", "Probability distributions", "Statistical estimation", "Hypothesis testing", "Bayesian inference"],
      skillsGained: ["Statistical reasoning", "Probabilistic modeling", "Data analysis", "Hypothesis formulation", "Uncertainty quantification"],
    },
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.95 }, { field: "Finance & Banking", relevance: 0.8 }, { field: "Consulting", relevance: 0.6 }],
  },

  // ===== BIOLOGY =====
  {
    code: "BIO 111", name: "Molecules, Genes, and Cells",
    description: "Introduction to molecular biology, genetics, cell structure and function, and biotechnology.",
    credits: 4, department: "Biology", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Biology"], difficulty: 3,
    professor: "Dr. Barbara Lom", professorRating: 4.6,
    professorInfo: {
      name: "Dr. Barbara Lom",
      title: "Beverly F. Dolan Professor of Biology",
      rmpRating: 4.6, rmpDifficulty: 3.4, rmpNumRatings: 14, rmpWouldTakeAgain: 100,
      rmpTags: ["Gives good feedback", "Clear grading criteria", "Inspirational", "Hilarious", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Cell biology", "Molecular genetics", "DNA replication & transcription", "Protein synthesis", "Biotechnology", "Cell signaling"],
      skillsGained: ["Laboratory techniques", "Scientific reasoning", "Molecular biology methods", "Data collection & analysis", "Scientific writing"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.7 }],
  },
  {
    code: "BIO 112", name: "Organisms and Ecosystems",
    description: "Ecology, evolution, organismal biology, and biodiversity.",
    credits: 4, department: "Biology", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Biology"], difficulty: 3,
    professor: "Dr. Mark Barsoum", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Mark Barsoum",
      title: "Assistant Professor of Biology; Director, John Crosland, Jr. Center for Teaching & Learning",
    },
    courseInsights: {
      keyTopics: ["Ecology", "Evolution", "Biodiversity", "Organismal biology", "Population dynamics", "Conservation biology"],
      skillsGained: ["Field research methods", "Ecological analysis", "Evolutionary thinking", "Scientific observation", "Environmental assessment"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.7 }, { field: "Environmental Science", relevance: 0.9 }],
  },
  {
    code: "BIO 220", name: "Genetics",
    description: "Principles of heredity, molecular genetics, gene expression, and genomics.",
    credits: 4, department: "Biology", prerequisites: ["BIO 111"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Biology"], difficulty: 3,
    professor: "Dr. Barbara Lom", professorRating: 4.6,
    professorInfo: {
      name: "Dr. Barbara Lom",
      title: "Beverly F. Dolan Professor of Biology",
      rmpRating: 4.6, rmpDifficulty: 3.4, rmpNumRatings: 14, rmpWouldTakeAgain: 100,
      rmpTags: ["Gives good feedback", "Clear grading criteria", "Inspirational", "Hilarious", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Mendelian genetics", "Molecular genetics", "Gene expression", "Genomics", "Genetic engineering", "Population genetics"],
      skillsGained: ["Genetic analysis", "Genomic data interpretation", "Lab technique proficiency", "Pedigree analysis", "Bioinformatics basics"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.85 }],
  },
  {
    code: "BIO 306", name: "Neuroscience",
    description: "Structure and function of the nervous system. Neural circuits, sensory systems, and cognitive neuroscience.",
    credits: 4, department: "Biology", prerequisites: ["BIO 111"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    professor: "Dr. Barbara Lom", professorRating: 4.6,
    professorInfo: {
      name: "Dr. Barbara Lom",
      title: "Beverly F. Dolan Professor of Biology",
      rmpRating: 4.6, rmpDifficulty: 3.4, rmpNumRatings: 14, rmpWouldTakeAgain: 100,
      rmpTags: ["Gives good feedback", "Clear grading criteria", "Inspirational", "Hilarious", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Neural anatomy", "Synaptic transmission", "Sensory systems", "Motor systems", "Cognitive neuroscience", "Neuroplasticity"],
      skillsGained: ["Neuroscience research methods", "Brain imaging interpretation", "Neural circuit analysis", "Scientific literature review", "Interdisciplinary thinking"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.85 }, { field: "Research & Academia", relevance: 0.9 }],
  },

  // ===== CHEMISTRY =====
  {
    code: "CHE 115", name: "Principles of Chemistry",
    description: "Atomic structure, bonding, stoichiometry, thermochemistry, and introduction to organic chemistry.",
    credits: 4, department: "Chemistry", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Chemistry"], difficulty: 3,
    professor: "Dr. Nicole Snyder", professorRating: 4.8,
    professorInfo: {
      name: "Dr. Nicole Snyder",
      title: "Professor of Chemistry",
      rmpRating: 4.8, rmpDifficulty: 4.2, rmpNumRatings: 50, rmpWouldTakeAgain: 98,
      rmpTags: ["Caring", "Accessible outside class", "Gives good feedback", "Inspirational", "Tough grader", "Respected", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Atomic structure", "Chemical bonding", "Stoichiometry", "Thermochemistry", "Acid-base chemistry", "Introduction to organic chemistry"],
      skillsGained: ["Chemical analysis", "Laboratory safety & technique", "Quantitative problem solving", "Scientific method application", "Chemical equation balancing"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.7 }, { field: "Environmental Science", relevance: 0.6 }],
  },
  {
    code: "CHE 230", name: "Organic Chemistry I",
    description: "Structure, reactivity, and synthesis of organic compounds. Stereochemistry and reaction mechanisms.",
    credits: 4, department: "Chemistry", prerequisites: ["CHE 115"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Chemistry"], difficulty: 4,
    professor: "Dr. Nicole Snyder", professorRating: 4.8,
    professorInfo: {
      name: "Dr. Nicole Snyder",
      title: "Professor of Chemistry",
      rmpRating: 4.8, rmpDifficulty: 4.2, rmpNumRatings: 50, rmpWouldTakeAgain: 98,
      rmpTags: ["Caring", "Accessible outside class", "Gives good feedback", "Inspirational", "Tough grader", "Respected", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Organic compound structure", "Stereochemistry", "Reaction mechanisms", "Functional groups", "Synthesis strategies", "Spectroscopy"],
      skillsGained: ["Organic synthesis planning", "Reaction mechanism analysis", "3D molecular visualization", "Lab synthesis techniques", "Scientific problem solving"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.85 }],
  },

  // ===== PHYSICS =====
  {
    code: "PHY 120", name: "General Physics I",
    description: "Mechanics, thermodynamics, and waves. Calculus-based approach.",
    credits: 4, department: "Physics", prerequisites: ["MAT 112"], offered: ["Fall"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Physics"], difficulty: 3,
    professor: "Dr. Mario Belloni", professorRating: 4.9,
    professorInfo: {
      name: "Dr. Mario Belloni",
      title: "Chair & Professor of Physics",
      rmpRating: 4.9, rmpDifficulty: 2.9, rmpNumRatings: 31, rmpWouldTakeAgain: 100,
      rmpTags: ["Caring", "Amazing lectures", "Accessible outside class", "Gives good feedback", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Newtonian mechanics", "Energy & momentum", "Rotational dynamics", "Thermodynamics", "Wave motion", "Oscillations"],
      skillsGained: ["Physics problem solving", "Mathematical modeling", "Laboratory experimentation", "Data analysis", "Scientific reasoning"],
    },
    careerRelevance: [{ field: "Software Engineering", relevance: 0.3 }, { field: "Research & Academia", relevance: 0.7 }],
  },
  {
    code: "PHY 220", name: "General Physics II",
    description: "Electricity, magnetism, optics, and modern physics.",
    credits: 4, department: "Physics", prerequisites: ["PHY 120", "MAT 113"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Physics"], difficulty: 4,
    professor: "Dr. Mario Belloni", professorRating: 4.9,
    professorInfo: {
      name: "Dr. Mario Belloni",
      title: "Chair & Professor of Physics",
      rmpRating: 4.9, rmpDifficulty: 2.9, rmpNumRatings: 31, rmpWouldTakeAgain: 100,
      rmpTags: ["Caring", "Amazing lectures", "Accessible outside class", "Gives good feedback", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Electrostatics", "Electric circuits", "Magnetism", "Electromagnetic waves", "Optics", "Modern physics"],
      skillsGained: ["Electromagnetic analysis", "Circuit design", "Optical system understanding", "Advanced lab techniques", "Quantitative physics reasoning"],
    },
    careerRelevance: [{ field: "Research & Academia", relevance: 0.8 }],
  },

  // ===== PSYCHOLOGY =====
  {
    code: "PSY 100", name: "General Psychology",
    description: "Survey of major areas in psychology including cognition, development, social behavior, and psychopathology.",
    credits: 4, department: "Psychology", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Psychology"], difficulty: 2,
    professor: "Dr. Mark Smith", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Mark Smith",
      title: "Wayne M. & Carolyn A. Watson Professor of Psychology",
    },
    courseInsights: {
      keyTopics: ["Cognition & memory", "Developmental psychology", "Social psychology", "Psychopathology", "Biological bases of behavior", "Research methods"],
      skillsGained: ["Psychological analysis", "Critical thinking", "Human behavior understanding", "Research literacy", "Empathy & perspective-taking"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.7 }, { field: "Education", relevance: 0.6 }, { field: "Consulting", relevance: 0.4 }],
  },
  {
    code: "PSY 210", name: "Research Methods",
    description: "Experimental design, data analysis, and scientific writing in psychology.",
    credits: 4, department: "Psychology", prerequisites: ["PSY 100"], offered: ["Fall", "Spring"],
    tags: ["major-requirement"], majorRequirements: ["Psychology"], difficulty: 3,
    professor: "Dr. Mark Smith", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Mark Smith",
      title: "Wayne M. & Carolyn A. Watson Professor of Psychology",
    },
    courseInsights: {
      keyTopics: ["Experimental design", "Statistical analysis", "Scientific writing", "Ethics in research", "Data collection methods", "Literature review"],
      skillsGained: ["Research design", "Statistical analysis (SPSS/R)", "Scientific writing", "Critical evaluation of research", "Ethical research conduct"],
    },
    careerRelevance: [{ field: "Research & Academia", relevance: 0.8 }, { field: "Data Science & Analytics", relevance: 0.5 }],
  },
  {
    code: "PSY 310", name: "Cognitive Psychology",
    description: "Attention, perception, memory, language, and decision-making processes.",
    credits: 4, department: "Psychology", prerequisites: ["PSY 100"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Mark Smith", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Mark Smith",
      title: "Wayne M. & Carolyn A. Watson Professor of Psychology",
    },
    courseInsights: {
      keyTopics: ["Attention & perception", "Memory systems", "Language processing", "Decision making", "Problem solving", "Cognitive biases"],
      skillsGained: ["Cognitive analysis", "UX research foundations", "Decision science", "Experimental psychology methods", "Human factors understanding"],
    },
    careerRelevance: [{ field: "Product Management", relevance: 0.6 }, { field: "Healthcare & Medicine", relevance: 0.5 }],
  },

  // ===== POLITICAL SCIENCE =====
  {
    code: "POL 101", name: "American Government",
    description: "Institutions, processes, and politics of the American political system.",
    credits: 4, department: "Political Science", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Political Science"], difficulty: 2,
    professor: "Dr. Susan Roberts", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Susan Roberts",
      title: "Professor of Political Science",
    },
    courseInsights: {
      keyTopics: ["Constitutional framework", "Congress & presidency", "Judicial system", "Political parties", "Elections & voting", "Civil liberties & rights"],
      skillsGained: ["Political analysis", "Policy evaluation", "Civic engagement", "Argumentative writing", "Current events analysis"],
    },
    careerRelevance: [{ field: "Government & Policy", relevance: 0.9 }, { field: "Law", relevance: 0.7 }],
  },
  {
    code: "POL 210", name: "International Relations",
    description: "Theories and practices of international politics, conflict, cooperation, and global governance.",
    credits: 4, department: "Political Science", prerequisites: [], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Political Science"], difficulty: 3,
    professor: "Dr. Susan Roberts", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Susan Roberts",
      title: "Professor of Political Science",
    },
    courseInsights: {
      keyTopics: ["Realism & liberalism", "International organizations", "Conflict & security", "Global governance", "Human rights", "International political economy"],
      skillsGained: ["International policy analysis", "Geopolitical reasoning", "Diplomatic communication", "Global perspective", "Comparative analysis"],
    },
    careerRelevance: [{ field: "Government & Policy", relevance: 0.85 }, { field: "Consulting", relevance: 0.5 }, { field: "Nonprofit & Social Impact", relevance: 0.7 }],
  },
  {
    code: "POL 310", name: "Constitutional Law",
    description: "Supreme Court decisions on federalism, separation of powers, and individual rights.",
    credits: 4, department: "Political Science", prerequisites: ["POL 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Susan Roberts", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Susan Roberts",
      title: "Professor of Political Science",
    },
    courseInsights: {
      keyTopics: ["Supreme Court jurisprudence", "Federalism", "Separation of powers", "Due process", "Equal protection", "First Amendment"],
      skillsGained: ["Legal analysis", "Case briefing", "Constitutional interpretation", "Legal writing", "Oral argumentation"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.95 }, { field: "Government & Policy", relevance: 0.8 }],
  },

  // ===== ENGLISH =====
  {
    code: "ENG 101", name: "Literature and Interpretation",
    description: "Introduction to literary analysis through close reading of poetry, fiction, drama, and essays.",
    credits: 4, department: "English", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["English"], difficulty: 2,
    professor: "Dr. Shireen Campbell", professorRating: 4.6,
    professorInfo: {
      name: "Dr. Shireen Campbell",
      title: "Professor of English & Educational Studies",
      rmpRating: 4.6, rmpDifficulty: 3.0, rmpNumRatings: 26, rmpWouldTakeAgain: 67,
      rmpTags: ["Get ready to read", "Gives good feedback", "Tough grader", "Participation matters", "Caring", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Close reading", "Literary analysis", "Poetry interpretation", "Narrative structure", "Dramatic forms", "Critical theory basics"],
      skillsGained: ["Critical reading", "Analytical writing", "Textual interpretation", "Argumentation", "Creative thinking"],
    },
    careerRelevance: [{ field: "Marketing & Communications", relevance: 0.7 }, { field: "Media & Journalism", relevance: 0.8 }, { field: "Law", relevance: 0.5 }],
  },
  {
    code: "ENG 220", name: "Creative Writing",
    description: "Workshop-based course in fiction, poetry, and creative nonfiction writing.",
    credits: 4, department: "English", prerequisites: ["ENG 101"], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 2,
    professor: "Dr. Ann Fox", professorRating: 4.1,
    professorInfo: {
      name: "Dr. Ann Fox",
      title: "Professor of English",
      rmpRating: 4.1, rmpDifficulty: 3.4, rmpNumRatings: 40, rmpWouldTakeAgain: 87,
      rmpTags: ["Participation matters", "Get ready to read", "Gives good feedback", "Caring", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Fiction writing", "Poetry craft", "Creative nonfiction", "Workshop critique", "Revision process", "Voice & style development"],
      skillsGained: ["Creative writing", "Constructive feedback", "Narrative craft", "Self-editing", "Peer review skills"],
    },
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.85 }, { field: "Marketing & Communications", relevance: 0.7 }],
  },

  // ===== HISTORY =====
  {
    code: "HIS 101", name: "World History to 1500",
    description: "Global perspectives on human civilizations from prehistory to the early modern period.",
    credits: 4, department: "History", prerequisites: [], offered: ["Fall"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Dan Aldridge", professorRating: 3.7,
    professorInfo: {
      name: "Dr. Dan Aldridge",
      title: "Professor of History",
      rmpRating: 3.7, rmpDifficulty: 2.6, rmpNumRatings: 21, rmpWouldTakeAgain: 80,
      rmpTags: ["Get ready to read", "Tests? Not many", "Participation matters", "Gives good feedback", "Respected"],
    },
    courseInsights: {
      keyTopics: ["Ancient civilizations", "Medieval societies", "Cultural exchange", "Religious development", "Political systems", "Trade networks"],
      skillsGained: ["Historical analysis", "Primary source interpretation", "Cross-cultural understanding", "Research writing", "Critical thinking"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.4 }, { field: "Education", relevance: 0.6 }],
  },
  {
    code: "HIS 201", name: "United States History",
    description: "American history from colonial period to present with emphasis on social and political movements.",
    credits: 4, department: "History", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["major-requirement", "distribution"], majorRequirements: ["History"], difficulty: 2,
    professor: "Dr. Patricia Tilburg", professorRating: 4.8,
    professorInfo: {
      name: "Dr. Patricia Tilburg",
      title: "Chair & James B. Duke Professor of History; Professor of Gender & Sexuality Studies",
      rmpRating: 4.8, rmpDifficulty: 3.5, rmpNumRatings: 24, rmpWouldTakeAgain: 90,
      rmpTags: ["Get ready to read", "Tough grader", "Amazing lectures", "Participation matters", "Inspirational", "Hilarious"],
    },
    courseInsights: {
      keyTopics: ["Colonial America", "Revolution & Constitution", "Civil War & Reconstruction", "Progressive Era", "Civil Rights Movement", "Modern America"],
      skillsGained: ["Historical research", "Argumentative writing", "Source analysis", "Historiographical thinking", "Civic understanding"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.5 }, { field: "Government & Policy", relevance: 0.6 }, { field: "Education", relevance: 0.5 }],
  },

  // ===== SOCIOLOGY =====
  {
    code: "SOC 101", name: "Introduction to Sociology",
    description: "Social institutions, stratification, culture, and social change through sociological perspectives.",
    credits: 4, department: "Sociology", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Sociology"], difficulty: 2,
    professor: "Dr. Gerardo Marti", professorRating: 3.7,
    professorInfo: {
      name: "Dr. Gerardo Marti",
      title: "Chair & William R. Kenan, Jr. Endowed Professor of Sociology",
      rmpRating: 3.7, rmpDifficulty: 3.9, rmpNumRatings: 35, rmpWouldTakeAgain: 43,
      rmpTags: ["Get ready to read", "Tough grader", "Participation matters", "Lots of homework", "Respected", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Social institutions", "Social stratification", "Culture & socialization", "Deviance & social control", "Social change", "Research methods"],
      skillsGained: ["Sociological imagination", "Critical social analysis", "Research methodology", "Data interpretation", "Persuasive writing"],
    },
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.8 }, { field: "Government & Policy", relevance: 0.6 }, { field: "Education", relevance: 0.5 }],
  },
  {
    code: "SOC 230", name: "Social Inequality",
    description: "Analysis of race, class, gender, and other dimensions of inequality in contemporary society.",
    credits: 4, department: "Sociology", prerequisites: ["SOC 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Gayle Kaufman", professorRating: 3.4,
    professorInfo: {
      name: "Dr. Gayle Kaufman",
      title: "Nancy and Erwin Maddrey Professor of Sociology and Gender & Sexuality Studies",
      rmpRating: 3.4, rmpDifficulty: 2.4, rmpNumRatings: 14, rmpWouldTakeAgain: 25,
      rmpTags: ["Accessible outside class", "Participation matters", "Group projects", "Graded by few things", "Get ready to read"],
    },
    courseInsights: {
      keyTopics: ["Race & ethnicity", "Class stratification", "Gender inequality", "Intersectionality", "Social mobility", "Institutional discrimination"],
      skillsGained: ["Inequality analysis", "Intersectional thinking", "Social justice frameworks", "Qualitative research", "Policy critique"],
    },
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.9 }, { field: "Government & Policy", relevance: 0.7 }, { field: "Law", relevance: 0.5 }],
  },

  // ===== COMMUNICATION STUDIES =====
  {
    code: "COM 100", name: "Introduction to Communication Studies",
    description: "Foundations of human communication including rhetoric, media studies, and interpersonal communication.",
    credits: 4, department: "Communication Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Amanda Martinez", professorRating: 2.5,
    professorInfo: {
      name: "Dr. Amanda Martinez",
      title: "Chair & Associate Professor of Communication Studies; Speaking Center Director",
      rmpRating: 2.5, rmpDifficulty: 3.9, rmpNumRatings: 23, rmpWouldTakeAgain: 25,
      rmpTags: ["Get ready to read", "Participation matters", "Group projects", "Tough grader", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Rhetoric & persuasion", "Media studies", "Interpersonal communication", "Public speaking", "Communication theory", "Digital communication"],
      skillsGained: ["Public speaking", "Rhetorical analysis", "Media literacy", "Interpersonal skills", "Persuasive communication"],
    },
    careerRelevance: [{ field: "Marketing & Communications", relevance: 0.9 }, { field: "Media & Journalism", relevance: 0.8 }, { field: "Consulting", relevance: 0.5 }],
  },
  {
    code: "COM 250", name: "Public Speaking and Advocacy",
    description: "Theory and practice of persuasive speaking, argumentation, and civic engagement.",
    credits: 4, department: "Communication Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 2,
    professor: "Dr. Amanda Martinez", professorRating: 2.5,
    professorInfo: {
      name: "Dr. Amanda Martinez",
      title: "Chair & Associate Professor of Communication Studies; Speaking Center Director",
      rmpRating: 2.5, rmpDifficulty: 3.9, rmpNumRatings: 23, rmpWouldTakeAgain: 25,
      rmpTags: ["Get ready to read", "Participation matters", "Group projects", "Tough grader", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Persuasive speaking", "Argumentation", "Civic engagement", "Speech delivery", "Audience analysis", "Advocacy strategies"],
      skillsGained: ["Public speaking mastery", "Argumentation skills", "Civic advocacy", "Audience engagement", "Persuasion techniques"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.7 }, { field: "Marketing & Communications", relevance: 0.8 }, { field: "Consulting", relevance: 0.7 }],
  },

  // ===== PHILOSOPHY =====
  {
    code: "PHI 101", name: "Introduction to Philosophy",
    description: "Fundamental questions of philosophy including knowledge, reality, ethics, and meaning.",
    credits: 4, department: "Philosophy", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Sean McKeever", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Sean McKeever",
      title: "Professor of Philosophy",
    },
    courseInsights: {
      keyTopics: ["Epistemology", "Metaphysics", "Ethics", "Logic", "Philosophy of mind", "Existentialism"],
      skillsGained: ["Critical thinking", "Logical argumentation", "Philosophical writing", "Conceptual analysis", "Ethical reasoning"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.7 }, { field: "Consulting", relevance: 0.4 }],
  },
  {
    code: "PHI 203", name: "Ethics",
    description: "Major ethical theories and their application to contemporary moral problems.",
    credits: 4, department: "Philosophy", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 2,
    professor: "Dr. Daniel Layman", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Daniel Layman",
      title: "Associate Professor of Philosophy",
    },
    courseInsights: {
      keyTopics: ["Utilitarianism", "Deontological ethics", "Virtue ethics", "Applied ethics", "Moral reasoning", "Contemporary moral debates"],
      skillsGained: ["Ethical analysis", "Moral reasoning", "Philosophical argumentation", "Applied ethics frameworks", "Thoughtful decision-making"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.8 }, { field: "Healthcare & Medicine", relevance: 0.5 }, { field: "Nonprofit & Social Impact", relevance: 0.6 }],
  },

  // ===== ENVIRONMENTAL STUDIES =====
  {
    code: "ENV 101", name: "Introduction to Environmental Studies",
    description: "Interdisciplinary approach to environmental issues including ecology, policy, and sustainability.",
    credits: 4, department: "Environmental Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement", "distribution"], majorRequirements: ["Environmental Studies"], difficulty: 2,
    professor: "Dr. Chris Paradise", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Chris Paradise",
      title: "Chair of Environmental Studies; Professor of Biology and Environmental Studies",
    },
    courseInsights: {
      keyTopics: ["Ecology fundamentals", "Environmental policy", "Sustainability", "Climate change", "Resource management", "Environmental justice"],
      skillsGained: ["Environmental analysis", "Interdisciplinary thinking", "Policy evaluation", "Sustainability assessment", "Systems thinking"],
    },
    careerRelevance: [{ field: "Environmental Science", relevance: 0.95 }, { field: "Government & Policy", relevance: 0.6 }, { field: "Nonprofit & Social Impact", relevance: 0.7 }],
  },
  {
    code: "ENV 250", name: "Environmental Policy",
    description: "Analysis of environmental regulations, policy-making, and sustainability frameworks.",
    credits: 4, department: "Environmental Studies", prerequisites: ["ENV 101"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Environmental Studies"], difficulty: 3,
    professor: "Dr. Brad Johnson", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Brad Johnson",
      title: "Professor of Environmental Studies",
    },
    courseInsights: {
      keyTopics: ["Environmental regulations", "Policy-making process", "Sustainability frameworks", "Climate policy", "Environmental law", "Cost-benefit analysis"],
      skillsGained: ["Policy analysis", "Regulatory understanding", "Sustainability planning", "Environmental advocacy", "Stakeholder analysis"],
    },
    careerRelevance: [{ field: "Environmental Science", relevance: 0.9 }, { field: "Government & Policy", relevance: 0.8 }, { field: "Nonprofit & Social Impact", relevance: 0.7 }],
  },

  // ===== PUBLIC HEALTH =====
  {
    code: "PUH 101", name: "Introduction to Public Health",
    description: "Overview of public health principles, epidemiology, health policy, and global health challenges.",
    credits: 4, department: "Public Health", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement"], majorRequirements: ["Public Health"], difficulty: 2,
    professor: "Dr. Kata Chillag", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Kata Chillag",
      title: "Chair of Public Health; Hamilton McKay Professor in Biosciences and Human Health",
    },
    courseInsights: {
      keyTopics: ["Epidemiology basics", "Health policy", "Global health", "Health disparities", "Disease prevention", "Public health ethics"],
      skillsGained: ["Public health analysis", "Epidemiological thinking", "Health policy evaluation", "Population health assessment", "Community health planning"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Government & Policy", relevance: 0.6 }],
  },
  {
    code: "PUH 250", name: "Epidemiology",
    description: "Study of disease patterns, health determinants, and public health interventions.",
    credits: 4, department: "Public Health", prerequisites: ["PUH 101"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Public Health"], difficulty: 3,
    professor: "Dr. Lauren Stutts", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Lauren Stutts",
      title: "Associate Professor of Public Health",
    },
    courseInsights: {
      keyTopics: ["Disease surveillance", "Study design", "Biostatistics", "Outbreak investigation", "Risk factor analysis", "Public health interventions"],
      skillsGained: ["Epidemiological methods", "Biostatistical analysis", "Disease investigation", "Public health data interpretation", "Evidence-based health decisions"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.95 }, { field: "Data Science & Analytics", relevance: 0.5 }],
  },

  // ===== ANTHROPOLOGY =====
  {
    code: "ANT 101", name: "Introduction to Anthropology",
    description: "Survey of cultural, biological, archaeological, and linguistic anthropology.",
    credits: 4, department: "Anthropology", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Fuji Lozada", professorRating: 4.5,
    professorInfo: {
      name: "Dr. Fuji Lozada",
      title: "Senior Associate Dean of the Faculty; Professor of Anthropology",
    },
    courseInsights: {
      keyTopics: ["Cultural anthropology", "Biological anthropology", "Archaeology", "Linguistic anthropology", "Ethnography", "Human evolution"],
      skillsGained: ["Cross-cultural analysis", "Ethnographic methods", "Holistic human understanding", "Fieldwork basics", "Cultural sensitivity"],
    },
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Research & Academia", relevance: 0.6 }],
  },

  // ===== ART =====
  {
    code: "ART 101", name: "Introduction to Studio Art",
    description: "Foundation course in visual arts exploring drawing, painting, sculpture, and digital media.",
    credits: 4, department: "Art", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. John Corso-Esquivel", professorRating: 4.7,
    professorInfo: {
      name: "Dr. John Corso-Esquivel",
      title: "Chair & Associate Professor of Art",
    },
    courseInsights: {
      keyTopics: ["Drawing fundamentals", "Painting techniques", "Sculpture", "Digital media", "Color theory", "Composition & design"],
      skillsGained: ["Visual communication", "Creative expression", "Design thinking", "Critique & feedback", "Artistic technique"],
    },
    careerRelevance: [{ field: "Arts & Design", relevance: 0.9 }, { field: "Media & Journalism", relevance: 0.4 }],
  },

  // ===== THEATRE =====
  {
    code: "THE 100", name: "Introduction to Theatre",
    description: "Survey of theatrical traditions, play analysis, and performance practices.",
    credits: 4, department: "Theatre", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Ann Marie Costa", professorRating: 4.6,
    professorInfo: {
      name: "Dr. Ann Marie Costa",
      title: "Samuel E. & Mary West Thatcher Professor of Theatre",
    },
    courseInsights: {
      keyTopics: ["Theatre history", "Play analysis", "Performance theory", "Stagecraft", "Dramatic literature", "Contemporary theatre"],
      skillsGained: ["Performance analysis", "Creative collaboration", "Public presentation", "Critical analysis of art", "Storytelling"],
    },
    careerRelevance: [{ field: "Arts & Design", relevance: 0.7 }, { field: "Marketing & Communications", relevance: 0.4 }],
  },

  // ===== MUSIC =====
  {
    code: "MUS 101", name: "Music in Western Culture",
    description: "Survey of Western music from the Middle Ages to the present, with emphasis on listening and analysis.",
    credits: 4, department: "Music", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Neil Lerner", professorRating: 4.5,
    professorInfo: {
      name: "Dr. Neil Lerner",
      title: "J. Estes Millner Professor of Music; Chair of Film, Media, and Digital Studies",
    },
    courseInsights: {
      keyTopics: ["Music history", "Musical forms & genres", "Listening analysis", "Cultural context of music", "Major composers", "Contemporary music trends"],
      skillsGained: ["Musical analysis", "Active listening", "Cultural appreciation", "Historical contextualization", "Aesthetic judgment"],
    },
    careerRelevance: [{ field: "Arts & Design", relevance: 0.7 }, { field: "Education", relevance: 0.4 }],
  },

  // ===== EDUCATIONAL STUDIES =====
  {
    code: "EDU 200", name: "Education in American Society",
    description: "Historical, philosophical, and sociological foundations of American education.",
    credits: 4, department: "Educational Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement"], majorRequirements: ["Educational Studies"], difficulty: 2,
    professor: "Dr. Chris Marsicano", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Chris Marsicano",
      title: "Chair & Associate Professor of Educational Studies; Director of the Institute for Public Good",
    },
    courseInsights: {
      keyTopics: ["History of American education", "Education philosophy", "Social inequality in education", "Education policy", "Teaching & learning theory", "School reform"],
      skillsGained: ["Educational analysis", "Policy evaluation", "Social justice in education", "Research methods", "Reflective practice"],
    },
    careerRelevance: [{ field: "Education", relevance: 0.95 }, { field: "Nonprofit & Social Impact", relevance: 0.6 }],
  },

  // ===== RELIGIOUS STUDIES =====
  {
    code: "REL 101", name: "Introduction to Religious Studies",
    description: "Comparative study of world religions including their beliefs, practices, and cultural contexts.",
    credits: 4, department: "Religious Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Syed Rizwan Zamir", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Syed Rizwan Zamir",
      title: "Chair & Associate Professor of Religious Studies",
    },
    courseInsights: {
      keyTopics: ["World religions overview", "Religious texts", "Rituals & practices", "Religion & culture", "Comparative theology", "Religion in modern world"],
      skillsGained: ["Comparative analysis", "Cultural sensitivity", "Critical reading of sacred texts", "Interfaith understanding", "Ethical reflection"],
    },
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.5 }, { field: "Education", relevance: 0.4 }],
  },

  // ===== GENDER & SEXUALITY STUDIES =====
  {
    code: "GSS 101", name: "Introduction to Gender and Sexuality Studies",
    description: "Interdisciplinary exploration of gender identity, sexuality, feminism, and social justice.",
    credits: 4, department: "Gender & Sexuality Studies", prerequisites: [], offered: ["Fall"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Gayle Kaufman", professorRating: 3.4,
    professorInfo: {
      name: "Dr. Gayle Kaufman",
      title: "Nancy and Erwin Maddrey Professor of Sociology and Gender & Sexuality Studies",
      rmpRating: 3.4, rmpDifficulty: 2.4, rmpNumRatings: 14, rmpWouldTakeAgain: 25,
      rmpTags: ["Accessible outside class", "Participation matters", "Group projects", "Graded by few things", "Get ready to read"],
    },
    courseInsights: {
      keyTopics: ["Gender theory", "Feminist thought", "Sexuality studies", "Intersectionality", "Queer theory", "Social justice"],
      skillsGained: ["Gender analysis", "Intersectional thinking", "Critical theory application", "Social justice frameworks", "Inclusive communication"],
    },
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Law", relevance: 0.4 }, { field: "Government & Policy", relevance: 0.5 }],
  },

  // ===== AFRICANA STUDIES =====
  {
    code: "AFR 101", name: "Introduction to Africana Studies",
    description: "Interdisciplinary study of the experiences, cultures, and histories of people of African descent.",
    credits: 4, department: "Africana Studies", prerequisites: [], offered: ["Fall"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Hilary Green", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Hilary Green",
      title: "James B. Duke Professor of Africana Studies",
    },
    courseInsights: {
      keyTopics: ["African diaspora", "African American history", "Black culture & identity", "Race & racism", "Postcolonial studies", "Contemporary Black life"],
      skillsGained: ["Critical race analysis", "Historical research", "Interdisciplinary thinking", "Cultural competency", "Social justice advocacy"],
    },
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Education", relevance: 0.5 }],
  },

  // ===== DATA SCIENCE (cross-listed) =====
  {
    code: "DAS 201", name: "Introduction to Data Science",
    description: "Data wrangling, visualization, statistical modeling, and machine learning with Python and R.",
    credits: 4, department: "Digital Studies", prerequisites: ["MAT 112"], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Tim Chartier", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Tim Chartier",
      title: "Joseph R. Morton Professor of Mathematics and Computer Science",
      rmpRating: 4.4, rmpDifficulty: 3.0, rmpNumRatings: 39, rmpWouldTakeAgain: 88,
      rmpTags: ["Accessible outside class", "Inspirational", "Caring", "Hilarious", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Data wrangling", "Data visualization", "Statistical modeling", "Machine learning basics", "Python & R programming", "Exploratory data analysis"],
      skillsGained: ["Data manipulation", "Statistical modeling", "Data visualization", "Programming for data science", "Machine learning fundamentals"],
    },
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.95 }, { field: "Finance & Banking", relevance: 0.7 }, { field: "Consulting", relevance: 0.6 }],
  },
  {
    code: "DAS 301", name: "Machine Learning",
    description: "Supervised and unsupervised learning, deep learning, model evaluation and deployment.",
    credits: 4, department: "Digital Studies", prerequisites: ["DAS 201", "MAT 214"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    professor: "Dr. Tim Chartier", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Tim Chartier",
      title: "Joseph R. Morton Professor of Mathematics and Computer Science",
      rmpRating: 4.4, rmpDifficulty: 3.0, rmpNumRatings: 39, rmpWouldTakeAgain: 88,
      rmpTags: ["Accessible outside class", "Inspirational", "Caring", "Hilarious", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Supervised learning", "Unsupervised learning", "Deep learning", "Model evaluation", "Feature engineering", "Model deployment"],
      skillsGained: ["ML model building", "Deep learning frameworks", "Model evaluation & tuning", "Feature engineering", "Production ML deployment"],
    },
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.95 }, { field: "Software Engineering", relevance: 0.7 }],
  },

  // ===== FILM & MEDIA STUDIES =====
  {
    code: "FMS 101", name: "Introduction to Film Studies",
    description: "Analysis of film as art and cultural artifact. Film history, theory, and critical approaches.",
    credits: 4, department: "Film & Media Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Dr. Mark Sample", professorRating: 4.8,
    professorInfo: {
      name: "Dr. Mark Sample",
      title: "Professor of Film, Media, and Digital Studies",
      rmpRating: 4.8, rmpDifficulty: 2.8, rmpNumRatings: 4, rmpWouldTakeAgain: 100,
      rmpTags: ["Caring", "Get ready to read", "Participation matters", "Clear grading criteria", "Amazing lectures"],
    },
    courseInsights: {
      keyTopics: ["Film theory", "Cinematography analysis", "Film history", "Genre studies", "Cultural critique", "Digital media"],
      skillsGained: ["Visual literacy", "Critical film analysis", "Media critique", "Cultural analysis", "Analytical writing"],
    },
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.8 }, { field: "Arts & Design", relevance: 0.6 }],
  },

  // ===== LANGUAGES =====
  {
    code: "FRE 101", name: "Elementary French I",
    description: "Introduction to French language and Francophone cultures.",
    credits: 4, department: "French", prerequisites: [], offered: ["Fall"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Staff",
    courseInsights: {
      keyTopics: ["French grammar", "Vocabulary building", "Listening comprehension", "Speaking practice", "Francophone cultures", "Reading & writing"],
      skillsGained: ["French language basics", "Cross-cultural communication", "Linguistic awareness", "Global perspective", "Second language acquisition"],
    },
    careerRelevance: [{ field: "Consulting", relevance: 0.4 }, { field: "Government & Policy", relevance: 0.4 }],
  },
  {
    code: "SPA 101", name: "Elementary Spanish I",
    description: "Introduction to Spanish language and Hispanic cultures.",
    credits: 4, department: "Hispanic Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    professor: "Staff",
    courseInsights: {
      keyTopics: ["Spanish grammar", "Vocabulary building", "Listening comprehension", "Speaking practice", "Hispanic cultures", "Reading & writing"],
      skillsGained: ["Spanish language basics", "Cross-cultural communication", "Linguistic awareness", "Global perspective", "Second language acquisition"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.4 }, { field: "Nonprofit & Social Impact", relevance: 0.4 }],
  },
  {
    code: "CHI 101", name: "Elementary Chinese I",
    description: "Introduction to Mandarin Chinese language and culture.",
    credits: 4, department: "Chinese", prerequisites: [], offered: ["Fall"],
    tags: ["core", "distribution"], difficulty: 3,
    professor: "Staff",
    courseInsights: {
      keyTopics: ["Mandarin pronunciation", "Character writing", "Basic grammar", "Listening comprehension", "Chinese culture", "Conversational skills"],
      skillsGained: ["Mandarin basics", "Character recognition", "Cross-cultural communication", "Tonal language skills", "East Asian cultural literacy"],
    },
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.4 }, { field: "Consulting", relevance: 0.4 }],
  },

  // ===== CLASSICS =====
  {
    code: "CLA 101", name: "Introduction to Classical Civilization",
    description: "Survey of ancient Greek and Roman civilizations including literature, philosophy, art, and political institutions.",
    credits: 4, department: "Classics", prerequisites: [], offered: ["Fall"],
    tags: ["core", "distribution"], difficulty: 2,
    careerRelevance: [{ field: "Education", relevance: 0.5 }, { field: "Law", relevance: 0.4 }],
  },
  {
    code: "CLA 201", name: "Greek and Roman Mythology",
    description: "Study of myths and legends from the ancient Mediterranean world and their lasting cultural influence.",
    credits: 4, department: "Classics", prerequisites: [], offered: ["Spring"],
    tags: ["elective"], difficulty: 2,
    careerRelevance: [{ field: "Education", relevance: 0.5 }, { field: "Media & Journalism", relevance: 0.3 }],
  },
  {
    code: "CLA 310", name: "Ancient Philosophy",
    description: "Readings in Plato, Aristotle, and the Hellenistic philosophers with attention to ethics, metaphysics, and epistemology.",
    credits: 4, department: "Classics", prerequisites: ["CLA 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Law", relevance: 0.5 }, { field: "Education", relevance: 0.4 }],
  },

  // ===== DANCE =====
  {
    code: "DAN 101", name: "Introduction to Dance",
    description: "Exploration of dance as an art form through technique, improvisation, and choreography across multiple genres.",
    credits: 4, department: "Dance", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "distribution"], difficulty: 2,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.7 }, { field: "Education", relevance: 0.3 }],
  },
  {
    code: "DAN 220", name: "Choreography and Performance",
    description: "Advanced study of choreographic methods, composition, and performance practices in contemporary dance.",
    credits: 4, department: "Dance", prerequisites: ["DAN 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.8 }, { field: "Education", relevance: 0.3 }],
  },

  // ===== GERMAN =====
  {
    code: "GER 101", name: "Elementary German I",
    description: "Introduction to the German language with emphasis on speaking, listening, reading, and writing skills.",
    credits: 4, department: "German", prerequisites: [], offered: ["Fall"],
    tags: ["core", "distribution"], difficulty: 2,
    careerRelevance: [{ field: "Consulting", relevance: 0.4 }, { field: "Government & Policy", relevance: 0.3 }],
  },
  {
    code: "GER 202", name: "Intermediate German II",
    description: "Continued development of German language skills with readings in German literature and culture.",
    credits: 4, department: "German", prerequisites: ["GER 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Consulting", relevance: 0.4 }, { field: "Government & Policy", relevance: 0.3 }],
  },

  // ===== ANTHROPOLOGY (additional) =====
  {
    code: "ANT 210", name: "Cultural Anthropology",
    description: "Ethnographic methods and cross-cultural comparison of kinship, religion, politics, and economic systems.",
    credits: 4, department: "Anthropology", prerequisites: ["ANT 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Research & Academia", relevance: 0.6 }],
  },
  {
    code: "ANT 340", name: "Medical Anthropology",
    description: "Cross-cultural study of health, illness, and healing with attention to biomedical and traditional medical systems.",
    credits: 4, department: "Anthropology", prerequisites: ["ANT 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.7 }, { field: "Nonprofit & Social Impact", relevance: 0.6 }],
  },

  // ===== ART (additional) =====
  {
    code: "ART 210", name: "Painting",
    description: "Exploration of painting techniques, color theory, and conceptual approaches in oil, acrylic, and mixed media.",
    credits: 4, department: "Art", prerequisites: ["ART 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.9 }, { field: "Education", relevance: 0.3 }],
  },
  {
    code: "ART 310", name: "Digital Art and Design",
    description: "Advanced studio course in digital media, graphic design, and interactive art using industry-standard tools.",
    credits: 4, department: "Art", prerequisites: ["ART 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.9 }, { field: "Marketing & Communications", relevance: 0.6 }],
  },

  // ===== THEATRE (additional) =====
  {
    code: "THE 230", name: "Acting Techniques",
    description: "Study and practice of acting methods including Stanislavski, Meisner, and contemporary approaches to character development.",
    credits: 4, department: "Theatre", prerequisites: ["THE 100"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.7 }, { field: "Marketing & Communications", relevance: 0.4 }],
  },
  {
    code: "THE 340", name: "Directing and Dramaturgy",
    description: "Theory and practice of theatrical directing, script analysis, and production dramaturgy.",
    credits: 4, department: "Theatre", prerequisites: ["THE 100"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.8 }, { field: "Media & Journalism", relevance: 0.4 }],
  },

  // ===== MUSIC (additional) =====
  {
    code: "MUS 210", name: "Music Theory and Composition",
    description: "Fundamentals of music theory, harmony, counterpoint, and compositional techniques.",
    credits: 4, department: "Music", prerequisites: ["MUS 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.8 }, { field: "Education", relevance: 0.4 }],
  },
  {
    code: "MUS 310", name: "Ethnomusicology",
    description: "Study of music across world cultures, exploring the social, political, and spiritual roles of music in diverse societies.",
    credits: 4, department: "Music", prerequisites: ["MUS 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Arts & Design", relevance: 0.6 }, { field: "Nonprofit & Social Impact", relevance: 0.4 }],
  },

  // ===== EDUCATIONAL STUDIES (additional) =====
  {
    code: "EDU 310", name: "Curriculum and Pedagogy",
    description: "Theories of curriculum design, instructional methods, and assessment strategies in K-12 and higher education.",
    credits: 4, department: "Educational Studies", prerequisites: ["EDU 200"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Educational Studies"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.95 }, { field: "Nonprofit & Social Impact", relevance: 0.5 }],
  },
  {
    code: "EDU 340", name: "Education Policy and Reform",
    description: "Analysis of contemporary education policy debates, school reform movements, and the politics of education.",
    credits: 4, department: "Educational Studies", prerequisites: ["EDU 200"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.9 }, { field: "Government & Policy", relevance: 0.7 }],
  },

  // ===== RELIGIOUS STUDIES (additional) =====
  {
    code: "REL 220", name: "Religion and Ethics",
    description: "Examination of ethical frameworks within major religious traditions and their application to contemporary moral issues.",
    credits: 4, department: "Religious Studies", prerequisites: ["REL 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.6 }, { field: "Law", relevance: 0.4 }],
  },
  {
    code: "REL 310", name: "Islam and the Modern World",
    description: "History, theology, and contemporary expressions of Islam with attention to politics, culture, and global relations.",
    credits: 4, department: "Religious Studies", prerequisites: ["REL 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.5 }, { field: "Nonprofit & Social Impact", relevance: 0.5 }],
  },

  // ===== GENDER & SEXUALITY STUDIES (additional) =====
  {
    code: "GSS 250", name: "Feminist Theory",
    description: "Survey of feminist thought from the Enlightenment to contemporary intersectional and transnational feminisms.",
    credits: 4, department: "Gender & Sexuality Studies", prerequisites: ["GSS 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Law", relevance: 0.5 }],
  },

  // ===== AFRICANA STUDIES (additional) =====
  {
    code: "AFR 250", name: "African American Literature",
    description: "Survey of African American literary traditions from slave narratives to contemporary fiction, poetry, and drama.",
    credits: 4, department: "Africana Studies", prerequisites: ["AFR 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.5 }, { field: "Media & Journalism", relevance: 0.4 }],
  },

  // ===== FILM & MEDIA STUDIES (additional) =====
  {
    code: "FMS 240", name: "Documentary Film",
    description: "History and aesthetics of documentary filmmaking with hands-on production of short documentary projects.",
    credits: 4, department: "Film & Media Studies", prerequisites: ["FMS 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.85 }, { field: "Arts & Design", relevance: 0.6 }],
  },

  // ===== DIGITAL STUDIES (additional) =====
  {
    code: "DAS 250", name: "Data Visualization",
    description: "Principles and practices of effective data visualization using modern tools and design thinking.",
    credits: 4, department: "Digital Studies", prerequisites: ["DAS 201"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.9 }, { field: "Marketing & Communications", relevance: 0.6 }],
  },

  // ===== FRENCH (additional) =====
  {
    code: "FRE 202", name: "Intermediate French II",
    description: "Continued development of French language skills with emphasis on reading, writing, and Francophone literature.",
    credits: 4, department: "French", prerequisites: ["FRE 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Consulting", relevance: 0.4 }, { field: "Government & Policy", relevance: 0.4 }],
  },

  // ===== HISPANIC STUDIES (additional) =====
  {
    code: "SPA 202", name: "Intermediate Spanish II",
    description: "Advanced intermediate Spanish with focus on composition, conversation, and Hispanic cultural texts.",
    credits: 4, department: "Hispanic Studies", prerequisites: ["SPA 101"], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.4 }, { field: "Nonprofit & Social Impact", relevance: 0.4 }],
  },

  // ===== CHINESE (additional) =====
  {
    code: "CHI 202", name: "Intermediate Chinese II",
    description: "Continued study of Mandarin Chinese with expanded vocabulary, grammar, and cultural topics.",
    credits: 4, department: "Chinese", prerequisites: ["CHI 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.4 }, { field: "Consulting", relevance: 0.4 }],
  },

  // ===== ENGLISH (additional) =====
  {
    code: "ENG 240", name: "American Literature",
    description: "Survey of American literary traditions from the colonial period through the twenty-first century.",
    credits: 4, department: "English", prerequisites: ["ENG 101"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["English"], difficulty: 3,
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.7 }, { field: "Education", relevance: 0.6 }],
  },
  {
    code: "ENG 315", name: "Shakespeare",
    description: "Close reading of Shakespeare's major plays and sonnets with attention to performance history and critical interpretation.",
    credits: 4, department: "English", prerequisites: ["ENG 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.6 }, { field: "Law", relevance: 0.4 }],
  },
  {
    code: "ENG 370", name: "Postcolonial Literature",
    description: "Study of literature from formerly colonized regions exploring themes of identity, diaspora, and cultural resistance.",
    credits: 4, department: "English", prerequisites: ["ENG 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.5 }, { field: "Nonprofit & Social Impact", relevance: 0.5 }],
  },

  // ===== HISTORY (additional) =====
  {
    code: "HIS 225", name: "Modern European History",
    description: "European history from the French Revolution to the present, including nationalism, world wars, and European integration.",
    credits: 4, department: "History", prerequisites: [], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["History"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.6 }, { field: "Law", relevance: 0.5 }],
  },
  {
    code: "HIS 310", name: "Civil Rights Movement",
    description: "In-depth study of the American civil rights movement from Reconstruction through the Black Power era.",
    credits: 4, department: "History", prerequisites: ["HIS 201"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Law", relevance: 0.6 }, { field: "Government & Policy", relevance: 0.7 }],
  },
  {
    code: "HIS 355", name: "History of East Asia",
    description: "Political, cultural, and economic history of China, Japan, and Korea from early empires to the contemporary period.",
    credits: 4, department: "History", prerequisites: [], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.5 }, { field: "Consulting", relevance: 0.4 }],
  },

  // ===== SOCIOLOGY (additional) =====
  {
    code: "SOC 310", name: "Sociology of Religion",
    description: "Sociological analysis of religious institutions, movements, and the role of religion in social life.",
    credits: 4, department: "Sociology", prerequisites: ["SOC 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Education", relevance: 0.4 }],
  },
  {
    code: "SOC 340", name: "Urban Sociology",
    description: "Study of cities and urban life including gentrification, poverty, segregation, and community development.",
    credits: 4, department: "Sociology", prerequisites: ["SOC 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.7 }, { field: "Nonprofit & Social Impact", relevance: 0.8 }],
  },

  // ===== COMMUNICATION STUDIES (additional) =====
  {
    code: "COM 310", name: "Media and Society",
    description: "Critical analysis of media institutions, media effects, and the role of mass media in shaping public discourse.",
    credits: 4, department: "Communication Studies", prerequisites: ["COM 100"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.9 }, { field: "Marketing & Communications", relevance: 0.7 }],
  },
  {
    code: "COM 340", name: "Health Communication",
    description: "Study of communication strategies in public health campaigns, patient-provider interactions, and health media.",
    credits: 4, department: "Communication Studies", prerequisites: ["COM 100"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.6 }, { field: "Marketing & Communications", relevance: 0.7 }],
  },

  // ===== PHILOSOPHY (additional) =====
  {
    code: "PHI 310", name: "Philosophy of Mind",
    description: "Exploration of consciousness, mental representation, artificial intelligence, and the mind-body problem.",
    credits: 4, department: "Philosophy", prerequisites: ["PHI 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.6 }, { field: "Software Engineering", relevance: 0.3 }],
  },
  {
    code: "PHI 340", name: "Political Philosophy",
    description: "Major works in political philosophy from Plato to Rawls, examining justice, liberty, equality, and the state.",
    credits: 4, department: "Philosophy", prerequisites: ["PHI 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Law", relevance: 0.8 }, { field: "Government & Policy", relevance: 0.7 }],
  },

  // ===== ENVIRONMENTAL STUDIES (additional) =====
  {
    code: "ENV 310", name: "Conservation Biology",
    description: "Science of biodiversity conservation including species management, habitat restoration, and conservation genetics.",
    credits: 4, department: "Environmental Studies", prerequisites: ["ENV 101", "BIO 112"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Environmental Studies"], difficulty: 3,
    careerRelevance: [{ field: "Environmental Science", relevance: 0.95 }, { field: "Research & Academia", relevance: 0.6 }],
  },
  {
    code: "ENV 340", name: "Climate Change Science and Policy",
    description: "Interdisciplinary study of climate science, impacts, mitigation strategies, and international climate policy.",
    credits: 4, department: "Environmental Studies", prerequisites: ["ENV 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Environmental Science", relevance: 0.9 }, { field: "Government & Policy", relevance: 0.8 }],
  },

  // ===== PUBLIC HEALTH (additional) =====
  {
    code: "PUH 310", name: "Global Health",
    description: "Examination of health challenges in low- and middle-income countries including infectious disease, nutrition, and health systems.",
    credits: 4, department: "Public Health", prerequisites: ["PUH 101"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Public Health"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Nonprofit & Social Impact", relevance: 0.8 }],
  },
  {
    code: "PUH 340", name: "Health Equity and Social Justice",
    description: "Analysis of health disparities, social determinants of health, and strategies for achieving health equity.",
    credits: 4, department: "Public Health", prerequisites: ["PUH 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.8 }, { field: "Nonprofit & Social Impact", relevance: 0.9 }],
  },

  // ===== COMPUTER SCIENCE (additional) =====
  {
    code: "CSC 335", name: "Computer Networks",
    description: "Network architecture, protocols, and applications including TCP/IP, HTTP, DNS, and network security fundamentals.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222", "CSC 231"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Software Engineering", relevance: 0.85 }, { field: "Data Science & Analytics", relevance: 0.4 }],
  },
  {
    code: "CSC 390", name: "Computer Science Seminar",
    description: "Advanced topics seminar in computer science. Recent offerings include cybersecurity, distributed systems, and computer graphics.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Software Engineering", relevance: 0.8 }, { field: "Research & Academia", relevance: 0.6 }],
  },

  // ===== ECONOMICS (additional) =====
  {
    code: "ECO 330", name: "Labor Economics",
    description: "Economic analysis of labor markets including wage determination, discrimination, human capital, and labor policy.",
    credits: 4, department: "Economics", prerequisites: ["ECO 201"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.8 }, { field: "Consulting", relevance: 0.7 }],
  },
  {
    code: "ECO 370", name: "Development Economics",
    description: "Economic analysis of developing countries including poverty, inequality, trade, and institutional development.",
    credits: 4, department: "Economics", prerequisites: ["ECO 201", "ECO 202"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.8 }, { field: "Nonprofit & Social Impact", relevance: 0.8 }],
  },

  // ===== MATHEMATICS (additional) =====
  {
    code: "MAT 240", name: "Differential Equations",
    description: "Ordinary differential equations, systems of equations, Laplace transforms, and applications to physical sciences.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 113"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Mathematics", "Physics"], difficulty: 4,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.7 }, { field: "Data Science & Analytics", relevance: 0.5 }],
  },
  {
    code: "MAT 312", name: "Abstract Algebra",
    description: "Study of algebraic structures including groups, rings, and fields with emphasis on proof-based mathematics.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 214"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Mathematics"], difficulty: 4,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.8 }, { field: "Software Engineering", relevance: 0.3 }],
  },
  {
    code: "MAT 340", name: "Real Analysis",
    description: "Rigorous treatment of limits, continuity, differentiation, and integration in the real number system.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 220"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Mathematics"], difficulty: 5,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.9 }, { field: "Finance & Banking", relevance: 0.5 }],
  },

  // ===== BIOLOGY (additional) =====
  {
    code: "BIO 230", name: "Ecology",
    description: "Study of interactions between organisms and their environments, including population dynamics, community ecology, and ecosystems.",
    credits: 4, department: "Biology", prerequisites: ["BIO 112"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Biology", "Environmental Studies"], difficulty: 3,
    careerRelevance: [{ field: "Environmental Science", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.7 }],
  },
  {
    code: "BIO 301", name: "Cell Biology",
    description: "Advanced study of cell structure and function including organelles, cell signaling, and the cytoskeleton.",
    credits: 4, department: "Biology", prerequisites: ["BIO 111", "CHE 115"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Biology"], difficulty: 4,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.85 }],
  },
  {
    code: "BIO 340", name: "Immunology",
    description: "Study of the immune system including innate and adaptive immunity, immunological disorders, and vaccine development.",
    credits: 4, department: "Biology", prerequisites: ["BIO 111"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.95 }, { field: "Research & Academia", relevance: 0.8 }],
  },

  // ===== CHEMISTRY (additional) =====
  {
    code: "CHE 305", name: "Physical Chemistry",
    description: "Thermodynamics, kinetics, and quantum mechanics applied to chemical systems.",
    credits: 4, department: "Chemistry", prerequisites: ["CHE 115", "MAT 220", "PHY 120"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Chemistry"], difficulty: 5,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.85 }, { field: "Environmental Science", relevance: 0.4 }],
  },
  {
    code: "CHE 340", name: "Biochemistry",
    description: "Chemistry of biological molecules including proteins, nucleic acids, lipids, and metabolic pathways.",
    credits: 4, department: "Chemistry", prerequisites: ["CHE 230", "BIO 111"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Chemistry", "Biology"], difficulty: 4,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.85 }],
  },

  // ===== PHYSICS (additional) =====
  {
    code: "PHY 310", name: "Modern Physics",
    description: "Special relativity, quantum mechanics, atomic structure, nuclear physics, and particle physics.",
    credits: 4, department: "Physics", prerequisites: ["PHY 220", "MAT 220"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Physics"], difficulty: 4,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.9 }, { field: "Software Engineering", relevance: 0.2 }],
  },
  {
    code: "PHY 340", name: "Electrodynamics",
    description: "Maxwell's equations, electromagnetic waves, radiation, and relativistic electrodynamics.",
    credits: 4, department: "Physics", prerequisites: ["PHY 220", "MAT 220"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Physics"], difficulty: 5,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.9 }],
  },

  // ===== PSYCHOLOGY (additional) =====
  {
    code: "PSY 250", name: "Developmental Psychology",
    description: "Study of human development across the lifespan, including cognitive, social, and emotional development.",
    credits: 4, department: "Psychology", prerequisites: ["PSY 100"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Psychology"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.7 }, { field: "Education", relevance: 0.8 }],
  },
  {
    code: "PSY 340", name: "Abnormal Psychology",
    description: "Study of psychological disorders, their diagnosis, etiology, and treatment approaches.",
    credits: 4, department: "Psychology", prerequisites: ["PSY 100"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Nonprofit & Social Impact", relevance: 0.5 }],
  },

  // ===== POLITICAL SCIENCE (additional) =====
  {
    code: "POL 330", name: "Comparative Politics",
    description: "Comparative analysis of political systems, regimes, and institutions across different countries and regions.",
    credits: 4, department: "Political Science", prerequisites: ["POL 101"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Political Science"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.85 }, { field: "Consulting", relevance: 0.5 }],
  },
  {
    code: "POL 350", name: "Political Theory",
    description: "Major works of political theory from ancient to modern, examining justice, power, democracy, and freedom.",
    credits: 4, department: "Political Science", prerequisites: ["POL 101"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Political Science"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.8 }, { field: "Law", relevance: 0.7 }],
  },

  // ===== ADDITIONAL BREADTH COURSES =====

  // Biology (additional upper-level)
  {
    code: "BIO 315", name: "Microbiology",
    description: "Study of microorganisms including bacteria, viruses, fungi, and their roles in health, disease, and the environment.",
    credits: 4, department: "Biology", prerequisites: ["BIO 111"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.8 }],
  },
  {
    code: "BIO 350", name: "Evolutionary Biology",
    description: "Mechanisms of evolution including natural selection, genetic drift, speciation, and phylogenetics.",
    credits: 4, department: "Biology", prerequisites: ["BIO 112", "BIO 220"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.85 }, { field: "Environmental Science", relevance: 0.6 }],
  },

  // Chemistry (additional upper-level)
  {
    code: "CHE 231", name: "Organic Chemistry II",
    description: "Continuation of Organic Chemistry I covering advanced reactions, spectroscopy, and synthesis of complex molecules.",
    credits: 4, department: "Chemistry", prerequisites: ["CHE 230"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Chemistry"], difficulty: 4,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.85 }, { field: "Research & Academia", relevance: 0.7 }],
  },
  {
    code: "CHE 250", name: "Analytical Chemistry",
    description: "Quantitative and qualitative chemical analysis using classical and instrumental methods.",
    credits: 4, department: "Chemistry", prerequisites: ["CHE 115"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Chemistry"], difficulty: 3,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.7 }, { field: "Environmental Science", relevance: 0.6 }],
  },

  // Physics (additional)
  {
    code: "PHY 330", name: "Quantum Mechanics",
    description: "Formal development of quantum theory including wave functions, operators, angular momentum, and perturbation theory.",
    credits: 4, department: "Physics", prerequisites: ["PHY 310", "MAT 240"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Physics"], difficulty: 5,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.95 }],
  },

  // Mathematics (additional)
  {
    code: "MAT 350", name: "Complex Analysis",
    description: "Theory of functions of a complex variable, analytic functions, contour integration, and residue theory.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 220"], offered: ["Fall"],
    tags: ["elective"], difficulty: 5,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.8 }, { field: "Finance & Banking", relevance: 0.4 }],
  },
  {
    code: "MAT 150", name: "Introduction to Statistical Modeling",
    description: "Applied statistics course covering regression, ANOVA, and statistical computing with R.",
    credits: 4, department: "Mathematics", prerequisites: ["MAT 112"], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 2,
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.8 }, { field: "Consulting", relevance: 0.5 }],
  },

  // Computer Science (additional)
  {
    code: "CSC 311", name: "Theory of Computation",
    description: "Formal languages, automata theory, computability, and computational complexity.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 250"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Computer Science"], difficulty: 4,
    careerRelevance: [{ field: "Software Engineering", relevance: 0.6 }, { field: "Research & Academia", relevance: 0.8 }],
  },
  {
    code: "CSC 351", name: "Computer Graphics",
    description: "Fundamentals of 2D and 3D graphics, rendering, transformations, and GPU programming.",
    credits: 4, department: "Computer Science", prerequisites: ["CSC 222", "MAT 214"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Software Engineering", relevance: 0.8 }, { field: "Arts & Design", relevance: 0.6 }],
  },

  // Economics (additional)
  {
    code: "ECO 320", name: "Game Theory",
    description: "Strategic decision-making with applications to economics, political science, and business.",
    credits: 4, department: "Economics", prerequisites: ["ECO 201"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Finance & Banking", relevance: 0.7 }, { field: "Consulting", relevance: 0.8 }],
  },

  // English (additional)
  {
    code: "ENG 330", name: "Victorian Literature",
    description: "Study of major Victorian novels, poetry, and essays in the context of industrial, social, and imperial change.",
    credits: 4, department: "English", prerequisites: ["ENG 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.6 }, { field: "Media & Journalism", relevance: 0.4 }],
  },

  // History (additional)
  {
    code: "HIS 340", name: "Latin American History",
    description: "Political, social, and cultural history of Latin America from colonialism to the present.",
    credits: 4, department: "History", prerequisites: [], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.6 }, { field: "Nonprofit & Social Impact", relevance: 0.5 }],
  },

  // Psychology (additional)
  {
    code: "PSY 320", name: "Social Psychology",
    description: "Study of how individuals think about, influence, and relate to one another in social contexts.",
    credits: 4, department: "Psychology", prerequisites: ["PSY 100"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Marketing & Communications", relevance: 0.7 }, { field: "Consulting", relevance: 0.5 }],
  },
  {
    code: "PSY 360", name: "Behavioral Neuroscience",
    description: "Biological bases of behavior including neural anatomy, pharmacology, and brain-behavior relationships.",
    credits: 4, department: "Psychology", prerequisites: ["PSY 100", "BIO 111"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.85 }, { field: "Research & Academia", relevance: 0.8 }],
  },

  // Sociology (additional)
  {
    code: "SOC 250", name: "Criminology",
    description: "Sociological theories of crime, criminal justice system, punishment, and social control.",
    credits: 4, department: "Sociology", prerequisites: ["SOC 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Law", relevance: 0.8 }, { field: "Government & Policy", relevance: 0.7 }],
  },

  // Political Science (additional)
  {
    code: "POL 250", name: "Political Research Methods",
    description: "Quantitative and qualitative research methods in political science, including survey design and data analysis.",
    credits: 4, department: "Political Science", prerequisites: ["POL 101"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Political Science"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.8 }, { field: "Data Science & Analytics", relevance: 0.5 }],
  },

  // Communication Studies (additional)
  {
    code: "COM 220", name: "Digital Media Production",
    description: "Hands-on production of digital media content including podcasts, video, and social media campaigns.",
    credits: 4, department: "Communication Studies", prerequisites: ["COM 100"], offered: ["Fall"],
    tags: ["elective"], difficulty: 2,
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.9 }, { field: "Marketing & Communications", relevance: 0.85 }],
  },

  // Philosophy (additional)
  {
    code: "PHI 250", name: "Logic",
    description: "Formal logic including propositional and predicate calculus, proofs, and metalogic.",
    credits: 4, department: "Philosophy", prerequisites: ["PHI 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Law", relevance: 0.7 }, { field: "Software Engineering", relevance: 0.4 }],
  },

  // Africana Studies (additional)
  {
    code: "AFR 310", name: "African Politics and Society",
    description: "Political systems, economic development, and social change in contemporary sub-Saharan Africa.",
    credits: 4, department: "Africana Studies", prerequisites: ["AFR 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Government & Policy", relevance: 0.6 }, { field: "Nonprofit & Social Impact", relevance: 0.7 }],
  },

  // Gender & Sexuality Studies (additional)
  {
    code: "GSS 310", name: "Queer Studies",
    description: "Interdisciplinary examination of sexuality, queer theory, and LGBTQ+ histories and cultures.",
    credits: 4, department: "Gender & Sexuality Studies", prerequisites: ["GSS 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Nonprofit & Social Impact", relevance: 0.7 }, { field: "Law", relevance: 0.4 }],
  },

  // Film & Media Studies (additional)
  {
    code: "FMS 310", name: "Digital Media Theory",
    description: "Critical examination of digital media, platform studies, algorithmic culture, and the politics of technology.",
    credits: 4, department: "Film & Media Studies", prerequisites: ["FMS 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.8 }, { field: "Marketing & Communications", relevance: 0.6 }],
  },

  // Environmental Studies (additional)
  {
    code: "ENV 220", name: "Environmental Chemistry",
    description: "Chemical processes in air, water, and soil environments, including pollution and remediation.",
    credits: 4, department: "Environmental Studies", prerequisites: ["CHE 115"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Environmental Science", relevance: 0.9 }, { field: "Healthcare & Medicine", relevance: 0.3 }],
  },

  // Public Health (additional)
  {
    code: "PUH 220", name: "Biostatistics",
    description: "Statistical methods for public health research including study design, hypothesis testing, and survival analysis.",
    credits: 4, department: "Public Health", prerequisites: ["PUH 101", "MAT 112"], offered: ["Spring"],
    tags: ["major-requirement"], majorRequirements: ["Public Health"], difficulty: 3,
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.85 }, { field: "Data Science & Analytics", relevance: 0.7 }],
  },

  // Hispanic Studies (additional)
  {
    code: "SPA 310", name: "Latin American Literature",
    description: "Survey of major literary works from Latin America in Spanish, including magical realism and contemporary fiction.",
    credits: 4, department: "Hispanic Studies", prerequisites: ["SPA 202"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.5 }, { field: "Media & Journalism", relevance: 0.4 }],
  },

  // French (additional)
  {
    code: "FRE 310", name: "French Literature and Culture",
    description: "Study of major works of French literature from the Enlightenment to the present in their cultural context.",
    credits: 4, department: "French", prerequisites: ["FRE 202"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Education", relevance: 0.5 }, { field: "Government & Policy", relevance: 0.3 }],
  },

  // Anthropology (additional upper-level)
  {
    code: "ANT 310", name: "Archaeology of the Americas",
    description: "Archaeological methods and evidence for pre-Columbian civilizations in North, Central, and South America.",
    credits: 4, department: "Anthropology", prerequisites: ["ANT 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 3,
    careerRelevance: [{ field: "Research & Academia", relevance: 0.7 }, { field: "Education", relevance: 0.4 }],
  },

  // Digital Studies (additional)
  {
    code: "DAS 310", name: "Natural Language Processing",
    description: "Computational methods for analyzing and generating human language, including text classification and language models.",
    credits: 4, department: "Digital Studies", prerequisites: ["DAS 201", "CSC 222"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.9 }, { field: "Software Engineering", relevance: 0.7 }],
  },

  // ===== ADDITIONAL COURSES (career-paths referenced) =====

  // Accounting / Economics cross-listed
  {
    code: "ACC 215", name: "Financial Accounting",
    description: "Introduction to financial accounting principles including the preparation and interpretation of financial statements — balance sheets, income statements, and cash flow statements.",
    credits: 4, department: "Economics", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. David Palmer", professorRating: 3.8,
    professorInfo: {
      name: "Dr. David Palmer",
      title: "Visiting Assistant Professor of Economics",
      rmpRating: 3.8, rmpDifficulty: 3.2, rmpNumRatings: 14, rmpWouldTakeAgain: 72,
      rmpTags: ["Clear grading criteria", "Gives good feedback", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Balance sheets", "Income statements", "Cash flow analysis", "Accrual accounting", "Financial ratios", "Revenue recognition"],
      skillsGained: ["Financial statement analysis", "Accounting principles", "Business valuation basics", "Financial literacy", "Spreadsheet modeling"],
    },
    careerRelevance: [{ field: "Investment Banking", relevance: 0.9 }, { field: "Entrepreneurship", relevance: 0.8 }, { field: "Financial Planning", relevance: 0.85 }],
  },

  // Anthropology (additional)
  {
    code: "ANT 200", name: "Ethnographic Methods",
    description: "Introduction to qualitative research methods used in anthropology, including participant observation, interviewing, and field note analysis. Students conduct original ethnographic fieldwork.",
    credits: 4, department: "Anthropology", prerequisites: ["ANT 101"], offered: ["Spring"],
    tags: ["elective", "methods"], difficulty: 3,
    professor: "Dr. Joanna Park", professorRating: 4.1,
    professorInfo: {
      name: "Dr. Joanna Park",
      title: "Associate Professor of Anthropology",
      rmpRating: 4.1, rmpDifficulty: 3.3, rmpNumRatings: 16, rmpWouldTakeAgain: 80,
      rmpTags: ["Caring", "Inspirational", "Gives good feedback", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Participant observation", "Semi-structured interviews", "Field notes", "Coding & thematic analysis", "Research ethics", "Reflexivity"],
      skillsGained: ["Qualitative research design", "Interviewing techniques", "Ethnographic writing", "Cross-cultural analysis", "Research ethics"],
    },
    careerRelevance: [{ field: "UX Design", relevance: 0.85 }, { field: "International Development", relevance: 0.8 }, { field: "Research & Academia", relevance: 0.75 }],
  },

  // Art (additional)
  {
    code: "ART 120", name: "Visual Design",
    description: "Foundational principles of visual communication including color theory, typography, layout, composition, and design thinking. Studio projects explore 2D and digital design.",
    credits: 4, department: "Art", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "introductory"], difficulty: 2,
    professor: "Dr. Maria Torres", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Maria Torres",
      title: "Associate Professor of Art",
      rmpRating: 4.3, rmpDifficulty: 2.8, rmpNumRatings: 19, rmpWouldTakeAgain: 88,
      rmpTags: ["Amazing lectures", "Inspirational", "Caring", "Clear grading criteria", "Gives good feedback"],
    },
    courseInsights: {
      keyTopics: ["Color theory", "Typography", "Layout & composition", "Visual hierarchy", "Design critique", "Digital tools"],
      skillsGained: ["Visual communication", "Design thinking", "Creative problem solving", "Critique and feedback", "Adobe Creative Suite basics"],
    },
    careerRelevance: [{ field: "UX Design", relevance: 0.9 }, { field: "Marketing & Communications", relevance: 0.8 }, { field: "Arts & Museum Curation", relevance: 0.7 }],
  },

  // Chemistry (alternate numbering)
  {
    code: "CHE 240", name: "Organic Chemistry I",
    description: "Structure, bonding, stereochemistry, and reactivity of carbon-containing compounds. Reaction mechanisms including substitution, elimination, and addition reactions.",
    credits: 4, department: "Chemistry", prerequisites: ["CHE 115"], offered: ["Fall"],
    tags: ["major-requirement"], majorRequirements: ["Chemistry", "Biology"], difficulty: 5,
    professor: "Dr. Felix Lee", professorRating: 3.6,
    professorInfo: {
      name: "Dr. Felix Lee",
      title: "Professor of Chemistry",
      rmpRating: 3.6, rmpDifficulty: 4.5, rmpNumRatings: 32, rmpWouldTakeAgain: 52,
      rmpTags: ["Tough grader", "Lots of homework", "Test heavy", "Clear grading criteria"],
    },
    courseInsights: {
      keyTopics: ["Molecular structure", "Stereochemistry", "Reaction mechanisms", "Substitution reactions", "Elimination reactions", "Spectroscopy"],
      skillsGained: ["Organic reaction prediction", "Mechanism drawing", "Spectral interpretation", "3D molecular visualization", "Lab technique"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.95 }, { field: "Research & Academia", relevance: 0.8 }],
  },

  // Classics (additional)
  {
    code: "CLA 200", name: "Classical Archaeology",
    description: "Introduction to the material culture of ancient Greece and Rome through archaeological evidence. Topics include architecture, pottery, sculpture, and excavation methods.",
    credits: 4, department: "Classics", prerequisites: ["CLA 101"], offered: ["Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Sarah Mitchell", professorRating: 4.0,
    professorInfo: {
      name: "Dr. Sarah Mitchell",
      title: "Associate Professor of Classics",
      rmpRating: 4.0, rmpDifficulty: 3.1, rmpNumRatings: 12, rmpWouldTakeAgain: 78,
      rmpTags: ["Respected", "Gives good feedback", "Amazing lectures", "Caring"],
    },
    courseInsights: {
      keyTopics: ["Excavation methods", "Greek architecture", "Roman material culture", "Pottery analysis", "Sculpture & iconography", "Archaeological theory"],
      skillsGained: ["Material culture analysis", "Archaeological method", "Visual analysis", "Research writing", "Artifact interpretation"],
    },
    careerRelevance: [{ field: "Arts & Museum Curation", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.75 }],
  },

  // Communication Studies (additional)
  {
    code: "COM 210", name: "Public Speaking",
    description: "Theory and practice of public speaking. Students develop skills in speech organization, delivery, audience analysis, and persuasive argumentation through frequent speaking exercises.",
    credits: 4, department: "Communication Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "introductory"], difficulty: 2,
    professor: "Dr. Rachel Williams", professorRating: 4.4,
    professorInfo: {
      name: "Dr. Rachel Williams",
      title: "Associate Professor of Communication Studies",
      rmpRating: 4.4, rmpDifficulty: 2.5, rmpNumRatings: 22, rmpWouldTakeAgain: 90,
      rmpTags: ["Amazing lectures", "Caring", "Inspirational", "Clear grading criteria", "Accessible outside class"],
    },
    courseInsights: {
      keyTopics: ["Speech organization", "Audience analysis", "Persuasive techniques", "Delivery & presence", "Visual aids", "Impromptu speaking"],
      skillsGained: ["Public speaking confidence", "Persuasive communication", "Presentation design", "Audience engagement", "Constructive feedback"],
    },
    careerRelevance: [{ field: "Marketing & Communications", relevance: 0.9 }, { field: "Law", relevance: 0.85 }, { field: "Management Consulting", relevance: 0.8 }, { field: "Product Management", relevance: 0.75 }],
  },

  // Digital Studies
  {
    code: "DIG 200", name: "Digital Media Production",
    description: "Hands-on introduction to digital media creation including video production, audio recording, web design, and multimedia storytelling using industry-standard tools.",
    credits: 4, department: "Digital Studies", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["elective", "introductory"], difficulty: 2,
    professor: "Dr. Kevin Foster", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Kevin Foster",
      title: "Assistant Professor of Digital Studies",
      rmpRating: 4.2, rmpDifficulty: 2.6, rmpNumRatings: 11, rmpWouldTakeAgain: 85,
      rmpTags: ["Amazing lectures", "Inspirational", "Gives good feedback", "Caring"],
    },
    courseInsights: {
      keyTopics: ["Video production", "Audio recording & editing", "Web design basics", "Multimedia storytelling", "Digital photography", "Post-production"],
      skillsGained: ["Video editing (Premiere Pro)", "Audio production", "Web design", "Multimedia storytelling", "Project management"],
    },
    careerRelevance: [{ field: "Media & Journalism", relevance: 0.9 }, { field: "Marketing & Communications", relevance: 0.8 }, { field: "UX Design", relevance: 0.6 }],
  },

  // Economics (additional)
  {
    code: "ECO 255", name: "Econometrics",
    description: "Statistical methods applied to economic data. Topics include regression analysis, hypothesis testing, causal inference, and panel data methods. Extensive use of R/Stata.",
    credits: 4, department: "Economics", prerequisites: ["ECO 101", "MAT 230"], offered: ["Fall", "Spring"],
    tags: ["major-requirement", "methods"], majorRequirements: ["Economics"], difficulty: 4,
    professor: "Dr. James Smith", professorRating: 3.9,
    professorInfo: {
      name: "Dr. James Smith",
      title: "Associate Professor of Economics",
      rmpRating: 3.9, rmpDifficulty: 4.0, rmpNumRatings: 18, rmpWouldTakeAgain: 65,
      rmpTags: ["Tough grader", "Lots of homework", "Respected", "Clear grading criteria"],
    },
    courseInsights: {
      keyTopics: ["Linear regression", "Hypothesis testing", "Instrumental variables", "Panel data", "Causal inference", "Time series"],
      skillsGained: ["Econometric modeling", "Statistical software (R/Stata)", "Causal reasoning", "Data analysis", "Research design"],
    },
    careerRelevance: [{ field: "Data Science & Analytics", relevance: 0.9 }, { field: "Management Consulting", relevance: 0.8 }, { field: "Investment Banking", relevance: 0.75 }],
  },
  {
    code: "ECO 315", name: "Financial Economics",
    description: "Theory and practice of financial markets. Topics include asset pricing, portfolio theory, risk management, derivatives, and capital market efficiency.",
    credits: 4, department: "Economics", prerequisites: ["ECO 201", "MAT 230"], offered: ["Spring"],
    tags: ["elective"], difficulty: 4,
    professor: "Dr. Mark Anderson", professorRating: 4.1,
    professorInfo: {
      name: "Dr. Mark Anderson",
      title: "Associate Professor of Economics",
      rmpRating: 4.1, rmpDifficulty: 3.8, rmpNumRatings: 15, rmpWouldTakeAgain: 74,
      rmpTags: ["Respected", "Amazing lectures", "Tough grader", "Clear grading criteria"],
    },
    courseInsights: {
      keyTopics: ["Asset pricing models", "Portfolio theory", "CAPM & APT", "Options & derivatives", "Market efficiency", "Risk management"],
      skillsGained: ["Financial modeling", "Valuation techniques", "Risk assessment", "Portfolio construction", "Financial data analysis"],
    },
    careerRelevance: [{ field: "Investment Banking", relevance: 0.95 }, { field: "Financial Planning", relevance: 0.9 }, { field: "Management Consulting", relevance: 0.6 }],
  },

  // English (additional)
  {
    code: "ENG 270", name: "Expository Writing",
    description: "Advanced writing course focused on clear, persuasive nonfiction prose. Students develop skills in argumentation, evidence-based writing, and revision through workshop-style feedback.",
    credits: 4, department: "English", prerequisites: ["ENG 101"], offered: ["Fall", "Spring"],
    tags: ["elective", "writing-intensive"], difficulty: 3,
    professor: "Dr. Michael Harris", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Michael Harris",
      title: "Professor of English",
      rmpRating: 4.2, rmpDifficulty: 3.3, rmpNumRatings: 25, rmpWouldTakeAgain: 82,
      rmpTags: ["Amazing lectures", "Gives good feedback", "Caring", "Inspirational", "Clear grading criteria"],
    },
    courseInsights: {
      keyTopics: ["Argumentative writing", "Evidence and analysis", "Revision process", "Research writing", "Rhetorical strategies", "Workshop critique"],
      skillsGained: ["Persuasive writing", "Critical editing", "Research synthesis", "Clear communication", "Workshop participation"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.9 }, { field: "Research & Academia", relevance: 0.85 }, { field: "Media & Journalism", relevance: 0.8 }, { field: "Nonprofit & Social Impact", relevance: 0.75 }],
  },

  // History (additional)
  {
    code: "HIS 200", name: "American History",
    description: "Survey of American history from the colonial era through the present, examining political, social, cultural, and economic developments that shaped the nation.",
    credits: 4, department: "History", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "introductory"], difficulty: 2,
    professor: "Dr. Katherine Price", professorRating: 4.3,
    professorInfo: {
      name: "Dr. Katherine Price",
      title: "Associate Professor of History",
      rmpRating: 4.3, rmpDifficulty: 2.9, rmpNumRatings: 20, rmpWouldTakeAgain: 85,
      rmpTags: ["Amazing lectures", "Inspirational", "Caring", "Gives good feedback", "Respected"],
    },
    courseInsights: {
      keyTopics: ["Colonial America", "American Revolution", "Civil War & Reconstruction", "Progressive Era", "Civil Rights Movement", "Contemporary America"],
      skillsGained: ["Historical analysis", "Primary source interpretation", "Research writing", "Critical thinking", "Contextual reasoning"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.7 }, { field: "Government & Public Policy", relevance: 0.7 }, { field: "Arts & Museum Curation", relevance: 0.8 }],
  },

  // Mathematics (alternate numbering)
  {
    code: "MAT 110", name: "Calculus I",
    description: "Introduction to differential and integral calculus. Topics include limits, derivatives, applications of differentiation, definite and indefinite integrals.",
    credits: 4, department: "Mathematics", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "major-requirement"], majorRequirements: ["Mathematics"], difficulty: 3,
    professor: "Dr. Donna Bowen", professorRating: 4.0,
    professorInfo: {
      name: "Dr. Donna Bowen",
      title: "Professor of Mathematics",
      rmpRating: 4.0, rmpDifficulty: 3.5, rmpNumRatings: 28, rmpWouldTakeAgain: 70,
      rmpTags: ["Respected", "Clear grading criteria", "Accessible outside class", "Lots of homework"],
    },
    courseInsights: {
      keyTopics: ["Limits & continuity", "Derivatives", "Applications of derivatives", "Integration", "Fundamental Theorem of Calculus", "Applications of integrals"],
      skillsGained: ["Mathematical reasoning", "Problem solving", "Quantitative analysis", "Abstract thinking", "Proof basics"],
    },
    careerRelevance: [{ field: "Investment Banking", relevance: 0.7 }, { field: "Data Science & Analytics", relevance: 0.7 }, { field: "Software Engineering", relevance: 0.5 }],
  },

  // Public Health (alternate prefix)
  {
    code: "PBH 200", name: "Global Public Health",
    description: "Introduction to global health challenges including infectious disease, maternal and child health, health systems, and the social determinants of health across different populations.",
    credits: 4, department: "Public Health", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["elective", "introductory"], difficulty: 3,
    professor: "Dr. Angela Wilson", professorRating: 4.1,
    professorInfo: {
      name: "Dr. Angela Wilson",
      title: "Associate Professor of Public Health",
      rmpRating: 4.1, rmpDifficulty: 3.0, rmpNumRatings: 17, rmpWouldTakeAgain: 82,
      rmpTags: ["Caring", "Inspirational", "Amazing lectures", "Gives good feedback"],
    },
    courseInsights: {
      keyTopics: ["Global disease burden", "Health systems", "Epidemiology basics", "Social determinants of health", "Health equity", "International health policy"],
      skillsGained: ["Public health analysis", "Epidemiological thinking", "Global health literacy", "Policy evaluation", "Cross-cultural health awareness"],
    },
    careerRelevance: [{ field: "Healthcare & Medicine", relevance: 0.8 }, { field: "International Development", relevance: 0.85 }, { field: "Healthcare Administration", relevance: 0.8 }],
  },

  // Philosophy (alternate numbering)
  {
    code: "PHI 220", name: "Ethics",
    description: "Systematic study of moral theories and their application to contemporary ethical issues. Covers utilitarianism, deontology, virtue ethics, and applied ethics across professional domains.",
    credits: 4, department: "Philosophy", prerequisites: [], offered: ["Fall", "Spring"],
    tags: ["core", "introductory"], difficulty: 3,
    professor: "Dr. Robert Martin", professorRating: 4.2,
    professorInfo: {
      name: "Dr. Robert Martin",
      title: "Professor of Philosophy",
      rmpRating: 4.2, rmpDifficulty: 3.2, rmpNumRatings: 21, rmpWouldTakeAgain: 83,
      rmpTags: ["Amazing lectures", "Respected", "Inspirational", "Gives good feedback", "Hilarious"],
    },
    courseInsights: {
      keyTopics: ["Utilitarianism", "Kantian ethics", "Virtue ethics", "Applied ethics", "Moral reasoning", "Ethical dilemmas"],
      skillsGained: ["Ethical analysis", "Moral reasoning", "Argumentation", "Critical thinking", "Philosophical writing"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.8 }, { field: "Research & Academia", relevance: 0.7 }, { field: "Healthcare & Medicine", relevance: 0.65 }, { field: "Media & Journalism", relevance: 0.6 }],
  },

  // Political Science (alternate numbering)
  {
    code: "POL 315", name: "Constitutional Law",
    description: "In-depth study of constitutional interpretation, judicial review, and landmark Supreme Court decisions. Covers separation of powers, federalism, individual rights, and equal protection.",
    credits: 4, department: "Political Science", prerequisites: ["POL 101"], offered: ["Fall"],
    tags: ["elective"], difficulty: 4,
    professor: "Dr. William Chen", professorRating: 4.3,
    professorInfo: {
      name: "Dr. William Chen",
      title: "Professor of Political Science",
      rmpRating: 4.3, rmpDifficulty: 3.6, rmpNumRatings: 24, rmpWouldTakeAgain: 84,
      rmpTags: ["Amazing lectures", "Respected", "Inspirational", "Tough grader", "Gives good feedback"],
    },
    courseInsights: {
      keyTopics: ["Judicial review", "Separation of powers", "First Amendment", "Due process", "Equal protection", "Landmark cases"],
      skillsGained: ["Legal analysis", "Constitutional interpretation", "Case briefing", "Legal writing", "Oral argumentation"],
    },
    careerRelevance: [{ field: "Law", relevance: 0.95 }, { field: "Government & Public Policy", relevance: 0.8 }],
  },

  // Psychology (alternate numbering)
  {
    code: "PSY 230", name: "Developmental Psychology",
    description: "Study of human cognitive, social, and emotional development across the lifespan, from infancy through late adulthood. Emphasis on theories, research methods, and applied contexts.",
    credits: 4, department: "Psychology", prerequisites: ["PSY 100"], offered: ["Fall", "Spring"],
    tags: ["elective"], difficulty: 3,
    professor: "Dr. Lisa Thompson", professorRating: 4.1,
    professorInfo: {
      name: "Dr. Lisa Thompson",
      title: "Associate Professor of Psychology",
      rmpRating: 4.1, rmpDifficulty: 3.0, rmpNumRatings: 20, rmpWouldTakeAgain: 81,
      rmpTags: ["Caring", "Amazing lectures", "Accessible outside class", "Gives good feedback", "Inspirational"],
    },
    courseInsights: {
      keyTopics: ["Cognitive development", "Social-emotional development", "Attachment theory", "Adolescent development", "Aging", "Nature vs. nurture"],
      skillsGained: ["Developmental assessment", "Research methods", "Lifespan perspective", "Child behavior analysis", "Applied developmental science"],
    },
    careerRelevance: [{ field: "Education", relevance: 0.9 }, { field: "Psychology & Counseling", relevance: 0.85 }, { field: "Healthcare & Medicine", relevance: 0.5 }],
  },
];
