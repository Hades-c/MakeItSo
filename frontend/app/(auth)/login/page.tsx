import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInErrorMessage } from "@/app/(auth)/_lib/sign-in-errors";
import {
  callbackPathFrom,
  firstParam,
  signedInUserOrNull,
  type SearchParams,
} from "@/server/auth/pages";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * /login (PLAN §3): signed-in visitors go straight on (to a same-origin `callbackUrl`, else /today). NextAuth
 * sends failed non-JS sign-ins back here with `?error=`; only known codes are shown (signInErrorMessage).
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const callbackPath = callbackPathFrom(params.callbackUrl);
  if (await signedInUserOrNull()) redirect(callbackPath);
  return (
    <LoginForm
      callbackPath={callbackPath}
      initialError={signInErrorMessage(firstParam(params.error))}
    />
  );
}
