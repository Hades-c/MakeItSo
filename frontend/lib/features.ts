// Feature switches for the Spring 2027 registration hotfix.
//
// Alumni networking and AI cold emails are hidden: one listed alumna was
// fabricated and 22 entries had stale or wrong facts (audit accuracy-alumni/*).
// The code stays in the repo; the UI does not render it and the API returns 404.
export const ALUMNI_NETWORKING_ENABLED: boolean = false;
export const COLD_EMAIL_ENABLED: boolean = false;
