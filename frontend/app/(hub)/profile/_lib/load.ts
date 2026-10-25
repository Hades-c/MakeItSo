import "server-only";
import type { Profile } from "@/lib/api/profile";
import type { Flags } from "@/lib/flags";
import type { CareerCluster } from "@/server/content/careers";
import { CAREERS } from "@/server/content/careers";
import { aiOpenWithoutVerifying, isAiVerified, loadAiAllowsUnverified } from "@/server/ai/access";
import {
  getProfile,
  isMailAvailable,
  isVerifiedDavidsonUser,
  profileProgramNames,
} from "@/server/auth";
import { now } from "@/server/clock";
import { loadFlags } from "@/server/features";

/**
 * Everything /profile renders, read once on the server (PLAN §3 /profile). The client islands get plain,
 * serialisable props and keep their own copy of what they edit, updated from each API answer.
 *
 *   profile        getProfile (W3): the Profile contract; majors/minors already mapped to official names
 *   majors/minors  official Acalog offering names (server/programs through W3's officialNames(): the interim
 *                  list while the programs service is unavailable), then the unlisted programs a profile may also
 *                  store (W3 profileProgramNames: a CIS major, the Middle East Studies minor)
 *   careers        the career-path taxonomy for interests (server/content: slug, name, cluster)
 *   now            the server's now() as ISO, so derived standing and year choices match on both sides
 */

export interface CareerOption {
  slug: string;
  name: string;
  cluster: CareerCluster;
}

export interface ProfilePageData {
  profile: Profile;
  majors: string[];
  minors: string[];
  careers: CareerOption[];
  flags: Pick<Flags, "ai">;
  /** Verified mailbox AND @davidson.edu: what alumni and cold e-mail need (and, switch off, every AI feature). */
  verifiedDavidson: boolean;
  /**
   * The temporary AI_ALLOW_UNVERIFIED switch (server/ai/access.ts): an unverified @davidson.edu account may use AI
   * (consent and the 18+ attestation still needed), cold e-mail and alumni excepted.
   */
  allowUnverifiedAi: boolean;
  /**
   * aiOpenWithoutVerifying: the switch with AI on and set up, so the page may say AI works before the address is
   * verified (the switch alone decides only the rule a lock states).
   */
  aiOpenWithoutVerifying: boolean;
  /** Verified for AI (isAiVerified, as the AI routes decide it): all AI needs besides consent. */
  aiVerified: boolean;
  /** A mail provider is configured, so /verify can send a code. */
  mailAvailable: boolean;
  now: string;
}

export async function loadProfilePage(userId: string): Promise<ProfilePageData> {
  const [view, majors, minors] = await Promise.all([
    getProfile(userId),
    profileProgramNames("major"),
    profileProgramNames("minor"),
  ]);
  // ProfileView adds the derived `standing`; the islands derive it themselves from the editable fields.
  const { standing: _standing, ...profile } = view;
  const allowUnverifiedAi = loadAiAllowsUnverified();
  return {
    profile,
    majors: majors.names,
    minors: minors.names,
    careers: CAREERS.map(({ slug, name, cluster }) => ({ slug, name, cluster })),
    flags: { ai: loadFlags().ai },
    verifiedDavidson: isVerifiedDavidsonUser(profile),
    allowUnverifiedAi,
    aiOpenWithoutVerifying: aiOpenWithoutVerifying(allowUnverifiedAi),
    // course-about stands for every AI feature but cold e-mail (the verified-only one).
    aiVerified: isAiVerified(profile, "course-about", allowUnverifiedAi),
    mailAvailable: isMailAvailable(),
    now: now().toISOString(),
  };
}
