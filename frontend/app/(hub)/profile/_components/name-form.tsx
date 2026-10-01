"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FieldErrorSummary,
  useFocusFirstInvalid,
  type FieldSpecs,
} from "@/app/(auth)/_components/field-errors";
import { FormAlert } from "@/app/(auth)/_components/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { callApi } from "@/lib/api/client";
import { profileApi, ProfilePatchBodySchema } from "@/lib/api/profile";
import { describeFailure } from "../_lib/errors";

const FIELDS: FieldSpecs<"name"> = { name: { id: "profile-name", label: "Name" } };

export interface NameFormProps {
  initialName: string;
}

/**
 * Your name as MakeItSo shows it (top bar, greetings). Never sent to the AI features. Save stays focusable while
 * there is nothing to save (aria-disabled), so focus does not fall back to the page after a save.
 */
export function NameForm({ initialName }: NameFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useFocusFirstInvalid(fieldErrors, FIELDS);

  const unchanged = name.trim() === saved;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || unchanged) return;
    setError(null);
    setStatus("");
    if (!ProfilePatchBodySchema.safeParse({ name }).success) {
      setFieldErrors({ name: name.trim() ? "Use at most 100 characters." : "Enter your name." });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const { profile } = await callApi(profileApi.update, { body: { name } });
      setName(profile.name);
      setSaved(profile.name);
      setStatus("Name saved.");
      // The top bar shows the name: re-render the shell.
      router.refresh();
    } catch (caught) {
      const failure = describeFailure(caught);
      const issue = failure.issues.find((i) => i.path === "name");
      if (issue) setFieldErrors({ name: issue.message });
      else setError(failure.message ?? failure.issues[0]?.message ?? null);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <FieldErrorSummary errors={fieldErrors} fields={FIELDS} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-end">
        <Field id="profile-name" label="Name" error={fieldErrors.name} className="md:flex-1">
          <Input
            value={name}
            maxLength={100}
            autoComplete="name"
            onChange={(event) => {
              setName(event.target.value);
              setStatus("");
            }}
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          aria-disabled={saving || unchanged ? true : undefined}
        >
          {saving ? "Saving…" : "Save name"}
        </Button>
      </div>
      <p role="status" className="text-sm font-medium text-success">
        {status}
      </p>
    </form>
  );
}
