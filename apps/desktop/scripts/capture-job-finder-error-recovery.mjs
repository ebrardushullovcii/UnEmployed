import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import {
  ACCEPTANCE_VERSION,
  acceptanceEnvironment,
  assertFileRenderer,
  assertPrepareOnly,
  attachProcessOutput,
  cleanupDirectory,
  ensureFreshOutputDir,
  finalizeProcessOutput,
  loadAcceptanceContext,
  makeIsolatedUserDataDirectory,
  installPrepareOnlySafetyProbe,
  screenshotMetadata,
  verifyAcceptanceArtifacts,
} from "./release-acceptance-harness.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const acceptance = loadAcceptanceContext("error-recovery");
const outputDir = acceptance.outputDir;
const REQUIRED_SCENARIO_COMPLETION_IDS = Object.freeze([
  "error-preview-1440",
  "error-preview-recovered-minimum",
]);
const report = {
  startedAt: new Date().toISOString(),
  outputDir,
  acceptance: {
    version: ACCEPTANCE_VERSION,
    manifestPath: acceptance.manifestPath,
    runDir: acceptance.runDir,
    sourceFingerprint: acceptance.manifest.source?.afterBuild?.digest ?? null,
    buildArtifactFingerprint: acceptance.manifest.artifacts?.digest ?? null,
    seedDigest: acceptance.seedDigest,
  },
  pass: false,
  captures: [],
  scenarios: {},
  requiredScenarioCompletionIds: [...REQUIRED_SCENARIO_COMPLETION_IDS],
  scenarioCompletionIds: [],
  runtimeErrors: [],
  mainProcess: { pid: null, stdout: "", stderr: "" },
  safety: {
    syntheticTestDataOnly: true,
    browserAgentEnabled: false,
    applicationActionsExecuted: null,
    finalSubmissionClicked: null,
    submitAuthorized: null,
    accountCreationAuthorized: null,
    prepareOnlyVerified: false,
    observedSafetyEvents: [],
    isolatedUserDataDir: null,
    cleanedUp: false,
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeReport() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

function completeScenario(scenarioId) {
  assert(
    REQUIRED_SCENARIO_COMPLETION_IDS.includes(scenarioId),
    `Unknown error/recovery scenario completion ID: ${scenarioId}`,
  );
  if (!report.scenarioCompletionIds.includes(scenarioId))
    report.scenarioCompletionIds.push(scenarioId);
}

async function inspectCaptureViewport(page) {
  const layout = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const documentOverflow = Math.max(
      0,
      document.documentElement.scrollWidth - viewport.width,
    );
    const visibleInteractive = Array.from(
      document.querySelectorAll(
        'button,a,input,textarea,select,[role="button"],[role="link"],[role="menuitem"],iframe,[data-resume-workspace-scroll-region]',
      ),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    const clipped = visibleInteractive
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ??
            null,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      })
      .filter(
        (rect) =>
          rect.left < -1 ||
          rect.right > viewport.width + 1 ||
          rect.top < -viewport.height - 1 ||
          rect.bottom > viewport.height * 2 + 1,
      );
    return {
      viewport,
      documentOverflow,
      clipped,
    };
  });
  const failures = [];
  if (layout.documentOverflow > 0)
    failures.push(`document horizontal overflow ${layout.documentOverflow}`);
  if (layout.clipped.length > 0)
    failures.push(`clipped interactive surfaces ${JSON.stringify(layout.clipped)}`);
  return {
    insideViewport: failures.length === 0,
    noClip: failures.length === 0,
    failures,
  };
}

