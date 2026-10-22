import { aiApi } from "@/lib/api/ai";
import { purgeEntries } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/admin/purge { feature, key? } → { purged } (lib/api/ai.ts). ADMIN_EMAILS with a verified mailbox:
// deletes one cached entry (e.g. a hidden, reported one) or every entry of a feature.
export const POST = defineRoute(aiApi.purge, async ({ body }) => ({
  purged: await purgeEntries(body),
}));
