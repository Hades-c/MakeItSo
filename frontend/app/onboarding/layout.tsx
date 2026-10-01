import Link from "next/link";
import { Wordmark } from "@/components/app/wordmark";
import { routes } from "@/lib/routes";

/**
 * Quiet, focused layout for the first run (outside the hub shell: no sidebar or tabs to wander off to; every step
 * still has Skip). The page itself checks the session.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-4">
          <Link
            href={routes.home()}
            aria-label="MakeItSo home"
            className="inline-flex min-h-11 items-center rounded-md"
          >
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:py-10">{children}</main>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-8 text-xs text-fg-3">
        <p>
          An independent student project, not a Davidson College service.{" "}
          <Link href={routes.privacy()} className="font-semibold text-fg-2 underline">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
