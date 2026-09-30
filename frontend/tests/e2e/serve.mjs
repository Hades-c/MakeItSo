// Starts the production server for Playwright: an in-memory MongoDB (unless E2E_MONGODB_URI is set) and
// `next start -p $E2E_PORT` pointed at it. Stops both when either exits or when Playwright sends SIGTERM.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { MongoMemoryServer } from "mongodb-memory-server";

const require = createRequire(import.meta.url);
const port = process.env.E2E_PORT ?? "3210";

let mongo;
let mongoUri = process.env.E2E_MONGODB_URI;
if (!mongoUri) {
  mongo = await MongoMemoryServer.create();
  mongoUri = mongo.getUri("wave0-e2e");
  console.log(`[e2e] in-memory MongoDB at ${mongoUri}`);
}

const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, MONGODB_URI: mongoUri },
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
