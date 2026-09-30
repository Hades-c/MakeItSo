import mongoose, { type Model, Schema, type Types } from "mongoose";
import { CLASS_STANDINGS, type ClassStanding } from "@/lib/term";

/**
 * Accounts, collection `users` (owner W3; PLAN §1 "Sign-up", §4 "New data goes only to new collections").
 *
 * The collection predates the rewrite, so the rules are:
 *   - New fields are optional and never back-filled: a legacy (hackathon-era) document simply lacks them, and
 *     readers treat a missing field as its neutral value (sessionVersion 0, no consent, not onboarded).
 *   - Legacy fields (`major`, `minor`, `currentYear`, `bio`, `careerInterests`, `totalCreditsRequired`) are kept,
 *     never deleted. `major`/`minor` are read to map a legacy profile (server/auth/profile.ts) and mirrored on write
 *     so an Instant Rollback to the old app still shows the student's major; the others are ignored.
 *   - No schema defaults: a default would be applied in memory when a legacy document is read and could be
 *     written back, so writers set every value explicitly (e.g. `emailVerifiedAt: null` on registration).
 *   - Updates are atomic (`updateOne`/`findOneAndUpdate`), never `doc.save()` on a legacy document.
 *
 * `emailVerifiedAt` has three states, and the difference matters:
 *   - a Date: the mailbox was verified with a code (server/auth/verification.ts, or a password reset);
 *   - null (stored explicitly): a new-flow registration that is not verified yet. Once a code has been e-mailed
 *     to it (`verificationSentAt`) and 24 hours have passed, a new registration of the same address may replace
 *     it (server/auth/registration.ts). An account that was never sent a code is never replaced;
 *   - missing: a legacy account. It keeps working, may verify its own mailbox, and is never replaced.
 * defineRoute's "verified"/"admin" modes read the raw field (server/http/auth.ts readAccountFlags).
 */
export interface IUser {
  _id: Types.ObjectId;
  name: string;
  /** Normalised (NFKC → trim → lower case) for new accounts; legacy values are trimmed and lower-cased. */
  email: string;
  /** bcrypt hash (cost 12). Never selected unless asked for with `.select("+password")`. */
  password?: string;
  image?: string;

  // ---- W3 ------------------------------------------------------------------------------------------------------
  emailVerifiedAt?: Date | null;
  /**
   * When the first code (verification or password reset) was e-mailed to this still-unverified account: the 24 h
   * window after which a new registration may replace it starts here, not at sign-up, so accounts created while
   * no mail provider existed are never replaceable before their inbox was ever reached.
   */
  verificationSentAt?: Date;
  /** Bumped by "sign out everywhere", a password change or reset, and deletion; JWTs carry the value they had. */
  sessionVersion?: number;
  /** Set by scripts/flag-legacy-accounts.ts on accounts created before the rewrite. Never replaced. */
  legacyAccount?: boolean;

  // ---- Profile (lib/api/profile.ts) ----------------------------------------------------------------------------
  /** Official program names (server/programs, interim lib/utils MAJORS). */
  majors?: string[];
  minors?: string[];
  graduationYear?: number;
  firstTerm?: string;
  standingOverride?: ClassStanding;
  /** Career-path slugs. */
  interests?: string[];
  aiConsentAt?: Date;
  adultAttestedAt?: Date;
  onboardedAt?: Date;

  // ---- Legacy (read-only except the major/minor mirror) --------------------------------------------------------
  major?: string;
  minor?: string;
  currentYear?: string;
  bio?: string;
  careerInterests?: string[];
  totalCreditsRequired?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    image: { type: String },

    emailVerifiedAt: { type: Date },
    verificationSentAt: { type: Date },
    sessionVersion: { type: Number, min: 0 },
    legacyAccount: { type: Boolean },

    majors: { type: [String], default: undefined },
    minors: { type: [String], default: undefined },
    graduationYear: { type: Number, min: 1900, max: 2200 },
    firstTerm: { type: String, match: /^\d{4}0[1-3]$/ },
    standingOverride: { type: String, enum: CLASS_STANDINGS },
    interests: { type: [String], default: undefined },
    aiConsentAt: { type: Date },
    adultAttestedAt: { type: Date },
    onboardedAt: { type: Date },

    major: { type: String },
    minor: { type: String },
    currentYear: { type: String },
    bio: { type: String },
    careerInterests: { type: [String], default: undefined },
    totalCreditsRequired: { type: Number },
  },
  { timestamps: true },
);

const User: Model<IUser> =
  (mongoose.models.User as Model<IUser> | undefined) ?? mongoose.model<IUser>("User", UserSchema);

export default User;
