import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  ApplyExecutionResultSchema,
  BrowserSessionStateSchema,
  DiscoveryRunResultSchema,
  JobPostingSchema,
  type ApplyExecutionResult,
  type BrowserSessionState,
  type DiscoveryRunResult,
  type JobSource,
} from "@unemployed/contracts";
import type { JobFinderAiClient } from "@unemployed/ai-providers";
import {
  runAgentDiscovery,
  type AgentConfig,
  type AgentExtractorPageType,
} from "@unemployed/browser-agent";
import type {
  AgentDiscoveryOptions,
  BrowserSessionRuntime,
  ExecuteEasyApplyInput,
} from "./index";

export interface JobPageExtractionInput {
  pageText: string;
  pageUrl: string;
  pageType: "search_results" | "job_detail";
  maxJobs: number;
}

export type JobPageExtractor = (
  input: JobPageExtractionInput,
) => Promise<unknown[]>;

export interface BrowserAgentRuntimeOptions {
  userDataDir: string;
  headless?: boolean;
  maxJobsPerRun?: number;
  chromeExecutablePath?: string;
  debugPort?: number;
  jobExtractor?: JobPageExtractor;
  aiClient?: JobFinderAiClient;
}

function uniqueByKey<TValue>(
  values: readonly TValue[],
  getKey: (value: TValue) => string,
): TValue[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const key = getKey(value);

    if (!key || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [value];
  });
}

