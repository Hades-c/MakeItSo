import { loadRegistrationOfferings, offeredCount } from "../_lib/catalog";
import { OfferedLine } from "./career-card";

/**
 * How many of a career's courses are on the registration term's schedule, streamed into its card. All cards share
 * one catalog read per request (loadRegistrationOfferings is memoised). Nothing at all when the catalog cannot
 * answer or the schedule is not published yet: never a guess.
 */
export async function OfferedCount({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return null;
  const offerings = await loadRegistrationOfferings();
  if (!offerings) return null;
  const total = new Set(codes).size;
  return (
    <OfferedLine
      offered={offeredCount(offerings, codes)}
      total={total}
      termLabel={offerings.label}
    />
  );
}
