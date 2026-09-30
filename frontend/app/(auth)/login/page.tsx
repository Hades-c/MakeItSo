"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        // next-auth reports wrong credentials as "CredentialsSignin"; anything else is a server-side message.
        setError(result.error === "CredentialsSignin" ? "Invalid email or password" : result.error);
        setLoading(false);
        return;
      }
      router.push("/today");
      router.refresh();
    } catch {
      // Network failure: without this the button stayed on "Signing in…" forever.
      setError("Could not reach MakeItSo. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 md:p-8">
      <h1 className="text-xl font-strong">Sign in</h1>
      <p className="mt-1.5 text-sm text-fg-2">Welcome back. Pick up your plan where you left it.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-danger bg-danger-wash px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <Field id="email" label="Email">
          <Input
            type="email"
            placeholder="you@davidson.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
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
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-fg-2">
        New to MakeItSo?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
