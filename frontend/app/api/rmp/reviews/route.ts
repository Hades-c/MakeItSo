import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";
const RMP_AUTH_HEADER = "Basic dGVzdDp0ZXN0";

const SEARCH_TEACHER_QUERY = `
  query SearchTeacher($text: String!, $schoolID: ID!) {
    newSearch {
      teachers(query: { text: $text, schoolID: $schoolID }) {
        edges {
          node {
            id
            firstName
            lastName
            school {
              name
              id
            }
            avgRating
            numRatings
            avgDifficulty
            wouldTakeAgainPercent
            department
          }
        }
      }
    }
  }
`;

const GET_TEACHER_RATINGS_QUERY = `
  query GetTeacherRatings($id: ID!) {
    node(id: $id) {
      ... on Teacher {
        id
        firstName
        lastName
        avgRating
        numRatings
        avgDifficulty
        wouldTakeAgainPercent
        department
        ratings(first: 20) {
          edges {
            node {
              comment
              date
              class
              helpfulRating
              clarityRating
              difficultyRating
              ratingTags
              wouldTakeAgain
              grade
              thumbsUpTotal
              thumbsDownTotal
            }
          }
        }
      }
    }
  }
`;

async function rmpQuery(query: string, variables: Record<string, unknown>) {
  const res = await fetch(RMP_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: RMP_AUTH_HEADER,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`RMP API returned ${res.status}`);
  }
  return res.json();
}

// Davidson College school ID on RMP
const DAVIDSON_SCHOOL_ID = "U2Nob29sLTM5NjU="; // base64 encoded School-3965

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { professorName } = await req.json();

    if (!professorName) {
      return NextResponse.json(
        { error: "professorName is required" },
        { status: 400 }
      );
    }

    // Step 1: Search for the teacher
    const searchResult = await rmpQuery(SEARCH_TEACHER_QUERY, {
      text: professorName,
      schoolID: DAVIDSON_SCHOOL_ID,
    });

    const teachers =
      searchResult?.data?.newSearch?.teachers?.edges || [];

    if (teachers.length === 0) {
      return NextResponse.json({
        found: false,
        reviews: [],
        message: "Professor not found on RateMyProfessors",
      });
    }

    // Find best match — verify last name matches to avoid wrong-professor results
    const searchParts = professorName
      .replace(/^Dr\.\s*/i, "")
      .trim()
      .split(/\s+/);
    const searchLastName = searchParts[searchParts.length - 1]?.toLowerCase();
    const matched = teachers.find(
      (t: { node: { lastName: string } }) =>
        t.node.lastName.toLowerCase() === searchLastName
    );
    if (!matched) {
      return NextResponse.json({
        found: false,
        reviews: [],
        message: "No matching professor found on RateMyProfessors",
      });
    }
    const teacher = matched.node;

    // Step 2: Get their ratings/reviews
    const ratingsResult = await rmpQuery(GET_TEACHER_RATINGS_QUERY, {
      id: teacher.id,
    });

    const teacherData = ratingsResult?.data?.node;
    const reviews =
      teacherData?.ratings?.edges?.map(
        (edge: {
          node: {
            comment: string;
            date: string;
            class: string;
            helpfulRating: number;
            clarityRating: number;
            difficultyRating: number;
            ratingTags: string;
            wouldTakeAgain: number;
            grade: string;
            thumbsUpTotal: number;
            thumbsDownTotal: number;
          };
        }) => ({
          comment: edge.node.comment,
          date: edge.node.date,
          class: edge.node.class,
          helpfulRating: edge.node.helpfulRating,
          clarityRating: edge.node.clarityRating,
          difficultyRating: edge.node.difficultyRating,
          ratingTags: edge.node.ratingTags,
          wouldTakeAgain: edge.node.wouldTakeAgain,
          grade: edge.node.grade,
          thumbsUpTotal: edge.node.thumbsUpTotal,
          thumbsDownTotal: edge.node.thumbsDownTotal,
        })
      ) || [];

    return NextResponse.json({
      found: true,
      professor: {
        name: `${teacher.firstName} ${teacher.lastName}`,
        department: teacher.department,
        avgRating: teacher.avgRating,
        numRatings: teacher.numRatings,
        avgDifficulty: teacher.avgDifficulty,
        wouldTakeAgainPercent: teacher.wouldTakeAgainPercent,
      },
      reviews,
    });
  } catch (error) {
    console.error("POST /api/rmp/reviews error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RMP reviews" },
      { status: 500 }
    );
  }
}
