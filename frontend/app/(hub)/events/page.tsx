import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SourceTagList } from "@/components/ui/source-tag";
import { featureMetadata, requireFeature } from "@/server/features";

// Stub (wave 0). Wave 3 builds the events list from the feed service, with filters and a source tag per item.
// Behind FEATURE_EVENTS (404 while it is off; the shell hides Events then): keep featureMetadata() as
// generateMetadata (a static `metadata` would title the 404 "Events") and requireFeature() as the page's first line.
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("events", { title: "Events" });
}

export default async function EventsPage() {
  await requireFeature("events");
  return (
    <>
      <PageHeader
        title="Events"
        subtitle="What is happening on campus, from every calendar, in one list."
      />
      <EmptyState
        icon={CalendarDays}
        title="Campus events are coming soon"
        description={
          <p>
            Events from WildcatSync, the Hurt Hub, the library and The Davidsonian will appear here,
            each labelled with its source.
          </p>
        }
      >
        <SourceTagList
          label="Sources for events"
          className="justify-center"
          sources={["wildcatsync", "hurt-hub", "library", "davidsonian", "events-digest"]}
        />
      </EmptyState>
    </>
  );
}
