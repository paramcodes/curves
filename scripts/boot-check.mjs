// Boot check — imports every package's public entry and asserts the wiring holds.
// Skeleton edition: real boot content arrives with Phases 1-2.
// Node 26 imports the .ts entries natively (type stripping, erasable syntax only).
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

console.log("boot-check: OK (skeleton)");
