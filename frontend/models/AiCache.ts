import mongoose, { Document, Model, Schema } from "mongoose";

export interface IAiCache extends Document {
  type: string;
  cacheKey: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AiCacheSchema = new Schema<IAiCache>(
  {
    type: { type: String, required: true },
    cacheKey: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

AiCacheSchema.index({ type: 1, cacheKey: 1 }, { unique: true });

const AiCache: Model<IAiCache> =
  mongoose.models.AiCache ?? mongoose.model<IAiCache>("AiCache", AiCacheSchema);

export default AiCache;
