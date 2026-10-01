import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { routes } from "@/lib/routes";
import type { AiFailure } from "@/lib/types/ai";
import type { Loaded, SuggestionsData } from "../_lib/load";
import { SuggestionsPanel } from "./suggestions-panel";

/**
 * Suggestions (PLAN §3, R2): AI drafts per course. When AI is not available to this student the whole view is a
 * short explanation of why (AI off, not set up, unverified mailbox, no consent) with the one step that helps;
 * no AI output is shown then.
 */

function gateAction(gate: AiFailure) {
  if (gate.kind === "consent_required") {
    return (
      <Link href={routes.profile()} className={buttonVariants({ variant: "primary" })}>
        Open your profile
      </Link>
    );
  }
  if (gate.kind === "unverified") {
    return (
      <Link href={routes.verify()} className={buttonVariants({ variant: "primary" })}>
        Verify your Davidson email
      </Link>
    );
  }
  return null;
}

export function SuggestionsTab({
  loaded,
  timeZone,
}: {
  loaded: Loaded<SuggestionsData>;
  timeZone: string;
}) {
  if (!loaded.ok) {
    return <ErrorState title="Suggestions could not load" description={loaded.message} />;
  }
  const { gate } = loaded.data;
  if (gate) {
    return (
      <EmptyState
        icon={Sparkles}
        title="AI suggestions are not available"
        description={<p data-testid="ai-gate">{gate.message}</p>}
        action={gateAction(gate)}
      />
    );
  }
  return (
    <SuggestionsPanel
      drafts={loaded.data.drafts}
      items={loaded.data.items}
      targetTerms={loaded.data.targetTerms}
      registration={loaded.data.registration}
      timeZone={timeZone}
    />
  );
}
