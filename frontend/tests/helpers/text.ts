/**
 * What a sighted reader sees and what a screen reader says, for component tests: the element's text without the
 * `.sr-only` parts (seen) or without the `aria-hidden` parts (spoken). Element boundaries count as spaces (a
 * screen reader pauses there too); whitespace is collapsed and no space is left before , ; : ) or a period, or
 * after (.
 */
function textWithout(element: Element, selector: string): string {
  const copy = element.cloneNode(true) as Element;
  for (const node of copy.querySelectorAll(selector)) node.remove();
  const parts: string[] = [];
  const walker = copy.ownerDocument.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    parts.push(node.nodeValue ?? "");
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/ ([,;:.)])/g, "$1")
    .replace(/\( /g, "(")
    .trim();
}

export const seenText = (element: Element) => textWithout(element, ".sr-only");
export const spokenText = (element: Element) => textWithout(element, '[aria-hidden="true"]');