async function capture(
  page,
  browserWindow,
  { label, scenario, scenarioId, viewport },
) {
  const fileName = `${String(report.captures.length + 1).padStart(2, "0")}-${label}.png`;
  const fullPath = path.join(outputDir, fileName);
  await page.screenshot({ path: fullPath, animations: "disabled" });
  const evidence = await screenshotMetadata(page, browserWindow, fullPath, {
    viewport,
    seedDigest: acceptance.seedDigest,
  });
  const inspection = await inspectCaptureViewport(page);
  const entry = {
    label,
    scenario,
    path: fullPath,
    route: evidence.route,
    seedDigest: evidence.seedDigest,
    viewportMetadata: evidence.viewport,
    screenshot: evidence.screenshot,
    ...inspection,
    pass: inspection.failures.length === 0,
    scenarioId,
    capturedAt: new Date().toISOString(),
  };
  report.captures.push(entry);
  await writeReport();
  assert(entry.pass === true, `Error/recovery capture failed: ${JSON.stringify(entry)}`);
  completeScenario(scenarioId);
  await writeReport();
  return entry;
}

async function stopApp(app) {
  const processHandle = app?.process();
  if (!processHandle?.pid) return;
  if (process.platform === "win32") {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)(
      "taskkill",
      ["/PID", String(processHandle.pid), "/T", "/F"],
      { windowsHide: true },
    ).catch(() => {});
  } else {
    processHandle.kill("SIGTERM");
  }
}

