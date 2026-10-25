"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEXT_LINK } from "../_lib/styles";

export interface ShowMoreProps {
  /** How many rows it holds ("Show 3 more"). */
  count: number;
  /** Said to screen readers after the visible words, e.g. "in the next two weeks". */
  context?: string;
  /** The held-back rows, rendered by the server and only hidden until the press. */
  children: React.ReactNode;
}

/**
 * "Show N more": a real button with aria-expanded that reveals the held-back rows in place, right below it, and
 * hides them again. Nothing is fetched on the press: the rows are already in the page, so the count is the number
 * of rows that appear.
 */
export function ShowMore({ count, context = "", children }: ShowMoreProps) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn(TEXT_LINK, "mt-1 gap-1 text-sm")}
        data-testid="show-more"
      >
        {open ? "Show fewer" : `Show ${count} more`}
        {context ? (
          <>
            {" "}
            <span className="sr-only">{context}</span>
          </>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </>
  );
}
