import "server-only";
import { readEnv } from "@/server/env";

/**
 * Feature flags (PLAN §4.1.14). Read on the server with `getFlags()` and passed to client components as props;
 * client code may `import type { Flags }` from here (type imports are erased), never call getFlags().
 *
 * Every R2 surface is built behind these so either release can ship without rework (PLAN §0). A flag only switches
 * a surface off: AI additionally needs configuration + consent + a verified @davidson.edu account at request time,
 * and alumni need a verified account.
 *
 *   careers       FEATURE_CAREERS        default on
 *   events        FEATURE_EVENTS         default on
 *   alumni        FEATURE_ALUMNI         default on
 *   ai            AI_ENABLED             default on
 *   rmp           RMP_ENABLED            default on  (ratings: rating, count, "as of", link)
 *   rmpSummaries  RMP_SUMMARIES_ENABLED  default off (AI summaries of reviews; owner opt-in only)
 */
export interface Flags {
  careers: boolean;
  events: boolean;
  alumni: boolean;
  ai: boolean;
  rmp: boolean;
  rmpSummaries: boolean;
}

export const FLAG_ENV_VARS = {
  careers: "FEATURE_CAREERS",
  events: "FEATURE_EVENTS",
  alumni: "FEATURE_ALUMNI",
  ai: "AI_ENABLED",
  rmp: "RMP_ENABLED",
  rmpSummaries: "RMP_SUMMARIES_ENABLED",
} as const satisfies Record<keyof Flags, string>;

/**
 * The current flags. Each flag is read on its own, so one malformed flag fails only the code that reads flags
 * (with an EnvError naming it), not the rest of the environment. Summaries need ratings: rmpSummaries is false
 * whenever rmp is.
 */
export function getFlags(source: Record<string, string | undefined> = process.env): Flags {
  const rmp = readEnv(FLAG_ENV_VARS.rmp, source);
  return {
    careers: readEnv(FLAG_ENV_VARS.careers, source),
    events: readEnv(FLAG_ENV_VARS.events, source),
    alumni: readEnv(FLAG_ENV_VARS.alumni, source),
    ai: readEnv(FLAG_ENV_VARS.ai, source),
    rmp,
    rmpSummaries: rmp && readEnv(FLAG_ENV_VARS.rmpSummaries, source),
  };
}
