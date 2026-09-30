// Preloaded into the e2e `next start` process (tests/e2e/serve.mjs) when EXTERNAL_MODE=fixtures. Every outside
// service must come from tests/fixtures/external through fetchExternal (PLAN §4.1.10), which never calls fetch in
// fixtures mode, so any outbound fetch from the server to a non-local host is a bug: it fails loudly here instead
// of quietly reaching a real upstream from CI.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const realFetch = globalThis.fetch;

function targetHost(input) {
  try {
    const url =
      typeof input === "string" || input instanceof URL ? new URL(input) : new URL(input.url);
    return { host: url.hostname, origin: url.origin };
  } catch {
    return null; // not an absolute URL: let fetch itself reject it
  }
}

globalThis.fetch = async function fixturesOnlyFetch(input, init) {
  const target = targetHost(input);
  if (target && !LOCAL_HOSTS.has(target.host)) {
    const message = `[e2e] blocked outbound fetch to ${target.origin}: EXTERNAL_MODE=fixtures serves outside services from tests/fixtures/external (use fetchExternal and add a fixture)`;
    console.error(message);
    throw new TypeError(message);
  }
  return realFetch(input, init);
};
