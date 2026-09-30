// Canonical form used to store and look up account emails.
export function normalizeEmail(value: unknown): string {
  return String(value).normalize("NFKC").trim().toLowerCase();
}
