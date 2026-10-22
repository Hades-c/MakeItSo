/** "Casey Wildcat" → "CW"; falls back to the email's first letter. */
export function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[words.length - 1]?.[0] ?? ""}`
      : (words[0]?.slice(0, 2) ?? "");
  return (letters || email.slice(0, 1) || "?").toUpperCase();
}

/** The avatar button: the menu's trigger, and LazyUserMenu's placeholder until the menu has loaded. */
export const USER_MENU_TRIGGER_CLASS =
  "grid size-11 shrink-0 place-items-center rounded-full border border-line-2 bg-sand text-sm font-strong text-fg transition-colors hover:border-line-strong md:size-9.5";
