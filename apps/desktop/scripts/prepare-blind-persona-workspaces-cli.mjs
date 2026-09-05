import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifySealedAcceptanceBootstrap } from "./release-acceptance-harness.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const apiPath = path.join(
  scriptDirectory,
  "prepare-blind-persona-workspaces.ts",
);
const args = process.argv.slice(2);
const optionValue = (name) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : null;
  if (!value || value.startsWith("--"))
    throw new Error(`Missing required ${name}.`);
  return value;
};
const verifyAll = args.includes("--verify-all");
if (!args.includes("--help") && !args.includes("-h")) {
  if (verifyAll) {
    // Read-only custody re-check: no sealed build bootstrap is required; the
    // custody index self-digest is verified inside the API before use.
    optionValue("--custody-index");
  } else {
    await verifySealedAcceptanceBootstrap({
      runDir: path.resolve(optionValue("--acceptance-run-dir")),
      expectedSealSha256: optionValue("--expected-seal-sha256"),
    });
  }
}
const { createServer } = await import("vite");
const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  root: desktopRoot,
  server: { middlewareMode: true },
});

try {
  const api = await server.ssrLoadModule(apiPath);
  if (verifyAll) {
    const options = api.parseBlindPersonaVerifyAllCli(args);
    if (!options) {
      process.stdout.write(`${api.BLIND_PERSONA_VERIFY_ALL_HELP}\n`);
    } else {
      const outcome = await api.verifyAllPreparedPersonaWorkspaces(options);
      for (const row of outcome.results) {
        process.stdout.write(
          row.ok
            ? `ok ${row.personaId}\n`
            : `FAIL ${row.personaId}: ${row.error}\n`,
        );
      }
      process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
      if (outcome.failures > 0) process.exitCode = 1;
    }
  } else {
    const options = api.parseBlindPersonaSeedCli(args);
    if (!options) {
      process.stdout.write(`${api.BLIND_PERSONA_SEED_HELP}\n`);
    } else {
      const result = await api.prepareBlindPersonaWorkspaces(options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
