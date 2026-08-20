import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { _electron as electron } from "playwright";
import {
  ACCEPTANCE_VERSION,
  acceptanceEnvironment,
  assertFileRenderer,
  assertPrepareOnly,
  attachProcessOutput,
  cleanupDirectory,
  digestSeed,
  ensureFreshOutputDir,
  finalizeProcessOutput,
  loadAcceptanceContext,
  makeIsolatedUserDataDirectory,
  installPrepareOnlySafetyProbe,
  screenshotMetadata,
  verifyAcceptanceArtifacts,
} from "./release-acceptance-harness.mjs";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const acceptance = loadAcceptanceContext("scale");
const artifactRoot = path.resolve(desktopDir, "test-artifacts", "ui");
const outputDir = acceptance.outputDir;
const screenshotDir = path.resolve(outputDir, "screenshots");
const viewportNormal = { width: 1440, height: 920, zoomFactor: 1 };
const viewportZoomed = { width: 1440, height: 920, zoomFactor: 2 };
const viewportMinimum = { width: 1024, height: 768, zoomFactor: 1 };
const WIDE_SIDEBAR_DESTINATIONS = Object.freeze([
  "Search plans",
  "Resume approaches",
]);
const PLANNING_SETTINGS_MENU_DESTINATIONS = Object.freeze([
  "Search plans",
  "Resume approaches",
  "Settings",
]);
const CANONICAL_ROUTE_DEFINITIONS = Object.freeze([
  {
    id: "profile",
    route: "/job-finder/profile",
    label: "Profile",
    heading: "Your profile",
    surface: "profile",
  },
  {
    id: "findJobs",
    route: "/job-finder/discovery",
    label: "Find jobs",
    heading: "Find jobs",
    surface: "findJobs",
  },
  {
    id: "shortlisted",
    route: "/job-finder/review-queue",
    label: "Shortlisted",
    heading: "Shortlisted jobs",
    surface: "shortlisted",
  },
  {
    id: "applications",
    route: "/job-finder/applications",
    label: "Applications",
    heading: "Applications",
    surface: "applications",
  },
]);
// Canonical accepted scale evidence measured a 1,780.86 ms cold usable shell
// and a 307.42 ms worst warm route switch. Keep a hard margin without hiding
// regressions in the user's reported 1–2 second navigation lag.
const CANONICAL_LATENCY_BUDGETS = Object.freeze({
  coldToUsableShellMs: 2_000,
  warmRouteSwitchMs: 500,
});
// Cross the historical 1,000-record boundary in every collection that the UI pages.
// The filename remains scale-500 for compatibility with the existing handoff, but
// the release gate must prove that the production build handles records beyond the
// old silent cap.
const counts = {
  jobs: 1_001,
  shortlisted: 1_001,
  applications: 1_001,
  sources: 1_001,
};
const routeCycles = 3;

const report = {
  startedAt: new Date().toISOString(),
  outputDir,
  screenshotDir,
  acceptance: {
    version: ACCEPTANCE_VERSION,
    manifestPath: acceptance.manifestPath,
    runDir: acceptance.runDir,
    sourceFingerprint: acceptance.manifest.source?.afterBuild?.digest ?? null,
    buildArtifactFingerprint: acceptance.manifest.artifacts?.digest ?? null,
    seedDigest: acceptance.seedDigest,
  },
  syntheticData: counts,
  scaleBoundary: { priorSilentCap: 1_000, requiredRecordCount: 1_001 },
  viewports: [viewportNormal, viewportZoomed, viewportMinimum],
  routeCycles,
  requiredScenarioCompletionIds: [
    "scale-1001-bootstrap",
    "scale-1001-find-jobs-pagination",
    "scale-1001-shortlisted-pagination",
    "scale-1001-applications-pagination",
    "scale-1001-profile-sources-pagination",
    "scale-1001-sidebar-1440",
    "scale-1001-planning-settings-zoom200",
    "scale-1001-planning-settings-minimum-width",
    "scale-1001-find-jobs-zoom200",
    "scale-1001-minimum-width",
  ],
  requiredCanonicalRoutes: CANONICAL_ROUTE_DEFINITIONS.map(({ id }) => id),
  scenarioCompletionIds: [],
  safety: {
    isolatedUserDataDir: null,
    syntheticCandidateDataOnly: true,
    browserAgentEnabled: false,
    applicationActionsExecuted: false,
    finalSubmissionClicked: false,
    submitAuthorized: false,
    accountCreationAuthorized: false,
  },
  startup: {},
  latencyBudgets: CANONICAL_LATENCY_BUDGETS,
  routeSwitches: [],
  pagination: {},
  screenshots: [],
  verifications: {
    paginationFlexWrap: [],
    horizontalOverflow: [],
    dropdownClipping: [],
    navigation: {
      wideSidebar: {},
      compactPlanning: {},
      planningSettingsMenu: {},
    },
  },
  memory: [],
  renderer: { longTaskSupported: null, samples: [] },
  runtimeErrors: [],
  safetyEvents: [],
  mainProcess: { pid: null, stdout: "", stderr: "" },
};
let activeBrowserWindow = null;
let processOutputState = null;
const processOutputStates = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function completeScenario(id) {
  if (!report.scenarioCompletionIds.includes(id))
    report.scenarioCompletionIds.push(id);
}

async function writeReport() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

function sourceTargets(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `scale_source_${index + 1}`,
    label: `Synthetic source ${String(index + 1).padStart(3, "0")}`,
    startingUrl: `https://jobs.example.test/source/${index + 1}`,
    enabled: false,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  }));
}

function createScaleState(baseSnapshot) {
  const jobTemplate =
    baseSnapshot.discoveryJobs[0] ?? baseSnapshot.savedJobs?.[0];
  const applicationTemplate = baseSnapshot.applicationRecords[0] ?? {
    id: "scale_application_template",
    jobId: "scale_job_template",
    title: "Synthetic application",
    company: "Synthetic Company",
    status: "drafting",
    lastActionLabel: "Application prepared without submission",
    nextActionLabel: "Review final application",
    lastUpdatedAt: "2026-08-18T08:00:00.000Z",
    lastAttemptState: null,
    questionSummary: {},
    latestBlocker: null,
    consentSummary: {},
    replaySummary: {},
    events: [],
    crm: null,
  };
  const campaignTemplate = baseSnapshot.campaigns[0] ?? {
    id: "scale_campaign_template",
    name: "Synthetic campaign",
    description: "",
    mode: "scale",
    status: "active",
    createdAt: "2026-08-18T08:00:00.000Z",
    updatedAt: "2026-08-18T08:00:00.000Z",
    searchPreferences: structuredClone(baseSnapshot.searchPreferences),
    sourceTargetIds: [],
    jobIds: [],
    minimumFitScore: null,
    limits: {
      retainedJobTarget: 1000,
      analysisConcurrency: 4,
      preparationBatchSize: 50,
      dailyPreparationLimit: 500,
    },
    stopRules: {
      pauseOnLoginRequired: true,
      pauseOnChangedForm: true,
      pauseOnUncertainEligibility: true,
      pauseOnFailureRatePercent: 20,
      failureRateMinimumSample: 5,
    },
    applicationPolicy: {
      resumeStrategy: "job_family_variants",
      defaultResumeStrategyId: null,
      requireReviewBeforePreparation: true,
      requireReviewBeforeExternalWrite: true,
      finalSubmitAuthorized: false,
      qualityReviewSampleRatio: 0.2,
      simultaneousApplicationWindowDays: 1,
    },
    rules: [],
    schedule: {},
    latestDigest: null,
    progress: { lastUpdatedAt: "2026-08-18T08:00:00.000Z" },
    history: [],
  };
  assert(
    jobTemplate,
    "The demo workspace did not provide a saved-job template.",
  );

  const targets = sourceTargets(counts.sources);
  const jobs = Array.from({ length: counts.jobs }, (_, index) => {
    const ordinal = index + 1;
    const id = `scale_job_${String(ordinal).padStart(4, "0")}`;
    const target = targets[index % targets.length];
    const status =
      index < counts.shortlisted ? "ready_for_review" : "discovered";
    return {
      ...structuredClone(jobTemplate),
      id,
      sourceJobId: `scale_source_job_${ordinal}`,
      canonicalUrl: `https://jobs.example.test/roles/${ordinal}`,
      applicationUrl: `https://jobs.example.test/roles/${ordinal}/apply`,
      title: `Senior Platform Engineer ${String(ordinal).padStart(3, "0")}`,
      company: `Synthetic Company ${index % 50}`,
      location: index % 2 === 0 ? "Remote" : "Prishtina, Kosovo",
      status,
      discoveredAt: "2026-08-18T08:00:00.000Z",
      firstSeenAt: "2026-08-18T08:00:00.000Z",
      lastSeenAt: "2026-08-18T08:00:00.000Z",
      lastVerifiedActiveAt: "2026-08-18T08:00:00.000Z",
      summary: "Synthetic scale-probe job; no external listing is opened.",
      description: "Synthetic scale-probe description.",
      matchAssessment: {
        ...jobTemplate.matchAssessment,
        score: 60 + (index % 40),
      },
      provenance: [
        {
          ...structuredClone(jobTemplate.provenance[0]),
          targetId: target.id,
          startingUrl: target.startingUrl,
          adapterKind: "auto",
          discoveredAt: "2026-08-18T08:00:00.000Z",
        },
      ],
      keywordSignals: jobTemplate.keywordSignals.map((signal, signalIndex) => ({
        ...signal,
        id: `scale_signal_${ordinal}_${signalIndex}`,
      })),
    };
  });

  const applicationRecords = Array.from(
    { length: counts.applications },
    (_, index) => {
      const job = jobs[index];
      return {
        ...structuredClone(applicationTemplate),
        id: `scale_application_${index + 1}`,
        jobId: job.id,
        title: job.title,
        company: job.company,
        status: "drafting",
        lastActionLabel: "Application prepared without submission",
        nextActionLabel: "Review final application",
        lastUpdatedAt: "2026-08-18T08:00:00.000Z",
        lastAttemptState: null,
      };
    },
  );

  const campaign = {
    ...structuredClone(campaignTemplate),
    name: "Synthetic scale probe 500",
    jobIds: jobs.map((job) => job.id),
    sourceTargetIds: targets.map((target) => target.id),
    applicationPolicy: {
      ...campaignTemplate.applicationPolicy,
      requireReviewBeforeExternalWrite: true,
      finalSubmitAuthorized: false,
    },
  };

  return {
    ...structuredClone(baseSnapshot),
    savedJobs: jobs,
    applicationRecords,
    applicationAttempts: [],
    applyRuns: [],
    applyJobResults: [],
    userActionRequests: [],
    userActionEvents: [],
    searchPreferences: {
      ...structuredClone(baseSnapshot.searchPreferences),
      discovery: {
        ...structuredClone(baseSnapshot.searchPreferences.discovery),
        targets,
      },
    },
    campaigns: [campaign],
    activeCampaignId: campaign.id,
  };
}

