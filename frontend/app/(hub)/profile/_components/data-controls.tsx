"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import {
  FieldErrorSummary,
  useFocusFirstInvalid,
  type FieldSpecs,
} from "@/app/(auth)/_components/field-errors";
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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { accountApi } from "@/lib/api/account";
import { callApi } from "@/lib/api/client";
import { routes } from "@/lib/routes";
import { downloadJson, exportFilename } from "../_lib/download";
import { describeFailure } from "../_lib/errors";
import { hardNavigate } from "../_lib/navigate";

/**
 * "Your data" (PLAN §3 /profile; W3's account data routes): download everything MakeItSo stores about you
 * (GET /api/me/export, 5 a day) as a JSON file, and delete the account (DELETE /api/me with the password
 * re-entered, in an in-page dialog). Deletion signs the browser out and lands on the home page with a full page
 * load, so no client state survives it.
 */

export function DownloadData() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function download() {
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      const data = await callApi(accountApi.export);
      downloadJson(data, exportFilename(data.exportedAt));
      setStatus("Your download has started.");
    } catch (caught) {
      setError(describeFailure(caught).message);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-2">
        A JSON file with your profile, your plan and everything else MakeItSo stores about you (up
        to 5 downloads a day).
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div>
        <Button variant="secondary" onClick={download} disabled={busy}>
          <Download aria-hidden />
          {busy ? "Preparing…" : "Download my data"}
        </Button>
      </div>
      <p role="status" className="text-sm font-medium text-success">
        {status}
      </p>
    </div>
  );
}

const DELETE_FIELDS: FieldSpecs<"password"> = {
  password: { id: "delete-password", label: "Password" },
};

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusFirstInvalid(fieldErrors, DELETE_FIELDS);

  function reset() {
    setPassword("");
    setFieldErrors({});
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!password) {
      setFieldErrors({ password: "Enter your password to confirm." });
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await callApi(accountApi.delete, { body: { password } });
    } catch (caught) {
      const failure = describeFailure(caught);
      const issue = failure.issues.find((i) => i.path === "password");
      if (issue) setFieldErrors({ password: issue.message });
      else setError(failure.message ?? failure.issues[0]?.message ?? null);
      setBusy(false);
      return;
    }
    hardNavigate(routes.home());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-2">
          Deletes your account, profile, plan and saved AI results right away. This cannot be
          undone: download your data first if you want a copy.
        </p>
        <div>
          <DialogTrigger asChild>
            <Button variant="danger">
              <Trash2 aria-hidden />
              Delete account
            </Button>
          </DialogTrigger>
        </div>
      </div>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            Everything MakeItSo stores about you is deleted immediately and cannot be recovered.
            Enter your password to confirm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FieldErrorSummary errors={fieldErrors} fields={DELETE_FIELDS} />
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id={DELETE_FIELDS.password.id} label="Password" error={fieldErrors.password}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" disabled={busy}>
              <Trash2 aria-hidden />
              {busy ? "Deleting…" : "Delete my account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
