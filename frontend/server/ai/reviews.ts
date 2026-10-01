import "server-only";
import { z } from "zod";
import RmpTeacher from "@/models/RmpTeacher";
import { getDb } from "@/server/db";
import { fetchExternal } from "@/server/http/external";
import { RMP_GRAPHQL_URL } from "@/server/rmp/roster";

/**
 * Review text for professor summaries (RMP_SUMMARIES_ENABLED only; called by the weekly job only). The text is
 * returned to the caller for one prompt and is never stored, cached or logged. One GraphQL request per teacher
 * through fetchExternal("ratemyprofessors"), validated with zod; no Authorization header.
 */

export interface Review {
  course: string | null;
  text: string;
}

export type ReviewFetcher = (legacyId: number) => Promise<Review[]>;

export const REVIEWS_PER_TEACHER = 30;
const REVIEW_MAX_CHARS = 600;

export const TEACHER_REVIEWS_QUERY = `query TeacherReviews($id: ID!, $first: Int!) {
  node(id: $id) {
    ... on Teacher {
      legacyId
      ratings(first: $first) {
        edges { node { comment class } }
      }
    }
  }
}`;

const ReviewsResponseSchema = z.object({
  data: z.object({
    node: z
      .object({
        legacyId: z.number().int().positive(),
        ratings: z.object({
          edges: z.array(
            z.object({
              node: z.object({
                comment: z.string().nullish(),
                class: z.string().nullish(),
              }),
            }),
          ),
        }),
      })
      .nullable(),
  }),
});

/** Plain review text: no markup, collapsed whitespace, cut to a bounded length. */
function clean(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, REVIEW_MAX_CHARS);
}

/** The newest reviews of a matched teacher (by RMP legacy id), or [] when the roster does not know them. */
export const fetchTeacherReviews: ReviewFetcher = async (legacyId) => {
  await getDb();
  const teacher = await RmpTeacher.findOne({ legacyId }).select("rmpId").lean();
  if (!teacher) return [];
  const response = await fetchExternal("ratemyprofessors", RMP_GRAPHQL_URL, {
    method: "POST",
    body: {
      query: TEACHER_REVIEWS_QUERY,
      variables: { id: teacher.rmpId, first: REVIEWS_PER_TEACHER },
    },
    schema: ReviewsResponseSchema,
    timeoutMs: 10_000,
    maxBytes: 2 * 1024 * 1024,
  });
  const node = response.data.data.node;
  if (!node || node.legacyId !== legacyId) return [];
  return node.ratings.edges
    .map((edge) => ({
      course: edge.node.class ? clean(edge.node.class).slice(0, 20) || null : null,
      text: clean(edge.node.comment ?? ""),
    }))
    .filter((review) => review.text.length >= 20);
};
