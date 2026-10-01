// Starts the production server for Playwright: an in-memory MongoDB and `next start -p $E2E_PORT` pointed at it.
// playwright.config.ts picks the database: with E2E_START_MONGO=<port> it has set E2E_MONGODB_URI to
// mongodb://127.0.0.1:<port>/… for the server and the test workers alike, and the in-memory server is started on
// that port here; otherwise E2E_MONGODB_URI is an outside MongoDB (used as is), and without either (serve.mjs run
// by hand) an in-memory one on a free port. Stops both when either exits or when Playwright sends SIGTERM.
// With EXTERNAL_MODE=fixtures (always, from playwright.config.ts) the server process preloads fetch-guard.mjs, so
// an outbound fetch to anything but localhost fails instead of reaching a real upstream.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { MongoMemoryServer } from "mongodb-memory-server";

const require = createRequire(import.meta.url);
const port = process.env.E2E_PORT ?? "3210";

let mongo;
let mongoUri = process.env.E2E_MONGODB_URI;
const mongoPort = Number(process.env.E2E_START_MONGO);
if (mongoUri && Number.isInteger(mongoPort) && mongoPort > 0) {
  mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", port: mongoPort } });
  console.log(`[e2e] in-memory MongoDB at ${mongoUri}`);
} else if (!mongoUri) {
  mongo = await MongoMemoryServer.create();
  mongoUri = mongo.getUri("makeitso-e2e");
  console.log(`[e2e] in-memory MongoDB at ${mongoUri}`);
}

const guard =
  process.env.EXTERNAL_MODE === "fixtures"
    ? `--import=${new URL("./fetch-guard.mjs", import.meta.url).href}`
    : "";
const nodeOptions = [process.env.NODE_OPTIONS, guard].filter(Boolean).join(" ");

const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, MONGODB_URI: mongoUri, NODE_OPTIONS: nodeOptions },
});

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  if (next.exitCode === null) next.kill("SIGTERM");
  await mongo?.stop().catch(() => undefined);
  process.exit(code);
}

next.on("exit", (code) => void stop(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void stop(0));
