"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { accountApi } from "@/lib/api/account";
import { callApi } from "@/lib/api/client";
import { routes } from "@/lib/routes";
import { describeFailure } from "../_lib/errors";
import { hardNavigate } from "../_lib/navigate";
import { useUrlDialog } from "../_lib/use-url-dialog";

/**
 * "Sign out everywhere" (W3: DELETE /api/account/sessions bumps the session version and clears this browser's
 * cookie). Confirmed in a dialog (kept in the URL as ?dialog=sign-out-everywhere); afterwards a full page load to
 * /login, which also drops every client cache.
 */
export function SignOutEverywhere() {
  const [open, setOpen] = useUrlDialog("sign-out-everywhere");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await callApi(accountApi.signOutEverywhere);
    } catch (caught) {
      const failure = describeFailure(caught);
      if (!failure.signedOut) {
        setError(failure.message);
        setBusy(false);
        return;
      }
    }
    hardNavigate(routes.login());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <LogOut aria-hidden />
          Sign out everywhere
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Sign out everywhere?</DialogTitle>
          <DialogDescription>
            Every device signed in to your account, this one included, will need your password
            again.
          </DialogDescription>
        </DialogHeader>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" aria-disabled={busy ? true : undefined}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={confirm} aria-disabled={busy ? true : undefined}>
            {busy ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
