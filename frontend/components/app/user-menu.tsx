"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
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
import { useTheme } from "./use-theme";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

/** "Casey Wildcat" → "CW"; falls back to the email's first letter. */
export function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[words.length - 1]?.[0] ?? ""}`
      : (words[0]?.slice(0, 2) ?? "");
  return (letters || email.slice(0, 1) || "?").toUpperCase();
}

export interface UserMenuProps {
  name: string;
  email: string;
}

/** Avatar button with Profile, theme choice and Sign out. */
export function UserMenu({ name, email }: UserMenuProps) {
  const { preference, setPreference } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name || email}`}
        className="grid size-11 shrink-0 place-items-center rounded-full border border-line-2 bg-sand text-sm font-strong text-fg transition-colors hover:border-line-strong md:size-9.5"
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
        <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: "/login" })}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
