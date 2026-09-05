import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createServer } from "vite";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = path.dirname(path.dirname(packageRoot));
dotenv.config({
  path: path.join(repositoryRoot, ".env.local"),
  override: false,
});

const server = await createServer({
  root: packageRoot,
  logLevel: "silent",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const benchmark = await server.ssrLoadModule("/src/cli.ts");
  await benchmark.runAiEvalCli(process.argv.slice(2));
} finally {
  await server.close();
}
