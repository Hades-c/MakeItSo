import Link from "next/link";
import { CommandPalette, CommandPaletteTrigger } from "./command-palette";
import { SearchForm } from "./search-form";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Wordmark } from "./wordmark";

export interface TopBarProps {
  user: { name: string; email: string };
}

/**
 * Sticky 64px top bar (58px on phones): wordmark, search (the course form plus the ⌘K command palette; a search
 * button on phones), theme toggle, avatar menu.
 */
export function TopBar({ user }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14.5 items-center gap-2.5 border-b border-line bg-surface px-4 md:h-16 md:gap-5 md:px-6">
      <Link
        href="/today"
        aria-label="MakeItSo, Davidson College: Today"
        className="-m-1 shrink-0 rounded-md p-1 max-md:-my-1.5 max-md:py-1.5 xl:w-56"
      >
        <Wordmark />
      </Link>
      <SearchForm className="max-w-140 flex-1 max-md:hidden" />
      <div className="ml-auto flex items-center gap-2.5">
        <CommandPaletteTrigger className="md:hidden" />
        <ThemeToggle />
        <UserMenu name={user.name} email={user.email} />
      </div>
      <CommandPalette />
    </header>
  );
}
