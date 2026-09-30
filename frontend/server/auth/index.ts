import "server-only";
// Registers verificationcodes + ratelimits in the account data registry (this module is in ACCOUNT_DATA_MODULES).
import "./account-data";

/**
 * Auth, security, profile and account (owner W3; PLAN §1 "Sign-up", §6.1 W3, §9). Import from "@/server/auth".
 *
 *   sessions       getSessionUser, requireUser({ verifiedDavidson }), requireApiUser, isEmailVerified,
 *                  isVerifiedDavidsonUser (server/auth/session.ts)
 *   NextAuth       getAuthOptions, authorizeCredentials (server/auth/options.ts)
 *   registration   registerAccount (always 202 "check your inbox")
 *   verification   verifyEmailCode, resendVerification; the hub banner: verifyBannerFor + VerifyBanner
 *   account        changePassword, signOutEverywhere, deleteAccount, exportAccount, clearSessionCookies
 *   profile        getProfile, updateProfile, grantAiConsent, revokeAiConsent, defaultFirstTerm, ...
 *   passwords      passwordProblem (the new-password policy), hashPassword, verifyPassword
 *   mail           getMailer, isMailAvailable (ConsoleMailer / ResendMailer; null = none)
 *   reset          requestPasswordReset, confirmPasswordReset
 */

export {
  authorizeCredentials,
  getAuthOptions,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_MAX_AGE_SEC,
  SignInRefusedError,
} from "./options";
export {
  getSessionUser,
  isEmailVerified,
  isVerifiedDavidsonUser,
  requireApiUser,
  requireUser,
  resolveSessionUser,
  RETURN_PATH_HEADER,
  VERIFIED_ONLY_REDIRECT,
  verifiedOnlyRedirect,
  type RequireUserOptions,
  type SessionUser,
} from "./session";
export { registerAccount, CHECK_INBOX_MESSAGE, NO_MAIL_MESSAGE } from "./registration";
export {
  resendVerification,
  verifyEmailCode,
  VERIFICATION_UNAVAILABLE_MESSAGE,
} from "./verification";
export { verifyBannerFor, type VerifyBannerState } from "./banner";
export {
  changePassword,
  clearSessionCookies,
  deleteAccount,
  exportAccount,
  getMe,
  signedOutResponse,
  signOutEverywhere,
} from "./account";
export {
  academicYearEnd,
  defaultFirstTerm,
  defaultGraduationYear,
  getProfile,
  grantAiConsent,
  officialNames,
  revokeAiConsent,
  updateProfile,
  type ProfileView,
} from "./profile";
export { hashPassword, passwordProblem, verifyPassword } from "./passwords";
export { isSafeAppPath, safeAppPath } from "./paths";
export { getMailer, isMailAvailable, type Mailer, type MailMessage } from "./mailer";
export {
  confirmPasswordReset,
  requestPasswordReset,
  RESET_UNAVAILABLE_MESSAGE,
} from "./password-reset";
