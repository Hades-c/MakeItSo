// Unit and integration tests never use the network (PLAN §4.1.10): outside services come from
// tests/fixtures/external through fetchExternal (EXTERNAL_MODE=fixtures). Any real fetch to a non-local host fails
// loudly here. Tests that need a fake upstream stub fetch with vi.stubGlobal, which replaces this guard.
const realFetch = globalThis.fetch;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Network access in a unit test: ${url.origin}. Use fixtures or stub fetch.`);
  }
  return realFetch(input, init);
}) as typeof fetch;
