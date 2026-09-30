"use client";

import { useSyncExternalStore } from "react";

/**
 * Open state of the one app-wide command palette, shared by its triggers (the ⌘K button in the top-bar search,
 * the phone search button, the keyboard shortcut) and the dialog itself, which live in separate client islands.
 */
export interface CommandPaletteState {
  open: boolean;
  /** Text to start with (e.g. what was already typed in the top-bar field). */
  query: string;
}

let state: CommandPaletteState = { open: false, query: "" };
const listeners = new Set<() => void>();
const CLOSED: CommandPaletteState = { open: false, query: "" };

function emit() {
  for (const listener of listeners) listener();
}

export function openCommandPalette(query = "") {
  state = { open: true, query };
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
