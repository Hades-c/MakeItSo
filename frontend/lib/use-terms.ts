"use client";

import { useEffect, useState } from "react";
import { fallbackTerms, type ResolvedTerms } from "@/lib/terms";

let termsPromise: Promise<ResolvedTerms> | null = null;

function loadTerms(): Promise<ResolvedTerms> {
  if (!termsPromise) {
    termsPromise = fetch("/api/terms")
      .then((res) => {
        if (!res.ok) throw new Error(`terms ${res.status}`);
        return res.json() as Promise<ResolvedTerms>;
      })
      .catch(() => {
        termsPromise = null; // retry on next mount
        return fallbackTerms();
      });
  }
  return termsPromise;
}

/** Active + registration terms from /api/terms (shared across components). */
export function useTerms(): ResolvedTerms | null {
  const [terms, setTerms] = useState<ResolvedTerms | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadTerms().then((t) => {
      if (!cancelled) setTerms(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return terms;
}