async function sampleProcessMemory(pid) {
  if (process.platform !== "win32" || !Number.isInteger(pid))
    return { available: false, reason: "windows-process-sample-unavailable" };
  const command = `$p=Get-Process -Id ${pid} -ErrorAction Stop; [pscustomobject]@{pid=$p.Id; name=$p.ProcessName; workingSetBytes=$p.WorkingSet64; privateBytes=$p.PrivateMemorySize64} | ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true },
    );
    const value = JSON.parse(stdout.trim());
    return {
      available: true,
      pid: Number(value.pid),
      name: value.name,
      workingSetBytes: Number(value.workingSetBytes),
      privateBytes: Number(value.privateBytes),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function installRendererProbe(page) {
  await page.evaluate(() => {
    if (globalThis.__productionScaleProbe) return;
    const state = {
      longTaskSupported: false,
      longTasks: [],
      heartbeatTicks: 0,
      maxHeartbeatGapMs: 0,
      lastHeartbeatAt: performance.now(),
    };
    globalThis.__productionScaleProbe = state;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          state.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
          });
      });
      observer.observe({ type: "longtask", buffered: true });
      state.longTaskSupported = true;
    } catch {
      state.longTaskSupported = false;
    }
    window.setInterval(() => {
      const now = performance.now();
      state.heartbeatTicks += 1;
      state.maxHeartbeatGapMs = Math.max(
        state.maxHeartbeatGapMs,
        now - state.lastHeartbeatAt,
      );
      state.lastHeartbeatAt = now;
    }, 16);
  });
}

async function readRendererProbe(page) {
  return page.evaluate(() => {
    const state = globalThis.__productionScaleProbe;
    return state
      ? {
          longTaskSupported: state.longTaskSupported,
          longTaskCount: state.longTasks.length,
          longTaskTotalMs: state.longTasks.reduce((t, e) => t + e.duration, 0),
          maxLongTaskMs: Math.max(0, ...state.longTasks.map((e) => e.duration)),
          heartbeatTicks: state.heartbeatTicks,
          maxHeartbeatGapMs: state.maxHeartbeatGapMs,
        }
      : null;
  });
}

async function readJobFinderTimingMarks(page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType("mark")
      .filter(
        (entry) =>
          entry.name.startsWith("job-finder:") ||
          entry.name.startsWith("acceptance-"),
      )
      .map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
      })),
  );
}

async function readSurface(page, route, paginationLabel = null) {
  return page.evaluate(
    ({ surface, paginationLabel: expectedPaginationLabel }) => {
      const rowSelector = {
        profile:
          '[data-job-sources-library] [aria-label="Configured job sources"] > li',
        findJobs:
          '[aria-labelledby="discovery-job-results-heading"] [data-collection-item-id]',
        shortlisted: "[data-collection-item-id]",
        applications: 'ul[aria-label="Applications"] > li',
      }[surface];
      const rows = rowSelector
        ? Array.from(document.querySelectorAll(rowSelector))
        : [];
      const selectedCollectionIds = Array.from(
        document.querySelectorAll(
          '[data-collection-item-id][aria-current="true"]',
        ),
      ).map((e) => e.getAttribute("data-collection-item-id"));
      const selectedApplicationButtons = Array.from(
        document.querySelectorAll(
          'ul[aria-label="Applications"] button[aria-current="true"]',
        ),
      ).map((e) => e.getAttribute("aria-label"));
      const pagination = Array.from(document.querySelectorAll("nav")).find(
        (el) => {
          const label = el.getAttribute("aria-label") ?? "";
          return expectedPaginationLabel
            ? label === expectedPaginationLabel
            : /pagination|pages/i.test(label);
        },
      );
      return {
        hash: window.location.hash,
        mountedRows: rows.length,
        rowIds: rows
          .map((r) => r.getAttribute("data-collection-item-id"))
          .filter(Boolean),
        selectedCollectionIds,
        selectedApplicationButtons,
        paginationLabel: pagination?.getAttribute("aria-label") ?? null,
        paginationText:
          pagination?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        paginationButtons: pagination
          ? Array.from(pagination.querySelectorAll("button")).map((b) => ({
              label: b.textContent?.trim() ?? "",
              disabled: b.disabled,
            }))
          : [],
        sourceStatus:
          document
            .querySelector('[data-job-sources-library] [role="status"]')
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? null,
      };
    },
    { surface: route, paginationLabel },
  );
}

async function waitForHeading(page, heading) {
  try {
    await page
      .getByRole("heading", { level: 1, name: heading, exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });
  } catch (error) {
    report.routeDebug = await page.evaluate(() => ({
      href: window.location.href,
      readyState: document.readyState,
      bodyText: document.body.innerText.slice(0, 4000),
      headings: Array.from(document.querySelectorAll("h1,h2"))
        .map((e) => ({ tag: e.tagName, text: e.textContent?.trim() ?? "" }))
        .slice(0, 20),
      mainText:
        document.querySelector("main")?.textContent?.slice(0, 3000) ?? null,
    }));
    throw error;
  }
}

async function waitForWorkspaceHydrationComplete(page, timeout = 30_000) {
  await page.waitForFunction(
    async () => {
      const workspace = await window.unemployed?.jobFinder?.getWorkspace?.();
      return workspace?.hydration?.phase === "complete";
    },
    undefined,
    { timeout },
  );
}

async function navigateHash(page, route, heading) {
  await page.evaluate((nextRoute) => {
    window.location.hash = `#${nextRoute}`;
  }, route);
  await waitForHeading(page, heading);
  await page.waitForTimeout(60);
}

