import { describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => sonner);

describe("notify (sonner on demand)", () => {
  it("loads sonner with the first toast and shows every message", async () => {
    const { notify } = await import("@/components/ui/notify");
    notify.success("Removed CSC 221 from your plan.");
    notify.warning("Already completed in Fall 2025.");
    await vi.waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Removed CSC 221 from your plan.");
      expect(sonner.toast.warning).toHaveBeenCalledWith("Already completed in Fall 2025.");
    });
  });
});
