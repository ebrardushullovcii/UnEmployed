import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const desktopDir = path.resolve(scriptDir, "..");
export const repositoryRoot = path.resolve(desktopDir, "..", "..");
export const artifactRoot = path.resolve(desktopDir, "test-artifacts", "ui");

const SOURCE_EXCLUDES = [
  /^node_modules(?:[\\/]|$)/,
  /^(?:out|dist|build|release|coverage|\.tmp|\.turbo)(?:[\\/]|$)/,
  /^test-artifacts(?:[\\/]|$)/,
  /^(?:\.git)(?:[\\/]|$)/,
];

const ARTIFACT_ROOTS = [
  "out",
  "assets",
  path.join("dist", "resume-parser-sidecar"),
];

export const ACCEPTANCE_VERSION = 1;
export const SYNTHETIC_SEED =
  "unemployed-job-finder-production-acceptance-2026-08-20-v1";
export const SYNTHETIC_SEED_DIGEST = digestSeed(SYNTHETIC_SEED);
// These are release-gate values, not values supplied by a capture report. A
// report may include the values as evidence, but the wrapper must compare them
// with these constants before accepting the run.
export const CANONICAL_LATENCY_BUDGETS = Object.freeze({
  coldToUsableShellMs: 2_000,
  warmRouteSwitchMs: 500,
});

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function normalizeRelative(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function digestSeed(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stableJson(value))
    .digest("hex");
}

export async function sha256File(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function walkFiles(root) {
  const output = [];
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile()) {
        output.push(filePath);
      } else if (entry.isSymbolicLink()) {
        // Symlinked build inputs are recorded as metadata instead of being followed.
        output.push(filePath);
      }
    }
  };
  await visit(root);
  return output;
}

