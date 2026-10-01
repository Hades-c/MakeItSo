import { ExternalLink } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { quickLinks } from "@/server/today";

/**
 * Quick links (PLAN §3): the Davidson portals and tools students open most, from the curated links
 * (server/content/links.ts). The platforms with a source tag (Davidson One, Handshake) show it; the others are
 * plain links to davidson.edu services.
 */
export function QuickLinks() {
  const links = quickLinks();
  return (
    <SectionCard id="quick-links" title="Quick links">
      <div className="@container">
        <ul className="grid grid-cols-1 gap-2 @min-[26rem]:grid-cols-2">
          {links.map((link) => (
            <li key={link.slug} {...(link.source ? { "data-aggregated": link.source } : {})}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-2"
              >
                <span className="min-w-0 break-words">
                  {link.name} <span className="sr-only">(opens in a new tab)</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {link.source ? <SourceTag source={link.source} /> : null}
                  <ExternalLink aria-hidden className="size-3.5 text-fg-3" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}
