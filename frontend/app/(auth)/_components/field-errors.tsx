"use client";

import { useEffect } from "react";
import { FormAlert } from "./form-alert";

/**
 * Field-level errors on the auth forms, announced (PLAN §7; brief "errors role=alert"). Field (components/ui)
 * renders each message under its control as plain text, which a screen reader does not announce, so the forms
 * also render this summary (a role="alert" FormAlert) and move focus to the first invalid field.
 *
 *   const FIELDS = { email: { id: "email", label: "Email" }, ... } as const;
 *   useFocusFirstInvalid(errors, FIELDS);
 *   <FieldErrorSummary errors={errors} fields={FIELDS} />
 */

export type FieldSpecs<K extends string> = Readonly<Record<K, { id: string; label: string }>>;

export function FieldErrorSummary<K extends string>({
  errors,
  fields,
}: {
  errors: Partial<Record<K, string | undefined>>;
  fields: FieldSpecs<K>;
}) {
  const invalid = (Object.keys(fields) as K[]).filter((key) => errors[key]);
  if (invalid.length === 0) return null;
  return (
    <FormAlert title="Check the highlighted fields">
      <ul className="flex flex-col gap-0.5">
        {invalid.map((key) => (
          <li key={key}>
            {fields[key].label}: {errors[key]}
          </li>
        ))}
      </ul>
    </FormAlert>
  );
}

/** Focus the first field (in `fields` order) that has an error, each time a new errors object is set. */
export function useFocusFirstInvalid<K extends string>(
  errors: Partial<Record<K, string | undefined>>,
  fields: FieldSpecs<K>,
): void {
  useEffect(() => {
    const first = (Object.keys(fields) as K[]).find((key) => errors[key]);
    if (first) document.getElementById(fields[first].id)?.focus();
  }, [errors, fields]);
}