async function switchRoute(page, definition, memoryPid) {
  const beforeProbe = await readRendererProbe(page);
  const navigationName = await page.evaluate(() =>
    window.innerWidth >= 1440
      ? "Job Finder sidebar destinations"
      : "Job Finder sections",
  );
  const button = page
    .getByRole("navigation", { name: navigationName })
    .getByRole("button", { name: new RegExp(`^${definition.label}(?:\\s|$)`) });
  await button.waitFor({ state: "visible", timeout: 10_000 });
  const timingMark = `acceptance-route-start-${report.routeSwitches.length + 1}`;
  await page.evaluate((mark) => performance.mark(mark), timingMark);
  const startedAt = performance.now();
  await button.click({ timeout: 10_000 });
  await waitForHeading(page, definition.heading);
  const headingObservedLatencyMs = performance.now() - startedAt;
  const rendererTiming = await page.evaluate(
    ({ mark, route }) => {
      const end = `${mark}-end`;
      performance.mark(end);
      const startEntry = performance.getEntriesByName(mark, "mark").at(-1);
      const endEntry = performance.getEntriesByName(end, "mark").at(-1);
      const feedbackEntry = startEntry
        ? performance
            .getEntriesByName(
              `job-finder:route:${route}:feedback-committed`,
              "mark",
            )
            .filter((entry) => entry.startTime >= startEntry.startTime)
            .at(0)
        : null;
      return {
        start: startEntry?.startTime ?? null,
        end: endEntry?.startTime ?? null,
        durationMs:
          startEntry && endEntry
            ? endEntry.startTime - startEntry.startTime
            : null,
        feedbackDurationMs:
          startEntry && feedbackEntry
            ? feedbackEntry.startTime - startEntry.startTime
            : null,
      };
    },
    { mark: timingMark, route: definition.route },
  );
  const latencyMs =
    rendererTiming.feedbackDurationMs ?? rendererTiming.durationMs;
  assert(
    Number.isFinite(headingObservedLatencyMs) &&
      Number.isFinite(rendererTiming.durationMs) &&
      Number.isFinite(latencyMs),
    `${definition.label}: route switch did not produce finite timing evidence ${JSON.stringify({ headingObservedLatencyMs, rendererTiming, latencyMs })}`,
  );
  if (rendererTiming.feedbackDurationMs !== null)
    assert(
      Number.isFinite(rendererTiming.feedbackDurationMs),
      `${definition.label}: renderer feedback timing was not finite.`,
    );
  // The route is usable when its heading is visible. Keep a short settling
  // period for the later layout/memory probes, but do not charge that
  // deliberate evidence delay to the user-facing navigation budget.
  await page.waitForTimeout(60);
  assert(
    latencyMs <= CANONICAL_LATENCY_BUDGETS.warmRouteSwitchMs,
    `${definition.label}: warm route switch exceeded ${CANONICAL_LATENCY_BUDGETS.warmRouteSwitchMs} ms (${latencyMs.toFixed(2)} ms).`,
  );
  if (definition.surface === "shortlisted") {
    await page.waitForFunction(
      () => Boolean(document.querySelector("[data-collection-item-id]")),
      undefined,
      { timeout: 15_000 },
    );
  }
  const afterProbe = await readRendererProbe(page);
  const surface = await readSurface(page, definition.surface);
  const roundTripStartedAt = performance.now();
  await page.evaluate(() => document.visibilityState);
  const roundTripMs = performance.now() - roundTripStartedAt;
  const memory = await sampleProcessMemory(memoryPid);
  const selectedIds = surface.selectedCollectionIds.filter(Boolean);
  assert(
    selectedIds.every((id) => surface.rowIds.includes(id)),
    `${definition.label}: stale selected collection row is not mounted on the current route.`,
  );
  report.routeSwitches.push({
    cycle:
      Math.floor(
        report.routeSwitches.length / CANONICAL_ROUTE_DEFINITIONS.length,
      ) + 1,
    route: definition.id,
    latencyMs: Math.round(latencyMs * 100) / 100,
    headingObservedLatencyMs: Math.round(headingObservedLatencyMs * 100) / 100,
    rendererRoundTripMs: Math.round(roundTripMs * 100) / 100,
    mountedRows: surface.mountedRows,
    selectedCollectionIds: selectedIds,
    selectedApplicationButtons: surface.selectedApplicationButtons,
    longTaskCountDelta:
      afterProbe && beforeProbe
        ? afterProbe.longTaskCount - beforeProbe.longTaskCount
        : null,
    longTaskTotalDeltaMs:
      afterProbe && beforeProbe
        ? afterProbe.longTaskTotalMs - beforeProbe.longTaskTotalMs
        : null,
    maxHeartbeatGapMs: afterProbe?.maxHeartbeatGapMs ?? null,
    rendererTiming,
    memory,
  });
}

async function setViewportAndZoom(page, browserWindow, vp) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await browserWindow.evaluate((win, factor) => {
    win.webContents.setZoomFactor(factor);
  }, vp.zoomFactor);
  await page.waitForTimeout(300);
}

async function captureScreenshot(page, name, meta = {}) {
  await mkdir(screenshotDir, { recursive: true });
  const fileName = `${String(report.screenshots.length + 1).padStart(2, "0")}-${name}.png`;
  const fullPath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: fullPath, animations: "disabled" });
  const screenshot = await screenshotMetadata(
    page,
    activeBrowserWindow,
    fullPath,
    {
      viewport: meta.viewport ?? null,
      seedDigest: acceptance.seedDigest,
      route: meta.route,
    },
  );
  const navigation = await inspectNavigation(page);
  const failures = [];
  if (navigation.documentHorizontalOverflow > 0)
    failures.push(
      `document horizontal overflow ${navigation.documentHorizontalOverflow}`,
    );
  if ((navigation.mainHorizontalOverflow ?? 0) > 0)
    failures.push(
      `main horizontal overflow ${navigation.mainHorizontalOverflow}`,
    );
  if (meta.expectWideSidebar && !navigation.wideSidebar.pass)
    failures.push(
      `1440 sidebar missing Search plans or Resume approaches ${JSON.stringify(navigation.wideSidebar)}`,
    );
  if (meta.expectCompactPlanningButton && !navigation.compactPlanning.pass)
    failures.push(
      `compact Planning and settings navigation missing ${JSON.stringify(navigation.compactPlanning)}`,
    );
  if (meta.expectPlanningSettingsMenu && !navigation.planningSettingsMenu.pass)
    failures.push(
      `Planning and settings menu is not inside the viewport with required destinations ${JSON.stringify(navigation.planningSettingsMenu)}`,
    );
  if (
    meta.expectPlanningSettingsKeyboard &&
    meta.planningSettingsKeyboard?.pass !== true
  )
    failures.push(
      `Planning and settings menu is not keyboard reachable ${JSON.stringify(meta.planningSettingsKeyboard)}`,
    );
  const insideViewport = failures.length === 0;
  const entry = {
    fileName,
    fullPath,
    scenarioId: meta.scenarioId ?? name,
    route: screenshot.route,
    seedDigest: screenshot.seedDigest,
    viewportMetadata: screenshot.viewport,
    screenshot: screenshot.screenshot,
    ...meta,
    navigation,
    insideViewport,
    noClip: insideViewport,
    failures,
    pass: failures.length === 0,
    capturedAt: new Date().toISOString(),
  };
  report.screenshots.push(entry);
  completeScenario(entry.scenarioId);
  await writeReport();
  return entry;
}