async function gitLines(args) {
  const { stdout } = await execFileAsync(
    process.platform === "win32" ? "git.exe" : "git",
    args,
    {
      cwd: repositoryRoot,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isExcludedSource(relativePath) {
  return SOURCE_EXCLUDES.some((pattern) => pattern.test(relativePath));
}

export async function gitMetadata() {
  const [headLines, statusLines] = await Promise.all([
    gitLines(["rev-parse", "HEAD"]),
    gitLines(["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  return {
    head: headLines[0] ?? null,
    dirty: statusLines.length > 0,
    status: statusLines,
  };
}

export async function sourceFingerprint() {
  const files = (await gitLines(["ls-files", "-co", "--exclude-standard"]))
    .map(normalizeRelative)
    .filter((relativePath) => !isExcludedSource(relativePath));
  const entries = [];
  for (const relativePath of files) {
    const fullPath = path.resolve(repositoryRoot, relativePath);
    try {
      const fileStat = await stat(fullPath);
      if (!fileStat.isFile()) continue;
      entries.push({
        path: relativePath,
        bytes: fileStat.size,
        sha256: await sha256File(fullPath),
      });
    } catch (error) {
      throw new Error(
        `Unable to hash source file ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const digest = createHash("sha256")
    .update(
      entries
        .map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}\n`)
        .join(""),
      "utf8",
    )
    .digest("hex");
  return {
    algorithm: "sha256",
    digest,
    fileCount: entries.length,
    files: entries,
  };
}

export async function artifactFingerprint() {
  const roots = [];
  const files = [];
  for (const relativeRoot of ARTIFACT_ROOTS) {
    const root = path.resolve(desktopDir, relativeRoot);
    if (!existsSync(root)) {
      roots.push({
        path: normalizeRelative(path.relative(desktopDir, root)),
        exists: false,
        fileCount: 0,
      });
      continue;
    }
    const rootStat = await stat(root);
    if (!rootStat.isDirectory())
      throw new Error(`Build artifact root is not a directory: ${root}`);
    const rootFiles = await walkFiles(root);
    roots.push({
      path: normalizeRelative(path.relative(desktopDir, root)),
      exists: true,
      fileCount: rootFiles.length,
    });
    for (const filePath of rootFiles) {
      const relativePath = normalizeRelative(
        path.relative(desktopDir, filePath),
      );
      const fileStat = await lstatSyncAsync(filePath);
      if (fileStat.isSymbolicLink()) {
        files.push({
          path: relativePath,
          kind: "symlink",
          target: await readlinkSafe(filePath),
        });
      } else {
        files.push({
          path: relativePath,
          kind: "file",
          bytes: fileStat.size,
          sha256: await sha256File(filePath),
        });
      }
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const digest = createHash("sha256")
    .update(files.map((entry) => `${stableJson(entry)}\n`).join(""), "utf8")
    .digest("hex");
  return { algorithm: "sha256", roots, fileCount: files.length, digest, files };
}

async function lstatSyncAsync(filePath) {
  return lstatSync(filePath);
}

async function readlinkSafe(filePath) {
  const { readlink } = await import("node:fs/promises");
  return readlink(filePath);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is required. Run the exact-build release acceptance command.`,
    );
  return path.resolve(value);
}

export function loadAcceptanceContext(component) {
  const runDir = requireEnv("JOB_FINDER_ACCEPTANCE_RUN_DIR");
  const manifestPath = requireEnv("JOB_FINDER_ACCEPTANCE_MANIFEST");
  if (!isInside(artifactRoot, runDir))
    throw new Error(
      `Acceptance run directory escaped ${artifactRoot}: ${runDir}`,
    );
  if (!isInside(runDir, manifestPath))
    throw new Error(
      `Acceptance manifest escaped the run directory: ${manifestPath}`,
    );
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read exact-build acceptance manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (manifest.acceptanceVersion !== ACCEPTANCE_VERSION)
    throw new Error(
      `Unsupported acceptance manifest version: ${manifest.acceptanceVersion}`,
    );
  if (manifest.runDir !== runDir)
    throw new Error(
      `Acceptance manifest run directory mismatch: ${manifest.runDir} !== ${runDir}`,
    );
  return {
    component,
    runDir,
    manifestPath,
    manifest,
    outputDir: path.join(runDir, component),
    seed: SYNTHETIC_SEED,
    seedDigest: SYNTHETIC_SEED_DIGEST,
  };
}

export async function verifyAcceptanceArtifacts(context) {
  const expected = context.manifest.artifacts;
  if (!expected?.files?.length)
    throw new Error("Acceptance manifest has no build artifact hashes.");
  const actual = await artifactFingerprint();
  if (
    actual.digest !== expected.digest ||
    actual.fileCount !== expected.fileCount
  ) {
    throw new Error(
      `Build artifacts changed after the exact build. expected=${expected.digest}/${expected.fileCount} actual=${actual.digest}/${actual.fileCount}`,
    );
  }
  const expectedFiles = new Map(
    expected.files.map((entry) => [entry.path, stableJson(entry)]),
  );
  const actualFiles = new Map(
    actual.files.map((entry) => [entry.path, stableJson(entry)]),
  );
  if (
    expectedFiles.size !== actualFiles.size ||
    [...expectedFiles].some(
      ([filePath, digest]) => actualFiles.get(filePath) !== digest,
    )
  ) {
    throw new Error(
      "Build artifact file list or hashes do not match the exact-build manifest.",
    );
  }
  return actual;
}

export async function ensureFreshOutputDir(outputDir) {
  if (!isInside(artifactRoot, outputDir))
    throw new Error(`Capture output escaped ${artifactRoot}: ${outputDir}`);
  if (existsSync(outputDir))
    throw new Error(
      `Capture output already exists; refusing stale screenshots: ${outputDir}`,
    );
  await mkdir(outputDir, { recursive: true });
}

export function acceptanceEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RENDERER_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  env.UNEMPLOYED_BROWSER_AGENT = "0";
  env.UNEMPLOYED_ENABLE_TEST_API = "1";
  env.UNEMPLOYED_TEST_SYSTEM_THEME = "dark";
  env.UNEMPLOYED_AI_API_KEY = "";
  env.UNEMPLOYED_AI_VISION_API_KEY = "";
  return env;
}

export async function assertFileRenderer(page) {
  const href = await page.evaluate(() => window.location.href);
  if (!href.startsWith("file://"))
    throw new Error(`Release acceptance launched a non-file renderer: ${href}`);
  return href;
}

// This probe is intentionally stricter than the product's application policy.
// It permits in-app navigation and other explicitly marked prepare-only
// controls, while preventing and recording external, submit, account, and
// authentication surfaces. The capture scripts fail the run when any record
// is observed, so a blocked action cannot silently become accepted evidence.
export function installPrepareOnlySafetyProbe() {
  if (window.__jobFinderAcceptanceSafetyProbeInstalled) return;
  window.__jobFinderAcceptanceSafetyProbeInstalled = true;
  const seen = new Set();
  const riskPattern =
    /\b(?:apply\s+(?:to|for|now|this\s+job)|application\s+submit|final\s+submit|submit(?:\s+application)?|external\s+write|account(?:\s+creation)?|auth(?:entication|orization)?|sign[ -]?up|sign[ -]?in|log(?:in|\s+in)|authenticate|consent|captcha|mfa|password|credential|open\s+(?:browser|external)|approve.*(?:application|external|submit)|retry.*(?:sign|login|application))\b/i;
  const getSurface = (target) =>
    target instanceof Element
      ? target.closest(
          "form,button,a,[role=button],[role=menuitem],[role=link],summary,input,textarea,select",
        )
      : null;
  const isExplicitlySafe = (control) => {
    if (!(control instanceof HTMLElement)) return false;
    if (control.closest('[data-acceptance-safe-control="true"]')) return true;
    if (control.closest('nav[aria-label="Job Finder sections"]')) return true;
    if (
      control.getAttribute("role") === "menuitem" &&
      control.closest('[role="menu"][aria-label="More Job Finder sections"]')
    )
      return true;
    return control.getAttribute("aria-label") === "Notifications and actions";
  };
  const describe = (control) => {
    if (!(control instanceof HTMLElement)) return "window";
    const label =
      control.getAttribute("aria-label") ??
      control.getAttribute("title") ??
      control.textContent?.replace(/\s+/g, " ").trim() ??
      control.tagName.toLowerCase();
    return label || control.tagName.toLowerCase();
  };
  const emit = (event, control, reason, blocked = true) => {
    const label = describe(control);
    const key = `${event}:${reason}:${label}:${control?.outerHTML?.slice(0, 300) ?? "window"}`;
    if (seen.has(key)) return;
    seen.add(key);
    const record = {
      type: event,
      label,
      reason,
      blocked,
      href: control instanceof HTMLAnchorElement ? control.href : null,
      at: new Date().toISOString(),
    };
    window.__jobFinderAcceptanceSafetyEvents?.(record);
  };
  const isExternalLink = (control) =>
    control instanceof HTMLAnchorElement &&
    /^(?:https?:|mailto:|javascript:)/i.test(control.href);
  const inspect = (event) => {
    const control = getSurface(event.target);
    if (!(control instanceof HTMLElement) || isExplicitlySafe(control)) return;
    const label = describe(control);
    const risky = riskPattern.test(label);
    const external = isExternalLink(control);
    // Local form editing is prepare-only and remains allowed. The submit
    // listener below handles the actual form boundary separately.
    if (!risky && !external) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    emit(event.type, control, external ? "external-link" : "risky-control");
  };
  document.addEventListener("click", inspect, true);
  document.addEventListener("pointerdown", inspect, true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" || event.key === " ") inspect(event);
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || isExplicitlySafe(form)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      emit("submit", form, "form-submit");
    },
    true,
  );
  const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
  HTMLFormElement.prototype.requestSubmit = function (...args) {
    if (isExplicitlySafe(this)) return originalRequestSubmit.apply(this, args);
    emit("requestSubmit", this, "programmatic-form-submit");
    return undefined;
  };
  const originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function (...args) {
    if (isExplicitlySafe(this)) return originalSubmit.apply(this, args);
    emit("submit", this, "programmatic-form-submit");
    return undefined;
  };
  const originalOpen = window.open;
  window.open = (...args) => {
    emit("window.open", null, "new-window");
    return null;
  };
  // Keep a reference so browser tooling cannot mistake the interception for
  // an accidental replacement of the native API during diagnostics.
  window.__jobFinderAcceptanceOriginalWindowOpen = originalOpen;
}

export function attachProcessOutput(app, report) {
  const state = { stdout: [], stderr: [] };
  const processHandle = app.process();
  processHandle?.stdout?.on("data", (chunk) =>
    state.stdout.push(String(chunk)),
  );
  processHandle?.stderr?.on("data", (chunk) =>
    state.stderr.push(String(chunk)),
  );
  report.mainProcess ??= {
    pid: processHandle?.pid ?? null,
    stdout: "",
    stderr: "",
  };
  if (report.mainProcess.pid === null)
    report.mainProcess.pid = processHandle?.pid ?? null;
  return state;
}

export function finalizeProcessOutput(
  state,
  report,
  { acceptedStderrPatterns = [] } = {},
) {
  report.mainProcess ??= { pid: null, stdout: "", stderr: "" };
  const stdout = state.stdout.join("");
  const stderr = state.stderr.join("");
  let unexpectedStderr = stderr.replace(
    /\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\r?\n(?:\(Use `electron --trace-warnings \.\.\.` to show where the warning was created\)\r?\n)?/g,
    "",
  );
  report.mainProcess.stdout += stdout;
  report.mainProcess.stderr += stderr;
  report.mainProcess.unexpectedStderr ??= "";
  report.mainProcess.acceptedWarnings ??= [];
  if (stderr !== unexpectedStderr) {
    report.mainProcess.acceptedWarnings.push("node-sqlite-experimental");
  }
  for (const accepted of acceptedStderrPatterns) {
    const before = unexpectedStderr;
    unexpectedStderr = unexpectedStderr.replace(accepted.pattern, "");
    if (before !== unexpectedStderr) {
      report.mainProcess.acceptedWarnings.push(accepted.name);
    }
  }
  report.mainProcess.unexpectedStderr += unexpectedStderr;
  if (unexpectedStderr.trim())
    throw new Error(
      `Electron main process wrote unexpected output to stderr:\n${unexpectedStderr}`,
    );
}

async function pngInfo(filePath) {
  const contents = await readFile(filePath);
  if (
    contents.length < 24 ||
    contents.readUInt32BE(0) !== 0x89504e47 ||
    contents.toString("ascii", 1, 4) !== "PNG"
  ) {
    throw new Error(`Screenshot is not a valid PNG: ${filePath}`);
  }
  return {
    bytes: contents.length,
    sha256: createHash("sha256").update(contents).digest("hex"),
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

export async function screenshotMetadata(
  page,
  browserWindow,
  screenshotPath,
  metadata = {},
) {
  const cssViewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }));
  const nativeZoomFactor = browserWindow
    ? await browserWindow.evaluate((win) => win.webContents.getZoomFactor())
    : null;
  const image = await pngInfo(screenshotPath);
  return {
    route: metadata.route ?? (await page.evaluate(() => window.location.hash)),
    seedDigest: metadata.seedDigest ?? SYNTHETIC_SEED_DIGEST,
    viewport: {
      physical: { width: image.width, height: image.height },
      css: { width: cssViewport.width, height: cssViewport.height },
      devicePixelRatio: cssViewport.devicePixelRatio,
      nativeZoomFactor,
      requested: metadata.viewport ?? null,
    },
    screenshot: image,
  };
}

export function assertPrepareOnly(workspace, observedSafetyEvents = []) {
  if (!workspace || typeof workspace !== "object")
    throw new Error("Prepare-only safety check could not read the workspace.");
  if (observedSafetyEvents.length)
    throw new Error(
      `Unexpected application, authentication, authorization, or submission event: ${JSON.stringify(observedSafetyEvents)}`,
    );
  if (!Array.isArray(workspace.userActionRequests))
    throw new Error(
      "Synthetic acceptance workspace omitted user-action safety records.",
    );
  for (const request of workspace.userActionRequests) {
    if (
      !request ||
      request.submitAuthorized !== false ||
      request.accountCreationAuthorized !== false
    )
      throw new Error(
        "Synthetic acceptance state did not explicitly retain false submit and account-creation authority.",
      );
  }
  if (!Array.isArray(workspace.campaigns))
    throw new Error("Synthetic acceptance workspace omitted campaign safety records.");
  for (const campaign of workspace.campaigns) {
    if (campaign?.applicationPolicy?.finalSubmitAuthorized !== false)
      throw new Error(
        "Synthetic acceptance campaign did not explicitly retain false final-submit authority.",
      );
  }
}

export async function cleanupDirectory(directory) {
  if (!directory) return null;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await import("node:fs/promises").then(({ rm }) =>
        rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 250,
        }),
      );
      return null;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return lastError;
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function makeIsolatedUserDataDirectory(
  prefix = "unemployed-job-finder-acceptance-",
) {
  return import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), prefix)),
  );
}
