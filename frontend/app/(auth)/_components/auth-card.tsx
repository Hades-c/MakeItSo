import type * as React from "react";
import { Card } from "@/components/ui/card";

export interface AuthCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** The Lakeside card every auth page sits in: h1, one line of context, the form, then links. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <Card className="p-6 md:p-8">
      <h1 className="text-xl font-strong tracking-title text-fg">{title}</h1>
      {description ? <div className="mt-1.5 text-sm text-fg-2">{description}</div> : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-6 text-center text-sm text-fg-2">{footer}</div> : null}
    </Card>
  );
}