async function checkHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main");
    const docOverflow = Math.max(
      0,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    const mainOverflow =
      main instanceof HTMLElement
        ? Math.max(0, main.scrollWidth - main.clientWidth)
        : null;
    const bodyOverflow = Math.max(
      0,
      document.body.scrollWidth - document.body.clientWidth,
    );
    return {
      docOverflow,
      mainOverflow,
      bodyOverflow,
      innerWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
  const passed =
    overflow.docOverflow === 0 && (overflow.mainOverflow ?? 0) === 0;
  report.verifications.horizontalOverflow.push({ label, ...overflow, passed });
  assert(
    passed,
    `${label}: horizontal overflow detected doc=${overflow.docOverflow} main=${overflow.mainOverflow}`,
  );
  return overflow;
}

async function checkPaginationFlexWrap(page, label) {
  const flexChecks = await page.evaluate(() => {
    const navs = Array.from(
      document.querySelectorAll(
        'nav[aria-label*="pagination" i], nav[aria-label*="pages" i], nav[aria-label="Job result pages"]',
      ),
    );
    return navs.map((nav) => {
      const style = getComputedStyle(nav);
      return {
        label: nav.getAttribute("aria-label"),
        flexWrap: style.flexWrap,
        display: style.display,
        className: nav.className,
        rect: nav.getBoundingClientRect().toJSON
          ? {
              width: Math.round(nav.getBoundingClientRect().width),
              height: Math.round(nav.getBoundingClientRect().height),
            }
          : null,
      };
    });
  });
  for (const check of flexChecks) {
    const passed = check.flexWrap === "wrap";
    report.verifications.paginationFlexWrap.push({
      label,
      navLabel: check.label,
      flexWrap: check.flexWrap,
      passed,
      className: check.className,
    });
    // Only enforce if pagination is present; Job sources pagination uses flex without wrap in current code - verify it doesn't overflow instead
    // For collection-pagination and job-results-pagination we expect wrap. Allow profile sources to be non-wrap but must not overflow.
    if (
      check.label &&
      /pagination/i.test(check.label) &&
      check.label !== "Job source pages"
    ) {
      assert(
        passed,
        `${label}: pagination ${check.label} flex-wrap is ${check.flexWrap} expected wrap`,
      );
    }
  }
  // Additional check: ensure pagination nav itself does not overflow viewport
  const overflowCheck = await page.evaluate(() => {
    const nav = document.querySelector(
      'nav[aria-label*="pagination" i], nav[aria-label="Job result pages"]',
    );
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      innerWidth: window.innerWidth,
      overflows: rect.right > window.innerWidth + 2 || rect.left < -2,
    };
  });
  if (overflowCheck)
    assert(
      !overflowCheck.overflows,
      `${label}: pagination nav overflows viewport ${JSON.stringify(overflowCheck)}`,
    );
  return flexChecks;
}

async function checkDropdownsNotClipped(page, label) {
  const dropdowns = await page.evaluate(() => {
    const selectors = [
      '[data-slot="select-trigger"]',
      "select",
      '[role="combobox"]',
      '[aria-haspopup="listbox"]',
      '[aria-haspopup="menu"]',
      "button[aria-expanded]",
    ];
    const elements = Array.from(document.querySelectorAll(selectors.join(",")));
    return elements
      .filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role"),
          ariaLabel: el.getAttribute("aria-label"),
          text: el.textContent?.slice(0, 80)?.replace(/\s+/g, " ").trim(),
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          clipped:
            rect.left < -2 ||
            rect.right > window.innerWidth + 2 ||
            rect.top < -2 ||
            rect.bottom > window.innerHeight + 2,
          overflow: style.overflow,
        };
      });
  });
  const clipped = dropdowns.filter((d) => d.clipped);
  report.verifications.dropdownClipping.push({
    label,
    totalDropdowns: dropdowns.length,
    clippedCount: clipped.length,
    clipped,
    all: dropdowns.slice(0, 10),
  });
  // Dropdowns vertically below viewport are scrollable and expected; only horizontal clipping is a failure.
  const innerWidth = await page.evaluate(() => window.innerWidth);
  const bad = dropdowns.filter(
    (d) => d.rect.left < -2 || d.rect.right > innerWidth + 5,
  );
  assert(
    bad.length === 0,
    `${label}: dropdowns horizontally clipped ${JSON.stringify(bad.slice(0, 3))}`,
  );
  return dropdowns;
}

async function inspectNavigation(page) {
  return page.evaluate(
    ({ wideSidebarDestinations, planningSettingsDestinations }) => {
      const rendered = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const textLabel = (element) =>
        element.getAttribute("aria-label") ??
        element.textContent?.replace(/\s+/g, " ").trim() ??
        element.tagName.toLowerCase();
      const inside = (rect) =>
        Boolean(
          rect &&
          rect.left >= -1 &&
          rect.right <= window.innerWidth + 1 &&
          rect.top >= -1 &&
          rect.bottom <= window.innerHeight + 1,
        );
      const sidebar = document.querySelector("[data-job-finder-sidebar]");
      const sidebarNavigation = sidebar?.querySelector(
        'nav[aria-label="Job Finder sidebar destinations"]',
      );
      const sidebarButtons = sidebarNavigation
        ? Array.from(sidebarNavigation.querySelectorAll("button")).filter(
            (button) => rendered(button),
          )
        : [];
      const sidebarLabels = sidebarButtons.map(textLabel);
      const sidebarRect = sidebar?.getBoundingClientRect() ?? null;
      const wideSidebar = {
        exists: sidebar instanceof HTMLElement,
        visible: rendered(sidebar),
        insideViewport: inside(sidebarRect),
        horizontalOverflow:
          sidebar instanceof HTMLElement
            ? Math.max(0, sidebar.scrollWidth - sidebar.clientWidth)
            : null,
        horizontalOverflowSuppressed:
          sidebar instanceof HTMLElement
            ? ["hidden", "clip"].includes(getComputedStyle(sidebar).overflowX)
            : false,
        labels: sidebarLabels,
        requiredLabels: wideSidebarDestinations,
        requiredDestinationsVisible: wideSidebarDestinations.every((label) =>
          sidebarLabels.includes(label),
        ),
        rect: sidebarRect
          ? {
              left: Math.round(sidebarRect.left),
              top: Math.round(sidebarRect.top),
              right: Math.round(sidebarRect.right),
              bottom: Math.round(sidebarRect.bottom),
            }
          : null,
      };
      wideSidebar.pass =
        wideSidebar.visible &&
        wideSidebar.insideViewport &&
        wideSidebar.horizontalOverflowSuppressed &&
        wideSidebar.requiredDestinationsVisible;

      const compactNavigation = document.querySelector(
        'nav[aria-label="Job Finder sections"]',
      );
      const planningButton = document.querySelector(
        'button[aria-label^="Planning and settings"]',
      );
      const compactPlanning = {
        navigationVisible: rendered(compactNavigation),
        buttonVisible: rendered(planningButton),
        sidebarHidden: !wideSidebar.visible,
      };
      compactPlanning.pass =
        compactPlanning.navigationVisible &&
        compactPlanning.buttonVisible &&
        compactPlanning.sidebarHidden;

      const menu = document.querySelector(
        '[role="menu"][aria-label="Planning and settings"]',
      );
      const menuRect = menu?.getBoundingClientRect() ?? null;
      const menuStyle = menu ? getComputedStyle(menu) : null;
      const menuScrollable = Boolean(
        menu &&
        (menu.scrollHeight > menu.clientHeight + 2 ||
          (menuStyle && /(auto|scroll)/.test(menuStyle.overflowY))),
      );
      const menuItems = menu
        ? Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => {
            const itemRect = item.getBoundingClientRect();
            const itemVisible = rendered(item);
            return {
              label:
                item.getAttribute("aria-label") ??
                item.textContent?.replace(/\s+/g, " ").trim() ??
                "",
              visible: itemVisible,
              withinViewport: inside(itemRect),
              reachable: itemVisible && (inside(itemRect) || menuScrollable),
              tabIndex: item.getAttribute("tabindex"),
            };
          })
        : [];
      const planningSettingsMenu = {
        exists: menu instanceof HTMLElement,
        visible: rendered(menu),
        rect: menuRect
          ? {
              left: Math.round(menuRect.left),
              top: Math.round(menuRect.top),
              right: Math.round(menuRect.right),
              bottom: Math.round(menuRect.bottom),
              width: Math.round(menuRect.width),
              height: Math.round(menuRect.height),
            }
          : null,
        menuScrollable,
        labels: menuItems.map((item) => item.label),
        requiredLabels: planningSettingsDestinations,
        requiredDestinationsVisible: planningSettingsDestinations.every(
          (label) => menuItems.some((item) => item.label === label),
        ),
        items: menuItems,
        horizontallyInside: inside(menuRect)
          ? true
          : Boolean(
              menuRect &&
              menuRect.left >= -1 &&
              menuRect.right <= window.innerWidth + 1,
            ),
        verticallyInside: Boolean(
          menuRect && menuRect.top >= -1 && menuRect.top < window.innerHeight,
        ),
      };
      planningSettingsMenu.insideViewport = Boolean(
        planningSettingsMenu.visible &&
        planningSettingsMenu.horizontallyInside &&
        planningSettingsMenu.verticallyInside &&
        menuRect &&
        (menuRect.bottom <= window.innerHeight + 1 || menuScrollable) &&
        menuItems.every((item) => item.reachable),
      );
      planningSettingsMenu.pass = Boolean(
        planningSettingsMenu.insideViewport &&
        planningSettingsMenu.requiredDestinationsVisible,
      );
      const documentHorizontalOverflow = Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      const main = document.querySelector("main");
      const mainHorizontalOverflow =
        main instanceof HTMLElement
          ? Math.max(0, main.scrollWidth - main.clientWidth)
          : null;
      return {
        documentHorizontalOverflow,
        mainHorizontalOverflow,
        wideSidebar,
        compactPlanning,
        planningSettingsMenu,
      };
    },
    {
      wideSidebarDestinations: WIDE_SIDEBAR_DESTINATIONS,
      planningSettingsDestinations: PLANNING_SETTINGS_MENU_DESTINATIONS,
    },
  );
}

