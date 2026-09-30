import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SourceTagList } from "@/components/ui/source-tag";

export const metadata: Metadata = { title: "Events" };

// Stub (wave 0). Wave 3 builds the events list from the feed service, with filters and a source tag per item.
export default function EventsPage() {
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
