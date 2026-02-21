import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const geminiModel = genAI.getGenerativeModel(
  { model: "gemini-1.5-flash" },
  { apiVersion: "v1" }
);

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

export async function generateMajorRoadmap(
  major: string,
  completedCourses: string[],
  classYear: string,
  interests: string[]
) {
  const prompt = `You are an academic advisor at Davidson College. Create a semester-by-semester course roadmap for a ${classYear} student majoring in ${major} who has completed: ${completedCourses.join(", ") || "no courses yet"}.

Their interests include: ${interests.join(", ") || "undecided"}.

Generate a JSON response:
{
  "roadmap": [
    {
      "semester": "Fall 2025",
      "courses": [
        {"code": "DEPT 101", "name": "Course Name", "type": "major-requirement|elective|distribution", "reason": "Why take this now"}
      ]
    }
  ],
  "advice": "2-3 sentences of personalized advice",
  "totalCreditsRemaining": 0,
  "estimatedGraduation": "Spring 2028"
}

Plan through graduation. Include 4-5 courses per semester. Davidson requires 128 credits (32 courses) to graduate. Return ONLY the JSON.`;

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
