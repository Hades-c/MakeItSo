import { moodleApi } from "@/lib/api/moodle";
import { defineRoute } from "@/server/http";
import {
  connectMoodle,
  disconnectMoodle,
  getMoodleStatus,
  requireMoodleImport,
} from "@/server/moodle";

// GET /api/moodle → MoodleStatus (never the feed URL).
export const GET = defineRoute(moodleApi.status, async ({ user }) => {
  requireMoodleImport();
  return getMoodleStatus(user.id);
});

/**
 * PUT /api/moodle { url } → MoodleStatus. Checks the URL, fetches it once and stores it encrypted only when Moodle
 * answers with a calendar (400 with what to do otherwise, 503 when Moodle does not answer).
 */
export const PUT = defineRoute(
  {
    ...moodleApi.connect,
    rateLimit: { name: "moodle-connect", limit: 10, windowSec: 3600, by: "user" },
  },
  async ({ user, body }) => {
    requireMoodleImport();
    return connectMoodle(user.id, body.url);
  },
);

/** DELETE /api/moodle?removeDeadlines=true → { removed }. Works with the flag off too. */
export const DELETE = defineRoute(moodleApi.disconnect, async ({ user, query }) =>
  disconnectMoodle(user.id, { removeDeadlines: query.removeDeadlines }),
);
