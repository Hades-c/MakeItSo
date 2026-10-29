import * as z from "zod";
import { MOODLE_PROBLEMS } from "@/lib/moodle";
import { IsoDateTimeSchema } from "@/lib/types/common";
import { StudentDeadlineSchema } from "@/lib/types/plan";

/**
 * A student's Moodle calendar connection as the API and /syllabi show it (server/moodle). Never the feed URL: it
 * is stored encrypted and only the server reads it.
 */
export const MoodleStatusSchema = z.object({
  connected: z.boolean(),
  connectedAt: IsoDateTimeSchema.nullable(),
  /** The last successful sync ("Connected · last synced <time>"). */
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  lastAttemptAt: IsoDateTimeSchema.nullable(),
  /** Why the last attempt failed; null when it worked (or nothing was tried yet). */
  problem: z.enum(MOODLE_PROBLEMS).nullable(),
  /** Feed events the last sync left out (the event or plan-deadline limit). */
  capped: z.number().int().min(0),
  /** The Moodle deadlines in the plan (origin "moodle"), by due time. */
  deadlines: z.array(StudentDeadlineSchema),
});
export type MoodleStatus = z.infer<typeof MoodleStatusSchema>;
