import localFont from "next/font/local";

// Classic MakeItSo type (owner's decision, 2026-10-25): Inter for UI and body, Playfair Display (bold) for the
// wordmark, page titles and card/section titles (the `font-display` utility), IBM Plex Mono only for course codes,
// CRNs and the verification code. Self-hosted from the @fontsource packages through next/font/local (preloaded,
// size-adjusted fallbacks), so the build needs no network (PLAN §4.1: build and CI never touch the network) and the
// browser never calls Google (CSP font-src 'self'). All three fonts are SIL Open Font License 1.1.
const sans = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});
// One static weight: Playfair is only ever set bold. Preloaded, since every page's h1 (and the wordmark) uses it:
// with the preload it arrives before first paint, without it the h1 (the LCP element) swaps from the fallback about
// half a second later on a slow phone connection; the preload costs about 70-90ms of first paint there.
const display = localFont({
  src: "../node_modules/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2",
  weight: "700",
  style: "normal",
  variable: "--font-playfair",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
const mono = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  // Not preloaded: codes appear on some pages only, and preloading all three weights everywhere cost about 200ms of
  // first paint on a slow phone connection (sign-in page, 150ms RTT, 1.6 Mbps) for a face most pages never use.
  preload: false,
  // Metric overrides are computed against Arial, which only suits the proportional face.
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

/**
 * The three fonts' CSS variables (--font-inter, --font-playfair, --font-plex-mono), for an <html> className. Both
 * documents set them: the root layout and global-error, which renders its own <html> when the layout fails.
 */
export const fontVariables = `${sans.variable} ${display.variable} ${mono.variable}`;
