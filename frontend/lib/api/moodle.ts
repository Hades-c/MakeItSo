import * as z from "zod";
import { apiRoute } from "@/lib/api/spec";
import { queryBoolean } from "@/lib/types/common";
import { MoodleStatusSchema } from "@/lib/types/moodle";

/**
 * Moodle calendar import routes (/syllabi, app/api/moodle/**; server/moodle). Signed-in users only, never cached.
 * The status never carries the feed URL. While MOODLE_IMPORT_ENABLED is off, every route but `disconnect` answers
 * 404 (a student can always remove what is stored).
 */

export const ConnectMoodleBodySchema = z
  .object({
    /** The calendar URL as pasted; the server checks it (lib/moodle.ts checkMoodleFeedUrl). */
    url: z.string().max(2_000),
  })
  .strict();

export const DisconnectMoodleQuerySchema = z.object({
  /** Also remove the deadlines the feed imported into the plan. */
  removeDeadlines: queryBoolean(false),
});

export const moodleApi = {
  status: apiRoute({
    method: "GET",
    path: "/api/moodle",
    auth: "user",
    response: MoodleStatusSchema,
  }),
  /** Connect or replace the feed: checked, fetched once (nothing is stored when Moodle refuses it), imported. */
  connect: apiRoute({
    method: "PUT",
    path: "/api/moodle",
    auth: "user",
    body: ConnectMoodleBodySchema,
    response: MoodleStatusSchema,
  }),
  /** "Sync now". */
  sync: apiRoute({
    method: "POST",
    path: "/api/moodle/sync",
    auth: "user",
    response: MoodleStatusSchema,
  }),
  disconnect: apiRoute({
    method: "DELETE",
    path: "/api/moodle",
    auth: "user",
    query: DisconnectMoodleQuerySchema,
    response: z.object({ removed: z.number().int().min(0) }),
  }),
} as const;