function validateJobPostings(values: readonly unknown[], context: string) {
  if (!Array.isArray(values)) {
    console.warn(
      `[BrowserRuntime] Expected an array of job postings from ${context}, received ${typeof values}.`,
    );
    return [];
  }

  return values.flatMap((value) => {
    const parsed = JobPostingSchema.safeParse(value);

    if (!parsed.success) {
      console.warn(
        `[BrowserRuntime] Skipping invalid job posting from ${context}:`,
        parsed.error.flatten(),
      );
      return [];
    }

    return [parsed.data];
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function buildChromeExecutableCandidates(explicitPath?: string): string[] {
  const candidates = explicitPath ? [explicitPath] : [];

  if (process.platform === "win32") {
    const programFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
    const programFilesX86 =
      process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";

    candidates.push(
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    );
  }

  return uniqueByKey(
    candidates.map((candidate) => candidate.trim()).filter(Boolean),
    (candidate) => candidate.toLowerCase(),
  );
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

async function waitForDebuggerEndpoint(
  debugPort: number,
  timeoutMs = 20_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isDebuggerEndpointReady(debugPort)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    "Chrome started but the remote debugging endpoint did not become ready in time.",
  );
}

async function getPrimaryPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? context.newPage();
}

function buildQuerySummary(
  targetRoles: readonly string[],
  locations: readonly string[],
  siteLabel?: string,
): string {
  const roles = targetRoles.join(", ") || "all roles";
  const preferredLocations = locations.join(", ") || "all locations";
  const target = siteLabel?.trim() || "configured target";
  return `${roles} | ${preferredLocations} | ${target}`;
}

export function createBrowserAgentRuntime(
  options: BrowserAgentRuntimeOptions,
): BrowserSessionRuntime {
  const debugPort = options.debugPort ?? 9333;
  const jobExtractor = options.jobExtractor;
  const runtimeAiClient = options.aiClient ?? null;
  let browserPromise: Promise<Browser> | null = null;
  let launchedChromeProcess: ChildProcess | null = null;
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
    if (chromeProcess.exitCode !== null || chromeProcess.killed) {
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

  async function terminateChromeProcessesByFingerprint(): Promise<void> {
    const runCommand = async (
      command: string,
      args: string[],
    ): Promise<void> => {
      await new Promise<void>((resolve) => {
        const child = spawn(command, args, {
          stdio: "ignore",
          windowsHide: true,
        });

        child.once("exit", () => resolve());
        child.once("error", () => resolve());
      });
    };

    const userDataFingerprint = `--user-data-dir=${options.userDataDir}`;
    const debugPortFingerprint = `--remote-debugging-port=${debugPort}`;

    if (process.platform === "win32") {
      return;
    }

    await runCommand("pkill", ["-f", userDataFingerprint]).catch(
      () => undefined,
    );
    await runCommand("pkill", ["-f", debugPortFingerprint]).catch(
      () => undefined,
    );
  }

  async function terminateLaunchedChromeProcess(): Promise<void> {
    const chromeProcess = launchedChromeProcess;
    launchedChromeProcess = null;

    if (!chromeProcess?.pid) {
      await terminateChromeProcessesByFingerprint();
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

    await terminateChromeProcessesByFingerprint();
  }

  async function connectBrowser(): Promise<Browser> {
    const { chromium } = await import("playwright");
    return attachBrowserLifecycle(
      await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`),
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
      if (!(await isDebuggerEndpointReady(debugPort))) {
        const chromeExecutable = await resolveChromeExecutable(
          options.chromeExecutablePath,
        );

        await mkdir(options.userDataDir, { recursive: true });

        const launchArgs = [
          `--remote-debugging-port=${debugPort}`,
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
        launchedChromeProcess.once("exit", () => {
          resetBrowserConnection();
        });
        launchedChromeProcess.unref();

        await waitForDebuggerEndpoint(debugPort);
      }

      return connectBrowser();
    })().catch((error: unknown) => {
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
    const page = await getPrimaryPage(context);
    await page.bringToFront();
    setSessionState(
      source,
      "ready",
      "Browser profile ready",
      "The dedicated browser profile is open and ready for target-specific discovery.",
    );
    return page;
  }

  return {
    async getSessionState(source) {
      return BrowserSessionStateSchema.parse({
        ...currentSessionState,
        source,
      });
    },
    async openSession(source) {
      await getReadyPage(source);
      return BrowserSessionStateSchema.parse({
        ...currentSessionState,
        source,
      });
    },
    async closeSession(source) {
      try {
        if (browserPromise) {
          const browser = await browserPromise;
          await browser.close().catch(() => {});
        }
      } catch {
        // Ignore browser close failures and continue process cleanup.
      } finally {
        await terminateLaunchedChromeProcess().catch(() => {});
        resetBrowserConnection();
      }

      return setSessionState(
        source,
        "unknown",
        "Browser profile closed",
        "The dedicated browser profile is closed. It will reopen automatically when the next run starts.",
      );
    },
    async runDiscovery(source, searchPreferences) {
      const timestamp = new Date().toISOString();

      return DiscoveryRunResultSchema.parse({
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
      });
    },
    async executeEasyApply(
      source,
      input: ExecuteEasyApplyInput,
    ): Promise<ApplyExecutionResult> {
      const startedAt = new Date().toISOString();

      return ApplyExecutionResultSchema.parse({
        state: "unsupported",
        summary: "Apply automation is not available for generic target flows",
        detail: `The current runtime does not submit applications automatically for '${input.job.title}'. Use the learned target guidance to continue manually.`,
        submittedAt: null,
        outcome: null,
        nextActionLabel: "Open the listing manually",
        checkpoints: [
          {
            id: `checkpoint_${input.job.id}_generic_apply_unsupported`,
            at: startedAt,
            label: "Apply automation unavailable",
            detail:
              "This target uses the generic debugger flow, so submission stays manual until a target-agnostic apply runtime exists.",
            state: "unsupported",
          },
        ],
      });
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
          ...(agentOptions.compaction
            ? { compaction: agentOptions.compaction }
            : {}),
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
          {
            chatWithTools: async (messages, tools, signal) =>
              ensuredAiClient.chatWithTools!(messages, tools, signal),
          },
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
                salaryText: job.salaryText,
                workMode: job.workMode,
                applyPath: job.applyPath,
                easyApplyEligible: job.easyApplyEligible,
                keySkills: job.keySkills,
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
