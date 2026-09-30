import Link from "next/link";
import { Wordmark } from "@/components/app/wordmark";
import { routes } from "@/lib/routes";

/** Centered, quiet layout for sign-in, sign-up, verification and password reset. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 md:justify-center md:py-16">
      <Link href={routes.home()} aria-label="MakeItSo home" className="mb-8 rounded-md">
        <Wordmark subline="always" />
      </Link>
      <main className="w-full max-w-md">{children}</main>
      <footer className="mt-8 max-w-md text-center text-xs text-fg-3">
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
