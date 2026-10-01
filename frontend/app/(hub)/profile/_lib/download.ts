"use client";

/**
 * Hand the browser a JSON document as a file download (the "Download my data" export): a Blob URL on a temporary
 * <a download>, revoked right after the click. Nothing is stored in the page or in browser storage.
 */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser a moment to start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

/** "makeitso-data-2026-09-30.json", the name the export route itself suggests. */
export function exportFilename(exportedAt: string): string {
  return `makeitso-data-${exportedAt.slice(0, 10)}.json`;
}
