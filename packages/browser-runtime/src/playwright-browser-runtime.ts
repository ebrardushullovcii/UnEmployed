import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  ApplyExecutionResultSchema,
  ApplyVisualCheckpointSchema,
  BrowserVisualEvidenceSummarySchema,
  BrowserVisualSnapshotRefSchema,
  BrowserVisualSnapshotRequestSchema,
  BrowserSessionStateSchema,
  DiscoveryRunResultSchema,
  type ApplyExecutionResult,
  type BrowserSessionState,
  type BrowserVisualSnapshotRequest,
  type DiscoveryRunResult,
  type JobPosting,
  type JobSource,
} from "@unemployed/contracts";
import type { JobFinderAiClient } from "@unemployed/ai-providers";
import {
  runAgentDiscovery,
  type AgentConfig,
  type AgentExtractorPageType,
  type LLMClient,
} from "@unemployed/browser-agent";
import type {
  AgentDiscoveryOptions,
  BrowserSessionRuntime,
  ExecuteApplicationFlowInput,
  ExecuteEasyApplyInput,
} from "./runtime-types";
import {
  areStructurallyEquivalentHttpUrls,
  buildChromeExecutableCandidates,
  buildQuerySummary,
  findRunningChromeDebugPortForUserDataDir,
  isHttpUrlLike,
  isWarmPageReusable,
  isTcpPortReachable,
  pathExists,
  readDevToolsActivePort,
  selectLiveHttpPage,
  validateJobPostings,
} from "./playwright-browser-runtime-utils";

export interface JobPageExtractionInput {
  pageText: string;
  pageUrl: string;
  pageType: "search_results" | "job_detail";
  maxJobs: number;
  signal?: AbortSignal;
}

export type JobPageExtractor = (
  input: JobPageExtractionInput,
) => Promise<JobPosting[]>;

export function createAgentChatWithToolsBridge(
  chatWithTools: NonNullable<JobFinderAiClient["chatWithTools"]>,
): LLMClient {
  return {
    chatWithTools,
  };
}

function buildUnsupportedApplyResult(input: {
  job: ExecuteEasyApplyInput["job"];
  startedAt: string;
  mode: "easy_apply" | ExecuteApplicationFlowInput["mode"];
  targetUrl?: string | null;
  visualEvidence?: ApplyExecutionResult["visualEvidence"];
  visualObservationSets?: ApplyExecutionResult["visualObservationSets"];
  visualCheckpoints?: ApplyExecutionResult["visualCheckpoints"];
}): ApplyExecutionResult {
  const targetUrl =
    input.targetUrl ?? input.job.applicationUrl ?? input.job.canonicalUrl;
  const prepareOnly = input.mode === "prepare_only";

  return ApplyExecutionResultSchema.parse({
    state: "unsupported",
    summary: "Apply automation is not available for generic target flows",
    detail: prepareOnly
      ? `The current runtime does not yet support review-safe apply preparation for '${input.job.title}'. Use the learned target guidance to continue manually.`
      : `The current runtime does not submit applications automatically for '${input.job.title}'. Use the learned target guidance to continue manually.`,
    submittedAt: null,
    outcome: null,
    questions: [],
    blocker: {
      code: "unsupported_apply_path",
      summary: prepareOnly
        ? "The generic runtime does not support review-safe apply preparation."
        : "The generic runtime does not support automated application submission.",
      detail:
        "Use the learned target guidance to continue this application manually.",
      questionIds: [],
      sourceDebugEvidenceRefIds: [],
      url: targetUrl,
    },
    consentDecisions: [],
    replay: {
      sourceInstructionArtifactId: null,
      sourceDebugEvidenceRefIds: [],
      lastUrl: targetUrl,
      checkpointUrls: targetUrl ? [targetUrl] : [],
    },
    visualEvidence: input.visualEvidence ?? [],
    visualObservationSets: input.visualObservationSets ?? [],
    visualCheckpoints: input.visualCheckpoints ?? [],
    nextActionLabel: "Open the listing manually",
    checkpoints: [
      {
        id: `checkpoint_${input.job.id}_generic_apply_unsupported`,
        at: input.startedAt,
        label: "Apply automation unavailable",
        detail: prepareOnly
          ? "This target uses the generic debugger flow, so application preparation and submission stay manual until a target-agnostic runtime exists."
          : "This target uses the generic debugger flow, so submission stays manual until a target-agnostic apply runtime exists.",
        state: "unsupported",
        visualEvidence: input.visualEvidence ?? [],
      },
    ],
  });
}

