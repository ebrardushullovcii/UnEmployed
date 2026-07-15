/* eslint-env node, browser */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(currentDir, "..");
const outputDir = path.join(
  desktopDir,
  "test-artifacts",
  "ui",
  "interview-helper-basic",
);

function assertInvariant(condition, message) {
  if (!condition)
    throw new Error(`Interview Helper basic harness failed: ${message}`);
}

async function getWorkspace(window) {
  return window.evaluate(() =>
    window.unemployed.interviewHelper.getWorkspace(),
  );
}

async function waitForOverlayWindows(app) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const windows = app
      .windows()
      .filter((candidate) =>
        candidate.url().includes('/interview-helper/overlay/'),
      );
    if (windows.length === 2) return windows;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for the answer and transcript popup windows.');
}

async function waitForCueCount(window, expectedMinimum) {
  await window.waitForFunction(
    async (minimum) => {
      const workspace = await window.unemployed.interviewHelper.getWorkspace();
      return (workspace.activeSession?.cueCards.length ?? 0) >= minimum;
    },
    expectedMinimum,
    { timeout: 15_000 },
  );
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const userDataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "unemployed-interview-helper-basic-"),
  );
  const attachmentPath = path.join(userDataDirectory, "architecture.png");
  await writeFile(
    attachmentPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
      "base64",
    ),
  );

  const app = await electron.launch({
    args: ["."],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_AI_API_KEY: "",
      UNEMPLOYED_AI_VISION_API_KEY: "",
      UNEMPLOYED_INTERVIEW_AI_API_KEY: "",
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
    },
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.setViewportSize({ width: 1440, height: 920 });
    await window
      .getByRole("heading", { name: "Interview conversation" })
      .waitFor();
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "01-setup.png"),
    });

    await window.evaluate(async () => {
      await window.unemployed.interviewHelper.saveSetup({
        consent: {
          microphoneCapture: true,
          meetingAudioCapture: true,
          screenshotCapture: true,
          modelTransmission: true,
          localRetention: true,
          overlayProtectionNotice: true,
          acceptedAt: new Date().toISOString(),
        },
      });
      await window.unemployed.interviewHelper.runRehearsal();
      await window.unemployed.interviewHelper.startSession();
    });
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await window
      .getByRole("heading", {
        name: "Ask, listen, and work through the answer",
      })
      .waitFor();

    const overlayWindows = await waitForOverlayWindows(app);
    for (const overlayWindow of overlayWindows) {
      await overlayWindow.waitForLoadState('domcontentloaded');
    }
    const answerOverlayWindow = overlayWindows.find((candidate) =>
      candidate.url().includes('/overlay/answer'),
    );
    const transcriptOverlayWindow = overlayWindows.find((candidate) =>
      candidate.url().includes('/overlay/transcript'),
    );
    assertInvariant(answerOverlayWindow, 'answer popup should exist');
    assertInvariant(transcriptOverlayWindow, 'transcript popup should exist');
    const popupVisibility = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((candidate) =>
          candidate.webContents.getURL().includes('/interview-helper/overlay/'),
        )
        .map((candidate) => ({
          url: candidate.webContents.getURL(),
          visible: candidate.isVisible(),
        })),
    );
    const workspaceBefore = await getWorkspace(window);
    const firstExpectedCueCount =
      (workspaceBefore.activeSession?.cueCards.length ?? 0) + 1;
    const composer = window.getByPlaceholder(
      "Ask a question, paste a screenshot, or type what you need help answering…",
    );
    await composer.fill("Help me explain a difficult architecture trade-off");
    await window.getByRole("button", { name: /^Send$/ }).click();
    await waitForCueCount(window, firstExpectedCueCount);
    await window
      .getByText("Help me explain a difficult architecture trade-off")
      .first()
      .waitFor();

    const popupComposer = answerOverlayWindow.getByPlaceholder(
      'Ask for an answer, follow-up, or feedback…',
    );
    await popupComposer.fill('Use this screenshot to improve the answer');
    await window.evaluate(() =>
      window.unemployed.interviewHelper.performAction('toggle_listening'),
    );
    await answerOverlayWindow.waitForFunction(() =>
      document
        .querySelector('textarea[aria-label="Ask Interview Copilot"]')
        ?.value.includes('Use this screenshot'),
    );
    await window.evaluate(() =>
      window.unemployed.interviewHelper.performAction('toggle_listening'),
    );

    const imageInput = answerOverlayWindow.locator(
      'input[type="file"][accept*="image/png"]',
    );
    await imageInput.setInputFiles(attachmentPath);
    await answerOverlayWindow.getByAltText("architecture.png").waitFor();
    const workspaceAfterText = await getWorkspace(window);
    const secondExpectedCueCount =
      (workspaceAfterText.activeSession?.cueCards.length ?? 0) + 1;
    await answerOverlayWindow.getByRole("button", { name: /^Send$/ }).click();
    await waitForCueCount(window, secondExpectedCueCount);
    await window.getByText("architecture.png").waitFor();

    await answerOverlayWindow
      .getByText("Use this screenshot to improve the answer")
      .waitFor({ timeout: 15_000 });
    await transcriptOverlayWindow
      .getByText("Use this screenshot to improve the answer")
      .waitFor({ timeout: 15_000 });

    await answerOverlayWindow
      .getByRole('button', { name: /^Copy answer$/ })
      .click();
    const copiedAnswer = await window.evaluate(() =>
      window.unemployed.interviewHelper.readClipboardText(),
    );
    await transcriptOverlayWindow
      .getByRole('button', { name: /^Copy transcript$/ })
      .click();
    const copiedTranscript = await window.evaluate(() =>
      window.unemployed.interviewHelper.readClipboardText(),
    );

    await answerOverlayWindow
      .getByRole('button', { name: 'Hide answer popup' })
      .click();
    await window.waitForFunction(async () => {
      const workspace = await window.unemployed.interviewHelper.getWorkspace();
      return workspace.answerOverlay.visible === false;
    });
    await window
      .getByRole('button', { name: 'Open answer popup' })
      .click();
    await window.waitForFunction(async () => {
      const workspace = await window.unemployed.interviewHelper.getWorkspace();
      return workspace.answerOverlay.visible === true;
    });

    const resizedAnswerBounds = await app.evaluate(({ BrowserWindow }) => {
      const answerWindow = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().includes('/overlay/answer'),
      );
      if (!answerWindow) return null;
      const bounds = answerWindow.getBounds();
      const resized = {
        ...bounds,
        width: bounds.width + 80,
        height: bounds.height + 60,
      };
      answerWindow.setBounds(resized);
      return resized;
    });
    assertInvariant(resizedAnswerBounds, 'answer popup should resize');
    await new Promise((resolve) => setTimeout(resolve, 500));
    await answerOverlayWindow.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "02-answer-popup.png"),
    });
    await transcriptOverlayWindow.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "03-transcript-popup.png"),
    });

    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await window
      .getByRole("heading", {
        name: "Ask, listen, and work through the answer",
      })
      .waitFor();
    await window
      .getByText("Help me explain a difficult architecture trade-off")
      .first()
      .waitFor();
    await window.getByText("architecture.png").waitFor();

    const finalWorkspace = await getWorkspace(window);
    const report = {
      activeSessionStarted: finalWorkspace.activeSession?.status === "active",
      advancedOverlayWindowCount: overlayWindows.length,
      popupVisibility,
      assistantResponseVisible:
        (await window.getByText("Interview Helper", { exact: true }).count()) >
        0,
      attachedImageVisible:
        (await window.getByText("architecture.png", { exact: true }).count()) >
        0,
      chatSurvivesReload:
        (finalWorkspace.activeSession?.chatConversation?.messages.length ??
          0) === 4,
      audioInputsVisible:
        (await window.getByRole("heading", { name: "Audio inputs" }).count()) >
        0,
      latestCueQuestion:
        finalWorkspace.activeSession?.cueCards.at(-1)?.question ?? null,
      localSttReady: Boolean(
        finalWorkspace.setup.rehearsal?.microphoneEngine.ready &&
        finalWorkspace.setup.rehearsal.microphoneEngine.kind ===
          "local_model" &&
        finalWorkspace.setup.rehearsal.meetingAudioEngine.ready &&
        finalWorkspace.setup.rehearsal.meetingAudioEngine.kind ===
          "local_model",
      ),
      rawImageBytesRetained: JSON.stringify(finalWorkspace).includes(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      ),
      transcriptVisible:
        (await window
          .getByRole("heading", { name: "Recent transcript" })
          .count()) > 0,
      popupTypedSendWorked:
        finalWorkspace.activeSession?.chatConversation?.messages.some(
          (message) =>
            message.role === 'user' &&
            message.content === 'Use this screenshot to improve the answer',
        ) ?? false,
      popupDraftSurvivedWorkspaceUpdate: true,
      popupClipboardWorked:
        copiedAnswer.text.length > 0 &&
        copiedTranscript.text.includes('Use this screenshot'),
      popupHideAndReopenWorked: finalWorkspace.answerOverlay.visible,
      popupResized: Boolean(resizedAnswerBounds),
    };

    await window.evaluate(() =>
      window.unemployed.interviewHelper.performAction('end_session'),
    );
    await window.waitForFunction(
      () =>
        window.unemployed.interviewHelper.getWorkspace().then(
          (workspace) => workspace.activeSession === null,
        ),
    );
    await window.evaluate(() =>
      window.unemployed.interviewHelper.startSession(),
    );
    const restartedOverlays = await waitForOverlayWindows(app);
    const restartedAnswer = restartedOverlays.find((candidate) =>
      candidate.url().includes('/overlay/answer'),
    );
    assertInvariant(restartedAnswer, 'answer popup should reopen after restart');
    const restoredAnswerBounds = await app.evaluate(({ BrowserWindow }) => {
      const answerWindow = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().includes('/overlay/answer'),
      );
      return answerWindow?.getBounds() ?? null;
    });
    report.popupBoundsRestored =
      JSON.stringify(restoredAnswerBounds) === JSON.stringify(resizedAnswerBounds);

    assertInvariant(report.activeSessionStarted, "session should start");
    assertInvariant(
      report.advancedOverlayWindowCount === 2,
      "answer and transcript popup windows should open when the interview starts",
    );
    assertInvariant(
      report.popupVisibility.every((popup) => popup.visible),
      "both popup windows should be visibly shown",
    );
    assertInvariant(
      report.assistantResponseVisible,
      "assistant response should be visible in the main window",
    );
    assertInvariant(
      report.attachedImageVisible,
      "sent attachment metadata should remain visible",
    );
    assertInvariant(
      report.chatSurvivesReload,
      "chat messages should survive a renderer reload",
    );
    assertInvariant(
      report.audioInputsVisible,
      "audio controls should be visible",
    );
    assertInvariant(
      report.transcriptVisible,
      "recent transcript should be visible",
    );
    assertInvariant(
      report.localSttReady,
      "local STT should be ready for mic and system chunks",
    );
    assertInvariant(
      report.rawImageBytesRetained === false,
      "raw image bytes must stay transient",
    );
    assertInvariant(report.popupTypedSendWorked, 'popup typed send should work');
    assertInvariant(
      report.popupClipboardWorked,
      'answer and transcript copy controls should work',
    );
    assertInvariant(
      report.popupHideAndReopenWorked,
      'answer popup should hide and reopen from visible controls',
    );
    assertInvariant(report.popupResized, 'answer popup should be resizable');
    assertInvariant(
      report.popupBoundsRestored,
      'resized popup bounds should survive an end/start cycle',
    );

    await window.evaluate(() => {
      document.querySelector("main")?.scrollTo({ top: 0 });
    });
    await window.screenshot({
      animations: "disabled",
      path: path.join(outputDir, "04-visible-chat.png"),
    });
    await writeFile(
      path.join(outputDir, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
}

await run();
