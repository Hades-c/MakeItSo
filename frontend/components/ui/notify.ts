/**
 * Toasts without sonner in the page's first-load JavaScript (PLAN §6.2 perf budget): sonner loads with the first
 * toast (the Toaster itself loads lazily in app/providers.tsx). Same messages as `toast.success` / `toast.warning`.
 */
function show(kind: "success" | "warning", message: string): void {
  void import("sonner").then(({ toast }) => toast[kind](message));
}

export const notify = {
  success: (message: string) => show("success", message),
  warning: (message: string) => show("warning", message),
};
