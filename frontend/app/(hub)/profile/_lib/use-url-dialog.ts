"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * A dialog whose open state lives in the URL (PLAN §7 "State": open dialogs live in URL search params):
 * /profile?dialog=delete-account opens the delete confirmation, so a reload or a shared link shows the same
 * screen. Opening one never submits anything; the student still confirms inside it.
 *
 * The URL is written with window.history.replaceState, which Next.js syncs into useSearchParams without a server
 * round trip (the page is not re-rendered, no history entry is added). A URL change from elsewhere (a link to
 * ?dialog=…, Back/Forward) opens or closes the dialog to match.
 */

export const DIALOG_PARAM = "dialog";

export type ProfileDialog = "delete-account" | "sign-out-everywhere";

/** The URL with `dialog` set to `name` (open) or removed (closed); other params and the hash are kept. */
export function dialogHref(href: string, name: ProfileDialog, open: boolean): string {
  const url = new URL(href);
  if (open) url.searchParams.set(DIALOG_PARAM, name);
  else if (url.searchParams.get(DIALOG_PARAM) === name) url.searchParams.delete(DIALOG_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function useUrlDialog(name: ProfileDialog): [boolean, (open: boolean) => void] {
  const params = useSearchParams();
  const inUrl = params?.get(DIALOG_PARAM) === name;
  const [open, setOpenState] = useState(inUrl);
  // Follow URL changes that did not come from setOpen (state adjusted during render, not in an effect).
  const [seen, setSeen] = useState(inUrl);
  if (seen !== inUrl) {
    setSeen(inUrl);
    setOpenState(inUrl);
  }

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      const href = dialogHref(window.location.href, name, next);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (href !== current) window.history.replaceState(null, "", href);
    },
    [name],
  );

  return [open, setOpen];
}
