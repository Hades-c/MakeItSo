"use client";

import * as React from "react";
import type { UserMenuProps } from "./user-menu";
import { initials, USER_MENU_TRIGGER_CLASS } from "./user-initials";

type UserMenuComponent = React.ComponentType<UserMenuProps>;

let menuModule: Promise<UserMenuComponent> | null = null;
/** The account menu's chunk, loaded once. */
function loadUserMenu(): Promise<UserMenuComponent> {
  menuModule ??= import("./user-menu").then((mod) => mod.UserMenu);
  return menuModule;
}

/**
 * The account menu (Radix DropdownMenu and its positioning) loads when the avatar is first pressed, so it is not part
 * of every hub page's first-load JavaScript (PLAN §6.2 perf budget). Until then the avatar is a plain button with the
 * same name and look; pressing it (click, Enter, Space or ArrowDown) mounts the real menu, open. Hovering or
 * focusing it starts the download early.
 */
export function LazyUserMenu({ name, email }: { name: string; email: string }) {
  const [Menu, setMenu] = React.useState<UserMenuComponent | null>(null);
  const [pending, setPending] = React.useState(false);
  const open = () => {
    setPending(true);
    void loadUserMenu().then((component) => setMenu(() => component));
  };
  if (Menu) return <Menu name={name} email={email} defaultOpen />;
  return (
    <button
      type="button"
      aria-label={`Account menu for ${name || email}`}
      aria-haspopup="menu"
      aria-expanded={pending}
      className={USER_MENU_TRIGGER_CLASS}
      data-testid="user-menu-placeholder"
      onPointerEnter={() => void loadUserMenu()}
      onFocus={() => void loadUserMenu()}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          open();
        }
      }}
    >
      <span aria-hidden>{initials(name, email)}</span>
    </button>
  );
}
