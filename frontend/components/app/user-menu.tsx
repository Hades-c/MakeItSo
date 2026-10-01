"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { initials, USER_MENU_TRIGGER_CLASS } from "./user-initials";
import { useTheme } from "./use-theme";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

export { initials } from "./user-initials";

export interface UserMenuProps {
  name: string;
  email: string;
  /** Open on mount (LazyUserMenu mounts the menu when its placeholder button is pressed). */
  defaultOpen?: boolean;
}

/** Avatar button with Profile, theme choice and Sign out. */
export function UserMenu({ name, email, defaultOpen = false }: UserMenuProps) {
  const { preference, setPreference } = useTheme();
  return (
    // Not modal: a modal menu aria-hides the whole app while its own items stay focusable (axe aria-hidden-focus,
    // serious). Esc and the trigger still close it and return focus.
    <DropdownMenu modal={false} defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name || email}`}
        className={USER_MENU_TRIGGER_CLASS}
      >
        <span aria-hidden>{initials(name, email)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{name || "Signed in"}</span>
          <span className="truncate" data-testid="hub-user-email">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          {THEME_PREFERENCES.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              {THEME_LABELS[p]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* next-auth/react loads on use: it is not needed for anything else on a hub page's first load. */}
        <DropdownMenuItem
          onSelect={() =>
            void import("next-auth/react").then(({ signOut }) => signOut({ callbackUrl: "/login" }))
          }
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
