import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(import.meta.dirname, "..");
const rootManifest = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);
const packageManager = rootManifest.packageManager;

if (typeof packageManager !== "string" || !packageManager.startsWith("pnpm@")) {
  console.error(
    "Root package.json must pin pnpm through packageManager before Turbo can run",
  );
  process.exit(1);
}

const nodeDir = path.dirname(process.execPath);
const corepackEntrypoint = path.join(
  nodeDir,
  "node_modules",
  "corepack",
  "dist",
  "corepack.js",
);

if (!fs.existsSync(corepackEntrypoint)) {
  console.error(
    `Corepack entrypoint not found beside Node.js: ${corepackEntrypoint}`,
  );
  process.exit(1);
}

const pathKey =
  Object.keys(process.env).find((key) => key.toLowerCase() === "path") ??
  "PATH";
const inheritedPath = process.env[pathKey] ?? "";
const env = {
  ...process.env,
  [pathKey]: [nodeDir, inheritedPath].filter(Boolean).join(path.delimiter),
};

const result = spawnSync(
  process.execPath,
  [
    corepackEntrypoint,
    packageManager,
    "exec",
    "turbo",
    ...process.argv.slice(2),
  ],
  {
    cwd: rootDir,
    env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
