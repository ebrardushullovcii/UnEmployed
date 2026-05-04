import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(currentDir, "..");
const width = Number.parseInt(process.env.UI_CAPTURE_WIDTH ?? "1440", 10);
const height = Number.parseInt(process.env.UI_CAPTURE_HEIGHT ?? "920", 10);
const runLabel = process.env.UI_CAPTURE_LABEL ?? "resume-workspace";
const outputDir = path.join(desktopDir, "test-artifacts", "ui", runLabel);

async function writeJson(fileName, value) {
  await writeFile(
    path.join(outputDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function waitForCondition(
  check,
  description,
  timeoutMs = 15000,
  intervalMs = 150,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function encodeContractSegment(value) {
  return encodeURIComponent(value);
}

async function getResumeWorkspace(window, jobId) {
  return window.evaluate(
    async (currentJobId) =>
      window.unemployed.jobFinder.getResumeWorkspace(currentJobId),
    jobId,
  );
}

async function getResumeAssistantMessages(window, jobId) {
  return window.evaluate(
    async (currentJobId) =>
      window.unemployed.jobFinder.getResumeAssistantMessages(currentJobId),
    jobId,
  );
}

async function getWorkspace(window) {
  return window.evaluate(() => window.unemployed.jobFinder.getWorkspace());
}

async function resetWorkspaceState(window, state) {
  await window.evaluate(async (workspaceState) => {
    if (!window.unemployed.jobFinder.test?.resetWorkspaceState) {
      throw new Error("Desktop test reset API is unavailable.");
    }

    return window.unemployed.jobFinder.test.resetWorkspaceState(workspaceState);
  }, state);
}

function getDraftSummaryText(workspace) {
  return (
    workspace.draft.sections.find((section) => section.kind === "summary")
      ?.text ?? ""
  );
}

function getPreviewExpectation(workspace) {
  const summarySection = workspace.draft.sections.find(
    (section) => section.kind === "summary",
  );
  const summaryText = summarySection?.text?.trim() ?? "";
  if (summarySection?.included && summaryText.length > 0) {
    return summaryText;
  }

  for (const section of workspace.draft.sections) {
    if (!section.included) {
      continue;
    }

    const sectionText = section.text?.trim();
    if (sectionText) {
      return sectionText;
    }

    for (const entry of section.entries) {
      if (!entry.included) {
        continue;
      }

      const entryText = [entry.title, entry.subtitle, entry.summary].find(
        (value) => typeof value === "string" && value.trim().length > 0,
      );
      if (entryText) {
        return entryText.trim();
      }

      const entryBulletText = entry.bullets.find(
        (bullet) => bullet.included && bullet.text.trim().length > 0,
      )?.text;
      if (entryBulletText) {
        return entryBulletText.trim();
      }
    }

    const sectionBulletText = section.bullets.find(
      (bullet) => bullet.included && bullet.text.trim().length > 0,
    )?.text;
    if (sectionBulletText) {
      return sectionBulletText.trim();
    }
  }

  return null;
}

function buildEntryFieldTarget(sectionId, entryId, field) {
  return [
    "entry",
    encodeContractSegment(sectionId),
    encodeContractSegment(entryId),
    encodeContractSegment(field),
  ].join(":");
}

function getEntryPreviewTarget(section, entry) {
  const fieldCandidates = [
    { field: "title", editorLabel: "Title", value: entry.title },
    { field: "subtitle", editorLabel: "Subtitle", value: entry.subtitle },
    { field: "summary", editorLabel: "Summary", value: entry.summary },
  ];

  for (const candidate of fieldCandidates) {
    const expectedValue = candidate.value?.trim();
    if (expectedValue) {
      return {
        sectionId: section.id,
        entryId: entry.id,
        targetId: buildEntryFieldTarget(section.id, entry.id, candidate.field),
        editorLabel: candidate.editorLabel,
        expectedValue,
      };
    }
  }

  const bullet = entry.bullets.find(
    (entryBullet) => entryBullet.included && entryBullet.text.trim().length > 0,
  );
  if (!bullet) {
    return null;
  }

  return {
    sectionId: section.id,
    entryId: entry.id,
    targetId: [
      "entry",
      encodeContractSegment(section.id),
      encodeContractSegment(entry.id),
      "bullet",
      encodeContractSegment(bullet.id),
    ].join(":"),
    editorLabel: "Bullet text",
    expectedValue: bullet.text.trim(),
  };
}

function getClickablePreviewTarget(workspace) {
  const targets = [];

  for (const section of workspace.draft.sections) {
    if (!section.included) {
      continue;
    }

    let entryTarget = null;
    for (const entry of section.entries) {
      if (!entry.included) {
        continue;
      }

      entryTarget = getEntryPreviewTarget(section, entry);
      if (entryTarget) {
        break;
      }
    }

    if (entryTarget) {
      targets.push(entryTarget);
      continue;
    }

    if (section.text?.trim()) {
      targets.push({
        sectionId: section.id,
        entryId: null,
        targetId: ["section", encodeContractSegment(section.id), "text"].join(
          ":",
        ),
        editorLabel: "Section text",
        expectedValue: section.text?.trim() ?? null,
      });
    }
  }

  return targets[1] ?? targets[0] ?? null;
}

function getExperienceSection(workspace) {
  return (
    workspace?.draft.sections.find(
      (section) => section.kind === "experience",
    ) ?? null
  );
}

function getExperienceEntries(workspace) {
  return getExperienceSection(workspace)?.entries ?? [];
}

function getExperienceEntryIds(workspace) {
  return getExperienceEntries(workspace).map((entry) => entry.id);
}

function getPreviewEntryOrder(html, entryIds) {
  return entryIds
    .map((entryId) => ({
      entryId,
      index: html.indexOf(`data-resume-entry-id="${entryId}"`),
    }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.entryId);
}

function getLatestBy(items, getTimestamp) {
  if (!items?.length) {
    return null;
  }

  return (
    items
      .map((item, index) => {
        const parsedTimestamp = Date.parse(getTimestamp(item));

        return {
          item,
          index,
          timestamp: Number.isFinite(parsedTimestamp)
            ? parsedTimestamp
            : Number.NEGATIVE_INFINITY,
        };
      })
      .sort((left, right) => {
        const timestampDifference = right.timestamp - left.timestamp;
        return timestampDifference !== 0
          ? timestampDifference
          : right.index - left.index;
      })[0]?.item ?? null
  );
}

async function waitForProfileOrSetupHeading(window) {
  await window
    .locator("h1")
    .filter({ hasText: /Your profile|Guided setup|Senior Product Designer/ })
    .waitFor({ timeout: 15000 });
}

function summaryField(window) {
  return editorFieldByTarget(window, "section:section_summary:text");
}

function editorFieldByTarget(window, targetId) {
  return window
    .locator(`[data-resume-editor-target="${targetId}"]:visible`)
    .first();
}

function assistantField(window) {
  return window
    .locator('[data-testid="resume-assistant-input"]:visible')
    .first();
}

async function loadResumeWorkspaceDemo(window, previewMode = "ok") {
  const state = await window.evaluate(async (mode) => {
    if (!window.unemployed.jobFinder.test) {
      throw new Error("Desktop test API is unavailable in the renderer.");
    }

    await window.unemployed.jobFinder.test.setResumePreviewMode(mode);
    return window.unemployed.jobFinder.test.loadResumeWorkspaceDemo();
  }, previewMode);

  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await waitForProfileOrSetupHeading(window);
  await window.setViewportSize({ width, height });

  return state;
}

async function openResumeWorkspace(window) {
  await window
    .getByRole("button", { name: /Open resume workspace/i })
    .first()
    .click();
  await window
    .getByRole("heading", { level: 1, name: /Senior Product Designer/i })
    .waitFor({ timeout: 10000 });
}

function visiblePreviewPane(window) {
  return window
    .locator("section:visible")
    .filter({
      has: window.getByText("Resume preview", { exact: true }),
    })
    .first();
}

function visiblePreviewFrame(window) {
  return window.locator('iframe[title="Live resume preview"]:visible').first();
}

async function getPreviewSrcdoc(window) {
  return visiblePreviewFrame(window).evaluate(
    (iframe) => iframe.getAttribute("srcdoc") ?? iframe.srcdoc ?? "",
  );
}

async function waitForPreviewFailure(window) {
  const previewPane = visiblePreviewPane(window);
  await previewPane
    .getByRole("heading", { name: "Preview unavailable" })
    .waitFor({ timeout: 10000 });
  await previewPane
    .locator("p:visible", {
      hasText: /^Preview rendering failed in desktop test mode\.$/,
    })
    .first()
    .waitFor({ timeout: 10000 });
}

async function waitForPreviewReady(window, options = {}) {
  const normalizedOptions = options ?? {};
  const expectedText =
    typeof normalizedOptions === "string"
      ? normalizedOptions
      : (normalizedOptions.expectedText ?? null);
  const changedFrom =
    typeof normalizedOptions === "string"
      ? null
      : (normalizedOptions.changedFrom ?? null);

  await visiblePreviewFrame(window).waitFor({ timeout: 10000 });
  await waitForCondition(
    async () => {
      let previewHtml;
      try {
        previewHtml = await getPreviewSrcdoc(window);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          /detached|execution context was destroyed|target closed|frame was detached|context destroyed/i.test(
            message,
          )
        ) {
          return false;
        }

        throw error;
      }

      if (expectedText && !previewHtml.includes(expectedText)) {
        return false;
      }

      if (changedFrom !== null && previewHtml === changedFrom) {
        return false;
      }

      return previewHtml.length > 0;
    },
    expectedText && changedFrom !== null
      ? `resume preview to include '${expectedText}' after a fresh render`
      : expectedText
        ? `resume preview to include '${expectedText}'`
        : changedFrom !== null
          ? "fresh resume preview content"
          : "resume preview content",
  );
}

async function waitForSavedSummaryText(window, expectedText) {
  await waitForCondition(
    async () =>
      getDraftSummaryText(await getResumeWorkspace(window, "job_ready")) ===
      expectedText,
    `saved summary text '${expectedText}'`,
  );
}

async function getActiveEditorLabel(window) {
  return window.evaluate(() => {
    const activeElement = document.activeElement;

    if (!(activeElement instanceof HTMLElement)) {
      return null;
    }

    return (
      activeElement.getAttribute("aria-label") ??
      activeElement.labels?.[0]?.textContent?.trim() ??
      null
    );
  });
}

async function getTemplateBadgeText(window) {
  return (
    (
      await window
        .getByText(/^Template:/)
        .first()
        .textContent()
    )?.trim() ?? null
  );
}

function templateStrategyPanel(window) {
  return window
    .locator("section")
    .filter({ hasText: "Template strategy" })
    .first();
}

async function clickLocatorViaDom(locator, description) {
  try {
    await locator.waitFor({ timeout: 10000 });
    await locator.click();
  } catch (error) {
    throw new Error(
      `Could not click ${description}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function clickTemplateStrategyVariant(window, variantLabel, buttonText) {
  const strategySection = templateStrategyPanel(window);
  const variantCard = strategySection
    .locator("[data-resume-template-option]")
    .filter({ hasText: variantLabel })
    .first();
  const button = variantCard.locator("[data-resume-template-select]").first();

  await clickLocatorViaDom(
    button,
    `button '${buttonText}' for template variant '${variantLabel}'`,
  );
}

async function captureResumeWorkspace() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const userDataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "unemployed-resume-workspace-"),
  );

  let app;

  try {
    app = await electron.launch({
      args: ["."],
      cwd: desktopDir,
      env: {
        ...process.env,
        UNEMPLOYED_BROWSER_AGENT: "0",
        UNEMPLOYED_ENABLE_TEST_API: "1",
        UNEMPLOYED_TEST_SYSTEM_THEME:
          process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? "dark",
        UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      },
    });

    const window = await app.firstWindow();
    await window.evaluate(async (theme) => {
      await window.unemployed.jobFinder.test?.setSystemThemeOverride(theme);
    }, process.env.UNEMPLOYED_TEST_SYSTEM_THEME ?? "dark");
    await window.waitForLoadState("domcontentloaded");
    await waitForProfileOrSetupHeading(window);
    await window.setViewportSize({ width, height });

    await loadResumeWorkspaceDemo(window, "fail_once");

    const studioResults = {};

    await window.getByRole("button", { name: /^Shortlisted/ }).click();
    await window
      .getByRole("heading", { level: 1, name: "Shortlisted jobs" })
      .waitFor({ timeout: 10000 });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "01-review-queue.png"),
    });

    await window.getByText(/Company site:/).waitFor({ timeout: 10000 });

    await openResumeWorkspace(window);
    await waitForPreviewFailure(window);
    const initialWorkspace = await getResumeWorkspace(window, "job_ready");
    const initialPreviewExpectation = getPreviewExpectation(initialWorkspace);
    const previewFailureMessage = await visiblePreviewPane(window)
      .locator("p:visible", {
        hasText: /^Preview rendering failed in desktop test mode\.$/,
      })
      .first()
      .textContent();
    const failureEditorVisible = await summaryField(window).isVisible();
    assert(
      failureEditorVisible,
      "Editing should remain available while preview rendering fails.",
    );
    Object.assign(studioResults, {
      previewFailure: {
        editorStillAvailable: failureEditorVisible,
        message: previewFailureMessage,
      },
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "02-preview-failure.png"),
    });

    await window.getByRole("button", { name: "Refresh preview" }).click();
    await waitForPreviewReady(window, initialPreviewExpectation);
    Object.assign(studioResults, {
      previewRecovery: {
        expectedText: initialPreviewExpectation,
        previewStatus: await visiblePreviewPane(window)
          .locator("span:visible", {
            hasText: /^(Saved draft rendered|Unsaved edits rendered)$/,
          })
          .first()
          .textContent(),
        previewContainsExpectedText: initialPreviewExpectation
          ? (await getPreviewSrcdoc(window)).includes(initialPreviewExpectation)
          : (await getPreviewSrcdoc(window)).length > 0,
      },
    });
    const recoveredWorkspace = await getResumeWorkspace(window, "job_ready");
    const recoveredExperienceSection = getExperienceSection(recoveredWorkspace);
    const recoveredExperienceEntries = getExperienceEntries(recoveredWorkspace);
    const recoveredEntryIds = getExperienceEntryIds(recoveredWorkspace);
    const recoveredPreviewHtml = await getPreviewSrcdoc(window);
    const expectedRecoveredProfileOrder = [
      "experience_1",
      "experience_coreledger_recent",
      "experience_coreledger_older",
    ];
    assert(
      expectedRecoveredProfileOrder.every(
        (profileRecordId, index) =>
          recoveredExperienceEntries[index]?.profileRecordId ===
          profileRecordId,
      ),
      `Expected corrected experience profile order ${expectedRecoveredProfileOrder.join(", ")}, got ${recoveredExperienceEntries.map((entry) => entry.profileRecordId ?? entry.id).join(", ")}.`,
    );
    const expectedRecoveredEntryIds = recoveredExperienceEntries
      .slice(0, expectedRecoveredProfileOrder.length)
      .map((entry) => entry.id);
    assert(
      JSON.stringify(
        getPreviewEntryOrder(recoveredPreviewHtml, expectedRecoveredEntryIds),
      ) === JSON.stringify(expectedRecoveredEntryIds),
      "Preview should render experience entries in the same corrected chronological order as the editor.",
    );
    Object.assign(studioResults, {
      experienceOrdering: {
        initialMode: recoveredExperienceSection?.entryOrderMode ?? null,
        editorOrder: recoveredEntryIds,
        editorProfileOrder: recoveredExperienceEntries.map(
          (entry) => entry.profileRecordId ?? null,
        ),
        previewOrder: getPreviewEntryOrder(
          recoveredPreviewHtml,
          expectedRecoveredEntryIds,
        ),
      },
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "03-preview-recovered.png"),
    });

    await window
      .getByText("Saved research", { exact: true })
      .first()
      .waitFor({ timeout: 10000 });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "04-resume-workspace-sources.png"),
    });

    await window
      .getByText("Template strategy", { exact: true })
      .first()
      .waitFor({ timeout: 10000 });
    const recommendedTemplateLabels = await templateStrategyPanel(window)
      .locator('[data-slot="badge"]')
      .evaluateAll((elements) =>
        elements
          .map((element) => element.textContent?.trim() ?? "")
          .filter((label) => label.includes("Recommended")),
      );
    Object.assign(studioResults, {
      catalogRecommendations: {
        recommendationBadges: recommendedTemplateLabels,
      },
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "04a-template-strategy-default.png"),
    });

    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "04b-template-strategy-options.png"),
    });

    const preTemplatePreviewSrcdoc = await getPreviewSrcdoc(window);
    await clickTemplateStrategyVariant(
      window,
      "Engineering Spec · Skills First",
      "Use this template",
    );
    await waitForCondition(
      async () =>
        (await getTemplateBadgeText(window)) === "Template: Engineering Spec",
      "template header badge to reflect the recommended template selection",
    );
    await waitForPreviewReady(window, {
      changedFrom: preTemplatePreviewSrcdoc,
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "04c-template-selected-engineering-spec.png"),
    });

    const unsavedPreviewSentinel =
      "Senior systems designer with strong workflow automation, design-system, and operations-platform experience.";
    await summaryField(window).fill(unsavedPreviewSentinel);
    await visiblePreviewPane(window)
      .locator("span:visible", { hasText: /^Unsaved edits rendered$/ })
      .first()
      .waitFor({ timeout: 10000 });
    await waitForPreviewReady(window, unsavedPreviewSentinel);
    const unsavedWorkspace = await getResumeWorkspace(window, "job_ready");
    assert(
      getDraftSummaryText(unsavedWorkspace) !== unsavedPreviewSentinel,
      "Unsaved preview text should not persist to the saved draft before saving.",
    );
    Object.assign(studioResults, {
      unsavedPreview: {
        fieldValue: await summaryField(window).inputValue(),
        previewContainsSentinel: (await getPreviewSrcdoc(window)).includes(
          unsavedPreviewSentinel,
        ),
        savedSummaryText: getDraftSummaryText(unsavedWorkspace),
      },
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "05-unsaved-live-preview.png"),
    });

    const clickTarget = getClickablePreviewTarget(
      await getResumeWorkspace(window, "job_ready"),
    );
    assert(
      clickTarget,
      "Expected a clickable preview target in the resume workspace demo.",
    );
    const previewFrame = window.frameLocator(
      'iframe[title="Live resume preview"]:visible',
    );
    const previewTargetLocator = previewFrame
      .locator(`[data-resume-target-id="${clickTarget.targetId}"]`)
      .first();
    await previewTargetLocator.waitFor({ timeout: 10000 });
    await previewTargetLocator.click();

    await waitForCondition(
      async () =>
        previewTargetLocator.evaluate(
          (element) => element.getAttribute("data-resume-selected") === "true",
        ),
      "clicked preview target to become selected",
    );

    const clickToFocusMessage =
      clickTarget.editorLabel === "Title"
        ? "entry title input focus after clicking the live preview"
        : "section text input focus after clicking the live preview";
    try {
      await waitForCondition(
        async () =>
          editorFieldByTarget(window, clickTarget.targetId).evaluate(
            (element, expectedValue) =>
              element === element.ownerDocument.activeElement &&
              element.value === expectedValue,
            clickTarget.expectedValue,
          ),
        clickToFocusMessage,
      );
    } catch (error) {
      await writeJson("preview-click-focus-failure.json", {
        clickTarget,
        editorField: await editorFieldByTarget(
          window,
          clickTarget.targetId,
        ).evaluate((element) => ({
          activeElementTagName:
            element.ownerDocument.activeElement?.tagName ?? null,
          activeElementTarget:
            element.ownerDocument.activeElement?.getAttribute(
              "data-resume-editor-target",
            ) ?? null,
          editorTarget: element.getAttribute("data-resume-editor-target"),
          editorValue: element.value,
          isActiveElement: element === element.ownerDocument.activeElement,
        })),
      });
      throw error;
    }

    Object.assign(studioResults, {
      clickToFocus: {
        target: clickTarget,
        activeEditorLabel: await getActiveEditorLabel(window),
        focusedValue: await editorFieldByTarget(
          window,
          clickTarget.targetId,
        ).inputValue(),
      },
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "06-preview-click-focus.png"),
    });

    const beforeManualOrderWorkspace = await getResumeWorkspace(
      window,
      "job_ready",
    );
    const beforeManualOrderEntries = getExperienceEntries(
      beforeManualOrderWorkspace,
    );
    const beforeManualOrder = getExperienceEntryIds(beforeManualOrderWorkspace);
    const beforeManualPreviewHtml = await getPreviewSrcdoc(window);
    const currentRoleEntryId = beforeManualOrderEntries.find(
      (entry) => entry.profileRecordId === "experience_1",
    )?.id;
    const recentCoreLedgerEntryId = beforeManualOrderEntries.find(
      (entry) => entry.profileRecordId === "experience_coreledger_recent",
    )?.id;
    assert(
      currentRoleEntryId && recentCoreLedgerEntryId,
      "Resume workspace demo must expose current and recent CoreLedger entries for ordering controls.",
    );
    const currentRoleTitleTarget = `entry:section_experience:${currentRoleEntryId}:title`;
    await window
      .locator(`[data-resume-editor-target="${currentRoleTitleTarget}"]`)
      .first()
      .evaluate((input) => {
        const article = input.closest("article");
        const buttons = Array.from(article?.querySelectorAll("button") ?? []);
        const moveDownButton = buttons.find((button) =>
          button.textContent?.toLowerCase().includes("move down"),
        );

        if (!(moveDownButton instanceof HTMLButtonElement)) {
          throw new Error(
            "Unable to find Move entry down button for the current role card.",
          );
        }

        moveDownButton.click();
      });
    await waitForCondition(async () => {
      const workspace = await getResumeWorkspace(window, "job_ready");
      const order = getExperienceEntryIds(workspace);
      return (
        getExperienceSection(workspace)?.entryOrderMode === "manual" &&
        order[0] === recentCoreLedgerEntryId &&
        order[1] === currentRoleEntryId
      );
    }, "manual experience entry reorder to persist");
    await waitForPreviewReady(window, { changedFrom: beforeManualPreviewHtml });
    const manualOrderWorkspace = await getResumeWorkspace(window, "job_ready");
    const manualOrder = getExperienceEntryIds(manualOrderWorkspace);
    const manualPreviewHtml = await getPreviewSrcdoc(window);
    assert(
      getExperienceSection(manualOrderWorkspace)?.entryOrderMode === "manual",
      "Expected persisted workspace to enter manual order after moving an experience entry.",
    );
    const manualDraft = manualOrderWorkspace.draft;
    const manualExperienceSection = getExperienceSection(manualOrderWorkspace);
    const manualEntriesById = new Map(
      manualExperienceSection?.entries.map((entry) => [entry.id, entry]) ?? [],
    );
    const resetDraft = {
      ...manualDraft,
      sections: manualDraft.sections.map((section) =>
        section.id === manualExperienceSection?.id
          ? {
              ...section,
              entryOrderMode: "chronology",
              entries: beforeManualOrder.map((entryId, index) => {
                const entry = manualEntriesById.get(entryId);
                assert(
                  entry,
                  `Missing expected experience entry '${entryId}' while resetting chronology evidence.`,
                );

                return {
                  ...entry,
                  sortOrder: index,
                };
              }),
            }
          : section,
      ),
      updatedAt: new Date().toISOString(),
    };
    await window.getByRole("button", { name: "Save draft" }).click();
    await waitForSavedSummaryText(window, unsavedPreviewSentinel);
    await window.evaluate(
      async ({ currentJobId, draft }) => {
        return window.unemployed.jobFinder.saveResumeDraft({
          ...draft,
          status: "needs_review",
          approvedAt: null,
          approvedExportId: null,
          staleReason: null,
        });
      },
      { currentJobId: "job_ready", draft: resetDraft },
    );
    await window.getByRole("button", { name: "Refresh preview" }).click();
    await waitForPreviewReady(window);
    const persistedResetWorkspace = await getResumeWorkspace(
      window,
      "job_ready",
    );
    assert(
      getExperienceSection(persistedResetWorkspace)?.entryOrderMode ===
        "chronology" &&
        JSON.stringify(getExperienceEntryIds(persistedResetWorkspace)) ===
          JSON.stringify(beforeManualOrder),
      "Expected save API to persist the chronological reset draft update.",
    );
    await window
      .locator("[data-resume-workspace-scroll-region]:visible")
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    let lastResetWorkspace = null;
    await waitForCondition(
      async () => {
        const workspace = await getResumeWorkspace(window, "job_ready");
        lastResetWorkspace = workspace;
        return (
          getExperienceSection(workspace)?.entryOrderMode === "chronology" &&
          JSON.stringify(getExperienceEntryIds(workspace)) ===
            JSON.stringify(beforeManualOrder)
        );
      },
      `experience entry order reset to chronology from ${JSON.stringify({
        beforeManualOrder,
        manualOrder,
        lastMode:
          getExperienceSection(lastResetWorkspace)?.entryOrderMode ?? null,
        lastOrder: lastResetWorkspace
          ? getExperienceEntryIds(lastResetWorkspace)
          : [],
      })}`,
    );
    const resetOrderWorkspace = await getResumeWorkspace(window, "job_ready");
    const resetPreviewHtml = await window.evaluate((draft) => {
      return window.unemployed.jobFinder.previewResumeDraft(draft);
    }, resetOrderWorkspace.draft);
    const resetPreviewOrder = getPreviewEntryOrder(
      resetPreviewHtml.html,
      beforeManualOrder,
    );
    assert(
      JSON.stringify(resetPreviewOrder) ===
        JSON.stringify(getExperienceEntryIds(resetOrderWorkspace)),
      `Expected reset preview order to match reset editor order, got ${resetPreviewOrder.join(", ")} versus ${getExperienceEntryIds(resetOrderWorkspace).join(", ")}.`,
    );
    Object.assign(studioResults, {
      experienceOrdering: {
        ...(studioResults.experienceOrdering ?? {}),
        manualOrder,
        manualMode:
          getExperienceSection(manualOrderWorkspace)?.entryOrderMode ?? null,
        manualPreviewOrder: getPreviewEntryOrder(
          manualPreviewHtml,
          manualOrder,
        ),
        resetOrder: getExperienceEntryIds(resetOrderWorkspace),
        resetMode:
          getExperienceSection(resetOrderWorkspace)?.entryOrderMode ?? null,
        resetPreviewOrder,
      },
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "06a-experience-order-controls.png"),
    });

    await window.getByRole("button", { name: "Save draft" }).click();
    await waitForSavedSummaryText(window, unsavedPreviewSentinel);
    await waitForPreviewReady(window, unsavedPreviewSentinel);
    await visiblePreviewPane(window)
      .locator("span:visible", { hasText: /^Saved draft rendered$/ })
      .first()
      .waitFor({ timeout: 10000 });
    Object.assign(studioResults, {
      savedDraft: {
        savedSummaryText: getDraftSummaryText(
          await getResumeWorkspace(window, "job_ready"),
        ),
        selectedTemplateBadge: await getTemplateBadgeText(window),
      },
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "07-after-manual-edit.png"),
    });

    const previousMessageCount = (
      await getResumeAssistantMessages(window, "job_ready")
    ).length;
    await window.getByRole("button", { name: "Open guided edits" }).click();
    await waitForCondition(
      async () =>
        await window
          .locator('[data-resume-guided-edits-open="true"]')
          .first()
          .isVisible(),
      "guided edits popup to open",
    );
    await assistantField(window).fill(
      "Shorten the summary and tighten one experience bullet for ATS readability.",
    );
    await window.getByRole("button", { name: "Send request" }).click();
    await waitForCondition(async () => {
      const messages = await getResumeAssistantMessages(window, "job_ready");
      const lastAssistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant");
      const sendButtonLabel = await window
        .getByRole("button", { name: /Send request|Updating/i })
        .textContent();
      return (
        messages.length > previousMessageCount &&
        lastAssistant?.role === "assistant" &&
        lastAssistant.content.trim().length > 0 &&
        lastAssistant.content !== "Updating your draft..." &&
        sendButtonLabel?.includes("Send request")
      );
    }, "assistant reply in resume workspace demo");
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "08-after-assistant.png"),
    });

    await window.getByRole("button", { name: "Export PDF" }).click();
    await waitForCondition(
      async () =>
        (await getResumeWorkspace(window, "job_ready")).exports.length > 0,
      "resume export in demo flow",
    );
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "09-after-export.png"),
    });

    await window.getByRole("button", { name: /Back to Shortlisted/i }).click();
    await window
      .getByRole("heading", { level: 1, name: "Shortlisted jobs" })
      .waitFor({ timeout: 10000 });
    const gatedApproveButton = window.getByRole("button", {
      name: "Start apply copilot",
    });
    if (!(await gatedApproveButton.isDisabled())) {
      throw new Error(
        "Start apply copilot should stay disabled before resume approval.",
      );
    }
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "10-review-queue-gated.png"),
    });

    await openResumeWorkspace(window);
    const reopenedWorkspace = await getResumeWorkspace(window, "job_ready");
    await waitForPreviewReady(window, getPreviewExpectation(reopenedWorkspace));

    const approveButton = window.getByRole("button", {
      name: "Approve current PDF",
    });
    await approveButton.waitFor({ timeout: 10000 });
    await approveButton.click();
    await waitForCondition(async () => {
      const workspace = await getResumeWorkspace(window, "job_ready");
      return (
        workspace.exports.some((entry) => entry.isApproved) &&
        workspace.draft.status === "approved"
      );
    }, "approved resume export in demo flow");
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "11-after-approval.png"),
    });

    await window.getByRole("button", { name: /Back to Shortlisted/i }).click();
    await window
      .getByRole("heading", { level: 1, name: "Shortlisted jobs" })
      .waitFor({ timeout: 10000 });
    const readyApproveButton = window.getByRole("button", {
      name: "Start apply copilot",
    });
    if (await readyApproveButton.isDisabled()) {
      throw new Error(
        "Start apply copilot should be enabled after resume approval.",
      );
    }
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "12-review-queue-approved.png"),
    });

    await readyApproveButton.click();
    await window.getByRole("button", { name: /^Applications/ }).click();
    await window
      .getByRole("heading", { level: 1, name: "Applications" })
      .waitFor({ timeout: 10000 });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "13-applications-after-apply.png"),
    });

    await window
      .getByText("Apply run review data", { exact: true })
      .waitFor({ timeout: 10000 });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "14-applications-after-copilot.png"),
    });

    const workspace = await getWorkspace(window);
    const latestAttempt = getLatestBy(
      workspace.applicationAttempts,
      (attempt) => attempt.updatedAt,
    );
    const applicationSummary = {
      latestAttemptState: latestAttempt?.state ?? null,
      latestAttemptOutcome: latestAttempt?.outcome ?? null,
    };

    if (applicationSummary.latestAttemptState !== "paused") {
      throw new Error(
        `Apply copilot should pause before submit, got '${applicationSummary.latestAttemptState ?? "null"}'.`,
      );
    }

    if (applicationSummary.latestAttemptOutcome !== null) {
      throw new Error("Apply copilot should not record a submitted outcome.");
    }

    await writeJson("studio-preview-results.json", studioResults);
    await writeJson("workspace-after-demo.json", workspace);
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        // Preserve the original failure while still cleaning up the temp profile.
      }
    }
    try {
      await rm(userDataDirectory, { recursive: true, force: true });
    } catch {
      // Preserve the original failure while still cleaning up the temp profile.
    }
  }

  process.stdout.write(
    `Saved resume workspace demo artifacts to ${outputDir}\n`,
  );
}

void captureResumeWorkspace();
