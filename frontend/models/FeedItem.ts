import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { FEED_SOURCE_IDS } from "@/lib/types/feeds";

/**
 * One normalised feed entry (lib/types/feeds.ts FeedItem; owner W4a). Collection `feeditems`, keyed by
 * (source, externalId). Text only; https URLs on allow-listed hosts. `expiresAt` drives a TTL index so past items
 * age out (W4a sets it, e.g. endsAt/startsAt/publishedAt + 30 days).
 */
const FeedItemSchema = new Schema(
  {
    source: { type: String, enum: FEED_SOURCE_IDS, required: true },
    /** Upstream UID / guid / id, unique within the source. */
    externalId: { type: String, required: true },
    kind: { type: String, enum: ["event", "news", "deadline", "hours"], required: true },
    title: { type: String, required: true, maxlength: 300 },
    url: { type: String, required: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    location: { type: String, default: null, maxlength: 200 },
    summaryText: { type: String, default: null, maxlength: 500 },
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
FeedItemSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FeedItemDoc = InferSchemaType<typeof FeedItemSchema>;
export type FeedItemDocument = HydratedDocument<FeedItemDoc>;

const FeedItem: Model<FeedItemDoc> =
  (mongoose.models.FeedItem as Model<FeedItemDoc> | undefined) ??
  mongoose.model<FeedItemDoc>("FeedItem", FeedItemSchema);

export default FeedItem;
