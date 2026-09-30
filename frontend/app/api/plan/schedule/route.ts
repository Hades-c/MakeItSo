import { planApi } from "@/lib/api/plan";
import { now } from "@/server/clock";
import { defineRoute } from "@/server/http";
import { getDaySchedule } from "@/server/plan";
import { todayKey } from "@/server/plan/time";

/**
 * GET /api/plan/schedule?date=YYYY-MM-DD (America/New_York; default today) → { schedule }: the day's classes from
 * the student's sections, plus (beyond the contract) the student-entered deadlines due that day.
 */
export const GET = defineRoute(planApi.daySchedule, async ({ user, query }) => {
  const schedule = await getDaySchedule(user.id, query.date ?? todayKey(now()));
  return { schedule };
});
