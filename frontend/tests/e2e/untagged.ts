/**
 * The only reasons an item marked `data-aggregated="untagged"` may be shown without a SourceTag (its
 * `data-untagged` attribute). Mirrors UNTAGGED_EXEMPTIONS in app/(hub)/careers/_lib/resources.ts, which the e2e
 * helpers cannot import (it is server-only); tests/w9a/resources.test.ts checks the two lists are the same.
 *
 *   davidson-web  an academic department's or institute's page on www.davidson.edu: no curated SourceId covers
 *                 those yet (contractRequest), so the item says "davidson.edu page" in plain text.
 */
export const E2E_UNTAGGED_EXEMPTIONS: readonly string[] = ["davidson-web"];
