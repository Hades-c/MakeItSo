import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

export async function generateCareerPlan(career: string, major: string, classYear: string) {
  const prompt = `You are a career advisor for Davidson College students. A ${classYear} student majoring in ${major} wants to pursue a career in ${career}.

Generate a JSON response with this exact structure:
{
  "recommendedMajor": "the best major at Davidson for this career",
  "coursesToTake": [
    {"code": "DEPT 101", "name": "Course Name", "reason": "Why this course helps", "priority": "required|recommended|helpful", "typicalYear": "Freshman|Sophomore|Junior|Senior"}
  ],
  "peopleToMeet": [
    {"role": "Title/Role", "type": "alumni|faculty|advisor|professional", "reason": "Why meet them", "suggestedTiming": "Freshman|Sophomore|Junior|Senior", "howToFind": "Where to find them"}
  ],
  "thingsToDo": [
    {"activity": "Activity name", "type": "internship|research|club|certification|project", "reason": "Why this matters", "timing": "When to do this", "classYear": "Freshman|Sophomore|Junior|Senior"}
  ],
  "careerInsights": "A 2-3 sentence overview of this career path from Davidson"
}

Davidson College departments: Africana Studies, Anthropology, Biology, Chemistry, Computer Science, Economics, English, Environmental Studies, History, Mathematics, Music, Philosophy, Physics, Political Science, Psychology, Sociology, Theatre, Art, Communication Studies, Educational Studies, French & Francophone Studies, German Studies, Hispanic Studies, Religious Studies, Gender & Sexuality Studies, Public Health.

Include 8-12 courses, 5-7 people to meet, and 6-8 things to do. Be specific to Davidson College. Return ONLY the JSON, no markdown formatting.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function generateCourseCareerMapping(courseCode: string, courseName: string, department: string) {
  const prompt = `For the Davidson College course "${courseCode}: ${courseName}" in the ${department} department, generate a JSON response mapping this course to career outcomes:

{
  "courseSummary": "A concise 1-2 sentence summary of what students learn",
  "careerConnections": [
    {"career": "Career/Field name", "relevance": 0.0-1.0, "explanation": "How this course helps"}
  ],
  "skills": ["skill1", "skill2", "skill3"],
  "complementaryCourses": ["DEPT 101", "DEPT 202"]
}

Include 4-6 career connections with realistic relevance scores. Return ONLY the JSON.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function generateCourseInsights(
  courseCode: string,
  courseName: string,
  description: string,
  department: string,
  extraContext?: {
    professor?: string;
    rmpRating?: number;
    rmpDifficulty?: number;
    knownTopics?: string[];
    knownSkills?: string[];
    careerRelevance?: { field: string; relevance: number }[];
  }
) {
  let contextBlock = "";
  if (extraContext) {
    const parts: string[] = [];
    if (extraContext.professor) parts.push(`Instructor: ${extraContext.professor}`);
    if (extraContext.rmpRating) parts.push(`RateMyProfessors quality rating: ${extraContext.rmpRating}/5`);
    if (extraContext.rmpDifficulty) parts.push(`RateMyProfessors difficulty rating: ${extraContext.rmpDifficulty}/5`);
    if (extraContext.knownTopics?.length) parts.push(`Known topics covered: ${extraContext.knownTopics.join(", ")}`);
    if (extraContext.knownSkills?.length) parts.push(`Known skills gained: ${extraContext.knownSkills.join(", ")}`);
    if (extraContext.careerRelevance?.length) {
      const careers = extraContext.careerRelevance.map(c => `${c.field} (${Math.round(c.relevance * 100)}%)`).join(", ");
      parts.push(`Career relevance: ${careers}`);
    }
    if (parts.length) contextBlock = `\n\nAdditional context about this course:\n${parts.join("\n")}`;
  }

  const prompt = `For the Davidson College course "${courseCode}: ${courseName}" in the ${department} department with the following description: "${description}"${contextBlock}

Generate a JSON response with key course information and skills students will gain:

{
  "keyTopics": ["topic1", "topic2", "topic3", "topic4", "topic5"],
  "skillsGained": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "courseHighlights": "A 2-3 sentence summary of what makes this course valuable and what students can expect to learn",
  "careerApplications": ["specific application 1", "specific application 2", "specific application 3"]
}

Be specific and practical. Use the additional context to provide more accurate and detailed insights. keyTopics should be the main subject areas covered. skillsGained should be tangible, marketable skills. careerApplications should be concrete ways the skills apply professionally. Return ONLY the JSON.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function generateProfessorSummary(
  professorName: string,
  courseCode: string,
  courseName: string,
  rmpRating?: number,
  rmpDifficulty?: number,
  rmpNumRatings?: number,
  rmpWouldTakeAgain?: number,
  rmpTags?: string[]
) {
  const parts: string[] = [];
  if (rmpRating != null) parts.push(`Overall quality rating: ${rmpRating}/5`);
  if (rmpDifficulty != null) parts.push(`Difficulty rating: ${rmpDifficulty}/5`);
  if (rmpNumRatings != null) parts.push(`Total number of student ratings: ${rmpNumRatings}`);
  if (rmpWouldTakeAgain != null) parts.push(`${rmpWouldTakeAgain}% of students would take this professor again`);
  if (rmpTags?.length) parts.push(`Student feedback tags: ${rmpTags.join(", ")}`);

  const prompt = `You are summarizing student reviews for Professor ${professorName} who teaches ${courseCode}: ${courseName} at Davidson College.

Based on the following RateMyProfessors data:
${parts.join("\n")}

Generate a JSON response:
{
  "summary": "A 3-4 sentence summary of what students can expect from this professor. Cover teaching style, workload expectations, and overall student sentiment. Be balanced and helpful.",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "considerations": ["thing to be aware of 1", "thing to be aware of 2"],
  "tipForSuccess": "One practical tip for succeeding in this professor's class"
}

Be honest but constructive. Derive insights from the rating numbers and student tags. If the rating is high, reflect that positively. If difficulty is high, frame it as rigorous but rewarding. Return ONLY the JSON.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function generateMajorRoadmap(
  major: string,
  completedCourses: string[],
  classYear: string,
  interests: string[],
  specificity: number = 3
) {
  // specificity: 1 = very general ("Elective", "Science Elective"), 5 = very specific (exact course codes)
  let specificityInstruction = "";
  if (specificity <= 1) {
    specificityInstruction = `\n\nIMPORTANT: Keep course suggestions VERY GENERAL. For electives and distribution courses, do NOT name specific courses. Instead use generic placeholders like:
- code: "ELEC ---", name: "Free Elective" for free electives
- code: "DIST ---", name: "Distribution: Social Science" for distribution requirements
- code: "DEPT ---", name: "${major} Elective" for major electives
Only name specific courses for absolute core requirements (e.g. the intro sequence for the major).`;
  } else if (specificity === 2) {
    specificityInstruction = `\n\nKeep course suggestions MOSTLY GENERAL. Name specific courses only for core major requirements. For electives and distributions, use category placeholders like "Social Science Elective", "Humanities Elective", "${major} Elective", etc. Use generic codes like "DIST ---" or "ELEC ---" for these.`;
  } else if (specificity === 3) {
    specificityInstruction = `\n\nUse a MIX of specific and general suggestions. Name specific courses for major requirements and key electives that align with the student's interests. For other slots, you may use general placeholders like "Free Elective" or "Distribution Elective".`;
  } else if (specificity === 4) {
    specificityInstruction = `\n\nBe MOSTLY SPECIFIC. Suggest specific Davidson courses with real course codes for most slots. You may use a few general placeholders for free electives where the student has maximum flexibility.`;
  } else {
    specificityInstruction = `\n\nBe VERY SPECIFIC. Suggest exact Davidson College courses with real course codes and names for every single slot. Use your best judgment to pick the best courses based on the student's major, interests, and career trajectory. No generic placeholders.`;
  }

  const prompt = `You are an academic advisor at Davidson College. Create a semester-by-semester course roadmap for a ${classYear} student majoring in ${major} who has completed: ${completedCourses.join(", ") || "no courses yet"}.

Their interests include: ${interests.join(", ") || "undecided"}.${specificityInstruction}

Generate a JSON response:
{
  "roadmap": [
    {
      "semester": "Fall 2025",
      "courses": [
        {"code": "DEPT 101", "name": "Course Name", "type": "major-requirement|elective|distribution", "reason": "Why take this now"}
      ]
    },
    {
      "semester": "Spring 2026",
      "courses": [...]
    },
    {
      "semester": "Summer 2026",
      "isSummer": true,
      "activities": [
        {"activity": "Activity name", "type": "internship|research|study-abroad|fellowship|personal-project|networking", "reason": "Why this is valuable", "examples": "1-2 specific examples relevant to the student"}
      ]
    }
  ],
  "advice": "2-3 sentences of personalized advice",
  "totalCreditsRemaining": 0,
  "estimatedGraduation": "Spring 2028"
}

Plan through graduation. Include 4-5 courses per semester. IMPORTANT: Between each academic year (after Spring, before Fall), include a "Summer YYYY" entry with isSummer: true and 3-4 suggested summer activities (internships, research, study abroad, personal projects, networking, etc.) tailored to the student's major and interests. These should be progressively more advanced — freshman summer more exploratory, senior summer more career-focused. Davidson requires 128 credits (32 courses) to graduate. Return ONLY the JSON.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function generateColdEmail(
  alumniName: string,
  alumniRole: string,
  alumniCompany: string,
  alumniBio: string,
  alumniMajor: string,
  alumniClassYear: number,
  studentName: string,
  studentMajor: string,
  studentClassYear: string,
  careerField: string
) {
  const prompt = `You are helping a Davidson College student write a cold email to a Davidson alumnus/alumna for networking purposes.

Alumni details:
- Name: ${alumniName}
- Davidson Class of ${alumniClassYear}, majored in ${alumniMajor}
- Current Role: ${alumniRole} at ${alumniCompany}
- Bio: ${alumniBio}

Student details:
- Name: ${studentName || "a current student"}
- Major: ${studentMajor || "Undecided"}
- Class Year: ${studentClassYear || "Freshman"}
- Career Interest: ${careerField}

Generate a JSON response with a personalized cold email:
{
  "subject": "A concise, compelling subject line that references the Davidson connection",
  "body": "The full email body. Should be 150-200 words. Include: 1) A warm Davidson connection opener, 2) Specific reference to the alumni's work/role that shows genuine interest, 3) Brief mention of the student's relevant interests/experience, 4) A clear, low-commitment ask (15-min call or coffee chat), 5) Professional sign-off. Tone should be respectful but not overly formal — like one Wildcat to another.",
  "tips": ["3-4 short tips for the student on how to make the most of this outreach"]
}

Make the email feel genuine and specific — not templated. Reference specific details from the alumni's bio and role. Return ONLY the JSON.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function generateCourseRecommendations(
  interests: string[],
  completedCourses: string[],
  major: string,
  classYear: string
) {
  const prompt = `You are an academic advisor at Davidson College. A ${classYear} student majoring in ${major} is interested in: ${interests.join(", ")}.
They have completed: ${completedCourses.join(", ") || "no courses yet"}.

Recommend courses they should take next. Generate a JSON response:
{
  "recommendations": [
    {
      "code": "DEPT 101",
      "name": "Course Name",
      "department": "Department Name",
      "credits": 4,
      "reason": "Why this is recommended",
      "careerImpact": ["Career 1", "Career 2"],
      "difficulty": 1-5,
      "priority": "high|medium|low",
      "prerequisites": ["DEPT 100"]
    }
  ]
}

Davidson departments: Africana Studies, Anthropology, Biology, Chemistry, Computer Science, Economics, English, Environmental Studies, History, Mathematics, Music, Philosophy, Physics, Political Science, Psychology, Sociology, Theatre, Art, Communication Studies, Educational Studies, French & Francophone Studies, German Studies, Hispanic Studies, Religious Studies.

Include 10-15 recommendations, sorted by priority. Use realistic Davidson course codes. Return ONLY the JSON.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
