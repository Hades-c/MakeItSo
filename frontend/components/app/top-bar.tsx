import Link from "next/link";
import { Search } from "lucide-react";
import { SearchForm } from "./search-form";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Wordmark } from "./wordmark";

export interface TopBarProps {
  user: { name: string; email: string };
}

/** Sticky 64px top bar (58px on phones): wordmark, ⌘K search, theme toggle, avatar menu. */
export function TopBar({ user }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14.5 items-center gap-2.5 border-b border-line bg-surface px-4 md:h-16 md:gap-5 md:px-6">
      <Link
        href="/today"
        aria-label="MakeItSo, Davidson College: Today"
        className="-m-1 shrink-0 rounded-md p-1 xl:w-56"
      >
        <Wordmark />
      </Link>
      <SearchForm className="max-w-140 flex-1 max-md:hidden" />
      <div className="ml-auto flex items-center gap-2.5">
        <Link
          href="/courses"
          aria-label="Search courses"
          className="grid size-11 place-items-center rounded-md border border-line bg-surface text-fg-2 hover:bg-surface-2 md:hidden"
        >
          <Search aria-hidden strokeWidth={1.8} className="size-4.5" />
        </Link>
        <ThemeToggle />
        <UserMenu name={user.name} email={user.email} />
      </div>
    </header>
  );
}
