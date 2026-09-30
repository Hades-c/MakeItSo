import { z } from "zod";
import {
  accountApi,
  CheckInboxResponseSchema,
  PasswordResetConfirmBodySchema,
  PasswordResetRequestBodySchema,
  TestMailboxQuerySchema,
  TestMailboxResponseSchema,
  VerificationCodeSchema,
  type CheckInboxResponse,
} from "@/lib/api/account";
import { ProfileResponseSchema } from "@/lib/api/profile";
import { apiRoute } from "@/lib/api/spec";
import { routes } from "@/lib/routes";

/**
 * W3 route contracts that are not in lib/api yet (isomorphic: route handlers and client forms share them), plus
 * aliases for the ones that moved there (import those from lib/api/account.ts and lib/routes.ts in new code).
 * Same conventions as lib/api (strict bodies, `null` = 204).
 */

/** @deprecated Moved: use `routes.forgotPassword()` (lib/routes.ts). */
export const FORGOT_PASSWORD_PATH = routes.forgotPassword();

/** @deprecated Moved to lib/api/account.ts. */
export {
  CheckInboxResponseSchema,
  PasswordResetConfirmBodySchema,
  PasswordResetRequestBodySchema,
  TestMailboxQuerySchema,
  TestMailboxResponseSchema,
  type CheckInboxResponse,
};

/** @deprecated Moved: use `VerificationCodeSchema` (lib/api/account.ts). */
export const CodeSchema = VerificationCodeSchema;

/**
 * PUT /api/profile/ai-consent: the dedicated consent endpoint (the AI consent notice's "Turn on AI features").
 * Consent needs the 18+ attestation (PLAN §1, until the owner decides on minors), so the body carries it.
 */
export const AiConsentBodySchema = z.object({ adultAttested: z.literal(true) }).strict();

export const authExtraApi = {
  /** @deprecated Moved: `accountApi.requestPasswordReset`. */
  requestPasswordReset: accountApi.requestPasswordReset,
  /** @deprecated Moved: `accountApi.confirmPasswordReset`. */
  confirmPasswordReset: accountApi.confirmPasswordReset,
  grantAiConsent: apiRoute({
    method: "PUT",
    path: "/api/profile/ai-consent",
    auth: "user",
    body: AiConsentBodySchema,
    response: ProfileResponseSchema,
  }),
  /** "Turn off AI features": clears aiConsentAt (the attestation stays). */
  revokeAiConsent: apiRoute({
    method: "DELETE",
    path: "/api/profile/ai-consent",
    auth: "user",
    response: ProfileResponseSchema,
  }),
  /** @deprecated Moved: `accountApi.testMailbox`. */
  testMailbox: accountApi.testMailbox,
} as const;
