import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  ApplyExecutionResultSchema,
  BrowserSessionStateSchema,
  DiscoveryRunResultSchema,
  type ApplyExecutionResult,
  type BrowserSessionState,
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
    buildChromeExecutableCandidates,
    buildQuerySummary,
    findRunningChromeDebugPortForUserDataDir,
    isHttpUrlLike,
    isWarmPageReusable,
    isTcpPortReachable,
    isLikelyStalePage,
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
}): ApplyExecutionResult {
  const targetUrl = input.targetUrl ?? input.job.applicationUrl ?? input.job.canonicalUrl;
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
      },
    ],
  });
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
      (candidate) =>
        normalizeUserDataDir(candidate) === normalizedUserDataDir,
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
    await isDebuggerEndpointReady(runningDebugPortForUserDataDir)
  ) {
    return runningDebugPortForUserDataDir;
  }

  const activeDebugPortFromProfile = await readDevToolsActivePort(userDataDir);

  if (
    activeDebugPortFromProfile !== null &&
    await isDebuggerEndpointReady(activeDebugPortFromProfile)
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
    await isDebuggerEndpointOwnedByUserDataDir(
      preferredDebugPort,
      userDataDir,
    )
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
  return pages[pages.length - 1] ?? context.newPage();
}

async function resolveLivePageForContext(
  context: BrowserContext,
  options?: { bringToFront?: boolean },
): Promise<Page> {
  const bringToFront = options?.bringToFront !== false;
  const currentPages = context.pages();
  const liveHttpPage = selectLiveHttpPage(currentPages);
  const page = liveHttpPage ?? (await getPrimaryPage(context));

  if (isLikelyStalePage(page)) {
    const refreshedLiveHttpPage = selectLiveHttpPage(context.pages());
    if (refreshedLiveHttpPage) {
      if (bringToFront) {
        await refreshedLiveHttpPage.bringToFront().catch(() => undefined);
      }
      return refreshedLiveHttpPage;
    }

    const freshPage = await context.newPage();
    if (bringToFront) {
      await freshPage.bringToFront().catch(() => undefined);
    }
    return freshPage;
  }

  if (bringToFront) {
    await page.bringToFront().catch(() => undefined);
  }
  return page;
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

        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
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

  return {
    getSessionState(source) {
      return Promise.resolve(BrowserSessionStateSchema.parse({
        ...currentSessionState,
        source,
      }));
    },
    async openSession(source) {
      await getReadyPage(source);
      return BrowserSessionStateSchema.parse({
        ...currentSessionState,
        source,
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
        await terminateChromeProcess(chromeProcess, shouldTerminateChromeProcess).catch(() => {});
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

      return Promise.resolve(DiscoveryRunResultSchema.parse({
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
      }));
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

      return Promise.resolve(
        buildUnsupportedApplyResult({
          job: input.job,
          startedAt,
          mode: input.mode,
          targetUrl,
        }),
      );
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
        page = await getReadyPage(source);

        if (!isWarmPageReusable({ pageUrl: page.url(), options: agentOptions })) {
          const navigationTarget =
            agentOptions.startingUrls.find((url) => isHttpUrlLike(url)) ??
            agentOptions.startingUrls[0] ??
            null;

          if (navigationTarget) {
            await page.goto(navigationTarget, { waitUntil: "domcontentloaded" });
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
	          ...(agentOptions.weakSameHostBoard ? { weakSameHostBoard: true } : {}),
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
            return currentSessionState.status === 'ready'
              ? getPrimaryPageIfReady(context)
              : getReadyPage(source);
          },
          ...(agentOptions.compaction
            ? { compaction: agentOptions.compaction }
            : {}),
          compactionCapability: {
            tokenEstimator: ({ messages, maxOutputTokens }) => {
              const estimatedInputTokens = messages.reduce((sum, message) => {
                const messageContent = message.content ?? "";
                const contentTokens = Math.ceil(messageContent.length / 4);
                if (message.role === "assistant" && message.toolCalls) {
                  return sum + contentTokens + Math.ceil(JSON.stringify(message.toolCalls).length / 4);
                }
                if (message.role === "tool") {
                  return sum + contentTokens + Math.ceil((message.toolCallId ?? "").length / 4);
                }
                return sum + contentTokens;
              }, 0);

              return {
                estimatedInputTokens,
                estimatedTotalTokens: estimatedInputTokens + Math.max(0, maxOutputTokens),
              };
            },
            modelContextWindowTokens:
              agentOptions.modelContextWindowTokens ??
              ensuredAiClient.getStatus().modelContextWindowTokens ??
              null,
            compactionWorkflowKey:
              agentOptions.compactionWorkflowKey ??
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
            }) => {
              const jobs = validateJobPostings(
                await jobExtractor({
                  pageText: input.pageText,
                  pageUrl: input.pageUrl,
                  pageType: input.pageType,
                  maxJobs: input.maxJobs,
                }),
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
