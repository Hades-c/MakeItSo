"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { CommandPalette } from "@/components/app/command-palette";
import {
  SearchUnavailableError,
  type SearchFn,
  type SearchResult,
} from "@/components/app/search-client";
import { Button } from "@/components/ui/button";

/**
 * Search over the given sample results (they come from the server page, so no sample content is bundled into
 * client JS). Type "offline" to see the unavailable state, "zzz" for no matches.
 */
function sampleSearch(results: SearchResult[]): SearchFn {
  return (query, signal) =>
    new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        const q = query.toLowerCase();
        if (q.includes("offline")) reject(new SearchUnavailableError("sample"));
        else resolve(q.includes("zzz") ? [] : results);
      }, 350);
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
}

export function CommandPaletteDemo({
  results,
  initialQuery,
}: {
  results: SearchResult[];
  initialQuery: string;
}) {
  const [open, setOpen] = React.useState(false);
  const search = React.useMemo(() => sampleSearch(results), [results]);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Search aria-hidden />
        Open the palette with sample results
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        search={search}
        initialQuery={initialQuery}
      />
    </>
  );
}
