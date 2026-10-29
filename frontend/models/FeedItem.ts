import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { FEED_SOURCE_IDS } from "@/lib/types/feeds";

/**
 * One normalised feed entry (lib/types/feeds.ts FeedItem; owner W4a), collection `feeditems`, keyed by
 * (source, externalId). Written only by server/feeds (syncFeeds) and read through listEvents / listNews, which map
 * documents to the wire FeedItem.
 *
 * - Text only (feed HTML becomes text); `url` is https on the source's allow-listed hosts (server/feeds/urls.ts).
 * - `channel` is the logical upstream feed inside the source ("events", "news", "issues"): a successful
 *   sync of one channel may prune that channel's vanished upcoming items; a failing channel never touches its
 *   stored items (the last good copy stays).
 * - `searchText` is title + location + summary folded to lower case without diacritics, for `q` filtering.
 * - `expiresAt` drives the TTL index: 60 days after the item ends (endsAt, else startsAt, else fetchedAt).
 * - Rows of kind "hours" (LibCal opening hours, no longer synced) may linger until their TTL: every read filters
 *   on event / deadline / news, so they are never served.
 */

const FeedItemSchema = new Schema(
  {
    source: { type: String, enum: FEED_SOURCE_IDS, required: true },
    /** Upstream UID / guid / id, unique within the source (recurrence instances: "<uid>#<start ISO>"). */
    externalId: { type: String, required: true, maxlength: 512 },
    /** Logical upstream feed inside the source ("events", "news", "issues"). */
    channel: { type: String, required: true, default: "events", maxlength: 40 },
    kind: { type: String, enum: ["event", "news", "deadline"], required: true },
    title: { type: String, required: true, maxlength: 300 },
    url: { type: String, required: true, maxlength: 2048 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    location: { type: String, default: null, maxlength: 200 },
    summaryText: { type: String, default: null, maxlength: 500 },
    /** Folded title + location + summary for text filtering (server/feeds/text.ts foldForSearch). */
    searchText: { type: String, default: "", maxlength: 1200 },
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
FeedItemSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FeedItemDoc = InferSchemaType<typeof FeedItemSchema>;
export type FeedItemDocument = HydratedDocument<FeedItemDoc>;

const FeedItem: Model<FeedItemDoc> =
  (mongoose.models.FeedItem as Model<FeedItemDoc> | undefined) ??
  mongoose.model<FeedItemDoc>("FeedItem", FeedItemSchema);

export default FeedItem;
