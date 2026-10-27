import { authExtraApi } from "@/app/(auth)/_lib/contracts";
import { accountApi } from "@/lib/api/account";
import { aiApi } from "@/lib/api/ai";
import { catalogApi } from "@/lib/api/catalog";
import { eventsApi } from "@/lib/api/events";
import { planApi } from "@/lib/api/plan";
import { profileApi } from "@/lib/api/profile";
import { programsApi } from "@/lib/api/programs";
import { ratingsApi } from "@/lib/api/ratings";
import { searchApi } from "@/lib/api/search";
import type { ApiRouteSpec, HttpMethod } from "@/lib/api/spec";
import { syllabiApi } from "@/lib/api/syllabi";

/**
 * Every route spec, by method and path: what `callApi` checks an endpoint's response against outside production
 * (it loads this module on demand, so production client bundles never include it or zod).
 */
export const API_SPECS: readonly ApiRouteSpec[] = [
  ...new Set(
    [
      accountApi,
      aiApi,
      authExtraApi,
      catalogApi,
      eventsApi,
      planApi,
      profileApi,
      programsApi,
      ratingsApi,
      searchApi,
      syllabiApi,
    ].flatMap((family) => Object.values(family) as ApiRouteSpec[]),
  ),
];

/** The spec served at `method` + `path` (the path with its [segments], as in the spec). */
export function specFor(method: HttpMethod, path: string): ApiRouteSpec | undefined {
  return API_SPECS.find((spec) => spec.method === method && spec.path === path);
}
