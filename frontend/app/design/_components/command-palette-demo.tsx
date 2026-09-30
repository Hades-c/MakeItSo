"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { CommandPalette } from "@/components/app/command-palette";
import { SearchUnavailableError, type SearchFn } from "@/components/app/search-client";
import { Button } from "@/components/ui/button";

/**
 * Sample results for the gallery (not real data). Type "offline" to see the unavailable state, "zzz" for no
 * matches.
 */
const sampleSearch: SearchFn = (query, signal) =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const q = query.toLowerCase();
      if (q.includes("offline")) return reject(new SearchUnavailableError("sample"));
      if (q.includes("zzz")) return resolve([]);
      resolve([
        {
          kind: "course",
          id: "202601-HIS-357",
          title: "HIS 357 · The Civil Rights Movement",
          subtitle: "Fall 2026 · Dan Aldridge · TTh 12:15–1:30p",
          href: "/courses/202601/HIS-357",
          source: "course-schedule",
        },
        {
          kind: "course",
          id: "202602-HIS-142",
          title: "HIS 142 · The United States since 1900",
          subtitle: "Spring 2027 · MW 8:05–9:20a",
          href: "/courses/202602/HIS-142",
          source: "course-schedule",
        },
        {
          kind: "career",
          id: "law",
          title: "Law and public policy",
          subtitle: "Career path (sample)",
          href: "/careers/law",
        },
        {
          kind: "event",
          id: "evt-1",
          title: "Civil rights film screening (sample)",
          subtitle: "Thu, Oct 1 · 7:00p · Union",
          href: "/events",
          source: "wildcatsync",
        },
      ]);
    }, 350);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export function CommandPaletteDemo() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Search aria-hidden />
        Open the palette with sample results
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        search={sampleSearch}
        initialQuery="civil rights"
      />
    </>
  );
}
