import { ExternalLink } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { quickLinks, safely } from "@/server/today";
import { PanelError } from "./panel-states";

/**
 * Quick links (PLAN §3): the Davidson portals and tools students open most, from the curated links
 * (server/content/links.ts). The platforms with a source tag (Davidson One, Handshake) show it; the others are
 * plain links to davidson.edu services.
 */
export function QuickLinks() {
  const links = safely("the quick links", () => quickLinks());
  if (!links) return <PanelError id="quick-links" title="Quick links" what="Quick links" />;
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
                className="flex min-h-11 items-start justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-2"
              >
                {/* The tag goes under the name, so a two-column card never squeezes the name mid-word. */}
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <span className="break-normal">
                    {link.name} <span className="sr-only">(opens in a new tab)</span>
                  </span>
                  {link.source ? <SourceTag source={link.source} /> : null}
                </span>
                <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-3" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}
