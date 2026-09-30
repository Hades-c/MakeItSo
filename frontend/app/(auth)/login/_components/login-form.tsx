"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { FORGOT_PASSWORD_PATH } from "@/app/(auth)/_lib/contracts";
import { NETWORK_ERROR } from "@/app/(auth)/_lib/messages";
import { signInErrorMessage } from "@/app/(auth)/_lib/sign-in-errors";
import { STANDALONE_LINK } from "@/app/(auth)/_lib/styles";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";

export interface LoginFormProps {
  /** Same-origin path to open after signing in (already checked on the server). */
  callbackPath: string;
  initialError?: string | null;
}

export function LoginForm({ callbackPath, initialError = null }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        setError(signInErrorMessage(result?.error ?? "CredentialsSignin"));
        setLoading(false);
        return;
      }
      router.replace(callbackPath);
      router.refresh();
    } catch {
      // Network failure: without this the button stayed on "Signing in…" forever.
      setError(NETWORK_ERROR);
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Pick up your plan where you left it."
      footer={
        <>
          New to MakeItSo?{" "}
          <Link href={routes.register()} className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="email" label="Email">
          <Input
            type="email"
            placeholder="you@davidson.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
          />
        </Field>
        <Field id="password" label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
        <div className="-mt-1 flex justify-end">
          <Link href={FORGOT_PASSWORD_PATH} className={`${STANDALONE_LINK} text-sm`}>
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