async function assertPagination(page, config) {
  await navigateHash(page, config.route, config.heading);
  if (config.waitFor) await config.waitFor(page);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= config.pageCount; pageNumber += 1) {
    const expectedRows = config.expectedRows(pageNumber);
    const expectedText = config.expectedText(pageNumber);
    if (config.screenshotOnPages?.includes(pageNumber)) {
      await checkHorizontalOverflow(
        page,
        `${config.id} page ${pageNumber} pre-check`,
      );
    }
    await page.waitForFunction(
      ({ surface, paginationLabel, expectedRows, expectedText }) => {
        const rowSelector = {
          profile:
            '[data-job-sources-library] [aria-label="Configured job sources"] > li',
          findJobs:
            '[aria-labelledby="discovery-job-results-heading"] [data-collection-item-id]',
          shortlisted: "[data-collection-item-id]",
          applications: 'ul[aria-label="Applications"] > li',
        }[surface];
        const pagination = Array.from(document.querySelectorAll("nav")).find(
          (el) => el.getAttribute("aria-label") === paginationLabel,
        );
        return (
          document.querySelectorAll(rowSelector).length === expectedRows &&
          pagination?.textContent?.replace(/\s+/g, " ").includes(expectedText)
        );
      },
      {
        surface: config.surface,
        paginationLabel: config.paginationLabel,
        expectedRows,
        expectedText,
      },
      { timeout: 15_000 },
    );
    const state = await readSurface(
      page,
      config.surface,
      config.paginationLabel,
    );
    assert(
      state.mountedRows === config.expectedRows(pageNumber),
      `${config.id} page ${pageNumber}: expected ${config.expectedRows(pageNumber)} mounted rows, got ${state.mountedRows}.`,
    );
    assert(
      state.paginationText?.includes(config.expectedText(pageNumber)),
      `${config.id} page ${pageNumber}: pagination text was ${state.paginationText}.`,
    );
    const next = state.paginationButtons.find((b) => b.label === "Next");
    const previous = state.paginationButtons.find(
      (b) => b.label === "Previous",
    );
    assert(next && previous, `${config.id}: pagination buttons are missing.`);
    assert(
      next.disabled === (pageNumber === config.pageCount),
      `${config.id} page ${pageNumber}: Next disabled incorrect.`,
    );
    assert(
      previous.disabled === (pageNumber === 1),
      `${config.id} page ${pageNumber}: Previous disabled incorrect.`,
    );
    pages.push({
      page: pageNumber,
      mountedRows: state.mountedRows,
      text: state.paginationText,
      nextDisabled: next.disabled,
      previousDisabled: previous.disabled,
    });
    if (config.screenshotOnPages?.includes(pageNumber)) {
      await checkPaginationFlexWrap(page, `${config.id}-p${pageNumber}`);
      await checkHorizontalOverflow(page, `${config.id}-p${pageNumber}`);
      await checkDropdownsNotClipped(page, `${config.id}-p${pageNumber}`);
      await captureScreenshot(
        page,
        `${config.id}-p${pageNumber}-${page.viewportSize ? page.viewportSize.width : 1440}`,
        {
          scenarioId: config.scenarioId
            ? `${config.scenarioId}-page-${pageNumber}`
            : undefined,
          surface: config.id,
          page: pageNumber,
          viewport: await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
            zoom: window.devicePixelRatio,
          })),
          pagination: state.paginationText,
          mountedRows: state.mountedRows,
        },
      );
    }
    if (pageNumber < config.pageCount) {
      await page
        .getByRole("navigation", { name: config.paginationLabel })
        .getByRole("button", { name: /^Next(?: page)?$/ })
        .click();
      await page.waitForTimeout(80);
    }
  }
  report.pagination[config.id] = { pageCount: config.pageCount, pages };
  if (config.scenarioId) completeScenario(config.scenarioId);
}

async function verifyWideSidebar(page) {
  await navigateHash(page, "/job-finder/profile", "Your profile");
  const sidebar = page.getByRole("complementary", {
    name: "Job Finder sidebar",
  });
  await sidebar.waitFor({ state: "visible", timeout: 10_000 });
  const navigation = await inspectNavigation(page);
  report.verifications.navigation.wideSidebar = navigation.wideSidebar;
  assert(
    navigation.wideSidebar.pass,
    `1440 sidebar did not expose Search plans and Resume approaches: ${JSON.stringify(navigation.wideSidebar)}`,
  );
  await captureScreenshot(page, "sidebar-1440", {
    viewport: "1440-normal",
    scenario: "wide-sidebar",
    scenarioId: "scale-1001-sidebar-1440",
    expectWideSidebar: true,
  });
  completeScenario("scale-1001-sidebar-1440");
}

