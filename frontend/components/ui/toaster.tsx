"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Toasts (sonner), styled with Lakeside tokens. Shown at the top so nothing but the tab bar is ever fixed to the
 * bottom of a phone screen. Use `import { toast } from "sonner"` to show one.
 */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={{ top: 76 }}
      mobileOffset={{ top: 66, left: 16, right: 16 }}
      closeButton
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-3.5 text-sm text-fg shadow-pop md:w-(--width)",
          title: "font-semibold",
          description: "mt-0.5 text-fg-2",
          icon: "mt-0.5 [&_svg]:size-4",
          success: "[&_[data-icon]]:text-success",
          error: "border-danger [&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-primary",
          actionButton:
            "ml-auto h-8 shrink-0 rounded-md bg-primary-fill px-3 text-xs font-semibold text-on-primary",
          cancelButton:
            "ml-auto h-8 shrink-0 rounded-md bg-surface-2 px-3 text-xs font-semibold text-fg-2",
          closeButton:
            "grid size-6 place-items-center rounded-full border border-line bg-surface text-fg-3 hover:text-fg",
        },
      }}
    />
  );
}
