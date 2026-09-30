// Feature switches for the Spring 2027 registration hotfix.
//
// Alumni networking and AI cold emails are hidden: one listed alumna was
// fabricated and 22 entries had stale or wrong facts (audit accuracy-alumni/*).
// The code stays in the repo; the UI does not render it and the API returns 404.
export const ALUMNI_NETWORKING_ENABLED: boolean = false;
export const COLD_EMAIL_ENABLED: boolean = false;

// Professor ratings (RateMyProfessors lookups) and AI professor summaries are
// hidden until professors can be matched correctly (audit accuracy-professors/*).
// /api/rmp/reviews and /api/ai/professor-summary return 404 while this is false.
export const PROFESSOR_RATINGS_ENABLED: boolean = false;

// GET /api/courses served the old static catalog (credits 4, static RMP
// fields). The live schedule is /api/courses/davidson; this returns 404.
export const STATIC_CATALOG_API_ENABLED: boolean = false;
