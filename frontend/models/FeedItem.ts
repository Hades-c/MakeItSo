import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { FEED_SOURCE_IDS } from "@/lib/types/feeds";

/**
 * One normalised feed entry (lib/types/feeds.ts FeedItem; owner W4a), collection `feeditems`, keyed by
 * (source, externalId). Written only by server/feeds (syncFeeds) and read through listEvents / listNews /
 * getLibraryHours, which map documents to the wire FeedItem.
 *
 * - Text only (feed HTML becomes text); `url` is https on the source's allow-listed hosts (server/feeds/urls.ts).
 * - `channel` is the logical upstream feed inside the source ("events", "news", "hours", "issues"): a successful
 *   sync of one channel may prune that channel's vanished upcoming items; a failing channel never touches its
 *   stored items (the last good copy stays).
 * - `searchText` is title + location + summary folded to lower case without diacritics, for `q` filtering.
 * - `hours` is set only on kind "hours" (LibCal opening hours of one location on one America/New_York date).
 * - `expiresAt` drives the TTL index: 60 days after the item ends (endsAt, else startsAt, else fetchedAt).
 */
const LibraryHoursDetailSchema = new Schema(
  {
    /** America/New_York calendar date, "YYYY-MM-DD". */
    date: { type: String, required: true },
    /** LibCal location id (lid). */
    locationId: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "closed", "24hours", "text", "not-set"],
      required: true,
    },
    /** LibCal's rendered text ("7am - 11:59pm", "Closed for Renovation"); "" when not set. */
    text: { type: String, default: "", maxlength: 200 },
    /** Position in LibCal's list, so locations keep the upstream order. */
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const FeedItemSchema = new Schema(
  {
    source: { type: String, enum: FEED_SOURCE_IDS, required: true },
    /** Upstream UID / guid / id, unique within the source (recurrence instances: "<uid>#<start ISO>"). */
    externalId: { type: String, required: true, maxlength: 512 },
    /** Logical upstream feed inside the source ("events", "news", "hours", "issues"). */
    channel: { type: String, required: true, default: "events", maxlength: 40 },
    kind: { type: String, enum: ["event", "news", "deadline", "hours"], required: true },
    title: { type: String, required: true, maxlength: 300 },
    url: { type: String, required: true, maxlength: 2048 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    location: { type: String, default: null, maxlength: 200 },
    summaryText: { type: String, default: null, maxlength: 500 },
    /** Folded title + location + summary for text filtering (server/feeds/text.ts foldForSearch). */
    searchText: { type: String, default: "", maxlength: 1200 },
    hours: { type: LibraryHoursDetailSchema, default: null },
    /** Hash of the normalised fields (skip rewrites when unchanged). */
    contentHash: { type: String, default: null },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { collection: "feeditems", timestamps: true },
);

FeedItemSchema.index({ source: 1, externalId: 1 }, { unique: true });
FeedItemSchema.index({ startsAt: 1, source: 1 });
FeedItemSchema.index({ kind: 1, startsAt: 1 });
FeedItemSchema.index({ source: 1, channel: 1, startsAt: 1 });
FeedItemSchema.index({ kind: 1, "hours.date": 1 });
FeedItemSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FeedItemDoc = InferSchemaType<typeof FeedItemSchema>;
export type FeedItemDocument = HydratedDocument<FeedItemDoc>;

const FeedItem: Model<FeedItemDoc> =
  (mongoose.models.FeedItem as Model<FeedItemDoc> | undefined) ??
  mongoose.model<FeedItemDoc>("FeedItem", FeedItemSchema);

export default FeedItem;
