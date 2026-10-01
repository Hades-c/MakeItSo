"use client";

import * as React from "react";
import { useId, useState } from "react";
import { Search } from "lucide-react";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { CourseCode } from "@/components/ui/course-code";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SourceTag } from "@/components/ui/source-tag";
import { callApi } from "@/lib/api/client";
import { catalogApi } from "@/lib/api/catalog";
import { termLabel, type TermCode } from "@/lib/term";
import type { CourseSummary } from "@/lib/types/catalog";
import { describeFailure } from "../_lib/errors";

/**
 * Search one term of the Davidson course schedule (GET /api/catalog/search, W1: public and CDN-cached) and list
 * the matches, each with the actions the step passes in. Submit-based (Enter or the Search button), so a phone
 * keyboard is not interrupted on every letter; the result count is announced politely. Results carry the
 * COURSE SCHEDULE source tag.
 */

export const SEARCH_PAGE_SIZE = 10;

export interface CourseSearchProps {
  term: TermCode;
  /** Visible label of the search box. */
  label: string;
  /** Actions (and any expanded detail) for one result. */
  renderResult: (course: CourseSummary) => React.ReactNode;
  testId?: string;
}

export function CourseSearch({ term, label, renderResult, testId }: CourseSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [searchedFor, setSearchedFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError(null);
    try {
      const result = await callApi(catalogApi.search, {
        query: { term, q, pageSize: SEARCH_PAGE_SIZE },
      });
      setResults(result.items);
      setTotal(result.total);
      setSearchedFor(q);
    } catch (caught) {
      setError(describeFailure(caught).message);
      setResults(null);
    }
    setSearching(false);
  }

  const status = searching
    ? "Searching…"
    : results === null
      ? ""
      : results.length === 0
        ? `No ${termLabel(term)} courses match “${searchedFor}”.`
        : total > results.length
          ? `Showing ${results.length} of ${total} ${termLabel(term)} courses for “${searchedFor}”. Add more words to narrow it down.`
          : `${total} ${termLabel(term)} ${total === 1 ? "course" : "courses"} for “${searchedFor}”.`;

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <form role="search" onSubmit={search} className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Course code, title or instructor"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={100}
            className="h-11 px-3 md:h-10"
          />
          <Button type="submit" variant="secondary" aria-disabled={searching || undefined}>
            <Search aria-hidden />
            Search
          </Button>
        </div>
      </form>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <p role="status" className="text-sm text-fg-2">
        {status}
      </p>
      {results && results.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {results.map((course) => (
            <li
              key={course.code}
              className="flex flex-col gap-2 px-3.5 py-3"
              data-testid="search-result"
              data-code={course.code}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <CourseCode code={course.code} />
                <span className="font-semibold text-fg">{course.title}</span>
                <SourceTag source="course-schedule" />
              </div>
              <p className="text-sm text-fg-2">
                {course.sectionCount === 1 ? "1 section" : `${course.sectionCount} sections`}
                {course.instructorNames.length > 0
                  ? ` · ${course.instructorNames.slice(0, 3).join(", ")}${course.instructorNames.length > 3 ? ", …" : ""}`
                  : ""}
              </p>
              {renderResult(course)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