async function buildApplyVisualDiagnostics(input: {
  job: ExecuteApplicationFlowInput["job"];
  mode: ExecuteApplicationFlowInput["mode"];
  targetUrl: string | null;
  captureVisualSnapshot?: ExecuteApplicationFlowInput["captureVisualSnapshot"];
  analyzeVisualSnapshot?: ExecuteApplicationFlowInput["analyzeVisualSnapshot"];
}): Promise<{
  visualEvidence: NonNullable<ApplyExecutionResult["visualEvidence"]>;
  visualObservationSets: NonNullable<ApplyExecutionResult["visualObservationSets"]>;
  visualCheckpoints: NonNullable<ApplyExecutionResult["visualCheckpoints"]>;
}> {
  if (!input.captureVisualSnapshot || !input.analyzeVisualSnapshot) {
    return {
      visualEvidence: [],
      visualObservationSets: [],
      visualCheckpoints: [],
    };
  }

  try {
    const snapshot = await input.captureVisualSnapshot({
      purpose: "apply_checkpoint",
      mode: "viewport",
      label: "Apply page visual checkpoint",
      reason:
        "Classify visible application page state before stopping the safe non-submitting apply flow.",
      region: null,
      retention: {
        retention: "temporary",
        redactionLevel: "sensitive",
        reason:
          "Temporary apply visual analysis input; screenshots are not persisted by default.",
        expiresAt: null,
      },
    });
    const observationSet = await input.analyzeVisualSnapshot({
      snapshot,
      context: {
        purpose: "apply_checkpoint",
        taskGoal:
          "Classify visible application form state, blockers, field/control hints, validation errors, and recovery context without directing browser actions.",
        pageUrl: snapshot.url ?? input.targetUrl,
        pageTitle: snapshot.pageTitle,
        visibleTextSample: null,
        domSignals: [
          input.mode === "prepare_only"
            ? "Safe apply flow is running in prepare-only mode."
            : "Safe apply flow is not authorized for live final submit.",
        ],
        sourceDebug: null,
        apply: {
          jobTitle: input.job.title,
          company: input.job.company,
          checkpointLabel: "Apply page visual checkpoint",
          recoveryMode: false,
        },
      },
    });
    const summary =
      observationSet.summary ??
      observationSet.blockers[0] ??
      observationSet.fieldControls[0] ??
      observationSet.validationErrors[0] ??
      observationSet.recoveryNotes[0] ??
      "Visual apply checkpoint captured no strong visible blocker.";
    const evidence = BrowserVisualEvidenceSummarySchema.parse({
      snapshotId: snapshot.id,
      observationSetId: observationSet.id,
      summary,
      capturedAt: snapshot.capturedAt,
      storagePath: snapshot.storagePath,
      retention: snapshot.retention.retention,
      redactionLevel: snapshot.retention.redactionLevel,
      confidence:
        observationSet.observations[0]?.confidence ??
        observationSet.reconciliations[0]?.confidence ??
        0.6,
      reconciliationStatus: observationSet.reconciliations[0]?.status ?? null,
    });
    const checkpoint = ApplyVisualCheckpointSchema.parse({
      id: `apply_visual_checkpoint_${input.job.id}_${snapshot.id}`,
      label: "Apply page visual checkpoint",
      purpose: snapshot.purpose,
      snapshotId: snapshot.id,
      observationSetId: observationSet.id,
      summary,
      capturedAt: snapshot.capturedAt,
      retained: snapshot.retention.retention !== "temporary",
      storagePath: snapshot.storagePath,
      blockers: observationSet.blockers,
      fieldControls: observationSet.fieldControls,
      validationErrors: observationSet.validationErrors,
      buttonStates: observationSet.buttonStates,
      questionContextIds: observationSet.questionContexts.map(
        (context) => context.id,
      ),
      reconciliations: observationSet.reconciliations,
    });

    return {
      visualEvidence: [evidence],
      visualObservationSets: [observationSet],
      visualCheckpoints: [checkpoint],
    };
  } catch {
    // Return empty results instead of fabricated evidence with dangling IDs
    return {
      visualEvidence: [],
      visualObservationSets: [],
      visualCheckpoints: [],
    };
  }
}

export interface BrowserAgentRuntimeOptions {
  userDataDir: string;
  headless?: boolean;
  maxJobsPerRun?: number;
  chromeExecutablePath?: string;
  debugPort?: number;
  jobExtractor?: JobPageExtractor;
  aiClient?: JobFinderAiClient;
}

async function resolveChromeExecutable(explicitPath?: string): Promise<string> {
  for (const candidate of buildChromeExecutableCandidates(explicitPath)) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "A Chrome executable was not found for the dedicated browser agent. Set UNEMPLOYED_CHROME_PATH to a local Chrome installation.",
  );
}

