import "server-only";
import { EVENT_SOURCE_IDS } from "@/app/(hub)/events/_lib/params";
import type { Flags } from "@/lib/flags";
import type { SourceId } from "@/lib/sources";
import { isMailAvailable } from "@/server/auth";
import { EnvError, readEnv } from "@/server/env";
import { featureEnabled, loadFlags } from "@/server/features";

/**
 * Which of MakeItSo's sections the landing may talk about right now (PLAN §0: R2 surfaces ship behind flags; §3 "/":
 * truthful claims; §9: a block about a flagged section renders only while featureEnabled). Decided per request on
 * the server, so a card, a source tag or a sentence is shown only while a visitor could actually use what it
 * describes:
 *
 *   careers  the Careers section is on (FEATURE_CAREERS)
 *   alumni   the alumni directory is on (FEATURE_ALUMNI, which also needs Careers) AND a mail provider is set up:
 *            alumni are for verified @davidson.edu accounts only, and without mail nobody can verify (PLAN §1)
 *   events   the Events section is on (FEATURE_EVENTS)
 *   ai       AI_ENABLED, a configured provider, and a mail provider (AI is for verified accounts too, PLAN §1)
 *   ratings  professor ratings are on (RMP_ENABLED)
 */

export interface LandingClaims {
  careers: boolean;
  alumni: boolean;
  events: boolean;
  ai: boolean;
  ratings: boolean;
}

export interface LandingCapabilities {
  /** server/auth isMailAvailable(): a mailbox can be verified. */
  mailAvailable: boolean;
  /** An AI provider is configured (a key, or the mock provider in tests). */
  aiConfigured: boolean;
}

/** Pure: the claims for these flags and capabilities. */
export function landingClaims(flags: Flags, capabilities: LandingCapabilities): LandingClaims {
  return {
    careers: featureEnabled(flags, "careers"),
    alumni: featureEnabled(flags, "alumni") && capabilities.mailAvailable,
    events: featureEnabled(flags, "events"),
    ai: flags.ai && capabilities.aiConfigured && capabilities.mailAvailable,
    ratings: flags.rmp,
  };
}

/**
 * Whether an AI provider is configured: the mock provider, or Anthropic with a key. A rejected configuration reads
 * as "not configured". contractRequest: use W6's server/ai/provider.ts aiConfigured() once it is merged.
 */
export function aiProviderConfigured(): boolean {
  try {
    if (readEnv("AI_PROVIDER") === "mock") return true;
    return Boolean(readEnv("ANTHROPIC_API_KEY"));
  } catch (error) {
    if (error instanceof EnvError) return false;
    throw error;
  }
}

/** The claims for this request. Never throws: anything that cannot be read counts as "off". */
export function loadLandingClaims(): LandingClaims {
  let aiConfigured = false;
  try {
    aiConfigured = aiProviderConfigured();
  } catch (error) {
    console.error("[landing] could not read the AI configuration:", error);
  }
  return landingClaims(loadFlags(), { mailAvailable: isMailAvailable(), aiConfigured });
}

/** "a, b and c". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The sources named in "Sources MakeItSo draws on": only those some page shows items from. */
export function landingSources(claims: LandingClaims): SourceId[] {
  return [
    "course-schedule",
    "registrar",
    ...(claims.ratings ? (["ratemyprofessors"] as const) : []),
    ...(claims.events ? EVENT_SOURCE_IDS : []),
  ];
}
