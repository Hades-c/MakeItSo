import Link from "next/link";
import { Wordmark } from "@/components/app/wordmark";

/** Centered, quiet layout for sign-in and sign-up. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 md:justify-center md:py-16">
      <Link href="/" aria-label="MakeItSo home" className="mb-8 rounded-md">
        <Wordmark subline="always" />
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
