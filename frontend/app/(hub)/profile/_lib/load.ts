import "server-only";
import type { Profile } from "@/lib/api/profile";
import type { Flags } from "@/lib/flags";
import type { CareerCluster } from "@/server/content/careers";
import { CAREERS } from "@/server/content/careers";
import { getProfile, isMailAvailable, isVerifiedDavidsonUser, officialNames } from "@/server/auth";
import { now } from "@/server/clock";
import { loadFlags } from "@/server/features";

/**
 * Everything /profile renders, read once on the server (PLAN §3 /profile). The client islands get plain,
 * serialisable props and keep their own copy of what they edit, updated from each API answer.
 *
 *   profile        getProfile (W3): the Profile contract; majors/minors already mapped to official names
 *   majors/minors  official Acalog offering names (server/programs through W3's officialNames(): the interim
 *                  list while the programs service is unavailable)
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
  /** Verified mailbox AND @davidson.edu: what AI (and alumni) need besides consent. */
  verifiedDavidson: boolean;
  /** A mail provider is configured, so /verify can send a code. */
  mailAvailable: boolean;
  now: string;
}

export async function loadProfilePage(userId: string): Promise<ProfilePageData> {
  const [view, majors, minors] = await Promise.all([
    getProfile(userId),
    officialNames("major"),
    officialNames("minor"),
  ]);
  // ProfileView adds the derived `standing`; the islands derive it themselves from the editable fields.
  const { standing: _standing, ...profile } = view;
  return {
    profile,
    majors: majors.names,
    minors: minors.names,
    careers: CAREERS.map(({ slug, name, cluster }) => ({ slug, name, cluster })),
    flags: { ai: loadFlags().ai },
    verifiedDavidson: isVerifiedDavidsonUser(profile),
    mailAvailable: isMailAvailable(),
    now: now().toISOString(),
  };
}
