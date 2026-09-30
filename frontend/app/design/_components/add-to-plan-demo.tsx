"use client";

import * as React from "react";
import {
  AddToPlanControl,
  type AddToPlanControlProps,
} from "@/components/domain/add-to-plan-control";

/** Stateful AddToPlanControl for the gallery: "adding" takes a second, then the course is in the plan. */
export function AddToPlanDemo({
  initialValue,
  ...props
}: Omit<AddToPlanControlProps, "value" | "onChange" | "onAdd" | "pending" | "added"> & {
  initialValue: string | null;
}) {
  const [value, setValue] = React.useState(initialValue);
  const [pending, setPending] = React.useState(false);
  const [addedTo, setAddedTo] = React.useState<string[]>([]);
  return (
    <AddToPlanControl
      {...props}
      value={value}
      onChange={setValue}
      pending={pending}
      added={value !== null && addedTo.includes(value)}
      onAdd={(term) => {
        setPending(true);
        window.setTimeout(() => {
          setPending(false);
          setAddedTo((terms) => [...terms, term]);
        }, 1000);
      }}
    />
  );
}
