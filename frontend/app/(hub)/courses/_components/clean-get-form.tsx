"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * A GET form that leaves empty fields out of the URL ("All departments", "Any time" submit "" natively, giving
 * ?dept=&after=…). With JavaScript the submit becomes a client navigation to the cleaned URL (back and reload
 * work as for any link); without it, the native GET still works and the page ignores the empty values.
 */
export function cleanQuery(data: FormData): string {
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (typeof value === "string" && value.trim() !== "") params.append(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function CleanGetForm({
  action,
  children,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "method" | "onSubmit"> & {
  action: string;
}) {
  const router = useRouter();
  return (
    <form
      {...props}
      method="get"
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        router.push(`${action}${cleanQuery(new FormData(event.currentTarget))}`);
      }}
    >
      {children}
    </form>
  );
}
