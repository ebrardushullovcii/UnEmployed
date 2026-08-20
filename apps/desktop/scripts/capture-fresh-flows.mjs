import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
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
  screenshotMetadata,
  installPrepareOnlySafetyProbe,
  verifyAcceptanceArtifacts,
} from "./release-acceptance-harness.mjs";

const execFileAsync = promisify(execFile);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(currentDir, "..");
const acceptance = loadAcceptanceContext("fresh");
const artifactRoot = path.resolve(desktopDir, "test-artifacts", "ui");
const outputDir = acceptance.outputDir;
const viewports = [
  { slug: "desktop", width: 1440, height: 920, zoomFactor: 1 },
  { slug: "zoom-200", width: 1440, height: 920, zoomFactor: 2 },
  { slug: "minimum", width: 1024, height: 768, zoomFactor: 1 },
];
const WIDE_SIDEBAR_DESTINATIONS = Object.freeze([
  "Search plans",
  "Resume approaches",
]);
const PLANNING_SETTINGS_MENU_LABEL = "Planning and settings";
const PLANNING_SETTINGS_MENU_DESTINATIONS = Object.freeze([
  "Search plans",
  "Resume approaches",
  "Settings",
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
  safety: {
    syntheticCandidateDataOnly: true,
    browserAgentEnabled: false,
    applicationActionsExecuted: null,
    finalSubmissionClicked: null,
    submitAuthorized: null,
    accountCreationAuthorized: null,
    prepareOnlyVerified: null,
    observedSafetyEvents: [],
  },
  captures: [],
  scenarios: {},
  requiredScenarioCompletionIds: [
    "home-zero-desktop",
    "home-zero-minimum",
    "guided-setup-empty-desktop",
    "guided-setup-empty-zoom200",
    "wide-sidebar-1440",
    "compact-planning-settings-minimum",
    "profile-sources-p1",
    "profile-sources-p2",
    "profile-sources-filtered-empty",
    "profile-sources-zoom200",
    "discovery-p1",
    "discovery-filtered-empty",
    "discovery-zoom200",
    "planning-settings-menu-zoom200",
    "home-zero-zoom200",
  ],
  scenarioCompletionIds: [],
  runtimeErrors: [],
  mainProcess: { pid: null, stdout: "", stderr: "" },
};
let activeBrowserWindow = null;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function completeScenario(scenarioId, evidence) {
  if (!report.requiredScenarioCompletionIds.includes(scenarioId))
    throw new Error(
      `Unknown required scenario completion ID: ${scenarioId}. Update the manifest before completing it.`,
    );
  if (!evidence || typeof evidence !== "object")
    throw new Error(`Scenario ${scenarioId} completed without capture evidence.`);
  if (evidence.pass !== true || evidence.insideViewport !== true || evidence.noClip !== true)
    throw new Error(
      `Required scenario ${scenarioId} did not pass its capture evidence: ${JSON.stringify({
        pass: evidence.pass,
        insideViewport: evidence.insideViewport,
        noClip: evidence.noClip,
        failures: evidence.failures ?? [],
      })}`,
    );
  if (!report.scenarioCompletionIds.includes(scenarioId))
    report.scenarioCompletionIds.push(scenarioId);
}
function assertZeroDashboardMetrics(workspace) {
  assert(
    workspace?.hydration?.phase === "complete",
    "Fresh home metrics were read before workspace hydration completed.",
  );
  const dashboard = workspace.dashboard;
  assert(dashboard && typeof dashboard === "object", "Fresh home has no dashboard snapshot.");
  const metrics = {
    jobsFoundToday: dashboard.jobsFoundToday,
    jobsAwaitingReview: dashboard.jobsAwaitingReview,
    applicationsReadyForApproval: dashboard.applicationsReadyForApproval,
    applicationsAppliedToday: dashboard.applicationsAppliedToday,
    applicationsAppliedThisWeek: dashboard.applicationsAppliedThisWeek,
    needsYouCount: dashboard.needsYouCount,
    upcomingInterviews: dashboard.upcomingInterviews,
    upcomingFollowUps: dashboard.upcomingFollowUps,
    sourceCount: dashboard.sourceHealth?.total,
  };
  const nonZeroMetrics = Object.entries(metrics).filter(([, value]) => value !== 0);
  assert(
    nonZeroMetrics.length === 0,
    `Fresh home did not have zero dashboard metrics: ${JSON.stringify(nonZeroMetrics)}`,
  );
  return metrics;
}
function assertHydratedCollectionCount(workspace, collection, expectedCount, label) {
  assert(
    workspace?.hydration?.phase === "complete",
    `${label} was read before workspace hydration completed.`,
  );
  const values = workspace[collection];
  assert(
    Array.isArray(values) && values.length === expectedCount,
    `${label} expected ${expectedCount} populated ${collection}, received ${Array.isArray(values) ? values.length : "missing"}.`,
  );
  return values.length;
}
async function writeReport() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "capture-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}
async function stopOwnedElectronProcessTree(app) {
  const appProcess = app.process();
  if (!appProcess?.pid) return;
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", [
        "/PID",
        String(appProcess.pid),
        "/T",
        "/F",
      ]);
    } catch {}
    return;
  }
  appProcess.kill("SIGTERM");
}
async function waitForCondition(check, description, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
async function getWorkspace(page) {
  return page.evaluate(() => window.unemployed.jobFinder.getWorkspace());
}
async function navigate(page, route, expectedHeading) {
  await page.evaluate((nextRoute) => {
    window.location.hash = `#${nextRoute}`;
  }, route);
  await page
    .getByRole("heading", { level: 1, name: expectedHeading })
    .waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(200);
}
async function setViewport(page, browserWindow, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await browserWindow.evaluate((win, zoomFactor) => {
    win.webContents.setZoomFactor(zoomFactor);
  }, viewport.zoomFactor);
  await page.waitForTimeout(320);
}
async function resetScroll(page) {
  await page.evaluate(() => {
    document.querySelector("main")?.scrollTo({ top: 0, left: 0 });
    for (const el of document.querySelectorAll("*")) {
      if (!(el instanceof HTMLElement)) continue;
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY)) el.scrollTo({ top: 0, left: 0 });
    }
  });
}
async function scanLayout(page) {
  return page.evaluate(() => {
    const rendered = (el) => {
      const closedDetails = el.closest("details:not([open])");
      if (closedDetails && !el.matches("summary")) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const label = (el) =>
      el.getAttribute("aria-label") ??
      el.getAttribute("title") ??
      el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ??
      el.tagName.toLowerCase();
    const descriptor = (el) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : ""}`;
    const interactive = Array.from(
      document.querySelectorAll(
        "button,a,input,select,textarea,summary,[role=button],[role=checkbox],[role=radio],[tabindex]",
      ),
    ).filter((el) => el instanceof HTMLElement && rendered(el));
    const clippedInteractive = interactive
      .flatMap((el) => {
        const rect = el.getBoundingClientRect();
        const intersects =
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        const scrollableAncestor = (() => {
          let ancestor = el.parentElement;
          while (ancestor) {
            const style = getComputedStyle(ancestor);
            if (
              /(auto|scroll)/.test(style.overflowY) &&
              ancestor.scrollHeight > ancestor.clientHeight + 2
            )
              return ancestor;
            ancestor = ancestor.parentElement;
          }
          return null;
        })();
        const verticallyClipped =
          rect.top < -1 || rect.bottom > window.innerHeight + 1;
        const horizontallyClipped =
          rect.left < -1 || rect.right > window.innerWidth + 1;
        if (
          !intersects ||
          (rect.left >= -1 &&
            rect.right <= window.innerWidth + 1 &&
            rect.top >= -1 &&
            rect.bottom <= window.innerHeight + 1)
        )
          return [];
        if (verticallyClipped && !horizontallyClipped && scrollableAncestor)
          return [];
        return [
          {
            label: label(el),
            selector: descriptor(el),
            rect: {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
            },
          },
        ];
      })
      .slice(0, 20);
    const shell = document.querySelector("[data-job-finder-shell]");
    const shellRect = shell?.getBoundingClientRect();
    const shellStyle =
      shell instanceof HTMLElement ? getComputedStyle(shell) : null;
    const shellScrollable =
      shell instanceof HTMLElement &&
      Boolean(shellStyle && /(auto|scroll)/.test(shellStyle.overflowY)) &&
      shell.scrollHeight > shell.clientHeight + 2;
    const shellControls = Array.from(
      document.querySelectorAll(
        'nav[aria-label="Job Finder sections"] button, [aria-label="Notifications and actions"] > button, [aria-label="Notifications and actions"] > details > summary',
      ),
    );
    const shellDestinations = shellControls.map((el) => {
      const shellContainer = el.closest(
        'nav[aria-label="Job Finder sections"], [aria-label="Notifications and actions"]',
      );
      // The compact sections nav is intentionally hidden at the wide sidebar
      // breakpoint. Only controls owned by a rendered shell container are
      // expected at the active breakpoint; controls in that container still
      // have to be visible and reachable.
      const expectedAtBreakpoint =
        shellContainer instanceof HTMLElement && rendered(shellContainer);
      const rect = el.getBoundingClientRect();
      const horizontal = rect.left >= -1 && rect.right <= window.innerWidth + 1;
      const vertical = rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
      const shellTop =
        shell instanceof HTMLElement && shellRect
          ? rect.top - shellRect.top + shell.scrollTop
          : null;
      const verticallyReachable =
        shellScrollable &&
        shellTop !== null &&
        shellTop >= -1 &&
        shellTop + rect.height <= shell.scrollHeight + 1;
      return {
        label: label(el),
        expectedAtBreakpoint,
        visible: rendered(el) && horizontal && vertical,
        reachable:
          expectedAtBreakpoint &&
          rendered(el) &&
          horizontal &&
          (vertical || verticallyReachable),
      };
    });
    const main = document.querySelector("main");
    const inputsOverflow = Array.from(
      document.querySelectorAll("input,textarea,select"),
    )
      .filter((el) => el instanceof HTMLElement && rendered(el))
      .map((el) => {
        const overflow = el.scrollWidth > el.clientWidth + 2;
        const value =
          el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
            ? el.value
            : (el.textContent ?? "");
        return {
          selector: descriptor(el),
          type: el.tagName.toLowerCase(),
          valueSnippet: value.slice(0, 80),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflow,
          rect: {
            left: Math.round(el.getBoundingClientRect().left),
            right: Math.round(el.getBoundingClientRect().right),
          },
        };
      })
      .filter((e) => e.overflow)
      .slice(0, 10);
    const pills = Array.from(
      document.querySelectorAll(
        '[class*="truncate"], .truncate, [class*="badge"], .badge, [class*="pill"]',
      ),
    )
      .filter((el) => el instanceof HTMLElement && rendered(el))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        // Pill truncate fix: elements with textOverflow ellipsis and overflow hidden are expected to have scrollWidth > clientWidth but should not be flagged if they correctly truncate
        const style = getComputedStyle(el);
        const isTruncate =
          el.classList.contains("truncate") ||
          style.textOverflow === "ellipsis" ||
          style.overflow === "hidden";
        const clipped =
          rect.right > window.innerWidth + 1 ||
          (el.scrollWidth > el.clientWidth + 2 && !isTruncate);
        // Also check if the element's parent clips it correctly
        return {
          text: el.textContent?.replace(/\s+/g, " ").trim().slice(0, 80),
          clipped,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          className: el.className.slice(0, 200),
          isTruncate,
          styleOverflow: style.overflow,
          textOverflow: style.textOverflow,
        };
      })
      .filter((e) => e.clipped)
      .slice(0, 10);
    const shellPt = (() => {
      const content = document.querySelector("[data-job-finder-shell-content]");
      if (!(content instanceof HTMLElement)) return null;
      const style = getComputedStyle(content);
      return {
        paddingTop: style.paddingTop,
        className: content.className.slice(0, 300),
      };
    })();
    const sidebar = document.querySelector("[data-job-finder-sidebar]");
    const sidebarNavigation = sidebar?.querySelector(
      'nav[aria-label="Job Finder sidebar destinations"]',
    );
    const sidebarRect = sidebar?.getBoundingClientRect();
    const sidebarLabels = sidebarNavigation
      ? Array.from(sidebarNavigation.querySelectorAll("button"))
          .filter((button) => button instanceof HTMLElement && rendered(button))
          .map((button) => label(button))
      : [];
    const sidebarVisible =
      sidebar instanceof HTMLElement && rendered(sidebar) && sidebarRect;
    const sidebarInsideViewport = Boolean(
      sidebarVisible &&
        sidebarRect.left >= -1 &&
        sidebarRect.right <= window.innerWidth + 1 &&
        sidebarRect.top >= -1 &&
        sidebarRect.bottom <= window.innerHeight + 1,
    );
    const wideSidebarInfo = {
      exists: sidebar instanceof HTMLElement,
      visible: Boolean(sidebarVisible),
      insideViewport: sidebarInsideViewport,
      horizontalOverflow:
        sidebar instanceof HTMLElement
          ? Math.max(0, sidebar.scrollWidth - sidebar.clientWidth)
          : null,
      horizontalOverflowSuppressed:
        sidebar instanceof HTMLElement
          ? ["hidden", "clip"].includes(getComputedStyle(sidebar).overflowX)
          : false,
      labels: sidebarLabels,
      requiredLabels: ["Search plans", "Resume approaches"],
      requiredDestinationsVisible: ["Search plans", "Resume approaches"].every(
        (requiredLabel) => sidebarLabels.includes(requiredLabel),
      ),
      pass: Boolean(sidebarVisible && sidebarInsideViewport),
      rect: sidebarRect
        ? {
            top: sidebarRect.top,
            right: sidebarRect.right,
            bottom: sidebarRect.bottom,
            left: sidebarRect.left,
          }
        : null,
    };
    wideSidebarInfo.pass =
      wideSidebarInfo.pass &&
      wideSidebarInfo.horizontalOverflowSuppressed &&
      wideSidebarInfo.requiredDestinationsVisible;

    const planningButton = document.querySelector(
      'button[aria-label^="Planning and settings"]',
    );
    const compactNavigation = document.querySelector(
      'nav[aria-label="Job Finder sections"]',
    );
    const compactPlanningInfo = {
      buttonExists: planningButton instanceof HTMLElement,
      buttonVisible:
        planningButton instanceof HTMLElement && rendered(planningButton),
      navigationVisible:
        compactNavigation instanceof HTMLElement && rendered(compactNavigation),
      sidebarHidden: !(sidebar instanceof HTMLElement && rendered(sidebar)),
    };
    compactPlanningInfo.pass =
      compactPlanningInfo.buttonVisible &&
      compactPlanningInfo.navigationVisible &&
      compactPlanningInfo.sidebarHidden;

    const planningMenu = document.querySelector(
      '[role="menu"][aria-label="Planning and settings"]',
    );
    const planningMenuInfo = planningMenu
      ? (() => {
          const rect = planningMenu.getBoundingClientRect();
          const visible = rendered(planningMenu);
          const style = getComputedStyle(planningMenu);
          const menuScrollable =
            planningMenu.scrollHeight > planningMenu.clientHeight + 2 ||
            /(auto|scroll)/.test(style.overflowY);
          const items = Array.from(
            planningMenu.querySelectorAll('[role="menuitem"]'),
          ).map((item) => {
            const itemRect = item.getBoundingClientRect();
            const itemVisible = rendered(item);
            const withinViewport =
              itemRect.left >= -1 &&
              itemRect.right <= window.innerWidth + 1 &&
              itemRect.top >= -1 &&
              itemRect.bottom <= window.innerHeight + 1;
            return {
              label: (
                item.getAttribute("aria-label") ??
                item.textContent?.replace(/\s+/g, " ").trim() ??
                ""
              ).slice(0, 80),
              visible: itemVisible,
              withinViewport,
              reachable: itemVisible && (withinViewport || menuScrollable),
              tabIndex: item.getAttribute("tabindex"),
            };
          });
          const horizontallyInside =
            rect.left >= -1 && rect.right <= window.innerWidth + 1;
          const verticallyInside =
            rect.top >= -1 && rect.top < window.innerHeight;
          const insideViewport =
            visible &&
            horizontallyInside &&
            verticallyInside &&
            (rect.bottom <= window.innerHeight + 1 || menuScrollable) &&
            items.every((item) => item.reachable);
          return {
            exists: true,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left,
            },
            visible,
            insideViewport,
            horizontallyInside,
            verticallyInside,
            menuScrollable,
            labels: items.map((item) => item.label),
            requiredLabels: ["Search plans", "Resume approaches", "Settings"],
            requiredDestinationsVisible: [
              "Search plans",
              "Resume approaches",
              "Settings",
            ].every((requiredLabel) =>
              items.some((item) => item.label === requiredLabel),
            ),
            items,
          };
        })()
      : {
          exists: false,
          visible: false,
          insideViewport: false,
          requiredDestinationsVisible: false,
          items: [],
        };
    planningMenuInfo.pass =
      planningMenuInfo.insideViewport &&
      planningMenuInfo.requiredDestinationsVisible;
    const emptyUnified = Array.from(document.querySelectorAll("*"))
      .filter(
        (el) =>
          el instanceof HTMLElement &&
          /No sources match|No jobs|No matching jobs|No sources match this view/i.test(
            el.textContent ?? "",
          ) &&
          rendered(el),
      )
      .slice(0, 5)
      .map((el) => ({
        text: el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120),
        className: el.className.slice(0, 200),
      }));
    return {
      route: window.location.hash,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentHorizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
      mainHorizontalOverflow:
        main instanceof HTMLElement
          ? Math.max(0, main.scrollWidth - main.clientWidth)
          : null,
      clippedInteractive,
      shellDestinations,
      hiddenShellDestinations: shellDestinations
        .filter((e) => e.expectedAtBreakpoint && !e.visible)
        .map((e) => e.label),
      unreachableShellDestinations: shellDestinations
        .filter((e) => e.expectedAtBreakpoint && !e.reachable)
        .map((e) => e.label),
      inputsOverflow,
      pillsClipped: pills,
      shellPt,
      wideSidebarInfo,
      compactPlanningInfo,
      planningMenuInfo,
      emptyUnified,
      scrollables: Array.from(document.querySelectorAll("*"))
        .filter(
          (el) =>
            el instanceof HTMLElement &&
            rendered(el) &&
            /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
            el.scrollHeight > el.clientHeight + 2,
        )
        .slice(0, 5)
        .map((el) => ({
          selector: descriptor(el),
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        })),
    };
  });
}
async function probeNestedScroll(page) {
  const setup = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("*"))
      .filter(
        (el) =>
          el instanceof HTMLElement &&
          /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
          el.scrollHeight > el.clientHeight + 2 &&
          el.getBoundingClientRect().bottom > 0 &&
          el.getBoundingClientRect().top < window.innerHeight,
      )
      .sort(
        (a, b) =>
          b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
      );
    const openMenu = document.querySelector(
      '[role="menu"][aria-label="Planning and settings"]',
    );
    const target =
      openMenu instanceof HTMLElement && candidates.includes(openMenu)
        ? openMenu
        : candidates[0];
    if (!(target instanceof HTMLElement)) return { available: false };
    for (const candidate of candidates) candidate.scrollTop = 0;
    const rect = target.getBoundingClientRect();
    const hadTabIndex = target.hasAttribute("tabindex");
    const previousTabIndex = target.getAttribute("tabindex");
    if (!hadTabIndex) target.setAttribute("tabindex", "-1");
    target.setAttribute("data-acceptance-scroll-target", "true");
    target.focus({ preventScroll: true });
    return {
      available: true,
      centerX: Math.max(
        2,
        Math.min(window.innerWidth - 2, rect.left + rect.width / 2),
      ),
      centerY: Math.max(
        2,
        Math.min(window.innerHeight - 2, rect.top + rect.height / 2),
      ),
      candidateCount: candidates.length,
      hadTabIndex,
      previousTabIndex,
      target: target.tagName.toLowerCase(),
    };
  });
  if (!setup.available)
    return {
      available: false,
      wheelMoved: false,
      keyboardMoved: false,
      wheelLeaked: false,
      keyboardLeaked: false,
    };
  await page.mouse.move(setup.centerX, setup.centerY);
  const beforeWheel = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-acceptance-scroll-target], *"))
      .filter(
        (el) =>
          el instanceof HTMLElement &&
          /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
          el.scrollHeight > el.clientHeight + 2,
      )
      .map((el) => ({
        target: el.hasAttribute("data-acceptance-scroll-target"),
        top: el.scrollTop,
      })),
  );
  await page.mouse.wheel(0, 220);
  await page.waitForTimeout(80);
  const wheel = await page.evaluate(() => {
    const target = document.querySelector("[data-acceptance-scroll-target]");
    if (!(target instanceof HTMLElement))
      return { moved: false, leaked: false };
    const candidates = Array.from(document.querySelectorAll("*")).filter(
      (el) =>
        el instanceof HTMLElement &&
        /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
        el.scrollHeight > el.clientHeight + 2,
    );
    const targetTop = target.scrollTop;
    const leaked = candidates.some((el) => el !== target && el.scrollTop > 0);
    return { moved: targetTop > 0, leaked, targetTop };
  });
  await page.evaluate(() => {
    const target = document.querySelector("[data-acceptance-scroll-target]");
    if (target instanceof HTMLElement) target.scrollTop = 0;
  });
  await page.mouse.move(setup.centerX, setup.centerY);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(80);
  const keyboard = await page.evaluate(() => {
    const target = document.querySelector("[data-acceptance-scroll-target]");
    if (!(target instanceof HTMLElement))
      return { moved: false, leaked: false };
    const candidates = Array.from(document.querySelectorAll("*")).filter(
      (el) =>
        el instanceof HTMLElement &&
        /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
        el.scrollHeight > el.clientHeight + 2,
    );
    return {
      moved: target.scrollTop > 0,
      leaked: candidates.some((el) => el !== target && el.scrollTop > 0),
      targetTop: target.scrollTop,
    };
  });
  await page.evaluate(({ hadTabIndex, previousTabIndex }) => {
    const target = document.querySelector("[data-acceptance-scroll-target]");
    if (!(target instanceof HTMLElement)) return;
    target.removeAttribute("data-acceptance-scroll-target");
    if (hadTabIndex) target.setAttribute("tabindex", previousTabIndex ?? "");
    else target.removeAttribute("tabindex");
  }, setup);
  return {
    available: true,
    candidateCount: setup.candidateCount,
    target: setup.target,
    wheelMoved: wheel.moved,
    keyboardMoved: keyboard.moved,
    wheelLeaked: wheel.leaked,
    keyboardLeaked: keyboard.leaked,
    wheelTargetTop: wheel.targetTop,
    keyboardTargetTop: keyboard.targetTop,
    wheelBaselineCount: beforeWheel.length,
  };
}
async function capture(page, label, metadata = {}) {
  await resetScroll(page);
  const fileName = `${String(report.captures.length + 1).padStart(3, "0")}-${slugify(label)}.png`;
  const fullPath = path.join(outputDir, fileName);
  await page.screenshot({ animations: "disabled", path: fullPath });
  const screenshot = await screenshotMetadata(
    page,
    activeBrowserWindow,
    fullPath,
    {
      viewport: metadata.viewport ?? null,
      seedDigest: acceptance.seedDigest,
      route: metadata.route,
    },
  );
  const layout = await scanLayout(page);
  const nestedScroll = await probeNestedScroll(page);
  const viewportInfo = metadata.viewport ?? {
    slug: "unknown",
    width: layout.viewport.width,
    height: layout.viewport.height,
    zoomFactor: 1,
  };
  const size = {
    bytes: screenshot.screenshot.bytes,
    width: screenshot.screenshot.width,
    height: screenshot.screenshot.height,
  };
  const filteredClipped = layout.clippedInteractive;
  const unreachableFiltered = layout.unreachableShellDestinations;
  const insideViewportBase =
    layout.documentHorizontalOverflow === 0 &&
    (layout.mainHorizontalOverflow ?? 0) === 0 &&
    filteredClipped.length === 0 &&
    layout.inputsOverflow.length === 0 &&
    layout.pillsClipped.length === 0 &&
    unreachableFiltered.length === 0;
  const noClipBase =
    insideViewportBase &&
    !nestedScroll.wheelLeaked &&
    !nestedScroll.keyboardLeaked;
  let navigationPass = true;
  if (metadata.expectWideSidebar) {
    navigationPass = layout.wideSidebarInfo.pass;
  }
  if (metadata.expectCompactPlanningButton) {
    navigationPass = navigationPass && layout.compactPlanningInfo.pass;
  }
  if (metadata.expectPlanningMenu) {
    navigationPass = navigationPass && layout.planningMenuInfo.pass;
  }
  if (metadata.expectPlanningMenuKeyboard) {
    navigationPass =
      navigationPass && metadata.planningMenuKeyboard?.pass === true;
  }
  const insideViewport = insideViewportBase && navigationPass;
  const noClip = noClipBase && navigationPass;
  const entry = {
    id: report.captures.length + 1,
    label,
    scenarioId: metadata.scenarioId ?? label,
    fileName,
    path: fullPath,
    viewport: viewportInfo,
    viewportMetadata: screenshot.viewport,
    route: screenshot.route,
    seedDigest: screenshot.seedDigest,
    screenshot: screenshot.screenshot,
    size,
    insideViewport,
    noClip,
    navigation: {
      wideSidebar: layout.wideSidebarInfo,
      compactPlanning: layout.compactPlanningInfo,
      planningMenu: layout.planningMenuInfo,
      keyboard: metadata.planningMenuKeyboard ?? null,
    },
    layout,
    nestedScroll,
    ...metadata,
  };
  // Attach pass/fail logic
  const failures = [];
  if (
    !(
      layout.documentHorizontalOverflow === 0 &&
      (layout.mainHorizontalOverflow ?? 0) === 0
    )
  )
    failures.push(
      `horizontal overflow ${layout.documentHorizontalOverflow}/${layout.mainHorizontalOverflow}`,
    );
  if (filteredClipped.length > 0)
    failures.push(`clippedInteractive ${JSON.stringify(filteredClipped)}`);
  if (unreachableFiltered.length > 0)
    failures.push(`unreachableShell ${unreachableFiltered.join(",")}`);
  if (
    nestedScroll.available &&
    (!nestedScroll.wheelMoved || !nestedScroll.keyboardMoved)
  )
    failures.push(
      `real scroll interaction did not move target wheel=${nestedScroll.wheelMoved} keyboard=${nestedScroll.keyboardMoved}`,
    );
  if (nestedScroll.wheelLeaked || nestedScroll.keyboardLeaked)
    failures.push(
      `scroll chaining leaked wheel=${nestedScroll.wheelLeaked} keyboard=${nestedScroll.keyboardLeaked}`,
    );
  if (layout.inputsOverflow.length > 0)
    failures.push(`inputsOverflow ${JSON.stringify(layout.inputsOverflow)}`);
  if (layout.pillsClipped.length > 0)
    failures.push(`pillsClipped ${JSON.stringify(layout.pillsClipped)}`);
  if (metadata.expectWideSidebar && !layout.wideSidebarInfo.pass)
    failures.push(
      `1440 sidebar is not visible with Search plans and Resume approaches ${JSON.stringify(layout.wideSidebarInfo)}`,
    );
  if (metadata.expectCompactPlanningButton && !layout.compactPlanningInfo.pass)
    failures.push(
      `Compact Planning and settings navigation is not visible below 1440 ${JSON.stringify(layout.compactPlanningInfo)}`,
    );
  if (metadata.expectPlanningMenu && !layout.planningMenuInfo.pass)
    failures.push(
      `Planning and settings menu is not inside the viewport with required destinations ${JSON.stringify(layout.planningMenuInfo)}`,
    );
  if (
    metadata.expectPlanningMenuKeyboard &&
    metadata.planningMenuKeyboard?.pass !== true
  )
    failures.push(
      `Planning and settings menu is not keyboard reachable ${JSON.stringify(metadata.planningMenuKeyboard)}`,
    );
  entry.failures = failures;
  entry.pass = failures.length === 0;
  report.captures.push(entry);
  completeScenario(entry.scenarioId, entry);
  await writeReport();
  if (failures.length)
    console.warn(`⚠ Capture "${label}" FAIL: ${failures.join("; ")}`);
  else
    console.log(
      `✓ Capture "${label}" PASS viewport=${viewportInfo.slug} size=${size.bytes} insideViewport=${insideViewport} noClip=${noClip}`,
    );
  return entry;
}

async function exercisePlanningSettingsKeyboard(page, menu) {
  const menuItems = menu.getByRole("menuitem");
  const count = await menuItems.count();
  if (count < PLANNING_SETTINGS_MENU_DESTINATIONS.length)
    throw new Error(
      `Planning and settings menu exposed ${count} items; expected at least ${PLANNING_SETTINGS_MENU_DESTINATIONS.length}.`,
    );
  const labels = await menuItems.evaluateAll((items) =>
    items.map(
      (item) =>
        item.getAttribute("aria-label") ??
        item.textContent?.replace(/\s+/g, " ").trim() ??
        "",
    ),
  );
  for (const requiredLabel of PLANNING_SETTINGS_MENU_DESTINATIONS) {
    if (!labels.some((label) => label.trim() === requiredLabel))
      throw new Error(
        `Planning and settings menu did not expose ${requiredLabel}. Labels: ${JSON.stringify(labels)}`,
      );
  }
  await page.keyboard.press("Home");
  const first = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      label:
        active?.getAttribute("aria-label") ??
        active?.textContent?.replace(/\s+/g, " ").trim() ??
        null,
      role: active?.getAttribute("role") ?? null,
    };
  });
  await page.keyboard.press("End");
  const last = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      label:
        active?.getAttribute("aria-label") ??
        active?.textContent?.replace(/\s+/g, " ").trim() ??
        null,
      role: active?.getAttribute("role") ?? null,
    };
  });
  const pass =
    first.role === "menuitem" &&
    first.label === labels[0].trim() &&
    last.role === "menuitem" &&
    last.label === labels[labels.length - 1].trim();
  if (!pass)
    throw new Error(
      `Planning and settings keyboard traversal did not reach first and last menu items: ${JSON.stringify({ first, last, labels })}`,
    );
  return {
    pass,
    firstFocusedLabel: first.label,
    lastFocusedLabel: last.label,
    labels: labels.map((label) => label.trim()),
  };
}

function buildSyntheticTargets(baseTargets, count) {
  const template = baseTargets?.[0] ?? {
    id: "target_template",
    label: "Template Source",
    startingUrl: "https://example.com/jobs",
    enabled: true,
    adapterKind: "auto",
    customInstructions: "",
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
  const targets = [];
  const domains = [
    "greenhouse.example.test",
    "lever.example.test",
    "ashbyhq.example.test",
    "workday.example.test",
    "example.test",
  ];
  const companies = [
    "Northstar Systems",
    "Atlas Works",
    "Signal Systems",
    "CoreLedger",
    "RemoteCom",
    "Northwind Labs",
    "Consent Labs",
    "Mercury AI",
    "Glean",
    "Constructor",
  ];
  for (let i = 0; i < count; i++) {
    const domain = domains[i % domains.length];
    const company = companies[i % companies.length];
    const id = `target_synth_${String(i + 1).padStart(3, "0")}`;
    const label =
      i % 7 === 0
        ? `Very Long Company Name With Excessive Descriptor That Should Truncate Elegantly In Compact Pill ${i + 1} With Extra Words To Test Ellipsis`
        : `${company} - Board ${i + 1}`;
    const startingUrl = `https://${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.${domain}/careers/${i + 1}`;
    const enabled = i % 3 !== 0;
    const instructionStatus =
      i % 5 === 0 ? "stale" : i % 7 === 0 ? "draft" : "missing";
    targets.push({
      ...structuredClone(template),
      id,
      label,
      startingUrl,
      enabled,
      instructionStatus,
      lastVerifiedAt: null,
    });
  }
  if (targets.length > 2) {
    targets[2].startingUrl =
      "https://jobs.example.test/source/example-eu-board";
    targets[2].label =
      "EU Lever EU Board With Very Long Title To Test Truncate At 200 Percent Zoom Effectively";
  }
  return targets;
}
function buildSyntheticJobs(baseJobs, count) {
  const template = baseJobs?.[0] ??
    baseJobs?.find(Boolean) ?? {
      id: "job_template",
      source: "target_site",
      sourceJobId: "template_source",
      discoveryMethod: "catalog_seed",
      canonicalUrl: "https://jobs.example.test/roles/template",
      applicationUrl: "https://jobs.example.test/roles/template/apply",
      title: "Senior Product Designer",
      company: "Signal Systems",
      location: "Remote",
      workMode: ["remote"],
      applyPath: "easy_apply",
      easyApplyEligible: true,
      postedAt: "2026-03-20T09:00:00.000Z",
      postedAtText: null,
      discoveredAt: "2026-03-20T09:05:00.000Z",
      firstSeenAt: "2026-03-20T09:05:00.000Z",
      lastSeenAt: "2026-03-20T09:05:00.000Z",
      lastVerifiedActiveAt: "2026-03-20T09:05:00.000Z",
      salaryText: "$180k - $220k",
      normalizedCompensation: {
        currency: "USD",
        interval: "year",
        minAmount: 180000,
        maxAmount: 220000,
        minAnnualUsd: 180000,
        maxAnnualUsd: 220000,
      },
      summary: "Own the design system.",
      description: "Own the design system and workflow platform.",
      keySkills: ["Figma", "Design Systems"],
      responsibilities: ["Own the design system roadmap."],
      minimumQualifications: ["Strong product design systems experience."],
      preferredQualifications: ["Workflow-platform product background."],
      seniority: "Senior",
      employmentType: "Full-time",
      department: "Design",
      team: "Design Systems",
      employerWebsiteUrl: "https://signalsystems.example.com",
      employerDomain: "signalsystems.example.com",
      atsProvider: null,
      screeningHints: {
        sponsorshipText: null,
        requiresSecurityClearance: null,
        relocationText: null,
        travelText: null,
        remoteGeographies: ["Europe"],
      },
      keywordSignals: [
        { id: "sig_1", label: "Design Systems", kind: "skill", weight: 5 },
      ],
      benefits: ["Remote-first collaboration"],
      status: "ready_for_review",
      matchAssessment: {
        score: 96,
        reasons: ["Strong design-systems overlap"],
        gaps: [],
        recommendation: "review_before_applying",
        evidence: [],
      },
      provenance: [],
      discoveryFeedback: null,
      latestMatchAssessmentAudit: null,
    };
  const jobs = [];
  const titles = [
    "Senior Product Designer",
    "Principal UX Engineer",
    "Staff Product Designer",
    "Lead UX Strategist",
    "Senior Systems Designer",
    "Platform Engineer",
    "Very Long Job Title That Should Truncate In Pill And Not Overflow The Card At 200 Percent Zoom For Verification Purposes With Extra Long Descriptor To Test Pill Ellipsis",
  ];
  const companies = [
    "Signal Systems",
    "Northstar Systems",
    "Atlas Works",
    "CoreLedger",
    "Northwind Labs",
    "Consent Labs",
    "Mercury AI",
  ];
  for (let i = 0; i < count; i++) {
    const base = structuredClone(template);
    const ordinal = i + 1;
    const title =
      titles[i % titles.length] +
      (i % 10 === 0
        ? ` ${ordinal} with extra long descriptor to test pill truncate behavior in job cards and badges at high zoom`
        : "");
    const company = companies[i % companies.length];
    jobs.push({
      ...base,
      id: `job_synth_${String(ordinal).padStart(3, "0")}`,
      sourceJobId: `source_synth_${ordinal}`,
      canonicalUrl: `https://jobs.example.test/roles/synth_${ordinal}`,
      applicationUrl: `https://jobs.example.test/roles/synth_${ordinal}/apply`,
      title,
      company,
      location:
        i % 3 === 0
          ? "Remote"
          : i % 3 === 1
            ? "Hybrid, London"
            : "On-site, Berlin with a very long location descriptor that should truncate elegantly without overflow",
      summary: `Synthetic job ${ordinal} for deterministic UI coverage.`,
      description: `Synthetic listing content for coverage ${ordinal}; no external source opened.`,
      status: "ready_for_review",
      discoveredAt: new Date(Date.now() - (count - i) * 60000).toISOString(),
      lastSeenAt: new Date().toISOString(),
      firstSeenAt: new Date(Date.now() - (count - i) * 60000).toISOString(),
      lastVerifiedActiveAt: new Date().toISOString(),
    });
  }
  return jobs;
}
async function waitForWorkspaceHydrated(page, timeoutMs = 30000) {
  await waitForCondition(
    async () => {
      const w = await getWorkspace(page);
      return w && w.hydration && w.hydration.phase === "complete";
    },
    "workspace hydration",
    timeoutMs,
  );
}
async function createEmptyStateInRenderer(page) {
  await page.evaluate(() => window.unemployed.jobFinder.resetWorkspace());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(
    () => Boolean(window.unemployed?.jobFinder?.getWorkspace),
    undefined,
    { timeout: 15000 },
  );
  await waitForWorkspaceHydrated(page, 20000);
}
async function run() {
  await ensureFreshOutputDir(outputDir);
  await verifyAcceptanceArtifacts(acceptance);
  const userDataDirectory = await makeIsolatedUserDataDirectory(
    "unemployed-fresh-flows-",
  );
  report.safety.isolatedUserDataDir = userDataDirectory;
  report.safety.syntheticTestDataDigest = digestSeed({
    seed: acceptance.seedDigest,
    component: "fresh",
    source: "preload.test",
  });
  let app;
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
    page.on("pageerror", (error) => {
      report.runtimeErrors.push({ type: "pageerror", message: error.message });
    });
    page.on("console", (msg) => {
      if (msg.type() === "error")
        report.runtimeErrors.push({ type: "console", message: msg.text() });
    });
    await page.waitForLoadState("domcontentloaded");
    await assertFileRenderer(page);
    await page.waitForFunction(
      () => Boolean(window.unemployed?.jobFinder?.test),
      undefined,
      { timeout: 30000 },
    );
    const browserWindow = await app.browserWindow(page);
    activeBrowserWindow = browserWindow;
    await page.evaluate(() =>
      window.unemployed.jobFinder.test.setSystemThemeOverride("dark"),
    );
    await setViewport(page, browserWindow, viewports[0]);

    const baseApplySnapshot = await page.evaluate(() =>
      window.unemployed.jobFinder.test.loadApplyQueueDemo(),
    );
    const baseResumeSnapshot = await page.evaluate(() =>
      window.unemployed.jobFinder.test.loadResumeWorkspaceDemo(),
    );

    console.log("=== Fresh Home 0 metrics with guidance ===");
    await createEmptyStateInRenderer(page);
    await page.evaluate(() => {
      window.location.hash = "#/job-finder/home";
    });
    await page
      .getByRole("heading", { name: /Today/ })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    const freshHomeDesktop = await capture(
      page,
      "fresh-home-desktop-0-metrics",
      {
        viewport: viewports[0],
        scenario: "fresh-home",
        scenarioId: "home-zero-desktop",
        expectWideSidebar: true,
      },
    );
    const freshHomeWorkspace = await getWorkspace(page);
    const freshHomeMetrics = assertZeroDashboardMetrics(freshHomeWorkspace);
    await setViewport(page, browserWindow, viewports[2]);
    const freshHomeMinimum = await capture(page, "fresh-home-minimum-width-0-metrics", {
      viewport: viewports[2],
      scenario: "fresh-home-minimum-width",
      scenarioId: "home-zero-minimum",
      expectCompactPlanningButton: true,
    });
    completeScenario("wide-sidebar-1440", freshHomeDesktop);
    completeScenario("compact-planning-settings-minimum", freshHomeMinimum);
    await setViewport(page, browserWindow, viewports[0]);
    report.scenarios.freshHome = {
      metricsZero: Object.values(freshHomeMetrics).every((value) => value === 0),
      metrics: freshHomeMetrics,
      viewport: viewports[0].slug,
      minimumWidth: viewports[2].width,
    };

    console.log("=== Guided Setup empty ===");
    await page.evaluate(() => {
      window.location.hash = "#/job-finder/profile/setup";
    });
    await page
      .getByRole("heading", { name: /Guided setup/ })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await capture(page, "guided-setup-empty-desktop", {
      viewport: viewports[0],
      scenario: "guided-setup-empty",
      scenarioId: "guided-setup-empty-desktop",
    });
    await setViewport(page, browserWindow, viewports[1]);
    await page.evaluate(() => {
      window.location.hash = "#/job-finder/profile/setup";
    });
    await capture(page, "guided-setup-empty-zoom200", {
      viewport: viewports[1],
      scenario: "guided-setup-empty-zoom200",
      scenarioId: "guided-setup-empty-zoom200",
    });
    await setViewport(page, browserWindow, viewports[0]);
    report.scenarios.guidedSetup = { empty: true };

    console.log(
      "=== Profile sources 25 rows p1/p2/filtered empty at 200% pill truncate ===",
    );
    let sourceState = structuredClone(baseResumeSnapshot);
    const syntheticTargets = buildSyntheticTargets(
      sourceState.searchPreferences?.discovery?.targets ??
        sourceState.searchPreferences?.discoveryTargets ??
        [],
      32,
    );
    // Ensure discoveryTargets field correct location
    if (sourceState.searchPreferences?.discovery?.targets) {
      sourceState.searchPreferences.discovery.targets = syntheticTargets;
    } else if (sourceState.searchPreferences) {
      sourceState.searchPreferences.discoveryTargets = syntheticTargets;
    }
    sourceState.searchPreferences.discovery.targets = syntheticTargets;
    sourceState.profileSetupState = {
      status: "completed",
      currentStep: "ready_check",
      completedAt: new Date().toISOString(),
      reviewItems: [],
      lastResumedAt: new Date().toISOString(),
    };
    // Ensure profile has minimal required fields
    if (!sourceState.profile.firstName) sourceState.profile.firstName = "Alex";
    if (!sourceState.profile.lastName)
      sourceState.profile.lastName = "Vanguard";
    await page.evaluate(
      (state) => window.unemployed.jobFinder.test.resetWorkspaceState(state),
      sourceState,
    );
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => Boolean(window.unemployed?.jobFinder?.getWorkspace),
      undefined,
      { timeout: 10000 },
    );
    await waitForWorkspaceHydrated(page, 20000);
    const profileWorkspace = await getWorkspace(page);
    const profileSourceTargets =
      profileWorkspace?.searchPreferences?.discovery?.targets ??
      profileWorkspace?.searchPreferences?.discoveryTargets;
    assert(
      Array.isArray(profileSourceTargets) &&
        profileSourceTargets.length === syntheticTargets.length,
      `Profile sources did not hydrate the expected populated state: expected ${syntheticTargets.length}, received ${Array.isArray(profileSourceTargets) ? profileSourceTargets.length : "missing"}.`,
    );
    await setViewport(page, browserWindow, viewports[0]);
    await page.evaluate(() => {
      window.location.hash =
        "#/job-finder/profile?section=sources&focus=job-sources";
    });
    await page
      .getByRole("heading", { name: "Your profile" })
      .waitFor({ state: "visible", timeout: 10000 });
    await page
      .getByText("Job sources", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await page
      .locator("[data-job-sources-library]")
      .waitFor({ state: "visible", timeout: 10000 });
    await capture(page, "profile-sources-25rows-p1-desktop", {
      viewport: viewports[0],
      scenario: "profile-sources-p1",
      scenarioId: "profile-sources-p1",
      totalSources: syntheticTargets.length,
      expectedRows: 25,
    });
    const profileP1Rows = await page
      .locator("[data-compact-source-id], [data-expanded-source-id]")
      .count();
    assert(
      profileP1Rows === 25,
      `Profile sources page 1 rendered ${profileP1Rows} rows instead of 25.`,
    );
    // p2 via Next
    const nextBtn = page
      .getByRole("button", { name: "Next", exact: true })
      .first();
    if (!(await nextBtn.isEnabled()))
      throw new Error(
        "Profile source pagination did not expose an enabled Next button for page 2.",
      );
    await nextBtn.click();
    await page
      .getByText(/26[–-]32 of 32/, { exact: false })
      .waitFor({ state: "visible", timeout: 10000 });
    await capture(page, "profile-sources-25rows-p2-desktop", {
      viewport: viewports[0],
      scenario: "profile-sources-p2",
      scenarioId: "profile-sources-p2",
      expectedRows: 7,
    });
    const profileP2Rows = await page
      .locator("[data-compact-source-id], [data-expanded-source-id]")
      .count();
    assert(
      profileP2Rows === 7,
      `Profile sources page 2 rendered ${profileP2Rows} rows instead of 7.`,
    );
    // filtered empty
    const searchInput = page
      .getByPlaceholder("Search by company, board, or URL")
      .first();
    await searchInput.waitFor({ state: "visible", timeout: 10000 });
    await searchInput.fill("zzznonexistentquery999");
    await page
      .getByText(/No sources match/i)
      .waitFor({ state: "visible", timeout: 10000 });
    await capture(page, "profile-sources-filtered-empty-desktop", {
      viewport: viewports[0],
      scenario: "profile-filtered-empty",
      scenarioId: "profile-sources-filtered-empty",
      emptyUnified: true,
    });
    await searchInput.fill("");
    // 200% pill truncate
    await setViewport(page, browserWindow, viewports[1]);
    await page.evaluate(() => {
      window.location.hash = "#/job-finder/profile?section=sources";
    });
    await page.waitForTimeout(700);
    await capture(page, "profile-sources-25rows-zoom200", {
      viewport: viewports[1],
      scenario: "profile-sources-zoom200",
      scenarioId: "profile-sources-zoom200",
      pillsTruncate: true,
    });
    await setViewport(page, browserWindow, viewports[0]);
    report.scenarios.profileSources = {
      total: profileSourceTargets.length,
      pageSize: 25,
      renderedRows: { page1: profileP1Rows, page2: profileP2Rows },
    };

    console.log("=== Discovery 50 rows + filtered empty ===");
    let discoveryState = structuredClone(baseApplySnapshot);
    const discoveryJobs = buildSyntheticJobs(
      discoveryState.savedJobs ?? discoveryState.discoveryJobs ?? [],
      50,
    );
    // Set both savedJobs and discoveryJobs if field exists
    discoveryState.savedJobs = discoveryJobs;
    if ("discoveryJobs" in discoveryState)
      discoveryState.discoveryJobs = discoveryJobs;
    // Also ensure recentDiscoveryJobs includes Completed?
    // Ensure campaign
    let campaign = discoveryState.campaigns?.[0];
    if (!campaign) {
      campaign = {
        id: "campaign_synth_1",
        name: "Synthetic Campaign 50",
        description: "Synthetic campaign for fresh flows",
        status: "active",
        mode: "precision",
        jobIds: discoveryJobs.map((j) => j.id),
        sourceTargetIds: syntheticTargets.slice(0, 3).map((t) => t.id),
        rules: [],
        schedule: {
          mode: "manual",
          enabled: false,
          daysOfWeek: [],
          localStartTime: "09:00",
          timeZone: "UTC",
          pauseWindows: [],
          runFacts: {
            nextRunAt: null,
            lastRunAt: null,
            lastRunOutcome: null,
            lastRunSummary: null,
            consecutiveFailures: 0,
          },
        },
        latestDigest: null,
        progress: {
          jobsFound: discoveryJobs.length,
          jobsRetained: discoveryJobs.length,
          applicationsPrepared: 0,
          applicationsApplied: 0,
          currentBatchCompleted: 0,
          currentBatchTotal: 0,
          blockedCount: 0,
          remainingQueueSize: 0,
          lastRunAt: null,
          lastUpdatedAt: new Date().toISOString(),
        },
        history: [],
        applicationPolicy: {
          requireReviewBeforeExternalWrite: true,
          finalSubmitAuthorized: false,
          defaultResumeStrategyId: null,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      discoveryState.campaigns = [campaign];
      discoveryState.activeCampaignId = campaign.id;
    } else {
      campaign.jobIds = discoveryJobs.map((j) => j.id);
      campaign.progress = {
        ...campaign.progress,
        jobsFound: discoveryJobs.length,
        jobsRetained: discoveryJobs.length,
      };
      discoveryState.activeCampaignId = campaign.id;
    }
    discoveryState.profileSetupState = {
      status: "completed",
      currentStep: "ready_check",
      completedAt: new Date().toISOString(),
      reviewItems: [],
      lastResumedAt: new Date().toISOString(),
    };
    // Ensure discoveryJobs visible: also need to ensure savedJobs leads to snapshot discoveryJobs
    // For discovery filtering, ensure at least one source enabled
    if (discoveryState.searchPreferences?.discovery?.targets) {
      // enable first target if none enabled
      const hasEnabled =
        discoveryState.searchPreferences.discovery.targets.some(
          (t) => t.enabled,
        );
      if (!hasEnabled && discoveryState.searchPreferences.discovery.targets[0])
        discoveryState.searchPreferences.discovery.targets[0].enabled = true;
    }
    await page.evaluate(
      (state) => window.unemployed.jobFinder.test.resetWorkspaceState(state),
      discoveryState,
    );
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => Boolean(window.unemployed?.jobFinder?.getWorkspace),
      undefined,
      { timeout: 10000 },
    );
    await waitForWorkspaceHydrated(page, 20000);
    const discoveryWorkspace = await getWorkspace(page);
    const hydratedDiscoveryJobs = assertHydratedCollectionCount(
      discoveryWorkspace,
      "discoveryJobs",
      discoveryJobs.length,
      "Discovery jobs",
    );
    assert(
      discoveryWorkspace.activeCampaignId &&
        discoveryWorkspace.campaigns?.some(
          (candidate) =>
            candidate.id === discoveryWorkspace.activeCampaignId &&
            candidate.jobIds.length === discoveryJobs.length,
        ),
      "Discovery workspace did not hydrate a populated active campaign with all synthetic jobs.",
    );
    await setViewport(page, browserWindow, viewports[0]);
    await page.evaluate(() => {
      window.location.hash = "#/job-finder/discovery";
    });
    await page
      .getByRole("heading", { name: "Find jobs" })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    await page
      .locator('[aria-labelledby="discovery-job-results-heading"]')
      .waitFor({ state: "visible", timeout: 10000 });
    await capture(page, "discovery-50rows-p1-desktop", {
      viewport: viewports[0],
      scenario: "discovery-p1",
      scenarioId: "discovery-p1",
      jobCount: 50,
    });
    const discoveryP1Rows = await page.locator("[data-job-result-id]").count();
    assert(
      discoveryP1Rows === discoveryJobs.length,
      `Discovery page 1 rendered ${discoveryP1Rows} jobs instead of ${discoveryJobs.length}.`,
    );
    // discovery p2 if available (50 page size 50 => only 1 page, but we still test pagination existence)
    // For 50 jobs with pageSize 50, p1 is 1-50, no p2 expected. We'll try to trigger filtered empty via search.
    const discoverySearchInput = page.getByPlaceholder(/Search/i).first();
    await discoverySearchInput.waitFor({ state: "visible", timeout: 10000 });
    await discoverySearchInput.fill("qzqzqz");
    await page
      .getByText(/No matching jobs|No jobs/i)
      .waitFor({ state: "visible", timeout: 10000 });
    await capture(page, "discovery-filtered-empty-desktop", {
      viewport: viewports[0],
      scenario: "discovery-filtered-empty",
      scenarioId: "discovery-filtered-empty",
      emptyUnified: true,
    });
    assert(
      (await page.locator("[data-job-result-id]").count()) === 0,
      "Discovery filtered-empty state still rendered job results.",
    );
    await discoverySearchInput.fill("");
    await setViewport(page, browserWindow, viewports[1]);
    await page.evaluate(() => {
      window.location.hash = "#/job-finder/discovery";
    });
    await page.waitForTimeout(700);
    await capture(page, "discovery-50rows-zoom200", {
      viewport: viewports[1],
      scenario: "discovery-zoom200",
      scenarioId: "discovery-zoom200",
    });
    await setViewport(page, browserWindow, viewports[0]);
    report.scenarios.discovery = {
      jobCount: hydratedDiscoveryJobs,
      renderedRows: discoveryP1Rows,
      filteredRenderedRows: 0,
    };

    console.log(
      "=== Planning and settings menu at 200% inside viewport + keyboard ===",
    );
    await setViewport(page, browserWindow, viewports[1]);
    await page.evaluate(() => {
      window.location.hash = "#/job-finder/home";
    });
    await page
      .getByRole("heading", { name: /Today/ })
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    const planningSettingsButton = page.getByRole("button", {
      name: /^Planning and settings/,
      exact: false,
    });
    await planningSettingsButton.waitFor({ state: "visible", timeout: 8000 });
    await planningSettingsButton.click();
    const planningSettingsMenu = page.getByRole("menu", {
      name: PLANNING_SETTINGS_MENU_LABEL,
      exact: true,
    });
    await planningSettingsMenu.waitFor({ state: "visible", timeout: 8000 });
    const planningMenuKeyboard = await exercisePlanningSettingsKeyboard(
      page,
      planningSettingsMenu,
    );
    const planningSettingsCapture = await capture(page, "planning-settings-menu-zoom200", {
      viewport: viewports[1],
      scenario: "planning-settings-menu",
      scenarioId: "planning-settings-menu-zoom200",
      expectPlanningMenu: true,
      expectPlanningMenuKeyboard: true,
      planningMenuKeyboard,
    });
    const planningMenuLayout = report.captures.at(-1)?.navigation?.planningMenu;
    if (
      !planningMenuLayout?.requiredDestinationsVisible ||
      !planningMenuLayout.labels?.includes("Settings")
    )
      throw new Error(
        `Planning and settings menu did not retain Settings at 200%: ${JSON.stringify(planningMenuLayout)}`,
      );
    completeScenario("planning-settings-menu-zoom200", planningSettingsCapture);
    await page.keyboard.press("Escape");
    await planningSettingsMenu.waitFor({ state: "hidden", timeout: 5000 });
    // Also capture zoom200 home for final sweep sanity
    await capture(page, "fresh-home-zoom200", {
      viewport: viewports[1],
      scenario: "fresh-home-zoom200",
      scenarioId: "home-zero-zoom200",
    });
    await setViewport(page, browserWindow, viewports[0]);

    // Safety checks
    const finalWorkspace = await getWorkspace(page);
    if (!finalWorkspace)
      throw new Error(
        "Fresh-flow acceptance could not read the final synthetic workspace.",
      );
    {
      const submitFlags = (finalWorkspace.userActionRequests ?? []).map(
        (r) => r.submitAuthorized,
      );
      const acctFlags = (finalWorkspace.userActionRequests ?? []).map(
        (r) => r.accountCreationAuthorized,
      );
      report.safety.observedSafetyEvents = observedSafetyEvents;
      report.safety.applicationActionsExecuted =
        observedSafetyEvents.length > 0;
      report.safety.finalSubmissionClicked = observedSafetyEvents.some((c) =>
        /submit|application|apply/i.test(c.label ?? ""),
      );
      report.safety.submitAuthorized = submitFlags.some(Boolean);
      report.safety.accountCreationAuthorized = acctFlags.some(Boolean);
      assertPrepareOnly(finalWorkspace, observedSafetyEvents);
      assert(
        report.safety.applicationActionsExecuted === false &&
          report.safety.finalSubmissionClicked === false &&
          report.safety.submitAuthorized === false &&
          report.safety.accountCreationAuthorized === false &&
          observedSafetyEvents.length === 0,
        `Fresh-flow safety completion was not prepare-only: ${JSON.stringify(report.safety)}`,
      );
      report.safety.prepareOnlyVerified = true;
    }
    if (report.runtimeErrors.length > 0) {
      throw new Error(
        `Runtime errors: ${JSON.stringify(report.runtimeErrors)}`,
      );
    }
    const completedScenarioIds = new Set(report.scenarioCompletionIds);
    const missingScenarioIds = report.requiredScenarioCompletionIds.filter(
      (scenarioId) => !completedScenarioIds.has(scenarioId),
    );
    if (missingScenarioIds.length > 0)
      throw new Error(
        `Fresh-flow acceptance did not complete required scenarios: ${missingScenarioIds.join(", ")}`,
      );
    assert(
      report.scenarioCompletionIds.length ===
        report.requiredScenarioCompletionIds.length,
      `Fresh-flow acceptance completed ${report.scenarioCompletionIds.length} scenarios but requires ${report.requiredScenarioCompletionIds.length}.`,
    );
    assert(
      report.safety.prepareOnlyVerified === true,
      "Fresh-flow acceptance did not complete its explicit prepare-only safety check.",
    );
    report.summary = {
      captureCount: report.captures.length,
      passCount: report.captures.filter((c) => c.pass).length,
      failCount: report.captures.filter((c) => !c.pass).length,
      viewports: viewports.map((v) => v.slug),
      allInsideViewport: report.captures.every((c) => c.insideViewport),
      allNoClip: report.captures.every((c) => c.noClip),
    };
    report.completedAt = new Date().toISOString();
    await writeReport();
    console.log(
      `Saved ${report.captures.length} fresh-flow captures to ${outputDir}`,
    );
    // List
    for (const c of report.captures) {
      console.log(
        `  ${c.id}: ${c.fileName} viewport=${c.viewport.slug} insideViewport=${c.insideViewport} noClip=${c.noClip} pass=${c.pass}`,
      );
    }
  } finally {
    let finalizationError = null;
    if (app) {
      try {
        await stopOwnedElectronProcessTree(app);
      } catch {}
    }
    if (processOutputState) {
      try {
        finalizeProcessOutput(processOutputState, report);
      } catch (error) {
        finalizationError = error;
      }
    }
    const cleanupError = await cleanupDirectory(userDataDirectory);
    report.safety.cleanedUp = !cleanupError;
    if (cleanupError) report.safety.cleanupError = String(cleanupError);
    try {
      await writeReport();
    } catch {}
    if (finalizationError) throw finalizationError;
    if (cleanupError)
      throw new Error(
        `Unable to clean isolated user data directory: ${cleanupError}`,
      );
  }
}
run().catch(async (err) => {
  console.error(err);
  report.failedAt = new Date().toISOString();
  report.failure =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  await writeReport();
  process.exitCode = 1;
});
