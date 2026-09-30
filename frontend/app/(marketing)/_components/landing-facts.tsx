import { connection } from "next/server";
import { SourceTag } from "@/components/ui/source-tag";
import { loadLandingFacts, type LandingFact } from "../_lib/facts";

/**
 * The landing's live numbers (async server component, in a Suspense boundary with no fallback): computed per
 * request (connection() keeps them out of the build), and nothing at all when none can be computed.
 */
export async function LandingFacts() {
  await connection();
  return <LandingFactsView facts={await loadLandingFacts()} />;
}

export function LandingFactsView({ facts }: { facts: readonly LandingFact[] }) {
  if (facts.length === 0) return null;
  return (
    <section aria-labelledby="landing-facts-title" className="mt-8" data-testid="landing-facts">
      <h2 id="landing-facts-title" className="sr-only">
        MakeItSo right now
      </h2>
      <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-8">
        {facts.map((fact) => (
          <li
            key={fact.id}
            data-fact={fact.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
          >
            <span className="text-xl font-strong text-fg tabular-nums">
              {fact.value.toLocaleString("en-US")}
            </span>
            <span className="text-sm text-fg-2">{fact.label}</span>
            {fact.source ? <SourceTag source={fact.source} className="self-center" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