async function run() {
  await ensureFreshOutputDir(outputDir);
  await verifyAcceptanceArtifacts(acceptance);
  const userDataDirectory = await makeIsolatedUserDataDirectory(
    "unemployed-job-finder-error-recovery-",
  );
  report.safety.isolatedUserDataDir = userDataDirectory;
  let app = null;
  let processOutputState = null;
  const observedSafetyEvents = [];
  try {
    app = await electron.launch({
      args: ["."],
      cwd: desktopDir,
      env: acceptanceEnvironment({
        UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      }),
    });
    processOutputState = attachProcessOutput(app, report);
    const page = await app.firstWindow();
    await page.exposeFunction("__jobFinderAcceptanceSafetyEvents", (record) => {
      observedSafetyEvents.push(record);
    });
    await page.addInitScript(installPrepareOnlySafetyProbe);
    await page.evaluate(installPrepareOnlySafetyProbe);
    page.on("pageerror", (error) =>
      report.runtimeErrors.push({ type: "pageerror", message: error.message }),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        report.runtimeErrors.push({ type: "console", message: message.text() });
    });
    await page.waitForLoadState("domcontentloaded");
    await assertFileRenderer(page);
    await page.waitForFunction(
      () => Boolean(window.unemployed?.jobFinder?.test),
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() =>
      window.unemployed.jobFinder.test.setSystemThemeOverride("dark"),
    );
    const browserWindow = await app.browserWindow(page);
    const baseSnapshot = await page.evaluate(async () => {
      await window.unemployed.jobFinder.test.setResumePreviewMode("fail_once");
      return window.unemployed.jobFinder.test.loadResumeWorkspaceDemo();
    });
    const jobId = baseSnapshot.reviewQueue?.[0]?.jobId;
    assert(
      typeof jobId === "string" && jobId.length > 0,
      "Error/recovery scenario has no synthetic shortlisted job.",
    );
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await assertFileRenderer(page);
    await page.waitForSelector("[data-job-finder-shell]", { timeout: 20_000 });
    await page.evaluate(() =>
      window.unemployed.jobFinder.test.setResumePreviewMode("fail_once"),
    );
    await page.setViewportSize({ width: 1440, height: 920 });
    await browserWindow.evaluate((win) => win.webContents.setZoomFactor(1));
    await page.evaluate((nextRoute) => {
      window.location.hash = `#${nextRoute}`;
    }, `/job-finder/review-queue/${jobId}/resume`);
    await page
      .getByLabel("Preview")
      .getByText("Resume preview", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page
      .getByRole("heading", { name: "Preview unavailable" })
      .waitFor({ state: "visible", timeout: 20_000 });
    const previewEditor = page
      .locator("[data-resume-workspace-scroll-region]:visible")
      .first();
    assert(
      (await previewEditor.count()) > 0,
      "Preview failure removed the resume editing surface.",
    );
    const errorCapture = await capture(page, browserWindow, {
      label: "preview-error-1440",
      scenario: "error",
      scenarioId: "error-preview-1440",
      viewport: {
        slug: "desktop",
        width: 1440,
        height: 920,
        zoomFactor: 1,
      },
    });
    report.scenarios.previewError = {
      scenarioId: errorCapture.scenarioId,
      pass: errorCapture.pass,
      editorRemainsAvailable: true,
      viewport: "desktop",
    };
    await page.getByRole("button", { name: "Refresh preview" }).click();
    await page
      .locator('iframe[title="Live resume preview"]:visible')
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.setViewportSize({ width: 1024, height: 768 });
    await browserWindow.evaluate((win) => win.webContents.setZoomFactor(1));
    await page.waitForTimeout(250);
    const recoveryCapture = await capture(page, browserWindow, {
      label: "preview-recovered-minimum-width",
      scenario: "recovery",
      scenarioId: "error-preview-recovered-minimum",
      viewport: { slug: "minimum", width: 1024, height: 768, zoomFactor: 1 },
    });
    report.scenarios.previewRecovery = {
      scenarioId: recoveryCapture.scenarioId,
      pass: recoveryCapture.pass,
      refreshAction: "Refresh preview",
      viewport: "minimum",
    };
    const finalWorkspace = await page.evaluate(() =>
      window.unemployed.jobFinder.getWorkspace(),
    );
    report.safety.observedSafetyEvents = observedSafetyEvents;
    const requests = finalWorkspace.userActionRequests;
    report.safety.submitAuthorized = requests.some(
      (request) => request.submitAuthorized === true,
    );
    report.safety.accountCreationAuthorized = requests.some(
      (request) => request.accountCreationAuthorized === true,
    );
    report.safety.applicationActionsExecuted = observedSafetyEvents.length > 0;
    report.safety.finalSubmissionClicked = observedSafetyEvents.some((event) =>
      /submit|application|apply|account|sign[ -]?in/i.test(event.label ?? ""),
    );
    assertPrepareOnly(finalWorkspace, observedSafetyEvents);
    report.safety.prepareOnlyVerified = true;
    assert(
      report.safety.applicationActionsExecuted === false &&
        report.safety.finalSubmissionClicked === false &&
        report.safety.submitAuthorized === false &&
        report.safety.accountCreationAuthorized === false &&
        observedSafetyEvents.length === 0,
      `Error/recovery safety completion was not prepare-only: ${JSON.stringify(report.safety)}`,
    );
    assert(
      report.requiredScenarioCompletionIds.length > 0 &&
        report.scenarioCompletionIds.length > 0 &&
        report.requiredScenarioCompletionIds.every((scenarioId) =>
          report.scenarioCompletionIds.includes(scenarioId),
        ),
      `Error/recovery acceptance did not complete required scenarios: ${JSON.stringify({ required: report.requiredScenarioCompletionIds, completed: report.scenarioCompletionIds })}`,
    );
    assert(
      report.runtimeErrors.length === 0,
      `Runtime errors detected: ${JSON.stringify(report.runtimeErrors)}`,
    );
    report.summary = {
      pass: true,
      errorStateCaptured: true,
      recoveryStateCaptured: true,
      screenshotCount: report.captures.length,
      runtimeErrorCount: report.runtimeErrors.length,
    };
    report.pass = true;
    report.completedAt = new Date().toISOString();
    await writeReport();
  } finally {
    if (app) await stopApp(app);
    let finalizationError = null;
    if (processOutputState) {
      try {
        finalizeProcessOutput(processOutputState, report, {
          acceptedStderrPatterns: [
            {
              name: "expected-preview-render-failure",
              pattern:
                /Error occurred in handler for 'job-finder:preview-resume-draft': Error: Preview rendering failed in desktop test mode\.\r?\n(?: {4}at .+\r?\n)+/g,
            },
          ],
        });
      } catch (error) {
        finalizationError = error;
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
