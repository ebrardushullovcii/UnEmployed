import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  digestSeed,
  verifySealedAcceptanceBootstrap,
} from "./release-acceptance-harness.mjs";
import { readFile } from "node:fs/promises";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const optionValue = (name) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : null;
  if (!value || value.startsWith("--"))
    throw new Error(`Missing required ${name}.`);
  return value;
};
if (!args.includes("--help") && !args.includes("-h")) {
  const custodyPath = path.resolve(optionValue("--custody-index"));
  const custody = JSON.parse(await readFile(custodyPath, "utf8"));
  const subject = { ...custody };
  delete subject.custodyIndexSha256;
  if (digestSeed(subject) !== custody.custodyIndexSha256)
    throw new Error("Tester bootstrap custody index digest mismatch.");
  await verifySealedAcceptanceBootstrap({
    runDir: custody.build?.runDir,
    expectedSealSha256: custody.build?.finalSealSha256,
  });
}
const { createServer } = await import("vite");
const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  root: path.resolve(scriptDirectory, ".."),
  server: { middlewareMode: true },
});

try {
  const api = await server.ssrLoadModule(
    path.join(scriptDirectory, "prepare-blind-persona-workspaces.ts"),
  );
  const options = api.parseBlindPersonaTesterCli(args);
  if (!options) process.stdout.write(`${api.BLIND_PERSONA_TESTER_HELP}\n`);
  else {
    const session = await api.launchBlindPersonaTester(options);
    process.stdout.write(
      `${JSON.stringify(
        {
          attempt: session.attempt,
          driverChannel: session.driverChannel,
          launchRecordPath: session.launchRecordPath,
          pid: session.pid,
          testerBrief: session.testerBrief,
          testerBriefPath: session.launchRecordPath,
        },
        null,
        2,
      )}\n`,
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
    await session.close();
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
