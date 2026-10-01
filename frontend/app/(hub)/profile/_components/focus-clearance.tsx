/**
 * Keeps keyboard focus clear of the fixed bars (WCAG 2.2 SC 2.4.11 Focus Not Obscured) on the page that renders
 * it: below 48rem the fixed bottom tabs (≈63px plus the home-indicator inset) cover the bottom of the viewport, and
 * the sticky top bar (58–64px) covers the top at every width. Browsers scroll a newly focused control into view
 * only when it is outside the viewport, not when it is under a fixed bar, unless the root scroller has
 * scroll-padding (scroll-margin on the control is ignored for focus in Chromium).
 *
 * A plain <style> element rendered in place, so it applies only while the page is mounted and leaves with it on a
 * client navigation. contractRequest: move these rules to app/globals.css (html) for every page, then drop this.
 */
const CSS = `html { scroll-padding-top: 4.5rem; }
@media (width < 48rem) {
  html { scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom)); }
}`;

export function FocusClearance() {
  return <style data-focus-clearance="">{CSS}</style>;
}
