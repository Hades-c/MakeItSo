"use client";

import * as React from "react";
import { PanelError } from "./panel-states";

export interface PanelBoundaryProps {
  /** The panel's id and title, for its error card. */
  id: string;
  title: string;
  /** What could not load ("Your schedule"). */
  what: string;
  children: React.ReactNode;
}

/**
 * The error boundary of one /today panel: Suspense does not catch errors, so a throw while a panel renders (on the
 * server or in the browser) would otherwise reach app/(hub)/error.tsx and replace the whole page. Here it becomes
 * that panel's small error state and every other panel keeps working. (Data loaders and pure computations already
 * degrade inside the panels; this catches what is left, e.g. a component throwing on bad data.)
 */
export class PanelBoundary extends React.Component<PanelBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(`[today] the ${this.props.id} panel failed:`, error);
  }

  override render() {
    if (this.state.failed) {
      return <PanelError id={this.props.id} title={this.props.title} what={this.props.what} />;
    }
    return this.props.children;
  }
}