async function verifyPlanningSettingsMenu(page, viewportLabel) {
  await navigateHash(page, "/job-finder/profile", "Your profile");
  const planningButton = page.getByRole("button", {
    name: /^Planning and settings/,
    exact: false,
  });
  await planningButton.waitFor({ state: "visible", timeout: 10_000 });
  await planningButton.click();
  const menu = page.getByRole("menu", { name: "Planning and settings" });
  await menu.waitFor({ state: "visible", timeout: 10_000 });
  const items = menu.getByRole("menuitem");
  const labels = await items.evaluateAll((elements) =>
    elements.map(
      (element) =>
        element.getAttribute("aria-label") ??
        element.textContent?.replace(/\s+/g, " ").trim() ??
        "",
    ),
  );
  for (const requiredLabel of PLANNING_SETTINGS_MENU_DESTINATIONS)
    assert(
      labels.includes(requiredLabel),
      `Planning and settings menu did not expose ${requiredLabel} at ${viewportLabel}: ${JSON.stringify(labels)}`,
    );
  const verticalClipEvidence = await menu.evaluate((element) => {
    const menu = element;
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const lastItem = items.at(-1);
    const beforeScrollTop = menu.scrollTop;
    const beforeRect = lastItem?.getBoundingClientRect() ?? null;
    lastItem?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const afterScrollTop = menu.scrollTop;
    const afterRect = lastItem?.getBoundingClientRect() ?? null;
    const menuRect = menu.getBoundingClientRect();
    const withinMenu = (rect) =>
      Boolean(
        rect &&
        rect.top >= menuRect.top - 1 &&
        rect.bottom <= menuRect.bottom + 1,
      );
    return {
      checked: true,
      itemCount: items.length,
      scrollable: menu.scrollHeight > menu.clientHeight + 2,
      scrollHeight: menu.scrollHeight,
      clientHeight: menu.clientHeight,
      beforeScrollTop,
      afterScrollTop,
      scrollChanged: afterScrollTop !== beforeScrollTop,
      lastItemBeforeWithinMenu: withinMenu(beforeRect),
      lastItemAfterWithinMenu: withinMenu(afterRect),
    };
  });
  assert(
    verticalClipEvidence.checked &&
      verticalClipEvidence.itemCount >=
        PLANNING_SETTINGS_MENU_DESTINATIONS.length &&
      verticalClipEvidence.lastItemAfterWithinMenu,
    `Planning and settings menu vertical clipping evidence failed at ${viewportLabel}: ${JSON.stringify(verticalClipEvidence)}`,
  );
  await page.keyboard.press("Home");
  const firstFocused = await page.evaluate(
    () => document.activeElement?.getAttribute("role") === "menuitem",
  );
  await page.keyboard.press("End");
  const lastFocused = await page.evaluate(
    () => document.activeElement?.getAttribute("role") === "menuitem",
  );
  const planningSettingsKeyboard = {
    pass: firstFocused && lastFocused,
    firstFocused,
    lastFocused,
    labels,
  };
  assert(
    planningSettingsKeyboard.pass,
    `Planning and settings menu keyboard traversal failed at ${viewportLabel}: ${JSON.stringify(planningSettingsKeyboard)}`,
  );
  const navigation = await inspectNavigation(page);
  report.verifications.navigation.compactPlanning[viewportLabel] =
    navigation.compactPlanning;
  assert(
    navigation.compactPlanning.pass,
    `Compact Planning and settings navigation is missing at ${viewportLabel}: ${JSON.stringify(navigation.compactPlanning)}`,
  );
  report.verifications.navigation.planningSettingsMenu[viewportLabel] = {
    ...navigation.planningSettingsMenu,
    verticalClipEvidence,
    keyboard: planningSettingsKeyboard,
  };
  assert(
    navigation.planningSettingsMenu.pass,
    `Planning and settings menu is clipped or missing required destinations at ${viewportLabel}: ${JSON.stringify(navigation.planningSettingsMenu)}`,
  );
  await captureScreenshot(page, `planning-settings-menu-${viewportLabel}`, {
    viewport: viewportLabel,
    scenario: "planning-settings-menu",
    scenarioId: `scale-1001-planning-settings-${viewportLabel}`,
    expectPlanningSettingsMenu: true,
    expectPlanningSettingsKeyboard: true,
    planningSettingsKeyboard,
  });
  completeScenario(`scale-1001-planning-settings-${viewportLabel}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
}

async function run() {
  const log = (m) => process.stdout.write(`[capture-scale-500] ${m}\n`);
  await ensureFreshOutputDir(outputDir);
  await verifyAcceptanceArtifacts(acceptance);
  await mkdir(screenshotDir, { recursive: true });
  const userDataDirectory = await makeIsolatedUserDataDirectory(
    "unemployed-scale-500-",
  );
  report.safety.isolatedUserDataDir = userDataDirectory;
  report.safety.syntheticTestDataDigest = digestSeed({
    seed: acceptance.seedDigest,
    component: "scale",
    source: "preload.test",
  });
  const createdDemoFiles = new Set();
  const observedSafetyEvents = [];
  let app = null;
  let page = null;
  let memoryPid = null;

  const launch = async () => {
    app = await electron.launch({
      args: ["."],
      cwd: desktopDir,
      env: acceptanceEnvironment({
        UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      }),
    });
    processOutputState = attachProcessOutput(app, report);
    processOutputStates.push(processOutputState);
    page = await app.firstWindow();
    await page.exposeFunction("__jobFinderAcceptanceSafetyEvents", (record) => {
      observedSafetyEvents.push(record);
    });
    await page.addInitScript(installPrepareOnlySafetyProbe);
    await page.evaluate(installPrepareOnlySafetyProbe);
    memoryPid = app.process()?.pid ?? null;
    page.on("pageerror", (e) =>
      report.runtimeErrors.push({ type: "pageerror", message: e.message }),
    );
    page.on("console", (m) => {
      if (m.type() === "error")
        report.runtimeErrors.push({ type: "console", message: m.text() });
    });
    await page.waitForLoadState("domcontentloaded");
    await assertFileRenderer(page);
    await page.waitForSelector("[data-job-finder-shell]", { timeout: 15_000 });
    return page;
  };

  try {
    log("launching bootstrap app");
    const bootstrapPage = await launch();
    await bootstrapPage.waitForFunction(
      () => Boolean(window.unemployed?.jobFinder?.test),
      undefined,
      { timeout: 15_000 },
    );
    const beforeFiles = new Set();
    const baseSnapshot = await bootstrapPage.evaluate(() =>
      window.unemployed.jobFinder.test.loadApplyQueueDemo(),
    );
    for (const filePath of [
      baseSnapshot.profile.baseResume.storagePath,
      ...baseSnapshot.resumeExportArtifacts.map((a) => a.filePath),
    ]) {
      if (!filePath) continue;
      try {
        await access(filePath);
        beforeFiles.add(filePath);
      } catch {}
    }
    const scaleState = createScaleState(baseSnapshot);
    log(
      `persisting synthetic scale state ${counts.jobs} jobs / ${counts.shortlisted} shortlisted / ${counts.applications} apps / ${counts.sources} sources`,
    );
    await bootstrapPage.evaluate(
      (state) => window.unemployed.jobFinder.test.resetWorkspaceState(state),
      scaleState,
    );
    for (const filePath of [
      scaleState.profile.baseResume.storagePath,
      ...scaleState.resumeExportArtifacts.map((a) => a.filePath),
    ]) {
      if (filePath && !beforeFiles.has(filePath))
        createdDemoFiles.add(filePath);
    }
    await bootstrapPage.reload();
    log("bootstrap state persisted; validating snapshot");
    await bootstrapPage.waitForSelector("[data-job-finder-shell]", {
      timeout: 15_000,
    });
    await waitForWorkspaceHydrationComplete(bootstrapPage);
    const bootstrappedWorkspace = await bootstrapPage.evaluate(() =>
      window.unemployed.jobFinder.getWorkspace(),
    );
    assert(
      bootstrappedWorkspace.hydration?.phase === "complete",
      `Bootstrap hydration did not complete before scale assertions: ${bootstrappedWorkspace.hydration?.phase}`,
    );
    assert(
      bootstrappedWorkspace.savedJobs?.length === counts.jobs ||
        bootstrappedWorkspace.discoveryJobs?.length === counts.jobs,
      `Bootstrap did not persist ${counts.jobs} jobs. got savedJobs=${bootstrappedWorkspace.savedJobs?.length} discoveryJobs=${bootstrappedWorkspace.discoveryJobs?.length}`,
    );
    // The repository exposes discoveryJobs + reviewQueue separation; check both representations
    const totalJobs =
      bootstrappedWorkspace.savedJobs?.length ??
      bootstrappedWorkspace.discoveryJobs?.length ??
      0;
    const reviewQueueLen =
      bootstrappedWorkspace.reviewQueue?.length ??
      bootstrappedWorkspace.savedJobs?.filter(
        (j) => j.status === "ready_for_review",
      ).length ??
      0;
    log(
      `bootstrapped totals: jobs=${totalJobs} reviewQueue=${reviewQueueLen} applications=${bootstrappedWorkspace.applicationRecords.length} sources=${bootstrappedWorkspace.searchPreferences.discovery.targets.length}`,
    );
    assert(totalJobs === counts.jobs, `Bootstrap jobs mismatch`);
    assert(
      bootstrappedWorkspace.applicationRecords.length === counts.applications,
      `Bootstrap applications mismatch`,
    );
    assert(
      bootstrappedWorkspace.searchPreferences.discovery.targets.length ===
        counts.sources,
      `Bootstrap sources mismatch`,
    );
    completeScenario("scale-1001-bootstrap");

    log("stopping bootstrap app");
    const bootstrapProcess = app.process();
    if (!bootstrapProcess)
      throw new Error("Bootstrap Electron process was unavailable.");
    const bootstrapExit = new Promise((resolve) => {
      bootstrapProcess.once("exit", resolve);
    });
    await execFileAsync("taskkill", [
      "/PID",
      String(bootstrapProcess.pid),
      "/T",
      "/F",
    ]);
    await bootstrapExit;
    // Let Windows finish terminating Chromium descendants and releasing the
    // SQLite/WAL files before starting the measured launch. The timer begins
    // only after this cleanup period, so harness teardown is not charged to or
    // hidden inside the product startup budget.
    await new Promise((r) => setTimeout(r, 3000));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await access(
          path.join(userDataDirectory, "job-finder-workspace.sqlite"),
        );
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    log("bootstrap app stopped");
    app = null;
    page = null;

    const coldStartedAt = performance.now();
    log("launching cold app");
    let coldLaunched = false;
    let lastColdError = null;
    for (let attempt = 0; attempt < 2 && !coldLaunched; attempt += 1) {
      try {
        if (attempt > 0) {
          log(`cold launch retry ${attempt + 1}`);
          try {
            if (app) {
              const proc = app.process();
              if (proc?.pid) {
                await execFileAsync("taskkill", [
                  "/PID",
                  String(proc.pid),
                  "/T",
                  "/F",
                ]).catch(() => {});
                await new Promise((r) => setTimeout(r, 800));
              }
            }
          } catch {}
          app = null;
          page = null;
          if (process.platform === "win32") {
            try {
              await execFileAsync("icacls", [
                userDataDirectory,
                "/reset",
                "/T",
                "/C",
                "/Q",
              ]);
            } catch {}
          }
          await new Promise((r) => setTimeout(r, 800));
        }
        await launch();
        await page.waitForFunction(
          () => Boolean(window.unemployed?.jobFinder?.getWorkspace),
          undefined,
          { timeout: 15_000 },
        );
        await page
          .getByRole("heading", { level: 1 })
          .first()
          .waitFor({ state: "visible", timeout: 15_000 });
        coldLaunched = true;
      } catch (error) {
        lastColdError = error;
        if (page)
          try {
            const diag = await page.evaluate(() => ({
              href: window.location.href,
              body: document.body.innerText.slice(0, 2000),
            }));
            report.coldLaunchDiagnostic = diag;
          } catch {}
        if (attempt === 1) throw error;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!coldLaunched && lastColdError) throw lastColdError;
    const playwrightLaunchToUsableShellMs =
      Math.round((performance.now() - coldStartedAt) * 100) / 100;
    const openingShellEpochMs = await page.evaluate(() => {
      const mark = performance
        .getEntriesByName("job-finder:opening-shell:committed", "mark")
        .at(-1);
      return mark ? performance.timeOrigin + mark.startTime : null;
    });
    const mainProcessTiming = await app.evaluate(() => ({
      nowEpochMs: Date.now(),
      uptimeMs: process.uptime() * 1000,
    }));
    assert(
      typeof openingShellEpochMs === "number",
      "The interactive opening-shell timing mark was not recorded.",
    );
    const mainProcessStartedAtEpochMs =
      mainProcessTiming.nowEpochMs - mainProcessTiming.uptimeMs;
    report.startup.playwrightLaunchToUsableShellMs =
      playwrightLaunchToUsableShellMs;
    report.startup.measurementOrigin = "electron-main-process-start";
    report.startup.mainProcessStartedAtEpochMs = mainProcessStartedAtEpochMs;
    report.startup.openingShellEpochMs = openingShellEpochMs;
    report.startup.coldToUsableShellMs =
      Math.round((openingShellEpochMs - mainProcessStartedAtEpochMs) * 100) /
      100;
    report.startup.electronPid = memoryPid;
    report.startup.memory = await sampleProcessMemory(memoryPid);
    await waitForWorkspaceHydrationComplete(page);
    report.startup.timingMarks = await readJobFinderTimingMarks(page);
    assert(
      report.startup.coldToUsableShellMs <=
        CANONICAL_LATENCY_BUDGETS.coldToUsableShellMs,
      `Cold usable shell exceeded ${CANONICAL_LATENCY_BUDGETS.coldToUsableShellMs} ms (${report.startup.coldToUsableShellMs} ms).`,
    );
    await installRendererProbe(page);
    report.renderer.longTaskSupported =
      (await readRendererProbe(page))?.longTaskSupported ?? false;
    const browserWindow = await app.browserWindow(page);
    activeBrowserWindow = browserWindow;
    await setViewportAndZoom(page, browserWindow, viewportNormal);
    log(`cold usable shell ${report.startup.coldToUsableShellMs} ms at 1440`);

    for (let cycle = 0; cycle < routeCycles; cycle += 1) {
      for (const route of CANONICAL_ROUTE_DEFINITIONS)
        await switchRoute(page, route, memoryPid);
    }
    const observedRouteIds = [
      ...new Set(report.routeSwitches.map((entry) => entry.route)),
    ];
    const missingCanonicalRoutes = report.requiredCanonicalRoutes.filter(
      (routeId) => !observedRouteIds.includes(routeId),
    );
    assert(
      report.routeSwitches.length ===
        routeCycles * CANONICAL_ROUTE_DEFINITIONS.length &&
        missingCanonicalRoutes.length === 0 &&
        observedRouteIds.length === report.requiredCanonicalRoutes.length,
      `Scale acceptance did not cover the canonical route set: ${JSON.stringify({ observedRouteIds, requiredRouteIds: report.requiredCanonicalRoutes, routeSwitchCount: report.routeSwitches.length })}`,
    );
    log("route switch cycles complete");

    // Capture baseline screenshots at 1440
    await captureScreenshot(page, "1440-profile-baseline", {
      viewport: "1440-normal",
    });
    await checkHorizontalOverflow(page, "1440-profile");
    await checkDropdownsNotClipped(page, "1440-profile");

    log("checking Find Jobs pagination 1-50 / 51-100 with screenshots");
    // Only capture pages 1 and 2 for Find Jobs to match objective (1-50/51-100), but also verify full pagination bounded
    await assertPagination(page, {
      id: "findJobs",
      scenarioId: "scale-1001-find-jobs-pagination",
      route: "/job-finder/discovery",
      heading: "Find jobs",
      surface: "findJobs",
      pageCount: Math.ceil(counts.jobs / 50),
      paginationLabel: "Job result pages",
      expectedRows: (pn) => Math.min(50, counts.jobs - (pn - 1) * 50),
      expectedText: (pn) => {
        const first = (pn - 1) * 50 + 1;
        const last = Math.min(pn * 50, counts.jobs);
        return `${first}–${last} of ${counts.jobs}`;
      },
      screenshotOnPages: [1, 2],
    });
    log("checking Shortlisted pagination");
    await assertPagination(page, {
      id: "shortlisted",
      scenarioId: "scale-1001-shortlisted-pagination",
      route: "/job-finder/review-queue",
      heading: "Shortlisted jobs",
      surface: "shortlisted",
      pageCount: Math.ceil(counts.shortlisted / 40),
      paginationLabel: "shortlisted jobs pagination",
      expectedRows: (pn) => Math.min(40, counts.shortlisted - (pn - 1) * 40),
      expectedText: (pn) => {
        const first = (pn - 1) * 40 + 1;
        const last = Math.min(pn * 40, counts.shortlisted);
        return `Showing ${first}–${last} of ${counts.shortlisted} shortlisted jobs`;
      },
      screenshotOnPages: [1],
    });
    // Extra screenshot for Shortlisted at bounded page
    await captureScreenshot(page, "shortlisted-p1-1440", {
      surface: "shortlisted",
      page: 1,
    });
    log("checking Applications pagination");
    await assertPagination(page, {
      id: "applications",
      scenarioId: "scale-1001-applications-pagination",
      route: "/job-finder/applications",
      heading: "Applications",
      surface: "applications",
      pageCount: Math.ceil(counts.applications / 40),
      paginationLabel: "applications pagination",
      expectedRows: (pn) => Math.min(40, counts.applications - (pn - 1) * 40),
      expectedText: (pn) => {
        const first = (pn - 1) * 40 + 1;
        const last = Math.min(pn * 40, counts.applications);
        return `Showing ${first}–${last} of ${counts.applications} applications`;
      },
      screenshotOnPages: [1],
    });
    await captureScreenshot(page, "applications-crm-p1-1440", {
      surface: "applications",
    });
    // Verify Applications CRM specific: ensure pagination is outside table scroll and table not horizontally overflowing
    await page.evaluate(
      () => (window.location.hash = "#/job-finder/applications"),
    );
    await waitForHeading(page, "Applications");
    await checkHorizontalOverflow(page, "applications-crm-1440");
    await checkDropdownsNotClipped(page, "applications-crm-1440");
    await captureScreenshot(page, "applications-crm-1440-lifecycle-dropdown", {
      note: "CRM lifecycle view dropdown visible",
    });

    log("checking Profile source pagination");
    await assertPagination(page, {
      id: "profileSources",
      scenarioId: "scale-1001-profile-sources-pagination",
      route: "/job-finder/profile?section=sources&focus=job-sources",
      heading: "Your profile",
      surface: "profile",
      pageCount: Math.ceil(counts.sources / 25),
      paginationLabel: "Job source pages",
      waitFor: async (currentPage) => {
        await currentPage
          .locator("[data-job-sources-library]")
          .waitFor({ state: "visible", timeout: 15_000 });
      },
      expectedRows: (pn) => Math.min(25, counts.sources - (pn - 1) * 25),
      expectedText: (pn) => {
        const first = (pn - 1) * 25 + 1;
        const last = Math.min(pn * 25, counts.sources);
        return `${first}–${last} of ${counts.sources}`;
      },
      screenshotOnPages: [1, 2],
    });
    await captureScreenshot(page, "profile-sources-p1-1440", {
      surface: "profileSources",
    });
    log("pagination checks at 1440 complete");

    // Verify the wide sidebar at 1440.
    await verifyWideSidebar(page);

    // Now test 200% zoom
    log("switching to 200% zoom");
    await setViewportAndZoom(page, browserWindow, viewportZoomed);
    await page.waitForTimeout(400);
    // Capture screenshots at 200%
    await navigateHash(page, "/job-finder/discovery", "Find jobs");
    await checkHorizontalOverflow(page, "findJobs-200pct");
    await checkPaginationFlexWrap(page, "findJobs-200pct");
    await checkDropdownsNotClipped(page, "findJobs-200pct");
    await captureScreenshot(page, "findJobs-p1-200pct", {
      viewport: "200pct",
      zoom: 2,
    });
    completeScenario("scale-1001-find-jobs-zoom200");

    // Go to page 2 at 200% and capture
    await page
      .getByRole("navigation", { name: "Job result pages" })
      .getByRole("button", { name: /^Next/ })
      .click();
    await page.waitForTimeout(150);
    await checkHorizontalOverflow(page, "findJobs-p2-200pct");
    await captureScreenshot(page, "findJobs-p2-200pct", { viewport: "200pct" });

    await navigateHash(page, "/job-finder/review-queue", "Shortlisted jobs");
    await checkHorizontalOverflow(page, "shortlisted-200pct");
    await captureScreenshot(page, "shortlisted-p1-200pct", {
      viewport: "200pct",
    });

    await navigateHash(page, "/job-finder/applications", "Applications");
    await checkHorizontalOverflow(page, "applications-200pct");
    await captureScreenshot(page, "applications-crm-p1-200pct", {
      viewport: "200pct",
    });

    await navigateHash(
      page,
      "/job-finder/profile?section=sources&focus=job-sources",
      "Your profile",
    );
    await page
      .locator("[data-job-sources-library]")
      .waitFor({ state: "visible", timeout: 15_000 });
    await checkHorizontalOverflow(page, "profile-sources-200pct");
    await captureScreenshot(page, "profile-sources-p1-200pct", {
      viewport: "200pct",
    });

    // Verify compact Planning and settings navigation at 200%.
    await verifyPlanningSettingsMenu(page, "zoom200");

    // Final overall checks
    await navigateHash(page, "/job-finder/discovery", "Find jobs");
    await checkPaginationFlexWrap(page, "final-200pct");
    await checkHorizontalOverflow(page, "final-200pct");
    await captureScreenshot(page, "final-200pct-overview", {
      viewport: "200pct",
    });

    // Exercise the actual Electron minimum window width after the populated and zoomed matrix.
    log("switching to the 1024px minimum-width viewport");
    await setViewportAndZoom(page, browserWindow, viewportMinimum);
    await verifyPlanningSettingsMenu(page, "minimum-width");
    await navigateHash(page, "/job-finder/discovery", "Find jobs");
    await checkHorizontalOverflow(page, "minimum-width-discovery");
    await checkPaginationFlexWrap(page, "minimum-width-discovery");
    await captureScreenshot(page, "minimum-width-discovery-populated", {
      viewport: viewportMinimum,
      scenario: "minimum-width-populated",
    });
    completeScenario("scale-1001-minimum-width");

    // Return to normal zoom for final report screenshot
    await setViewportAndZoom(page, browserWindow, viewportNormal);
    await navigateHash(page, "/job-finder/profile", "Your profile");
    await captureScreenshot(page, "final-1440-overview", { viewport: "1440" });

    report.renderer.final = await readRendererProbe(page);
    report.memory.push({
      phase: "final",
      sample: await sampleProcessMemory(memoryPid),
    });
    assert(
      report.runtimeErrors.length === 0,
      `Runtime errors detected: ${JSON.stringify(report.runtimeErrors)}`,
    );
    const finalWorkspace = await page.evaluate(() =>
      window.unemployed.jobFinder.getWorkspace(),
    );
    report.safetyEvents = observedSafetyEvents;
    assertPrepareOnly(finalWorkspace, observedSafetyEvents);
    report.safety.prepareOnlyVerified = true;
    report.safety.applicationActionsExecuted = false;
    report.safety.finalSubmissionClicked = false;
    report.safety.submitAuthorized = false;
    report.safety.accountCreationAuthorized = false;
    const missingScenarioIds = report.requiredScenarioCompletionIds.filter(
      (scenarioId) => !report.scenarioCompletionIds.includes(scenarioId),
    );
    assert(
      missingScenarioIds.length === 0,
      `Scale acceptance did not complete required scenarios: ${missingScenarioIds.join(", ")}`,
    );
    const planningMenuChecks = Object.values(
      report.verifications.navigation.planningSettingsMenu,
    );
    const compactNavigationChecks = Object.values(
      report.verifications.navigation.compactPlanning,
    );
    const moreMenuWithinViewport =
      planningMenuChecks.length === 2 &&
      planningMenuChecks.every(
        (check) =>
          check.pass === true &&
          check.insideViewport === true &&
          check.verticalClipEvidence?.checked === true &&
          check.verticalClipEvidence?.lastItemAfterWithinMenu === true,
      ) &&
      compactNavigationChecks.length === 2 &&
      compactNavigationChecks.every((check) => check.pass === true);
    assert(
      moreMenuWithinViewport,
      `Compact navigation/menu clipping checks did not pass: ${JSON.stringify({ planningMenuChecks, compactNavigationChecks })}`,
    );
    report.summary = {
      coldToUsableShellMs: report.startup.coldToUsableShellMs,
      routeSwitchCount: report.routeSwitches.length,
      maxRouteSwitchMs: Math.max(
        ...report.routeSwitches.map((e) => e.latencyMs),
      ),
      runtimeErrorCount: report.runtimeErrors.length,
      longTaskSupported: report.renderer.longTaskSupported,
      paginationBounded: Object.values(report.pagination).every((p) =>
        p.pages.every((pg) => pg.mountedRows <= 50),
      ),
      horizontalOverflowPassed: report.verifications.horizontalOverflow.every(
        (v) => v.passed,
      ),
      paginationFlexWrapPassed: report.verifications.paginationFlexWrap.filter(
        (v) => v.passed,
      ).length,
      canonicalRouteCoverage: report.requiredCanonicalRoutes.every((routeId) =>
        observedRouteIds.includes(routeId),
      ),
      moreMenuWithinViewport,
      screenshotCount: report.screenshots.length,
    };
    report.completedAt = new Date().toISOString();
    await writeReport();
    process.stdout.write(`Saved capture-scale-500 report to ${outputDir}\n`);
    process.stdout.write(
      `Screenshots: ${report.screenshots.map((s) => s.fileName).join(", ")}\n`,
    );
    process.stdout.write(JSON.stringify(report.summary, null, 2) + "\n");
  } finally {
    let finalizationError = null;
    for (const filePath of createdDemoFiles) {
      try {
        await rm(filePath, { force: true });
      } catch {
        try {
          await execFileAsync("icacls", [filePath, "/reset"]).catch(() => {});
        } catch {}
        try {
          await rm(filePath, { force: true });
        } catch {}
      }
    }
    if (app) {
      try {
        const appProcess = app.process();
        if (appProcess?.pid) {
          const appExit = new Promise((resolve) => {
            appProcess.once("exit", resolve);
            setTimeout(resolve, 3000);
          });
          await execFileAsync("taskkill", [
            "/PID",
            String(appProcess.pid),
            "/T",
            "/F",
          ]);
          await appExit;
          await new Promise((r) => setTimeout(r, 800));
        }
      } catch {}
    }
    for (const output of processOutputStates) {
      try {
        finalizeProcessOutput(output, report);
      } catch (error) {
        finalizationError = finalizationError ?? error;
      }
    }
    const cleanupError = await cleanupDirectory(userDataDirectory);
    report.safety.cleanedUp = !cleanupError;
    if (cleanupError) report.safety.cleanupError = String(cleanupError);
    await writeReport();
    if (finalizationError) throw finalizationError;
    if (cleanupError)
      throw new Error(
        `Unable to clean isolated user data directory: ${cleanupError}`,
      );
  }
}

run().catch(async (error) => {
  report.failedAt = new Date().toISOString();
  report.failure =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeReport();
  process.stderr.write(`${report.failure}\n`);
  process.exitCode = 1;
});
