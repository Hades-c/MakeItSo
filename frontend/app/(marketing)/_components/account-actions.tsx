import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { isSignedIn } from "../_lib/session";

/**
 * The landing's session-dependent buttons: sign in / create account for visitors, Go to Today for signed-in
 * students. The async components sit in Suspense boundaries whose fallback is the signed-out view, so the page
 * never waits for the session check (../_lib/session.ts).
 */

export function HeaderActionsView({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <Button asChild>
        <Link href={routes.today()}>Go to Today</Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost">
        <Link href={routes.login()}>Sign in</Link>
      </Button>
      <Button asChild>
        <Link href={routes.register()}>Create account</Link>
      </Button>
    </>
  );
}

export function HeroActionsView({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <Button asChild size="lg">
        <Link href={routes.today()}>
          Go to Today
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild size="lg">
        <Link href={routes.register()}>
          Create your account
          <ArrowRight aria-hidden />
        </Link>
      </Button>
      <Button asChild size="lg" variant="secondary">
        <Link href={routes.login()}>Sign in</Link>
      </Button>
    </>
  );
}

export async function HeaderActions() {
  return <HeaderActionsView signedIn={await isSignedIn()} />;
}

export async function HeroActions() {
  return <HeroActionsView signedIn={await isSignedIn()} />;
}
