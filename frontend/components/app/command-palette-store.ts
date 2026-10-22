"use client";

import { useSyncExternalStore } from "react";

/**
 * Open state of the one app-wide command palette, shared by its triggers (the ⌘K button in the top-bar search,
 * the phone search link, the keyboard shortcut) and the dialog itself, which live in separate client islands.
 */
export interface CommandPaletteState {
  open: boolean;
  /** Text to start with (e.g. what was already typed in the top-bar field). */
  query: string;
  /**
   * Where focus goes back to when the palette closes: the trigger that opened it, or whatever had focus when ⌘K
   * was pressed. The palette has no Radix Dialog.Trigger, so it returns focus itself.
   */
  opener: HTMLElement | null;
}

let state: CommandPaletteState = { open: false, query: "", opener: null };
const listeners = new Set<() => void>();
const CLOSED: CommandPaletteState = { open: false, query: "", opener: null };

function emit() {
  for (const listener of listeners) listener();
}

/** The element that has focus now, if it is one focus can usefully go back to. */
export function focusedElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Open the palette. `opener` is where focus returns on close (default: the element focused now; pass the trigger
 * explicitly, since Safari does not focus a button on click).
 */
export function openCommandPalette(query = "", opener: HTMLElement | null = focusedElement()) {
  state = { open: true, query, opener };
  emit();
}

export function closeCommandPalette() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCommandPaletteState(): CommandPaletteState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => CLOSED,
  );
}
