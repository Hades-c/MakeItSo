/**
 * A feed item's location as every page shows it (the events list, Today's campus panel and timeline), so they
 * read it the same way. Isomorphic and pure.
 */

const COUNTRY = /^(us|usa|united states)$/i;

/** The lower-case words of a location part ("NC 28036" → ["nc", "28036"]). */
function words(part: string): string[] {
  return part.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * A feed item's location, trimmed, with the address tail a feed repeats left out: Hurt Hub's "…, 210 Delburg
 * Street, Davidson, NC 28036, Davidson, NC, 28036, US" reads "…, 210 Delburg Street, Davidson, NC 28036". A
 * trailing country goes, then each short trailing part (at most three words) whose words all appear earlier.
 * Null for none (never a blank string, so a caller never prints a stray separator beside nothing).
 */
export function formatEventLocation(location: string | null): string | null {
  const trimmed = location?.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s*,\s*/).filter(Boolean);
  if (parts.length > 1 && COUNTRY.test(parts.at(-1)!)) parts.pop();
  while (parts.length > 1) {
    const last = words(parts.at(-1)!);
    const earlier = new Set(parts.slice(0, -1).flatMap(words));
    if (last.length > 3 || !last.every((word) => earlier.has(word))) break;
    parts.pop();
  }
  return parts.join(", ");
}
