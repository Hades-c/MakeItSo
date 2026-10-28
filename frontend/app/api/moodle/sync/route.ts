import { moodleApi } from "@/lib/api/moodle";
import { defineRoute } from "@/server/http";
import { requireMoodleImport, syncMoodle } from "@/server/moodle";

/** POST /api/moodle/sync → MoodleStatus ("Sync now"; 429 past the per-student hourly limit). */
export const POST = defineRoute(moodleApi.sync, async ({ user }) => {
  requireMoodleImport();
  return syncMoodle(user.id);
});
