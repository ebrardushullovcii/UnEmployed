import path from "node:path";
import { fileURLToPath } from "node:url";

// Blind original-vs-generated resume comparison CLI. Pure fs + validation: no
// acceptance bootstrap, no network, no Electron. Backed by
// blind-resume-comparison-harness.ts through the same vite ssrLoadModule
// pattern as the sibling persona CLIs.

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const apiPath = path.join(
  scriptDirectory,
  "blind-resume-comparison-harness.ts",
);
const args = process.argv.slice(2);

const KNOWN_COMMANDS = new Set(["init", "record", "aggregate"]);
// Any unrecognized leading token fails closed before anything loads -- an
// unknown subcommand word OR flags-first input (only --help/-h are exempt).
// Bare help requests still print help successfully.
const first = typeof args[0] === "string" ? args[0] : undefined;
const malformedFirstInput =
  first !== undefined &&
  first !== "--help" &&
  first !== "-h" &&
  !KNOWN_COMMANDS.has(first);
const helpRequested =
  args.includes("--help") || args.includes("-h") || args.length === 0;

if (malformedFirstInput) {
  // Malformed invocations fail closed with a nonzero exit instead of printing
  // help as if the invocation had succeeded.
  process.stderr.write(
    `Unknown blind-resume-comparison input: ${first} (expected init, record, or aggregate as the first argument); see --help.\n`,
  );
  process.exitCode = 1;
} else {
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
    if (helpRequested) {
      process.stdout.write(`${api.BLIND_RESUME_COMPARISON_HELP}\n`);
    } else {
      const options = api.parseBlindResumeComparisonCli(args);
      if (!options) {
        process.stdout.write(`${api.BLIND_RESUME_COMPARISON_HELP}\n`);
      } else if (options.command === "init") {
        // init prints no slot assignment: which variant is the original is
        // recorded only in the sealed manifest and joined at aggregate.
        const outcome = await api.initBlindResumeComparison(options);
        process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
      } else if (options.command === "record") {
        const outcome = await api.recordBlindResumeComparisonRating(options);
        process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
      } else {
        const outcome = await api.aggregateBlindResumeComparison(options);
        for (const row of outcome.failures) {
          const flatReason = row.reason.replaceAll(/\s+/gu, " ").trim();
          process.stdout.write(`REFUSED ${row.subject}: ${flatReason}\n`);
        }
        for (const reason of outcome.exitReasons) {
          process.stdout.write(`BLOCKED ${reason}\n`);
        }
        if (outcome.aggregatePath) {
          process.stdout.write(`aggregate ${outcome.aggregatePath}\n`);
        }
        if (!outcome.ok) process.exitCode = 1;
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
}