async function isDebuggerEndpointReady(debugPort: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function normalizeUserDataDir(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function createVisualSnapshotId(): string {
  return `visual_snapshot_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function createVisualSnapshotFileName(snapshotId: string): string {
  return `${snapshotId.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
}

function createVisualSnapshotMetadataFileName(snapshotId: string): string {
  return `${snapshotId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}

function getVisualSnapshotArtifactDir(userDataDir: string): string {
  return join(userDataDir, "visual-snapshots");
}

async function cleanupExpiredVisualSnapshots(input: {
  artifactDir: string;
  nowMs?: number;
  maxAgeMs?: number;
  maxFiles?: number;
}): Promise<void> {
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const maxFiles = input.maxFiles ?? 200;

  try {
    const entries = await readdir(input.artifactDir, { withFileTypes: true });
    const pngEntries = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
        .map(async (entry) => {
          const path = join(input.artifactDir, entry.name);
          const metadataPath = join(
            input.artifactDir,
            `${entry.name.slice(0, -4)}.json`,
          );
          try {
            const stats = await stat(path);
            const expiresAtMs = await readFile(metadataPath, "utf8")
              .then((content) => {
                const payload = JSON.parse(content) as { expiresAt?: unknown };
                return typeof payload.expiresAt === "string"
                  ? Date.parse(payload.expiresAt)
                  : Number.NaN;
              })
              .catch(() => Number.NaN);
            return { path, metadataPath, mtimeMs: stats.mtimeMs, expiresAtMs };
          } catch {
            return null;
          }
        }),
    );
    const files = pngEntries
      .filter(
        (
          entry,
        ): entry is {
          path: string;
          metadataPath: string;
          mtimeMs: number;
          expiresAtMs: number;
        } => entry !== null,
      )
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const expired = files.filter((entry) => {
      if (Number.isFinite(entry.expiresAtMs)) {
        return entry.expiresAtMs <= nowMs;
      }

      return nowMs - entry.mtimeMs > maxAgeMs;
    });
    const overflow = files.slice(maxFiles);
    const pathsToDelete = new Set<string>();
    [...expired, ...overflow].forEach((entry) => {
      pathsToDelete.add(entry.path);
      pathsToDelete.add(entry.metadataPath);
    });

    await Promise.all(
      [...pathsToDelete].map((path) => rm(path, { force: true }).catch(() => {})),
    );
  } catch {
    // Retention cleanup is best-effort and must never block browser work.
  }
}

async function safePageTitle(page: Page): Promise<string | null> {
  try {
    const title = await page.title();
    return title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

function safePageUrl(page: Page): string | null {
  try {
    const url = page.url();
    if (!url || url === "about:blank") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function isDebuggerEndpointOwnedByUserDataDir(
  debugPort: number,
  userDataDir: string,
): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const normalizedUserDataDir = normalizeUserDataDir(userDataDir);
    const candidateUserDataDirs = [
      payload.userDataDir,
      payload.userDataDirPath,
      payload.browserUserDataDir,
      payload["User-Data-Dir"],
    ].flatMap((value) =>
      typeof value === "string" && value.trim().length > 0 ? [value] : [],
    );

    return candidateUserDataDirs.some(
      (candidate) => normalizeUserDataDir(candidate) === normalizedUserDataDir,
    );
  } catch {
    return false;
  }
}

async function resolveBrowserDebugPort(
  preferredDebugPort: number,
  userDataDir: string,
): Promise<number> {
  const runningDebugPortForUserDataDir =
    await findRunningChromeDebugPortForUserDataDir(userDataDir);

  if (
    runningDebugPortForUserDataDir !== null &&
    (await isDebuggerEndpointReady(runningDebugPortForUserDataDir))
  ) {
    return runningDebugPortForUserDataDir;
  }

  const activeDebugPortFromProfile = await readDevToolsActivePort(userDataDir);

  if (
    activeDebugPortFromProfile !== null &&
    (await isDebuggerEndpointReady(activeDebugPortFromProfile))
  ) {
    return activeDebugPortFromProfile;
  }

  if (!(await isTcpPortReachable(preferredDebugPort))) {
    return preferredDebugPort;
  }

  if (!(await isDebuggerEndpointReady(preferredDebugPort))) {
    for (
      let candidatePort = preferredDebugPort + 1;
      candidatePort < preferredDebugPort + 20;
      candidatePort += 1
    ) {
      if (!(await isTcpPortReachable(candidatePort))) {
        return candidatePort;
      }
    }

    throw new Error(
      `Remote debugging port ${preferredDebugPort} is occupied by a non-Chrome process. Close that process or set UNEMPLOYED_CHROME_DEBUG_PORT to a free port.`,
    );
  }

  if (
    await isDebuggerEndpointOwnedByUserDataDir(preferredDebugPort, userDataDir)
  ) {
    return preferredDebugPort;
  }

  for (
    let candidatePort = preferredDebugPort + 1;
    candidatePort < preferredDebugPort + 20;
    candidatePort += 1
  ) {
    if (!(await isTcpPortReachable(candidatePort))) {
      return candidatePort;
    }
  }

  throw new Error(
    `Remote debugging port ${preferredDebugPort} is already serving another browser session. Close that browser or set UNEMPLOYED_CHROME_DEBUG_PORT to a free port.`,
  );
}

async function waitForDebuggerEndpoint(
  debugPort: number,
  chromeProcess?: ChildProcess | null,
  timeoutMs = 20_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isDebuggerEndpointReady(debugPort)) {
      return;
    }

    if (chromeProcess && chromeProcess.exitCode !== null) {
      throw new Error(
        `Chrome exited before the remote debugging endpoint on port ${debugPort} became ready.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Chrome started but the remote debugging endpoint on port ${debugPort} did not become ready within ${timeoutMs}ms.`,
  );
}

async function getPrimaryPage(context: BrowserContext): Promise<Page> {
  const pages = context.pages();
  const openPages = pages.filter((page) => !page.isClosed());
  return openPages[openPages.length - 1] ?? context.newPage();
}

async function navigatePageToTarget(input: {
  page: Page;
  targetUrl: string;
  timeout?: number;
}): Promise<boolean> {
  if (areStructurallyEquivalentHttpUrls(input.page.url(), input.targetUrl)) {
    return false;
  }

  await input.page.goto(input.targetUrl, {
    waitUntil: "domcontentloaded",
    ...(input.timeout ? { timeout: input.timeout } : {}),
  });

  return true;
}

async function resolveLivePageForContext(
  context: BrowserContext,
  options?: { bringToFront?: boolean },
): Promise<Page> {
  const bringToFront = options?.bringToFront !== false;
  const currentPages = context.pages();
  const liveHttpPage = selectLiveHttpPage(currentPages);
  const page = liveHttpPage ?? (await getPrimaryPage(context));

  if (bringToFront) {
    await page.bringToFront().catch(() => undefined);
  }
  return page;
}

async function resolveAutomationPageForContext(
  context: BrowserContext,
  options: { targetUrl?: string | null; bringToFront?: boolean } = {},
): Promise<Page> {
  const normalizedTargetUrl =
    typeof options.targetUrl === "string" ? options.targetUrl.trim() : "";
  const currentPages = context.pages();
  const openPages = currentPages.filter((page) => !page.isClosed());
  const exactTargetPage = isHttpUrlLike(normalizedTargetUrl)
    ? openPages.find((page) =>
        areStructurallyEquivalentHttpUrls(page.url(), normalizedTargetUrl),
      )
    : null;
  const blankPage = openPages.find((page) => !isHttpUrlLike(page.url())) ?? null;
  const page = exactTargetPage ?? blankPage ?? (await context.newPage());

  if (options.bringToFront !== false) {
    await page.bringToFront().catch(() => undefined);
  }

  return page;
}

async function prepareAutomationPageForTarget(
  context: BrowserContext,
  options: {
    targetUrl: string;
    setBlockedState: (detail: string) => void;
    bringToFront?: boolean;
  },
): Promise<{
  page: Page;
  alreadyAtTarget: boolean;
  navigatedToTarget: boolean;
}> {
  const page = await resolveAutomationPageForContext(context, {
    targetUrl: options.targetUrl,
    bringToFront: false,
  });
  const alreadyAtTarget = areStructurallyEquivalentHttpUrls(
    page.url(),
    options.targetUrl,
  );
  let navigatedToTarget = false;

  if (!alreadyAtTarget) {
    try {
      navigatedToTarget = await navigatePageToTarget({
        page,
        targetUrl: options.targetUrl,
      });
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : `The dedicated browser profile could not open ${options.targetUrl}.`;
      options.setBlockedState(detail);
      throw error;
    }
  }

  if (options.bringToFront !== false || navigatedToTarget) {
    await page.bringToFront().catch(() => undefined);
  }

  return {
    page,
    alreadyAtTarget,
    navigatedToTarget,
  };
}

async function getPrimaryPageIfReady(context: BrowserContext): Promise<Page> {
  const currentPages = context.pages();
  const liveHttpPage = selectLiveHttpPage(currentPages);
  return liveHttpPage ?? getPrimaryPage(context);
}

export function createBrowserAgentRuntime(
  options: BrowserAgentRuntimeOptions,
): BrowserSessionRuntime {
  const debugPort = options.debugPort ?? 9333;
  let activeDebugPort = debugPort;
  const jobExtractor = options.jobExtractor;
  const runtimeAiClient = options.aiClient ?? null;
  let browserPromise: Promise<Browser> | null = null;
  let launchedChromeProcess: ChildProcess | null = null;
  let ownsChromeProcess = false;
  let currentSessionState = BrowserSessionStateSchema.parse({
    source: "target_site",
    status: "unknown",
    driver: "chrome_profile_agent",
    label: "Browser profile not started",
    detail:
      "Open the dedicated browser profile when you want the agent to reuse a warm or authenticated browser context.",
    lastCheckedAt: new Date().toISOString(),
  });

  function setSessionState(
    source: JobSource,
    status: BrowserSessionState["status"],
    label: string,
    detail: string | null,
  ) {
    currentSessionState = BrowserSessionStateSchema.parse({
      source,
      status,
      driver: "chrome_profile_agent",
      label,
      detail,
      lastCheckedAt: new Date().toISOString(),
    });

    return currentSessionState;
  }

  function resetBrowserConnection(): void {
    browserPromise = null;
    launchedChromeProcess = null;
    ownsChromeProcess = false;
    setSessionState(
      "target_site",
      "unknown",
      "Browser profile not started",
      "Open the dedicated browser profile when you want the agent to reuse a warm or authenticated browser context.",
    );
  }

  function attachBrowserLifecycle(browser: Browser): Browser {
    browser.once("disconnected", () => {
      resetBrowserConnection();
    });

    return browser;
  }

  async function waitForChromeProcessExit(
    chromeProcess: ChildProcess,
    timeoutMs: number,
  ): Promise<boolean> {
    if (chromeProcess.exitCode !== null) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const onSettled = () => {
        clearTimeout(timeout);
        chromeProcess.off("exit", onExit);
        chromeProcess.off("error", onError);
      };
      const onExit = () => {
        onSettled();
        resolve(true);
      };
      const onError = () => {
        onSettled();
        resolve(true);
      };
      const timeout = setTimeout(() => {
        onSettled();
        resolve(false);
      }, timeoutMs);

      chromeProcess.once("exit", onExit);
      chromeProcess.once("error", onError);
    });
  }

  async function terminateChromeProcess(
    chromeProcess: ChildProcess | null,
    shouldTerminate: boolean,
  ): Promise<void> {
    if (!shouldTerminate || !chromeProcess?.pid) {
      return;
    }

    try {
      if (process.platform === "win32") {
        const taskkill = spawn(
          "taskkill",
          ["/PID", String(chromeProcess.pid), "/T", "/F"],
          {
            stdio: "ignore",
            windowsHide: true,
          },
        );
        await new Promise<void>((resolve) => {
          taskkill.once("exit", () => resolve());
          taskkill.once("error", () => resolve());
        });
        await waitForChromeProcessExit(chromeProcess, 5_000);
        return;
      }

      process.kill(-chromeProcess.pid, "SIGTERM");
      const exitedAfterSigterm = await waitForChromeProcessExit(
        chromeProcess,
        1_000,
      );

      if (!exitedAfterSigterm) {
        process.kill(-chromeProcess.pid, "SIGKILL");
        await waitForChromeProcessExit(chromeProcess, 1_000);
      }
    } catch {
      try {
        chromeProcess.kill("SIGTERM");
        const exitedAfterSigterm = await waitForChromeProcessExit(
          chromeProcess,
          1_000,
        );

        if (!exitedAfterSigterm) {
          chromeProcess.kill("SIGKILL");
          await waitForChromeProcessExit(chromeProcess, 1_000);
        }
      } catch {
        // Ignore cleanup failures here; session reset still clears local state.
      }
    }
  }

  async function terminateLaunchedChromeProcess(): Promise<void> {
    const chromeProcess = launchedChromeProcess;
    const shouldTerminate = ownsChromeProcess;
    launchedChromeProcess = null;
    ownsChromeProcess = false;

    await terminateChromeProcess(chromeProcess, shouldTerminate);
  }

  async function connectBrowser(): Promise<Browser> {
    const { chromium } = await import("playwright");
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return attachBrowserLifecycle(
          await chromium.connectOverCDP(`http://127.0.0.1:${activeDebugPort}`),
        );
      } catch (error) {
        lastError = error;

        if (attempt === 4) {
          break;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1)),
        );
      }
    }

    throw lastError instanceof Error
      ? new Error(
          `Chrome exposed the debugging endpoint on port ${activeDebugPort}, but CDP attach still failed: ${lastError.message}`,
        )
      : new Error(
          `Chrome exposed the debugging endpoint on port ${activeDebugPort}, but CDP attach still failed.`,
        );
  }

  async function ensureBrowser(): Promise<Browser> {
    if (browserPromise) {
      try {
        const browser = await browserPromise;

        if (browser.isConnected()) {
          return browser;
        }
      } catch {
        resetBrowserConnection();
      }
    }

    browserPromise = (async () => {
      activeDebugPort = await resolveBrowserDebugPort(
        debugPort,
        options.userDataDir,
      );

      if (!(await isDebuggerEndpointReady(activeDebugPort))) {
        const chromeExecutable = await resolveChromeExecutable(
          options.chromeExecutablePath,
        );

        await mkdir(options.userDataDir, { recursive: true });

        const launchArgs = [
          `--remote-debugging-port=${activeDebugPort}`,
          `--user-data-dir=${options.userDataDir}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--new-window",
          "about:blank",
        ];

        if (options.headless) {
          launchArgs.push("--headless=new");
        }

        launchedChromeProcess = spawn(chromeExecutable, launchArgs, {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        ownsChromeProcess = true;
        launchedChromeProcess.once("exit", () => {
          resetBrowserConnection();
        });
        launchedChromeProcess.unref();

        try {
          await waitForDebuggerEndpoint(activeDebugPort, launchedChromeProcess);
        } catch (error) {
          await terminateLaunchedChromeProcess().catch(() => undefined);
          throw error;
        }
      }

      return connectBrowser();
    })().catch(async (error: unknown) => {
      await terminateLaunchedChromeProcess().catch(() => undefined);
      resetBrowserConnection();
      throw error;
    });

    return browserPromise;
  }

  async function getContext(): Promise<BrowserContext> {
    const browser = await ensureBrowser();
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(
        "Chrome opened but did not expose a default browsing context for automation.",
      );
    }

    return context;
  }

  async function getReadyPage(source: JobSource): Promise<Page> {
    const context = await getContext();
    const page = await resolveLivePageForContext(context, {
      bringToFront: currentSessionState.status !== "ready",
    });
    setSessionState(
      source,
      "ready",
      "Browser profile ready",
      "The dedicated browser profile is open and ready for target-specific discovery.",
    );
    return page;
  }

  async function getAgentRunPage(
    source: JobSource,
    agentOptions: AgentDiscoveryOptions,
  ): Promise<Page> {
    const navigationTarget =
      agentOptions.startingUrls.find((url) => isHttpUrlLike(url)) ?? null;

    if (!navigationTarget) {
      return getReadyPage(source);
    }

    const context = await getContext();
    const prepared = await prepareAutomationPageForTarget(context, {
      targetUrl: navigationTarget,
      bringToFront: currentSessionState.status !== "ready",
      setBlockedState: (detail) => {
        setSessionState(source, "blocked", "Browser navigation failed", detail);
      },
    });
    setSessionState(
      source,
      "ready",
      "Browser profile ready",
      "The dedicated browser profile is open and ready for target-specific discovery.",
    );
    return prepared.page;
  }

  async function openSessionAtTarget(input: {
    source: JobSource;
    targetUrl?: string | null;
  }): Promise<BrowserSessionState> {
    const normalizedTargetUrl =
      typeof input.targetUrl === "string" ? input.targetUrl.trim() : "";
    if (isHttpUrlLike(normalizedTargetUrl)) {
      await prepareAutomationPageForTarget(await getContext(), {
          targetUrl: normalizedTargetUrl,
          bringToFront: true,
          setBlockedState: (detail) => {
            setSessionState(
              input.source,
              "blocked",
              "Browser navigation failed",
              detail,
            );
          },
        });
    } else {
      await getReadyPage(input.source);
    }

    setSessionState(
      input.source,
      "ready",
      "Browser profile ready",
      "The dedicated browser profile is open and ready for target-specific discovery.",
    );

    return BrowserSessionStateSchema.parse({
      ...currentSessionState,
      source: input.source,
    });
  }

  async function captureVisualSnapshotForPage(
    page: Page,
    request: BrowserVisualSnapshotRequest,
  ) {
    const normalizedRequest = BrowserVisualSnapshotRequestSchema.parse(request);
    const viewportSize = page.viewportSize();
    const screenshotBuffer = await page.screenshot({
      type: "png",
      animations: "disabled",
      timeout: 10_000,
      fullPage: normalizedRequest.mode === "full_page",
      ...(normalizedRequest.mode === "region" && normalizedRequest.region
        ? {
            clip: {
              x: normalizedRequest.region.x,
              y: normalizedRequest.region.y,
              width: normalizedRequest.region.width,
              height: normalizedRequest.region.height,
            },
          }
        : {}),
    });
    const capturedAt = new Date().toISOString();
    const dataUrl = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;
    const snapshotId = createVisualSnapshotId();
    let storagePath: string | null = null;
    const warnings: string[] = [];

    if (normalizedRequest.retention.retention !== "temporary") {
      try {
        const visualArtifactDir = getVisualSnapshotArtifactDir(
          options.userDataDir,
        );
        await mkdir(visualArtifactDir, { recursive: true });
        await cleanupExpiredVisualSnapshots({ artifactDir: visualArtifactDir });
        storagePath = join(
          visualArtifactDir,
          createVisualSnapshotFileName(snapshotId),
        );
        await writeFile(storagePath, screenshotBuffer);
        await writeFile(
          join(
            visualArtifactDir,
            createVisualSnapshotMetadataFileName(snapshotId),
          ),
          JSON.stringify(
            {
              snapshotId,
              capturedAt,
              purpose: normalizedRequest.purpose,
              mode: normalizedRequest.mode,
              retention: normalizedRequest.retention.retention,
              redactionLevel: normalizedRequest.retention.redactionLevel,
              expiresAt: normalizedRequest.retention.expiresAt,
            },
            null,
            2,
          ),
          "utf8",
        );
      } catch (error) {
        warnings.push(
          `Screenshot was captured in memory but could not be retained on disk: ${error instanceof Error ? error.message : "unknown storage error"}.`,
        );
      }
    }

    return BrowserVisualSnapshotRefSchema.parse({
      id: snapshotId,
      capturedAt,
      url: safePageUrl(page),
      pageTitle: await safePageTitle(page),
      mode: normalizedRequest.mode,
      purpose: normalizedRequest.purpose,
      label: normalizedRequest.label,
      region: normalizedRequest.region,
      viewport: viewportSize
        ? {
            x: 0,
            y: 0,
            width: viewportSize.width,
            height: viewportSize.height,
          }
        : null,
      mimeType: "image/png",
      dataUrl,
      storagePath,
      retention: normalizedRequest.retention,
      warnings,
    });
  }

  async function captureVisualSnapshotForSource(
    source: JobSource,
    request: BrowserVisualSnapshotRequest,
  ) {
    return captureVisualSnapshotForPage(await getReadyPage(source), request);
  }

  return {
    getSessionState(source) {
      return Promise.resolve(
        BrowserSessionStateSchema.parse({
          ...currentSessionState,
          source,
        }),
      );
    },
    async openSession(source, options) {
      return openSessionAtTarget({
        source,
        targetUrl: options?.targetUrl ?? null,
      });
    },
    async closeSession(source) {
      const chromeProcess = launchedChromeProcess;
      const shouldTerminateChromeProcess = ownsChromeProcess;
      launchedChromeProcess = null;
      ownsChromeProcess = false;

      try {
        if (browserPromise) {
          const browser = await browserPromise;
          if (shouldTerminateChromeProcess) {
            await browser.close().catch(() => {});
          }
        }
      } catch {
        // Ignore browser close failures and continue process cleanup.
      } finally {
        await terminateChromeProcess(
          chromeProcess,
          shouldTerminateChromeProcess,
        ).catch(() => {});
        resetBrowserConnection();
      }

      return setSessionState(
        source,
        "unknown",
        "Browser profile closed",
        "The dedicated browser profile is closed. It will reopen automatically when the next run starts.",
      );
    },
    runDiscovery(source, searchPreferences) {
      const timestamp = new Date().toISOString();

      return Promise.resolve(
        DiscoveryRunResultSchema.parse({
          source,
          startedAt: timestamp,
          completedAt: timestamp,
          querySummary: buildQuerySummary(
            searchPreferences.targetRoles,
            searchPreferences.locations,
          ),
          warning:
            "Direct live discovery is not available for generic target flows. Use the agent discovery path instead.",
          jobs: [],
        }),
      );
    },
    executeEasyApply(
      source,
      input: ExecuteEasyApplyInput,
    ): Promise<ApplyExecutionResult> {
      const startedAt = new Date().toISOString();

      return Promise.resolve(
        buildUnsupportedApplyResult({
          job: input.job,
          startedAt,
          mode: "easy_apply",
        }),
      );
    },
    executeApplicationFlow(
      source,
      input: ExecuteApplicationFlowInput,
    ): Promise<ApplyExecutionResult> {
      const startedAt = new Date().toISOString();
      const targetUrl = input.job.applicationUrl ?? input.job.canonicalUrl;

      return buildApplyVisualDiagnostics({
        job: input.job,
        mode: input.mode,
        targetUrl,
        ...(input.captureVisualSnapshot
          ? { captureVisualSnapshot: input.captureVisualSnapshot }
          : {}),
        ...(input.analyzeVisualSnapshot
          ? { analyzeVisualSnapshot: input.analyzeVisualSnapshot }
          : {}),
      }).then((visualDiagnostics) =>
        buildUnsupportedApplyResult({
          job: input.job,
          startedAt,
          mode: input.mode,
          targetUrl,
          visualEvidence: visualDiagnostics.visualEvidence,
          visualObservationSets: visualDiagnostics.visualObservationSets,
          visualCheckpoints: visualDiagnostics.visualCheckpoints,
        }),
      );
    },
    async captureVisualSnapshot(
      source,
      request: BrowserVisualSnapshotRequest,
    ) {
      return captureVisualSnapshotForSource(source, request);
    },
    async runAgentDiscovery(
      source: JobSource,
      agentOptions: AgentDiscoveryOptions,
    ): Promise<DiscoveryRunResult> {
      const startedAt = new Date().toISOString();
      const aiClient = agentOptions.aiClient ?? runtimeAiClient;

      if (!aiClient?.chatWithTools) {
        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary(
            agentOptions.searchPreferences.targetRoles,
            agentOptions.searchPreferences.locations,
            agentOptions.siteLabel,
          ),
          warning:
            "AI client does not support tool calling. Cannot run agent discovery.",
          jobs: [],
        });
      }

      if (!jobExtractor) {
        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary(
            agentOptions.searchPreferences.targetRoles,
            agentOptions.searchPreferences.locations,
            agentOptions.siteLabel,
          ),
          warning: "No job extractor configured. Cannot run agent discovery.",
          jobs: [],
        });
      }

      const ensuredAiClient = aiClient;

      let page: Page | null = null;

      try {
        page = await getAgentRunPage(source, agentOptions);

        if (
          !isWarmPageReusable({ pageUrl: page.url(), options: agentOptions })
        ) {
          const navigationTarget =
            agentOptions.startingUrls.find((url) => isHttpUrlLike(url)) ??
            agentOptions.startingUrls[0] ??
            null;

          if (navigationTarget) {
            await page.goto(navigationTarget, {
              waitUntil: "domcontentloaded",
            });
          }
        }

        const agentConfig: AgentConfig = {
          source,
          maxSteps: agentOptions.maxSteps,
          targetJobCount: agentOptions.targetJobCount,
          userProfile: agentOptions.userProfile,
          searchPreferences: {
            targetRoles: agentOptions.searchPreferences.targetRoles,
            locations: agentOptions.searchPreferences.locations,
          },
          startingUrls: agentOptions.startingUrls,
          ...(agentOptions.agentHints?.widenReviewBudget
            ? { weakSameHostBoard: true }
            : {}),
          navigationPolicy: {
            allowedHostnames: agentOptions.navigationHostnames,
            allowSubdomains: true,
          },
          promptContext: {
            siteLabel: agentOptions.siteLabel,
            ...(agentOptions.siteInstructions
              ? { siteInstructions: agentOptions.siteInstructions }
              : {}),
            ...(agentOptions.toolUsageNotes
              ? { toolUsageNotes: agentOptions.toolUsageNotes }
              : {}),
            ...(agentOptions.taskPacket
              ? { taskPacket: agentOptions.taskPacket }
              : {}),
            ...(agentOptions.experimental ? { experimental: true } : {}),
          },
          resolveLivePage: async () => {
            const context = await getContext();
            return currentSessionState.status === "ready"
              ? getPrimaryPageIfReady(context)
              : getReadyPage(source);
          },
          ...(agentOptions.captureVisualSnapshots || agentOptions.taskPacket
            ? {
                visualAnalysis: {
                  enabled: true,
                  captureSnapshot: (request, snapshotPage) =>
                    captureVisualSnapshotForPage(snapshotPage ?? page!, request),
                  analyzeSnapshot: ({ snapshot, context }) =>
                    ensuredAiClient.analyzeBrowserVisualSnapshot
                      ? ensuredAiClient.analyzeBrowserVisualSnapshot({
                          snapshot,
                          context,
                        })
                      : Promise.reject(
                          new Error(
                            "AI client does not support browser visual analysis.",
                          ),
                        ),
                  persistScreenshots: Boolean(agentOptions.taskPacket),
                },
              }
            : {}),
          ...(agentOptions.compaction
            ? { compaction: agentOptions.compaction }
            : {}),
          compactionCapability: {
            tokenEstimator: ({ messages, maxOutputTokens }) => {
              const estimatedInputTokens = messages.reduce((sum, message) => {
                const messageContent = message.content ?? "";
                const contentTokens = Math.ceil(messageContent.length / 4);
                if (message.role === "assistant" && message.toolCalls) {
                  return (
                    sum +
                    contentTokens +
                    Math.ceil(JSON.stringify(message.toolCalls).length / 4)
                  );
                }
                if (message.role === "tool") {
                  return (
                    sum +
                    contentTokens +
                    Math.ceil((message.toolCallId ?? "").length / 4)
                  );
                }
                return sum + contentTokens;
              }, 0);

              return {
                estimatedInputTokens,
                estimatedTotalTokens:
                  estimatedInputTokens + Math.max(0, maxOutputTokens),
              };
            },
            modelContextWindowTokens:
              agentOptions.modelContextWindowTokens ??
              ensuredAiClient.getStatus().modelContextWindowTokens ??
              null,
            compactionWorkflowKey:
              agentOptions.compactionHints?.workflowKey ??
              (agentOptions.taskPacket
                ? "source_debug_worker"
                : "browser_agent_live_discovery"),
          },
          ...(agentOptions.relevantUrlSubstrings
            ? {
                extractionContext: {
                  relevantUrlSubstrings: agentOptions.relevantUrlSubstrings,
                },
              }
            : {}),
        };

        const result = await runAgentDiscovery(
          page,
          agentConfig,
          createAgentChatWithToolsBridge(ensuredAiClient.chatWithTools!),
          {
            extractJobsFromPage: async (input: {
              pageText: string;
              pageUrl: string;
              pageType: AgentExtractorPageType;
              maxJobs: number;
              signal?: AbortSignal;
            }) => {
              const extractionInput: JobPageExtractionInput = {
                pageText: input.pageText,
                pageUrl: input.pageUrl,
                pageType: input.pageType,
                maxJobs: input.maxJobs,
              };
              if (input.signal) {
                extractionInput.signal = input.signal;
              }

              const jobs = validateJobPostings(
                await jobExtractor(extractionInput),
                input.pageUrl,
              );

              return jobs.map((job) => ({
                sourceJobId: job.sourceJobId,
                canonicalUrl: job.canonicalUrl,
                title: job.title,
                company: job.company,
                location: job.location,
                description: job.description,
                summary: job.summary,
                postedAt: job.postedAt,
                postedAtText: job.postedAtText,
                salaryText: job.salaryText,
                workMode: job.workMode,
                applyPath: job.applyPath,
                easyApplyEligible: job.easyApplyEligible,
                keySkills: job.keySkills,
                responsibilities: job.responsibilities,
                minimumQualifications: job.minimumQualifications,
                preferredQualifications: job.preferredQualifications,
                seniority: job.seniority,
                employmentType: job.employmentType,
                department: job.department,
                team: job.team,
                employerWebsiteUrl: job.employerWebsiteUrl,
                employerDomain: job.employerDomain,
                benefits: job.benefits,
              }));
            },
          },
          agentOptions.onProgress,
          agentOptions.signal,
        );

        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary(
            agentOptions.searchPreferences.targetRoles,
            agentOptions.searchPreferences.locations,
            agentOptions.siteLabel,
          ),
          warning:
            [
              result.incomplete
                ? `Agent discovery stopped after ${result.steps} steps. Found ${result.jobs.length} jobs.`
                : null,
              result.error
                ? `Discovery encountered an error: ${result.error}`
                : null,
            ]
              .filter(Boolean)
              .join(" ") || null,
          jobs: result.jobs,
          agentMetadata: {
            steps: result.steps,
            incomplete: result.incomplete ?? false,
            transcriptMessageCount: result.transcriptMessageCount,
            reviewTranscript: result.reviewTranscript ?? [],
            compactionState: result.compactionState ?? null,
            compactionUsedFallbackTrigger:
              result.compactionUsedFallbackTrigger ?? false,
            phaseCompletionMode: result.phaseCompletionMode ?? null,
            phaseCompletionReason: result.phaseCompletionReason ?? null,
            phaseEvidence: result.phaseEvidence ?? null,
            debugFindings: result.debugFindings ?? null,
          },
        });
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          agentOptions.signal?.aborted
        ) {
          throw error;
        }

        const detail =
          error instanceof Error
            ? error.message
            : "Unknown error during agent discovery";

        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary(
            agentOptions.searchPreferences.targetRoles,
            agentOptions.searchPreferences.locations,
            agentOptions.siteLabel,
          ),
          warning: `Agent discovery failed: ${detail}`,
          jobs: [],
          agentMetadata: null,
        });
      } finally {
        if (page) {
          setSessionState(
            source,
            "ready",
            "Browser profile ready",
            "The dedicated browser profile is open and ready for target-specific discovery.",
          );
        }
      }
    },
  };
}
