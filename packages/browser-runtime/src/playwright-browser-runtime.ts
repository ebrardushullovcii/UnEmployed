import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdir,
  readFile,
  rename,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, CDPSession, Page } from "playwright";
import {
  ApplyExecutionResultSchema,
  ApplyVisualCheckpointSchema,
  BrowserVisualEvidenceSummarySchema,
  BrowserVisualSnapshotRefSchema,
  BrowserVisualSnapshotRequestSchema,
  BrowserSessionStateSchema,
  DiscoveryRunResultSchema,
  type ApplyExecutionResult,
  type ApplyExecutionStage,
  type ApplyExecutionTiming,
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
import { ApplicationNavigationError } from "./application-navigation-error";
import {
  buildPreparationResult,
  createApplicationRunServiceWorkerSentinel,
  installServiceWorkerRegisterGuardInPage,
  runGenericApplicationPreparation,
  type ServiceWorkerSafetyFinding,
} from "./playwright-application-flow";
import {
  executeExactlyOneFinalAction as executeExactlyOneFinalActionOnPage,
  observeApplicationForm as observeApplicationFormOnPage,
} from "./application-submission-browser-hands";
import type {
  ExecuteExactlyOneFinalActionInput,
  ObserveApplicationFormOptions,
} from "./application-submission-browser-hands";
import {
  createInconclusiveSourceAccessProbeResult,
  inspectSourceAccessPage,
} from "./source-access-probe";
import {
  areStructurallyEquivalentHttpUrls,
  bringPageToFrontBestEffort,
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

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// connectOverCDP attaches the persistent default context without accepting
// Playwright's serviceWorkers:"block" context option, so the same hardened
// registration guard Playwright would install for that option is applied
// explicitly before managed flows navigate. The installer hardens both the
// ServiceWorkerContainer prototype and instance non-configurably before site
// scripts run in every document and frame.
const SERVICE_WORKER_BLOCK_INIT_SCRIPT =
  installServiceWorkerRegisterGuardInPage;

const serviceWorkerBlockedContexts = new WeakSet<BrowserContext>();

async function blockServiceWorkersOnManagedContext(
  context: BrowserContext,
): Promise<void> {
  if (serviceWorkerBlockedContexts.has(context)) {
    return;
  }

  serviceWorkerBlockedContexts.add(context);

  // Hosts that do not expose init scripts cannot carry the block; installation
  // failures on capable hosts remain fatal.
  if (typeof context.addInitScript !== "function") {
    return;
  }

  try {
    await context.addInitScript(SERVICE_WORKER_BLOCK_INIT_SCRIPT);
  } catch (error) {
    serviceWorkerBlockedContexts.delete(context);
    throw error;
  }
}

export type ActiveServiceWorkerBlockReason =
  | "active_service_worker_controlling_application_origin"
  | "service_worker_origin_unresolved"
  | "service_worker_inspection_unavailable";

export class ActiveServiceWorkerBlockError extends Error {
  readonly code = "active_service_worker_block" as const;
  readonly reason: ActiveServiceWorkerBlockReason;
  readonly targetUrl: string;
  readonly serviceWorkerUrls: string[];

  constructor(input: {
    reason: ActiveServiceWorkerBlockReason;
    targetUrl: string;
    detail: string;
    serviceWorkerUrls?: string[];
  }) {
    super(input.detail);
    this.name = "ActiveServiceWorkerBlockError";
    this.reason = input.reason;
    this.targetUrl = input.targetUrl;
    this.serviceWorkerUrls = input.serviceWorkerUrls ?? [];
  }
}

function parseHttpOrigin(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function assertNoActiveServiceWorkerControlsApplicationOrigin(input: {
  context: BrowserContext;
  targetUrl: string;
}): void {
  if (typeof input.context.serviceWorkers !== "function") {
    throw new ActiveServiceWorkerBlockError({
      reason: "service_worker_inspection_unavailable",
      targetUrl: input.targetUrl,
      detail: `Active service workers could not be inspected on the managed browser context before opening ${input.targetUrl}. Reset the dedicated browser profile from Safeguards, then finish this application manually.`,
    });
  }

  let activeWorkers;
  try {
    activeWorkers = input.context.serviceWorkers();
  } catch (error) {
    throw new ActiveServiceWorkerBlockError({
      reason: "service_worker_inspection_unavailable",
      targetUrl: input.targetUrl,
      detail: `Active service workers could not be inspected on the managed browser context before opening ${input.targetUrl}: ${
        error instanceof Error ? error.message : "unknown inspection error"
      }. Reset the dedicated browser profile from Safeguards, then finish this application manually.`,
    });
  }

  const targetOrigin = parseHttpOrigin(input.targetUrl);
  if (!targetOrigin) {
    throw new ActiveServiceWorkerBlockError({
      reason: "service_worker_origin_unresolved",
      targetUrl: input.targetUrl,
      detail: `The application origin for ${input.targetUrl} could not be safely determined while active browser service workers exist. Reset the dedicated browser profile from Safeguards, then finish this application manually.`,
    });
  }

  const controllingWorkerUrls: string[] = [];
  const unresolvedWorkerUrls: string[] = [];
  for (const worker of activeWorkers) {
    const workerUrl = worker.url();
    const workerOrigin = parseHttpOrigin(workerUrl);
    if (!workerOrigin) {
      unresolvedWorkerUrls.push(workerUrl);
    } else if (workerOrigin === targetOrigin) {
      controllingWorkerUrls.push(workerUrl);
    }
  }

  if (controllingWorkerUrls.length > 0) {
    throw new ActiveServiceWorkerBlockError({
      reason: "active_service_worker_controlling_application_origin",
      targetUrl: input.targetUrl,
      detail: `An active service worker (${controllingWorkerUrls.join(", ")}) can control the application origin ${targetOrigin}. Close or reset the dedicated browser profile so the worker stops, then finish this application manually; automated preparation stays stopped.`,
      serviceWorkerUrls: controllingWorkerUrls,
    });
  }

  if (unresolvedWorkerUrls.length > 0) {
    throw new ActiveServiceWorkerBlockError({
      reason: "service_worker_origin_unresolved",
      targetUrl: input.targetUrl,
      detail: `An active service worker (${unresolvedWorkerUrls.join(", ")}) has an origin that cannot be safely determined relative to ${targetOrigin}. Reset the dedicated browser profile from Safeguards, then finish this application manually.`,
      serviceWorkerUrls: unresolvedWorkerUrls,
    });
  }
}

function buildServiceWorkerSafetyStopResult(input: {
  executionInput: ExecuteApplicationFlowInput;
  finding: ServiceWorkerSafetyFinding;
}): ApplyExecutionResult {
  const targetUrl =
    input.executionInput.job.applicationUrl ??
    input.executionInput.job.canonicalUrl;
  const detail = `${input.finding.detail} The runtime stopped before any further field or click action and left every service-worker registration untouched. Reset the dedicated browser profile from Safeguards, then finish this application manually.`;
  return buildPreparationResult({
    executionInput: input.executionInput,
    summary: "A service worker can influence this application origin",
    detail,
    questions: [],
    blocker: {
      code: "requires_manual_review",
      summary: "A service worker can influence this application origin.",
      detail,
      questionIds: [],
      sourceDebugEvidenceRefIds: [],
      url: isHttpUrlLike(targetUrl) ? targetUrl : null,
    },
    checkpoints: [],
    checkpointLabel: "Paused for an application-origin service worker",
    checkpointDetail: detail,
    checkpointUrls: isHttpUrlLike(targetUrl) ? [targetUrl] : [],
    lastUrl: isHttpUrlLike(targetUrl) ? targetUrl : null,
    now: new Date().toISOString(),
    nextActionLabel:
      "Reset the browser profile, then finish this application manually",
  });
}

async function markManagedChromeProfileExitedCleanly(
  userDataDir: string,
): Promise<void> {
  const preferencesPath = join(userDataDir, "Default", "Preferences");
  let preferencesText: string;

  try {
    preferencesText = await readFile(preferencesPath, "utf8");
  } catch {
    return;
  }

  try {
    const preferences: unknown = JSON.parse(preferencesText);
    if (!isJsonRecord(preferences)) {
      return;
    }

    const existingProfile = isJsonRecord(preferences.profile)
      ? preferences.profile
      : {};
    if (
      existingProfile.exit_type === "Normal" &&
      existingProfile.exited_cleanly === true
    ) {
      return;
    }

    const temporaryPath = `${preferencesPath}.unemployed-clean-exit-${process.pid}`;
    await writeFile(
      temporaryPath,
      JSON.stringify({
        ...preferences,
        profile: {
          ...existingProfile,
          exit_type: "Normal",
          exited_cleanly: true,
        },
      }),
      "utf8",
    );
    try {
      await rename(temporaryPath, preferencesPath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  } catch {
    // A malformed or temporarily locked Preferences file must not block the browser.
  }
}

export function createAgentChatWithToolsBridge(
  chatWithTools: NonNullable<JobFinderAiClient["chatWithTools"]>,
): LLMClient {
  return {
    chatWithTools,
  };
}

/**
 * ADR 0013 compact-first discovery can finish without model tools. When the
 * configured client lacks `chatWithTools`, keep a rejecting stub so escalation
 * fails with the same honest warning instead of skipping the page scan.
 */
export function resolveAgentDiscoveryChatWithTools(
  chatWithTools: JobFinderAiClient["chatWithTools"] | undefined,
): NonNullable<JobFinderAiClient["chatWithTools"]> {
  return (
    chatWithTools ??
    (() =>
      Promise.reject(
        new Error(
          "AI client does not support tool calling. Cannot run agent discovery.",
        ),
      ))
  );
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
  visualObservationSets: NonNullable<
    ApplyExecutionResult["visualObservationSets"]
  >;
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

interface ManagedBrowserWindowBounds {
  height: number;
  width: number;
  x?: number;
  y?: number;
  windowState?: "normal" | "minimized" | "maximized" | "fullscreen";
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

async function getDebuggerWebSocketUrl(
  debugPort: number,
): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const webSocketDebuggerUrl = payload.webSocketDebuggerUrl;
    return typeof webSocketDebuggerUrl === "string" &&
      /^wss?:\/\//iu.test(webSocketDebuggerUrl)
      ? webSocketDebuggerUrl
      : null;
  } catch {
    return null;
  }
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
      [...pathsToDelete].map((path) =>
        rm(path, { force: true }).catch(() => {}),
      ),
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
  let windowsLauncherExitedAt: number | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (await isDebuggerEndpointReady(debugPort)) {
      return;
    }

    if (
      chromeProcess &&
      chromeProcess.exitCode !== null &&
      process.platform !== "win32"
    ) {
      throw new Error(
        `Chrome exited before the remote debugging endpoint on port ${debugPort} became ready.`,
      );
    }

    if (chromeProcess?.exitCode !== null && process.platform === "win32") {
      windowsLauncherExitedAt ??= Date.now();
      if (Date.now() - windowsLauncherExitedAt >= 5_000) {
        throw new Error(
          `Chrome exited before the remote debugging endpoint on port ${debugPort} became ready.`,
        );
      }
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
    await bringPageToFrontBestEffort(page);
  }
  return page;
}

async function resolveAutomationPageForContext(
  context: BrowserContext,
  options: {
    targetUrl?: string | null;
    bringToFront?: boolean;
    closeOtherPages?: boolean;
    reuseExistingPage?: boolean;
    onPageResolved?: (page: Page) => void;
  } = {},
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
  const blankPage =
    openPages.find((page) => !isHttpUrlLike(page.url())) ?? null;
  const reusableLivePage = selectLiveHttpPage(openPages);
  const page =
    options.reuseExistingPage === false
      ? await context.newPage()
      : (exactTargetPage ??
        blankPage ??
        reusableLivePage ??
        (await context.newPage()));
  options.onPageResolved?.(page);

  if (options.closeOtherPages && options.reuseExistingPage !== false) {
    await Promise.allSettled(
      openPages
        .filter((candidate) => candidate !== page)
        .map(async (candidate) => candidate.close()),
    );
  }

  if (options.bringToFront !== false) {
    await bringPageToFrontBestEffort(page);
  }

  return page;
}

async function prepareAutomationPageForTarget(
  context: BrowserContext,
  options: {
    targetUrl: string;
    setBlockedState: (detail: string) => void;
    bringToFront?: boolean;
    navigationTimeoutMs?: number;
    acceptTargetOriginAfterTimeout?: boolean;
    closeOtherPages?: boolean;
    reuseExistingPage?: boolean;
    signal?: AbortSignal;
    onPageResolved?: (page: Page) => void;
  },
): Promise<{
  page: Page;
  alreadyAtTarget: boolean;
  navigatedToTarget: boolean;
}> {
  options.signal?.throwIfAborted();
  const page = await resolveAutomationPageForContext(context, {
    targetUrl: options.targetUrl,
    bringToFront: false,
    ...(options.reuseExistingPage !== undefined
      ? { reuseExistingPage: options.reuseExistingPage }
      : {}),
    ...(options.closeOtherPages !== undefined
      ? { closeOtherPages: options.closeOtherPages }
      : {}),
    ...(options.onPageResolved
      ? { onPageResolved: options.onPageResolved }
      : {}),
  });
  options.signal?.throwIfAborted();
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
        ...(options.navigationTimeoutMs
          ? { timeout: options.navigationTimeoutMs }
          : {}),
      });
      options.signal?.throwIfAborted();
    } catch (error) {
      const timeoutReached =
        error instanceof Error && error.name === "TimeoutError";
      const targetOriginReached = (() => {
        try {
          return (
            new URL(page.url()).origin === new URL(options.targetUrl).origin
          );
        } catch {
          return false;
        }
      })();

      if (
        timeoutReached &&
        options.acceptTargetOriginAfterTimeout === true &&
        targetOriginReached
      ) {
        navigatedToTarget = true;
      } else {
        const detail =
          error instanceof Error
            ? error.message
            : `The dedicated browser profile could not open ${options.targetUrl}.`;
        options.setBlockedState(detail);
        // Classify once at the goto boundary so consumers can separate
        // "the employer page never opened" from every other failure mode.
        throw new ApplicationNavigationError({
          targetUrl: options.targetUrl,
          diagnosticDetail: detail,
          ...(error instanceof Error ? { cause: error } : {}),
        });
      }
    }
  }

  if (options.bringToFront !== false || navigatedToTarget) {
    await bringPageToFrontBestEffort(page);
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
  let applicationExecutionTail: Promise<void> = Promise.resolve();
  const windowBoundsPath = join(
    options.userDataDir,
    "unemployed-browser-window-bounds.json",
  );

  function parseManagedBrowserWindowBounds(
    value: unknown,
  ): ManagedBrowserWindowBounds | null {
    if (!isJsonRecord(value)) return null;
    const width = value.width;
    const height = value.height;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 640 ||
      height < 480
    ) {
      return null;
    }
    return {
      width: Math.round(width),
      height: Math.round(height),
      ...(typeof value.x === "number" && Number.isFinite(value.x)
        ? { x: Math.round(value.x) }
        : {}),
      ...(typeof value.y === "number" && Number.isFinite(value.y)
        ? { y: Math.round(value.y) }
        : {}),
      ...(value.windowState === "normal" ||
      value.windowState === "minimized" ||
      value.windowState === "maximized" ||
      value.windowState === "fullscreen"
        ? { windowState: value.windowState }
        : {}),
    };
  }

  async function getBrowserWindowSession(browser: Browser): Promise<{
    session: CDPSession;
    windowId: number;
    bounds: ManagedBrowserWindowBounds;
  } | null> {
    const page = browser.contexts().flatMap((context) => context.pages())[0];
    if (!page) return null;
    const session = await page.context().newCDPSession(page);
    try {
      const info = await session.send("Browser.getWindowForTarget");
      const bounds = parseManagedBrowserWindowBounds(info.bounds);
      if (!bounds) {
        await session.detach().catch(() => undefined);
        return null;
      }
      return {
        session,
        windowId: info.windowId,
        bounds,
      };
    } catch (error) {
      await session.detach().catch(() => undefined);
      throw error;
    }
  }

  async function restoreBrowserWindowBounds(browser: Browser): Promise<void> {
    if (options.headless) return;
    const saved = await readFile(windowBoundsPath, "utf8")
      .then((content) => parseManagedBrowserWindowBounds(JSON.parse(content)))
      .catch(() => null);
    const connection = await getBrowserWindowSession(browser).catch(() => null);
    if (!connection) return;
    try {
      await connection.session.send("Browser.setWindowBounds", {
        windowId: connection.windowId,
        bounds: saved ?? { width: 1280, height: 820, windowState: "normal" },
      });
    } finally {
      await connection.session.detach().catch(() => undefined);
    }
  }

  async function persistBrowserWindowBounds(browser: Browser): Promise<void> {
    if (options.headless) return;
    const connection = await getBrowserWindowSession(browser).catch(() => null);
    if (!connection) return;
    try {
      const parsed = parseManagedBrowserWindowBounds(connection.bounds);
      if (!parsed) return;
      await mkdir(options.userDataDir, { recursive: true });
      const temporaryPath = `${windowBoundsPath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(parsed), "utf8");
      await rename(temporaryPath, windowBoundsPath);
    } finally {
      await connection.session.detach().catch(() => undefined);
    }
  }
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
    if (
      !shouldTerminate ||
      !chromeProcess?.pid ||
      chromeProcess.exitCode !== null
    ) {
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
    const cdpEndpoint =
      (await getDebuggerWebSocketUrl(activeDebugPort)) ??
      `http://127.0.0.1:${activeDebugPort}`;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const browser = attachBrowserLifecycle(
          await chromium.connectOverCDP(cdpEndpoint, {
            timeout: 5_000,
          }),
        );
        await restoreBrowserWindowBounds(browser).catch(() => undefined);
        return browser;
      } catch (error) {
        lastError = error;

        if (attempt === 2) {
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
        await markManagedChromeProfileExitedCleanly(options.userDataDir);

        const launchArgs = [
          `--remote-debugging-port=${activeDebugPort}`,
          `--user-data-dir=${options.userDataDir}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-session-crashed-bubble",
          "--hide-crash-restore-bubble",
          // Extension service workers can observe or mutate application pages
          // outside the typed runtime boundary. Keep the managed profile's
          // ordinary cookies/session state, but never activate installed
          // extensions in an automation-owned Chrome process.
          "--disable-extensions",
          // Chrome can still start bundled component-extension background
          // workers when ordinary extensions are disabled. Those workers are
          // unrelated to an ATS page but must not make the fail-closed active
          // worker gate reject every fresh managed profile.
          "--disable-component-extensions-with-background-pages",
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
          // Chrome on Windows can hand off from the short-lived process returned
          // by spawn to a continuing browser process. The CDP connection owns the
          // authoritative lifecycle after that handoff.
          if (process.platform !== "win32") {
            resetBrowserConnection();
          }
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

    await blockServiceWorkersOnManagedContext(context);

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
      closeOtherPages: true,
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
    reuseExistingPage?: boolean;
    targetUrl?: string | null;
  }): Promise<BrowserSessionState> {
    const normalizedTargetUrl =
      typeof input.targetUrl === "string" ? input.targetUrl.trim() : "";
    if (isHttpUrlLike(normalizedTargetUrl)) {
      await prepareAutomationPageForTarget(await getContext(), {
        targetUrl: normalizedTargetUrl,
        ...(input.reuseExistingPage !== undefined
          ? { reuseExistingPage: input.reuseExistingPage }
          : {}),
        bringToFront: true,
        closeOtherPages: true,
        navigationTimeoutMs: 8_000,
        acceptTargetOriginAfterTimeout: true,
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

  async function observeApplicationFormForSource(
    source: JobSource,
    observeOptions?: ObserveApplicationFormOptions,
  ) {
    return observeApplicationFormOnPage(
      await getReadyPage(source),
      observeOptions,
    );
  }

  async function executeExactlyOneFinalActionForSource(
    source: JobSource,
    actionInput: ExecuteExactlyOneFinalActionInput,
  ) {
    actionInput.signal?.throwIfAborted();
    return executeExactlyOneFinalActionOnPage(
      await getReadyPage(source),
      actionInput,
    );
  }

  function withApplicationExecutionLock<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const run = applicationExecutionTail.then(operation, operation);
    applicationExecutionTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
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
        ...(options?.reuseExistingPage !== undefined
          ? { reuseExistingPage: options.reuseExistingPage }
          : {}),
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
            await persistBrowserWindowBounds(browser).catch(() => undefined);
            const browserClosedGracefully = await browser.close().then(
              () => true,
              () => false,
            );
            if (browserClosedGracefully && chromeProcess) {
              await waitForChromeProcessExit(chromeProcess, 5_000);
            }
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
    async inspectSourceAccess(source, input) {
      void source;
      if (!browserPromise) {
        return createInconclusiveSourceAccessProbeResult(input);
      }

      const browser = await browserPromise.catch(() => null);
      if (!browser || !browser.isConnected()) {
        return createInconclusiveSourceAccessProbeResult(input);
      }

      const pages = browser.contexts().flatMap((context) => context.pages());
      const page = selectLiveHttpPage(pages);
      return page
        ? inspectSourceAccessPage(page, input)
        : createInconclusiveSourceAccessProbeResult(input);
    },
    observeApplicationForm: observeApplicationFormForSource,
    executeExactlyOneFinalAction: executeExactlyOneFinalActionForSource,
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
          inventoryCompleteness: "unknown",
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
      options,
    ): Promise<ApplyExecutionResult> {
      return withApplicationExecutionLock(async () => {
        const executionStartedAtMs = Date.now();
        const startedAt = new Date(executionStartedAtMs).toISOString();
        const executionTimings: ApplyExecutionTiming[] = [];
        const recordExecutionTiming = (
          stage: ApplyExecutionStage,
          stageStartedAtMs: number,
        ): void => {
          const completedAtMs = Date.now();
          executionTimings.push({
            stage,
            startedAt: new Date(stageStartedAtMs).toISOString(),
            completedAt: new Date(completedAtMs).toISOString(),
            durationMs: Math.max(0, completedAtMs - stageStartedAtMs),
          });
        };
        const targetUrl = input.job.applicationUrl ?? input.job.canonicalUrl;
        const resumeFilePath = input.resumeArtifact.filePath.trim();
        const approvedResumeFileExists = resumeFilePath
          ? await pathExists(resumeFilePath)
          : false;
        let executionResult: ApplyExecutionResult;
        let applicationPageOpened = false;

        if (
          input.resumeArtifact.jobId !== input.job.id ||
          !approvedResumeFileExists
        ) {
          const detail =
            "The production runtime refused to open the application because the approved application resume is missing or does not belong to this job.";
          executionResult = buildPreparationResult({
            executionInput: input,
            state: "failed",
            summary: "Approved resume export is missing",
            detail,
            questions: [],
            blocker: {
              code: "missing_resume",
              summary: "A current approved resume export is required.",
              detail,
              questionIds: [],
              sourceDebugEvidenceRefIds: [],
              url: isHttpUrlLike(targetUrl) ? targetUrl : null,
            },
            checkpoints: [],
            checkpointLabel: "Stopped before opening the application",
            checkpointDetail: detail,
            checkpointUrls: isHttpUrlLike(targetUrl) ? [targetUrl] : [],
            lastUrl: isHttpUrlLike(targetUrl) ? targetUrl : null,
            now: startedAt,
            nextActionLabel: "Export and approve the tailored resume",
          });
        } else if (!isHttpUrlLike(targetUrl)) {
          executionResult = buildUnsupportedApplyResult({
            job: input.job,
            startedAt,
            mode: input.mode,
            targetUrl: null,
          });
        } else {
          const browserPreparationStartedAtMs = Date.now();
          let formPreparationStartedAtMs: number | null = null;
          let workingPage: Page | null = null;
          const closeWorkingPageOnAbort = () => {
            if (workingPage) {
              void workingPage.close().catch(() => undefined);
            }
          };
          options?.signal?.addEventListener("abort", closeWorkingPageOnAbort, {
            once: true,
          });
          try {
            const context = await getContext();
            assertNoActiveServiceWorkerControlsApplicationOrigin({
              context,
              targetUrl,
            });
            const runSentinel = createApplicationRunServiceWorkerSentinel({
              context,
              targetUrl,
            });
            try {
              const preNavigationFinding = await runSentinel.check(
                "browser_preparation",
              );
              if (preNavigationFinding) {
                executionResult = buildServiceWorkerSafetyStopResult({
                  executionInput: input,
                  finding: preNavigationFinding,
                });
              } else {
                const prepared = await prepareAutomationPageForTarget(context, {
                  targetUrl,
                  bringToFront: true,
                  closeOtherPages: true,
                  ...(options?.signal ? { signal: options.signal } : {}),
                  onPageResolved: (page) => {
                    workingPage = page;
                    runSentinel.attachPage(page);
                    if (options?.signal?.aborted) {
                      closeWorkingPageOnAbort();
                    }
                  },
                  setBlockedState: (detail) => {
                    setSessionState(
                      source,
                      "blocked",
                      "Application navigation failed",
                      detail,
                    );
                  },
                });
                options?.signal?.throwIfAborted();
                const postNavigationFinding =
                  await runSentinel.check("post_navigation");
                if (postNavigationFinding) {
                  applicationPageOpened = true;
                  recordExecutionTiming(
                    "browser_preparation",
                    browserPreparationStartedAtMs,
                  );
                  executionResult = buildServiceWorkerSafetyStopResult({
                    executionInput: input,
                    finding: postNavigationFinding,
                  });
                } else {
                  applicationPageOpened = true;
                  recordExecutionTiming(
                    "browser_preparation",
                    browserPreparationStartedAtMs,
                  );
                  setSessionState(
                    source,
                    "ready",
                    "Application preparation paused safely",
                    "The dedicated browser profile is open at the current application checkpoint. Final submission remains disabled.",
                  );
                  formPreparationStartedAtMs = Date.now();
                  executionResult = await runGenericApplicationPreparation({
                    context,
                    page: prepared.page,
                    executionInput: input,
                    startedAt,
                    ...(options?.signal ? { signal: options.signal } : {}),
                    sentinel: runSentinel,
                  });
                  options?.signal?.throwIfAborted();
                  recordExecutionTiming(
                    "form_preparation",
                    formPreparationStartedAtMs,
                  );
                }
              }
            } finally {
              runSentinel.detach();
            }
          } catch (error) {
            if (options?.signal?.aborted) {
              throw error;
            }
            if (!applicationPageOpened) {
              recordExecutionTiming(
                "browser_preparation",
                browserPreparationStartedAtMs,
              );
            } else if (formPreparationStartedAtMs !== null) {
              recordExecutionTiming(
                "form_preparation",
                formPreparationStartedAtMs,
              );
            }
            const errorDetail =
              error instanceof Error
                ? error.message
                : "The application page could not be inspected safely.";
            if (error instanceof ApplicationNavigationError) {
              // The employer page never opened, so this is a technical failure,
              // not a Needs-you step: report it failed with causal-free copy.
              // Raw transport detail stays in session diagnostics only.
              const unreachableDetail = `${error.userDetail}`;
              executionResult = buildPreparationResult({
                executionInput: input,
                state: "failed",
                summary: error.userSummary,
                detail: unreachableDetail,
                questions: [],
                blocker: {
                  code: "application_page_unreachable",
                  summary: `${error.userSummary}.`,
                  detail: unreachableDetail,
                  questionIds: [],
                  sourceDebugEvidenceRefIds: [],
                  url: isHttpUrlLike(targetUrl) ? targetUrl : null,
                },
                checkpoints: [],
                checkpointLabel: "Failed before the application page opened",
                checkpointDetail: unreachableDetail,
                checkpointUrls: isHttpUrlLike(targetUrl) ? [targetUrl] : [],
                lastUrl: isHttpUrlLike(targetUrl) ? targetUrl : null,
                now: new Date().toISOString(),
                nextActionLabel: "Retry preparation",
              });
            } else {
              const detail = `The runtime stopped without submitting after browser preparation failed: ${errorDetail}`;
              executionResult = buildPreparationResult({
                executionInput: input,
                summary: "Application preparation stopped safely",
                detail,
                questions: [],
                blocker: {
                  code: "requires_manual_review",
                  summary: "The live application page needs manual review.",
                  detail,
                  questionIds: [],
                  sourceDebugEvidenceRefIds: [],
                  url: targetUrl,
                },
                checkpoints: [],
                checkpointLabel: "Stopped after a safe browser failure",
                checkpointDetail: detail,
                checkpointUrls: [targetUrl],
                lastUrl: targetUrl,
                now: new Date().toISOString(),
                nextActionLabel: "Inspect the application page manually",
              });
            }
          } finally {
            options?.signal?.removeEventListener(
              "abort",
              closeWorkingPageOnAbort,
            );
            const pageToClose = workingPage as Page | null;
            if (
              options?.signal?.aborted &&
              pageToClose &&
              !pageToClose.isClosed()
            ) {
              await pageToClose.close().catch(() => undefined);
            }
          }
        }

        const visualDiagnosticsStartedAtMs = Date.now();
        const visualDiagnostics = applicationPageOpened
          ? await buildApplyVisualDiagnostics({
              job: input.job,
              mode: input.mode,
              targetUrl: executionResult.replay.lastUrl ?? targetUrl,
              ...(input.captureVisualSnapshot
                ? { captureVisualSnapshot: input.captureVisualSnapshot }
                : {}),
              ...(input.analyzeVisualSnapshot
                ? { analyzeVisualSnapshot: input.analyzeVisualSnapshot }
                : {}),
            })
          : {
              visualEvidence: [],
              visualObservationSets: [],
              visualCheckpoints: [],
            };
        if (applicationPageOpened) {
          recordExecutionTiming(
            "visual_diagnostics",
            visualDiagnosticsStartedAtMs,
          );
        }
        recordExecutionTiming("total", executionStartedAtMs);
        const lastCheckpointIndex = executionResult.checkpoints.length - 1;

        return ApplyExecutionResultSchema.parse({
          ...executionResult,
          checkpoints: executionResult.checkpoints.map((checkpoint, index) =>
            index === lastCheckpointIndex
              ? {
                  ...checkpoint,
                  visualEvidence: visualDiagnostics.visualEvidence,
                }
              : checkpoint,
          ),
          visualEvidence: visualDiagnostics.visualEvidence,
          visualObservationSets: visualDiagnostics.visualObservationSets,
          visualCheckpoints: visualDiagnostics.visualCheckpoints,
          executionTimings,
        });
      });
    },
    async captureVisualSnapshot(source, request: BrowserVisualSnapshotRequest) {
      return captureVisualSnapshotForSource(source, request);
    },
    async runAgentDiscovery(
      source: JobSource,
      agentOptions: AgentDiscoveryOptions,
    ): Promise<DiscoveryRunResult> {
      const startedAt = new Date().toISOString();
      const aiClient = agentOptions.aiClient ?? runtimeAiClient;

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
          inventoryCompleteness: "unknown",
          jobs: [],
        });
      }

      // ADR 0013: compact-first observation can finish without any model.
      // Missing or tool-less AI must therefore reach the page scan. Escalation
      // alone uses the rejecting stub below and preserves the honest warning
      // when deterministic observation cannot finish the requested inventory.
      const chatWithTools = resolveAgentDiscoveryChatWithTools(
        aiClient?.chatWithTools,
      );

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
          ...(agentOptions.runControl
            ? { runControl: agentOptions.runControl }
            : {}),
          ...(agentOptions.resumeCheckpoint
            ? { resumeCheckpoint: agentOptions.resumeCheckpoint }
            : {}),
          ...(agentOptions.onCheckpoint
            ? { onCheckpoint: agentOptions.onCheckpoint }
            : {}),
          targetJobCount: agentOptions.targetJobCount,
          userProfile: agentOptions.userProfile,
          searchPreferences: {
            targetRoles: agentOptions.searchPreferences.targetRoles,
            locations: agentOptions.searchPreferences.locations,
            workModes: agentOptions.searchPreferences.workModes ?? [],
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
                    captureVisualSnapshotForPage(
                      snapshotPage ?? page!,
                      request,
                    ),
                  analyzeSnapshot: ({ snapshot, context }) =>
                    aiClient?.analyzeBrowserVisualSnapshot
                      ? aiClient.analyzeBrowserVisualSnapshot({
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
              aiClient?.getStatus().modelContextWindowTokens ??
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
          createAgentChatWithToolsBridge(chatWithTools),
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
                providerUpdatedAt: job.providerUpdatedAt,
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
              result.warning ?? null,
              result.error
                ? `Discovery encountered an error: ${result.error}`
                : null,
            ]
              .filter(Boolean)
              .join(" ") || null,
          inventoryCompleteness: "partial",
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
          inventoryCompleteness: "unknown",
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
