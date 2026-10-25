import type { authExtraApi } from "@/app/(auth)/_lib/contracts";
import type { accountApi } from "@/lib/api/account";
import type { aiApi } from "@/lib/api/ai";
import type { catalogApi } from "@/lib/api/catalog";
import type { planApi } from "@/lib/api/plan";
import type { profileApi } from "@/lib/api/profile";
import type { ApiEndpoints } from "@/lib/api/spec";

/**
 * The routes client islands call, as `callApi` endpoints: the method, path and AI flag of each spec in lib/api
 * (and the AI-consent spec in app/(auth)/_lib/contracts.ts), without its zod schemas. Client code imports these
 * instead of the specs, so a page's first-load JavaScript carries no zod (the specs' schemas built about 33 KB of
 * it into /courses, the course page and /plan):
 *
 *   await callApi(planEndpoints.addItem, { body: { termCode: "202602", courseCode: "CSC 221" } });
 *
 * The specs are imported as types only. ApiEndpoints<typeof planApi> makes the compiler require one endpoint per
 * route, with exactly the spec's method, path and aiResult, so the two cannot drift; tests/lib/api/endpoints.test.ts
 * checks the same at run time. Server code and tests keep passing the full specs.
 */

export const accountEndpoints: ApiEndpoints<typeof accountApi> = {
  register: { method: "POST", path: "/api/auth/register" },
  me: { method: "GET", path: "/api/me" },
  export: { method: "GET", path: "/api/me/export" },
  delete: { method: "DELETE", path: "/api/me" },
  verify: { method: "POST", path: "/api/account/verify" },
  resendVerification: { method: "POST", path: "/api/account/verify/resend" },
  changePassword: { method: "POST", path: "/api/account/password" },
  signOutEverywhere: { method: "DELETE", path: "/api/account/sessions" },
  requestPasswordReset: { method: "POST", path: "/api/auth/password-reset" },
  confirmPasswordReset: { method: "POST", path: "/api/auth/password-reset/confirm" },
  confirmPasswordResetLink: { method: "POST", path: "/api/auth/password-reset/link" },
  testMailbox: { method: "GET", path: "/api/auth/test-mailbox" },
};

export const aiEndpoints: ApiEndpoints<typeof aiApi> = {
  courseAbout: { method: "POST", path: "/api/ai/course-about", aiResult: true },
  planSuggestions: { method: "POST", path: "/api/ai/plan-suggestions", aiResult: true },
  careerPlan: { method: "POST", path: "/api/ai/career-plan", aiResult: true },
  coldEmail: { method: "POST", path: "/api/ai/cold-email", aiResult: true },
  professorSummary: { method: "POST", path: "/api/ai/professor-summary", aiResult: true },
  report: { method: "POST", path: "/api/ai/report" },
  purge: { method: "POST", path: "/api/ai/admin/purge" },
};

export const catalogEndpoints: ApiEndpoints<typeof catalogApi> = {
  terms: { method: "GET", path: "/api/catalog/terms" },
  search: { method: "GET", path: "/api/catalog/search" },
  course: { method: "GET", path: "/api/catalog/courses/[term]/[code]" },
  availability: { method: "GET", path: "/api/catalog/availability" },
  filters: { method: "GET", path: "/api/catalog/filters" },
  cronRefresh: { method: "GET", path: "/api/cron/catalog" },
};

export const planEndpoints: ApiEndpoints<typeof planApi> = {
  getPlan: { method: "GET", path: "/api/plan" },
  addItem: { method: "POST", path: "/api/plan/items" },
  updateItem: { method: "PATCH", path: "/api/plan/items/[id]" },
  removeItem: { method: "DELETE", path: "/api/plan/items/[id]" },
  updateManual: { method: "PATCH", path: "/api/plan/manual" },
  progress: { method: "GET", path: "/api/plan/progress" },
  daySchedule: { method: "GET", path: "/api/plan/schedule" },
  getWebTree: { method: "GET", path: "/api/plan/webtree" },
  saveWebTree: { method: "PUT", path: "/api/plan/webtree" },
  listDeadlines: { method: "GET", path: "/api/plan/deadlines" },
  addDeadline: { method: "POST", path: "/api/plan/deadlines" },
  removeDeadline: { method: "DELETE", path: "/api/plan/deadlines/[id]" },
  listSummer: { method: "GET", path: "/api/plan/summer" },
  addSummer: { method: "POST", path: "/api/plan/summer" },
  updateSummer: { method: "PATCH", path: "/api/plan/summer/[id]" },
  removeSummer: { method: "DELETE", path: "/api/plan/summer/[id]" },
  listDrafts: { method: "GET", path: "/api/plan/drafts" },
  updateDraft: { method: "PATCH", path: "/api/plan/drafts/[id]" },
};

export const profileEndpoints: ApiEndpoints<typeof profileApi> = {
  get: { method: "GET", path: "/api/profile" },
  update: { method: "PATCH", path: "/api/profile" },
};

export const authExtraEndpoints: ApiEndpoints<typeof authExtraApi> = {
  requestPasswordReset: accountEndpoints.requestPasswordReset,
  confirmPasswordReset: accountEndpoints.confirmPasswordReset,
  grantAiConsent: { method: "PUT", path: "/api/profile/ai-consent" },
  revokeAiConsent: { method: "DELETE", path: "/api/profile/ai-consent" },
  testMailbox: accountEndpoints.testMailbox,
};
