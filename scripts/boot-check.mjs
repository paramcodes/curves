// Boot check — imports every package's public entry and asserts the wiring holds,
// then constructs the db layer for real (migrations + every repo + the rollover job).
// Node 26 imports the .ts entries natively (type stripping, erasable syntax only);
// the db wiring runs through tsx (its modules use extensionless relative imports).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const fail = (message) => {
  console.error(`boot-check: FAIL — ${message}`);
  process.exit(1);
};

if (!existsSync(join(root, ".env.example"))) {
  fail(".env.example is missing (canonical env contract)");
}

const entries = [
  { path: "../packages/domain/src/entry.ts", packageName: "@curves/domain", booted: false },
  { path: "../packages/db/src/entry.ts", packageName: "@curves/db", booted: true },
  { path: "../packages/api/src/entry.ts", packageName: "@curves/api", booted: true },
  { path: "../packages/ui/src/entry.ts", packageName: "@curves/ui", booted: true },
  { path: "../apps/web/src/entry.ts", packageName: "web", booted: true },
];

for (const entry of entries) {
  let module;
  try {
    module = await import(entry.path);
  } catch (error) {
    fail(`${entry.path} failed to import: ${error}`);
  }
  if (module.packageName !== entry.packageName) {
    fail(`${entry.path}: expected packageName "${entry.packageName}", got "${module.packageName}"`);
  }
  if (entry.booted && module.booted !== true) {
    fail(`${entry.path}: expected booted === true, got ${module.booted}`);
  }
}

// Phase 1: construct schema + repositories + job against a throwaway pglite db.
const wiring = spawnSync("pnpm", ["--filter", "@curves/db", "exec", "tsx", "src/boot-wiring.ts"], {
  cwd: root,
  stdio: "inherit",
});
if (wiring.status !== 0) {
  fail("db boot wiring failed (migrations + repos + rollover job did not construct)");
}

// Phase 2: construct the full appRouter and drive one procedure through a caller.
const apiWiring = spawnSync(
  "pnpm",
  ["--filter", "@curves/api", "exec", "tsx", "src/boot-wiring.ts"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (apiWiring.status !== 0) {
  fail("api boot wiring failed (appRouter did not construct or health.check failed)");
}

console.log("boot-check: OK (entries + db wiring + appRouter)");
