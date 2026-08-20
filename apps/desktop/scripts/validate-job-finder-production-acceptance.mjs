import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_LATENCY_BUDGETS,
  digestSeed,
  SYNTHETIC_SEED,
  SYNTHETIC_SEED_DIGEST,
  stableJson,
} from "./release-acceptance-harness.mjs";
import {
  DESKTOP_BUILD_ARGS,
  resolveBuildInvocation,
} from "./resolve-build-invocation.mjs";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const files = [
  "release-acceptance-harness.mjs",
  "resolve-build-invocation.mjs",
  "run-job-finder-production-acceptance.mjs",
  "capture-fresh-flows.mjs",
  "capture-scale-500.mjs",
  "capture-job-finder-error-recovery.mjs",
];
for (const fileName of files) {
  const filePath = path.join(scriptDir, fileName);
  const result = await execFileAsync(process.execPath, ["--check", filePath], {
    windowsHide: true,
  });
  assert(
    !result.stderr,
    `${fileName} failed syntax validation: ${result.stderr}`,
  );
}

assert(
  stableJson({ b: 2, a: 1 }) === stableJson({ a: 1, b: 2 }),
  "Stable JSON hashing is not key-order independent.",
);
assert(
  digestSeed(SYNTHETIC_SEED) === SYNTHETIC_SEED_DIGEST,
  "Synthetic seed digest is not deterministic.",
);
const wrapper = await readFile(
  path.join(scriptDir, "run-job-finder-production-acceptance.mjs"),
  "utf8",
);
const errorRecovery = await readFile(
  path.join(scriptDir, "capture-job-finder-error-recovery.mjs"),
  "utf8",
);
const resolver = await readFile(
  path.join(scriptDir, "resolve-build-invocation.mjs"),
  "utf8",
);
assert(
  resolver.includes(
    'export const DESKTOP_BUILD_ARGS = Object.freeze(["--filter", "@unemployed/desktop", "build"])',
  ),
  "Acceptance resolver does not have one explicit desktop build command.",
);
assert(
  resolver.includes("environment.npm_execpath"),
  "Acceptance resolver does not prefer npm_execpath when a cached pnpm entry point is supplied.",
);
assert(
  resolver.includes("nodeExecutable"),
  "Acceptance resolver does not run a cached JavaScript package-manager entry point through Node.",
);
assert(
  resolver.includes('source: "npm_execpath"') &&
    resolver.includes('source: "path-fallback"'),
  "Acceptance resolver does not record both package-manager resolution paths.",
);
assert(
  resolver.includes('platform === "win32" ? "pnpm.cmd" : "pnpm"'),
  "Acceptance resolver has no explicit pnpm PATH fallback.",
);
assert(
  stableJson(DESKTOP_BUILD_ARGS) ===
    stableJson(["--filter", "@unemployed/desktop", "build"]),
  "Acceptance resolver changed the desktop build arguments.",
);
const cachedResolverProbe = resolveBuildInvocation({
  environment: { npm_execpath: path.join(scriptDir, "pnpm.cjs") },
  platform: "win32",
  nodeExecutable: "C:/node/node.exe",
  repositoryRoot: path.dirname(scriptDir),
  fileExists: () => true,
});
assert(
  cachedResolverProbe.source === "npm_execpath" &&
    cachedResolverProbe.command === "C:/node/node.exe",
  "Acceptance resolver did not select the cached npm_execpath through Node.",
);
assert(
  cachedResolverProbe.args[0].toLowerCase().endsWith("pnpm.cjs"),
  "Acceptance resolver did not pass the cached pnpm JavaScript entry point.",
);
const fallbackResolverProbe = resolveBuildInvocation({
  environment: {},
  platform: "win32",
  nodeExecutable: "C:/node/node.exe",
  repositoryRoot: path.dirname(scriptDir),
  fileExists: () => false,
});
assert(
  fallbackResolverProbe.source === "path-fallback" &&
    fallbackResolverProbe.command === "pnpm.cmd",
  "Acceptance resolver fallback is not explicit and deterministic.",
);
assert(
  wrapper.includes("resolveBuildInvocation"),
  "Acceptance wrapper does not use the package-manager resolver.",
);
assert(
  wrapper.includes("rendererUrlEnvironmentRemoved: true"),
  "Acceptance wrapper does not record renderer URL isolation.",
);
assert(
  wrapper.includes(
    "afterRunArtifacts.digest === acceptanceReport.artifacts.digest",
  ),
  "Acceptance wrapper does not rehash build artifacts after capture.",
);
assert(
  wrapper.includes("entry.pass === true"),
  "Acceptance wrapper does not require pass=true for every capture.",
);
assert(
  wrapper.includes("Array.isArray(entry.failures) && entry.failures.length === 0"),
  "Acceptance wrapper does not require an explicit empty capture-failures list.",
);
assert(
  wrapper.includes("entry.insideViewport === true"),
  "Acceptance wrapper does not require insideViewport=true.",
);
assert(
  wrapper.includes("entry.noClip === true"),
  "Acceptance wrapper does not require noClip=true.",
);
assert(
  wrapper.includes("Array.isArray(report.requiredScenarioCompletionIds)") &&
    wrapper.includes("Array.isArray(report.scenarioCompletionIds)"),
  "Acceptance wrapper does not require explicit required/completed scenario lists.",
);
assert(
  wrapper.includes("CANONICAL_LATENCY_BUDGETS") &&
    wrapper.includes("EXPECTED_SCALE_ROUTE_SWITCH_COUNT") &&
    wrapper.includes("Number.isFinite(rendererTiming.start)"),
  "Acceptance wrapper does not enforce canonical route/latency timing evidence.",
);
assert(
  stableJson(CANONICAL_LATENCY_BUDGETS) ===
    stableJson({ coldToUsableShellMs: 2_000, warmRouteSwitchMs: 500 }),
  "Canonical acceptance latency budgets changed unexpectedly.",
);
assert(
  wrapper.includes("real wheel-and-keyboard scroll-chain proof"),
  "Acceptance wrapper does not enforce real scroll-chain evidence.",
);
for (const fileName of [
  "capture-fresh-flows.mjs",
  "capture-scale-500.mjs",
  "capture-job-finder-error-recovery.mjs",
]) {
  const source = await readFile(path.join(scriptDir, fileName), "utf8");
  assert(
    source.includes("ensureFreshOutputDir"),
    `${fileName} does not reject stale output directories.`,
  );
  assert(
    source.includes("verifyAcceptanceArtifacts"),
    `${fileName} does not bind captures to the exact build.`,
  );
  assert(
    source.includes("assertFileRenderer"),
    `${fileName} does not enforce the file renderer.`,
  );
  assert(
    source.includes("screenshotMetadata"),
    `${fileName} does not record screenshot evidence metadata.`,
  );
  assert(
    !source.includes("re-audit-2026-08-20"),
    `${fileName} still uses a fixed stale artifact directory.`,
  );
}
const scaleSource = await readFile(
  path.join(scriptDir, "capture-scale-500.mjs"),
  "utf8",
);
assert(
  scaleSource.includes("requiredRecordCount: 1_001"),
  "Scale acceptance no longer crosses the historical 1,000-record boundary.",
);
assert(
  scaleSource.includes('phase === "complete"'),
  "Scale acceptance asserts counts before hydration completes.",
);
assert(
  scaleSource.includes("CANONICAL_LATENCY_BUDGETS"),
  "Scale acceptance has no hard canonical latency budgets.",
);
assert(
  scaleSource.includes("rendererTiming"),
  "Scale acceptance does not capture actual warm-route timing marks.",
);
const freshSource = await readFile(
  path.join(scriptDir, "capture-fresh-flows.mjs"),
  "utf8",
);
assert(
  !freshSource.includes("linkedin.com"),
  "Fresh acceptance still uses a real-looking LinkedIn URL for synthetic data.",
);
assert(
  !freshSource.includes('filter((c) => !c.label.includes("Settings"))'),
  "Fresh acceptance still excludes Settings at 200%.",
);
assert(
  !freshSource.includes("more-menu-zoom200-fallback"),
  "Fresh acceptance still has a fallback More-menu capture.",
);
assert(
  freshSource.includes("page.mouse.wheel"),
  "Fresh acceptance does not exercise real wheel scrolling.",
);
assert(
  freshSource.includes('page.keyboard.press("PageDown")'),
  "Fresh acceptance does not exercise keyboard scrolling.",
);
const safetySource = await readFile(
  path.join(scriptDir, "release-acceptance-harness.mjs"),
  "utf8",
);
assert(
  safetySource.includes("Notifications and actions"),
  "Safety probe does not cover notifications/actions.",
);
assert(
  /document\.addEventListener\(\s*["']keydown["']/.test(safetySource),
  "Safety probe does not observe keyboard risk events.",
);
for (const requiredSafetyToken of [
  "preventDefault",
  "stopImmediatePropagation",
  'window.open',
  'requestSubmit',
  '"submit"',
]) {
  assert(
    safetySource.includes(requiredSafetyToken),
    `Safety probe does not intercept ${requiredSafetyToken}.`,
  );
}
for (const requiredErrorToken of [
  "REQUIRED_SCENARIO_COMPLETION_IDS",
  "requiredScenarioCompletionIds",
  "scenarioCompletionIds",
  "scenarioId",
  "insideViewport",
  "noClip",
  "failures",
  "pass",
  "completeScenario",
]) {
  assert(
    errorRecovery.includes(requiredErrorToken),
    `Error/recovery capture is missing ${requiredErrorToken}.`,
  );
}
process.stdout.write(
  "Job Finder production-acceptance harness static validation passed.\n",
);
