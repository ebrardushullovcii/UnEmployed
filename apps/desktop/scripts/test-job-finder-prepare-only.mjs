/* eslint-env node, browser */
/* global process, setTimeout, clearTimeout, window */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(currentDir, "..");
const fixturePath = path.join(
  desktopDir,
  "test-fixtures",
  "job-finder",
  "profile-baseline-workspace.json",
);
const syntheticResumePath = path.join(
  desktopDir,
  "test-fixtures",
  "job-finder",
  "resume-import-sample.txt",
);
const outputLabel =
  process.env.JOB_FINDER_PREPARE_ONLY_LABEL ?? "prepare-only-live-smoke";
const outputDir = path.join(
  desktopDir,
  "test-artifacts",
  "job-finder",
  outputLabel,
);
const reportPath = path.join(outputDir, "prepare-only-smoke-report.json");
const target = {
  id:
    process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_ID ??
    "target_lever_aircall",
  label:
    process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_LABEL ??
    "Aircall Lever",
  startingUrl:
    process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_URL ??
    "https://jobs.lever.co/aircall",
};
const targetRoles = parseCommaSeparatedList(
  process.env.JOB_FINDER_PREPARE_ONLY_TARGET_ROLES,
  [
    "AI Productivity Engineer",
    "Software Engineer",
    "Product Engineer",
    "Frontend Engineer",
    "Backend Engineer",
  ],
);
const discoveryTimeoutMs = readPositiveInteger(
  process.env.JOB_FINDER_PREPARE_ONLY_DISCOVERY_TIMEOUT_MS,
  240_000,
);
const applyTimeoutMs = readPositiveInteger(
  process.env.JOB_FINDER_PREPARE_ONLY_APPLY_TIMEOUT_MS,
  180_000,
);
const expectExactSourceJob =
  process.env.JOB_FINDER_PREPARE_ONLY_EXPECT_EXACT_SOURCE_JOB === "1";
const requireFinalCheckpoint =
  process.env.JOB_FINDER_PREPARE_ONLY_REQUIRE_FINAL_CHECKPOINT === "1";
const expectedBlockerCode =
  process.env.JOB_FINDER_PREPARE_ONLY_EXPECT_BLOCKER_CODE?.trim() || null;
const useLiveDiscoveryAi =
  process.env.JOB_FINDER_PREPARE_ONLY_USE_LIVE_DISCOVERY_AI !== "0";
const keepTemporaryProfile =
  process.env.JOB_FINDER_PREPARE_ONLY_KEEP_PROFILE === "1";
const resumeApplicationMode =
  process.env.JOB_FINDER_PREPARE_ONLY_RESUME_MODE === "original_resume"
    ? "original_resume"
    : "tailored_per_job";

class SmokeBlocker extends Error {
  constructor(stage, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "SmokeBlocker";
    this.stage = stage;
  }
}

class SafetyViolation extends Error {
  constructor(message) {
    super(message);
    this.name = "SafetyViolation";
  }
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCommaSeparatedList(value, fallback) {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : fallback;
}

function normalizeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
    return parsed.toString();
  } catch {
    return null;
  }
}

function summarizeError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function withTimeout(promise, timeoutMs, label, onTimeout) {
  let timeoutHandle = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          Promise.resolve(onTimeout?.()).catch(() => undefined);
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function waitForJobFinderBridge(page) {
  await page.waitForFunction(
    () => Boolean(window.unemployed?.jobFinder),
    undefined,
    { timeout: 20_000 },
  );
}

async function launchApp(userDataDirectory, forceLiveAi) {
  const app = await electron.launch({
    args: ["."],
    cwd: desktopDir,
    env: {
      ...process.env,
      UNEMPLOYED_BROWSER_AGENT: "1",
      UNEMPLOYED_BROWSER_HEADLESS: "1",
      UNEMPLOYED_ENABLE_TEST_API: "1",
      UNEMPLOYED_USER_DATA_DIR: userDataDirectory,
      ...(process.env.JOB_FINDER_PREPARE_ONLY_AUTHORIZE_INTERMEDIATE_WRITES ===
      "1"
        ? { UNEMPLOYED_TEST_AUTHORIZE_INTERMEDIATE_ATS_WRITES: "1" }
        : {}),
      ...(forceLiveAi ? { UNEMPLOYED_TEST_API_USE_LIVE_AI: "1" } : {}),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await waitForJobFinderBridge(page);
    return { app, page };
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}

async function getWorkspace(page) {
  return page.evaluate(() => window.unemployed.jobFinder.getWorkspace());
}

async function getWorkspaceSafely(page) {
  if (!page || page.isClosed()) {
    return null;
  }
  return getWorkspace(page).catch(() => null);
}

function buildSearchPreferences(base) {
  return {
    ...base,
    targetRoles,
    locations: [],
    excludedLocations: [],
    workModes: [],
    seniorityLevels: [],
    minimumSalaryUsd: null,
    targetSalaryUsd: null,
    companyBlacklist: [],
    companyWhitelist: [],
    approvalMode: "review_before_submit",
    discovery: {
      historyLimit: 5,
      targets: [
        {
          ...target,
          enabled: true,
          adapterKind: "auto",
          customInstructions: null,
          instructionStatus: "missing",
          validatedInstructionId: null,
          draftInstructionId: null,
          lastDebugRunId: null,
          lastVerifiedAt: null,
          staleReason: null,
        },
      ],
    },
  };
}

function buildSettings(base) {
  return {
    ...base,
    resumeTemplateId: "classic_ats",
    humanReviewRequired: true,
    keepSessionAlive: true,
    allowAutoSubmitOverride: false,
    discoveryOnly: false,
    resumeApplicationMode,
  };
}

function selectTargetJob(jobs) {
  const normalizedStartingUrl = normalizeHttpUrl(target.startingUrl);
  const exactJob = jobs.find(
    (job) =>
      normalizeHttpUrl(job.canonicalUrl) === normalizedStartingUrl ||
      normalizeHttpUrl(job.applicationUrl) === normalizedStartingUrl,
  );
  if (exactJob || expectExactSourceJob) {
    return exactJob ?? null;
  }

  const candidates = jobs.filter((job) => {
    const title = job.title.toLowerCase();
    return /\b(?:engineer|engineering|developer|software|frontend|backend|platform)\b/u.test(
      title,
    );
  });
  return (
    candidates.find((job) =>
      targetRoles.some(
        (role) => role.toLowerCase() === job.title.toLowerCase(),
      ),
    ) ??
    candidates[0] ??
    jobs[0] ??
    null
  );
}

function buildDiscoverySummary(workspace) {
  const latestRun = workspace?.recentDiscoveryRuns?.[0] ?? null;
  return {
    provider: workspace?.agentProvider ?? null,
    runState: latestRun?.state ?? workspace?.discoveryRunState ?? null,
    summary: latestRun?.summary ?? null,
    warning: latestRun?.targetExecutions?.[0]?.warning ?? null,
    jobs: (workspace?.discoveryJobs ?? []).map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      canonicalUrl: job.canonicalUrl,
      applicationUrl: job.applicationUrl,
      discoveryMethod: job.discoveryMethod,
      source: job.source,
    })),
  };
}

function findLatestAttempt(workspace, jobId) {
  return (
    (workspace?.applicationAttempts ?? [])
      .filter((attempt) => attempt.jobId === jobId)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )[0] ?? null
  );
}

function summarizeFinalControl(attempt) {
  const checkpoint = attempt?.checkpoints?.at(-1) ?? null;
  const combinedText = `${checkpoint?.label ?? ""} ${checkpoint?.detail ?? ""}`;
  const labelMatch = combinedText.match(
    /identified '([^']+)'|action '([^']+)'/u,
  );
  const reached =
    /final (?:visible )?(?:control|submit)|pre-submit checkpoint/iu.test(
      combinedText,
    );
  return {
    state: reached ? "reached_without_submit" : "blocked_before_final_control",
    label: labelMatch?.[1] ?? labelMatch?.[2] ?? null,
    checkpoint,
    runtimeExplicitlySaysNotClicked: /did not click/u.test(combinedText),
  };
}

function summarizeSafety(workspace) {
  const submittedAttempts = (workspace?.applicationAttempts ?? []).filter(
    (attempt) =>
      attempt.state === "submitted" || attempt.outcome === "submitted",
  );
  const submittedJobs = (workspace?.discoveryJobs ?? []).filter(
    (job) => job.status === "submitted",
  );
  const submittedRecords = (workspace?.applicationRecords ?? []).filter(
    (record) =>
      record.status === "submitted" || record.lastAttemptState === "submitted",
  );
  return {
    submittedAttemptIds: submittedAttempts.map((attempt) => attempt.id),
    submittedJobIds: submittedJobs.map((job) => job.id),
    submittedRecordIds: submittedRecords.map((record) => record.id),
    submittedNeverOccurred:
      submittedAttempts.length === 0 &&
      submittedJobs.length === 0 &&
      submittedRecords.length === 0,
  };
}

async function runPrepareOnlySmoke() {
  await mkdir(outputDir, { recursive: true });
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const userDataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "unemployed-job-finder-prepare-only-"),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    invocation: "electron_preload_bridge",
    outcome: "running",
    source: target,
    requestedRoles: targetRoles,
    isolation: {
      temporaryUserDataDirectory: true,
      realWorkspaceUsed: false,
      cleanedUp: false,
      retainedForInspection: keepTemporaryProfile,
      retainedPath: keepTemporaryProfile ? userDataDirectory : null,
    },
    phases: [],
    discovery: null,
    selectedJob: null,
    candidate: null,
    resume: null,
    application: null,
    blocker: null,
    assertions: null,
    capabilities: {
      intermediateAtsWritesAuthorized:
        process.env.JOB_FINDER_PREPARE_ONLY_AUTHORIZE_INTERMEDIATE_WRITES ===
        "1",
      finalSubmitAuthorized: false,
      exactSourceJobRequired: expectExactSourceJob,
      finalCheckpointRequired: requireFinalCheckpoint,
      resumeApplicationMode,
      liveDiscoveryAi: useLiveDiscoveryAi,
      expectedBlockerCode,
    },
  };

  let app = null;
  let page = null;
  let latestWorkspace = null;
  let selectedJob = null;
  let safetyViolation = null;
  let acceptanceViolation = null;

  const closeCurrentApp = async () => {
    if (app) {
      await app.close().catch(() => undefined);
    }
    app = null;
    page = null;
  };

  const runPhase = async (stage, operation) => {
    const startedAt = Date.now();
    try {
      const result = await operation();
      report.phases.push({
        stage,
        ok: true,
        wallClockMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      report.phases.push({
        stage,
        ok: false,
        wallClockMs: Date.now() - startedAt,
        error: summarizeError(error),
      });
      throw new SmokeBlocker(stage, summarizeError(error), error);
    }
  };

  try {
    ({ app, page } = await runPhase("launch_discovery_app", () =>
      launchApp(userDataDirectory, useLiveDiscoveryAi),
    ));

    latestWorkspace = await runPhase(
      "seed_isolated_alex_vanguard_workspace",
      () =>
        page.evaluate(
          async ({ profile, searchPreferences, settings }) => {
            await window.unemployed.jobFinder.saveWorkspaceInputs({
              profile,
              searchPreferences,
            });
            await window.unemployed.jobFinder.saveSettings(settings);
            return window.unemployed.jobFinder.getWorkspace();
          },
          {
            profile: fixture.profile,
            searchPreferences: buildSearchPreferences(
              fixture.searchPreferences,
            ),
            settings: buildSettings(fixture.settings),
          },
        ),
    );

    if (resumeApplicationMode === "original_resume") {
      latestWorkspace = await runPhase(
        "import_synthetic_original_resume",
        () =>
          page.evaluate(
            (sourcePath) =>
              window.unemployed.jobFinder.test.importResumeFromPath({
                sourcePath,
                useVision: false,
              }),
            syntheticResumePath,
          ),
      );
      const importedLocationReviewItem =
        latestWorkspace.profileSetupState.reviewItems.find(
          (item) =>
            item.status === "pending" &&
            item.target.domain === "identity" &&
            item.target.key === "currentLocation" &&
            item.proposedValue === "Berlin, Germany",
        );
      if (!importedLocationReviewItem) {
        throw new SmokeBlocker(
          "find_synthetic_imported_location",
          "The synthetic resume import did not expose the expected Berlin, Germany location for confirmation.",
        );
      }
      latestWorkspace = await runPhase(
        "confirm_synthetic_imported_location",
        () =>
          page.evaluate(
            (reviewItemId) =>
              window.unemployed.jobFinder.applyProfileSetupReviewAction(
                reviewItemId,
                "confirm",
              ),
            importedLocationReviewItem.id,
          ),
      );
      report.candidate = {
        fullName: latestWorkspace.profile.fullName,
        email: latestWorkspace.profile.email,
        phone: latestWorkspace.profile.phone,
        currentLocation: latestWorkspace.profile.currentLocation,
        currentCountry: latestWorkspace.profile.currentCountry,
        preferredEmail:
          latestWorkspace.profile.applicationIdentity.preferredEmail,
        preferredPhone:
          latestWorkspace.profile.applicationIdentity.preferredPhone,
      };
      if (
        report.candidate.fullName !== "Jamie Rivers" ||
        report.candidate.email !== "jamie@example.com" ||
        report.candidate.phone !== "+49 555 0000000" ||
        report.candidate.currentLocation !== "Berlin, Germany" ||
        report.candidate.currentCountry !== "Germany" ||
        report.candidate.preferredEmail !== report.candidate.email ||
        report.candidate.preferredPhone !== report.candidate.phone
      ) {
        throw new SmokeBlocker(
          "verify_synthetic_candidate_tuple",
          "The imported synthetic candidate identity, contact, and location tuple was not coherent before Apply.",
        );
      }
      latestWorkspace = await runPhase(
        "restore_exact_search_after_resume_import",
        () =>
          page.evaluate(
            async ({ profile, searchPreferences, settings }) => {
              await window.unemployed.jobFinder.saveWorkspaceInputs({
                profile,
                searchPreferences,
              });
              await window.unemployed.jobFinder.saveSettings(settings);
              return window.unemployed.jobFinder.getWorkspace();
            },
            {
              profile: latestWorkspace.profile,
              searchPreferences: buildSearchPreferences(
                latestWorkspace.searchPreferences,
              ),
              settings: buildSettings(latestWorkspace.settings),
            },
          ),
      );
    }

    const configuredTargets =
      latestWorkspace.searchPreferences.discovery.targets;
    if (
      configuredTargets.length !== 1 ||
      configuredTargets[0]?.id !== target.id ||
      configuredTargets[0]?.startingUrl !== target.startingUrl
    ) {
      throw new SmokeBlocker(
        "verify_source_scope",
        `The isolated workspace was not scoped exclusively to ${target.label}.`,
      );
    }

    latestWorkspace = await runPhase("fast_configured_source_discovery", () =>
      withTimeout(
        page.evaluate(
          (targetId) =>
            window.unemployed.jobFinder.runAgentDiscovery(undefined, targetId),
          target.id,
        ),
        discoveryTimeoutMs,
        `${target.label} fast discovery`,
        () =>
          page.evaluate(() =>
            window.unemployed.jobFinder.cancelAgentDiscovery(),
          ),
      ),
    );
    report.discovery = buildDiscoverySummary(latestWorkspace);
    selectedJob = selectTargetJob(latestWorkspace.discoveryJobs ?? []);

    if (!selectedJob) {
      throw new SmokeBlocker(
        "select_target_job",
        `${target.label} discovery returned no usable job. ${
          report.discovery.warning ?? "No target warning was recorded."
        }`,
      );
    }

    report.selectedJob = {
      id: selectedJob.id,
      title: selectedJob.title,
      company: selectedJob.company,
      canonicalUrl: selectedJob.canonicalUrl,
      applicationUrl: selectedJob.applicationUrl,
    };

    await closeCurrentApp();
    ({ app, page } = await runPhase("relaunch_with_deterministic_test_ai", () =>
      launchApp(userDataDirectory, false),
    ));
    latestWorkspace = await getWorkspace(page);
    if (latestWorkspace.agentProvider.kind !== "deterministic") {
      throw new SmokeBlocker(
        "verify_deterministic_resume_provider",
        `Expected deterministic AI provider, got '${latestWorkspace.agentProvider.kind}'.`,
      );
    }

    latestWorkspace = await runPhase("queue_discovered_job", () =>
      page.evaluate(
        (jobId) => window.unemployed.jobFinder.queueJobForReview(jobId),
        selectedJob.id,
      ),
    );
    if (resumeApplicationMode === "original_resume") {
      const reviewItem = latestWorkspace.reviewQueue.find(
        (item) => item.jobId === selectedJob.id,
      );
      if (
        !reviewItem ||
        reviewItem.resumeApplicationMode !== "original_resume" ||
        reviewItem.resumeReview.status !== "original_resume"
      ) {
        throw new SmokeBlocker(
          "verify_original_resume_ready",
          "The shortlisted job did not retain the imported original CV as its application artifact.",
        );
      }
      report.resume = {
        providerKind: latestWorkspace.agentProvider.kind,
        mode: "original_resume",
        fileName: latestWorkspace.profile.baseResume.fileName,
        filePath: latestWorkspace.profile.baseResume.storagePath,
        extractionStatus: latestWorkspace.profile.baseResume.extractionStatus,
        importedProfileName: latestWorkspace.profile.fullName,
        approved: true,
        unchanged: true,
        validationIssues: [],
      };
    } else {
      latestWorkspace = await runPhase("generate_deterministic_resume", () =>
        page.evaluate(
          (jobId) => window.unemployed.jobFinder.generateResume(jobId),
          selectedJob.id,
        ),
      );
      latestWorkspace = await runPhase("export_resume_pdf", () =>
        page.evaluate(
          (jobId) => window.unemployed.jobFinder.exportResumePdf(jobId),
          selectedJob.id,
        ),
      );
      let resumeWorkspace = await runPhase("read_exported_resume", () =>
        page.evaluate(
          (jobId) => window.unemployed.jobFinder.getResumeWorkspace(jobId),
          selectedJob.id,
        ),
      );
      const exportedResume = resumeWorkspace.exports
        .slice()
        .sort(
          (left, right) =>
            new Date(right.exportedAt).getTime() -
            new Date(left.exportedAt).getTime(),
        )[0];
      if (!exportedResume) {
        throw new SmokeBlocker(
          "approve_resume_pdf",
          "No exported resume PDF was available to approve.",
        );
      }

      latestWorkspace = await runPhase("approve_resume_pdf", () =>
        page.evaluate(
          ({ jobId, exportId }) =>
            window.unemployed.jobFinder.approveResume(jobId, exportId),
          { jobId: selectedJob.id, exportId: exportedResume.id },
        ),
      );
      resumeWorkspace = await page.evaluate(
        (jobId) => window.unemployed.jobFinder.getResumeWorkspace(jobId),
        selectedJob.id,
      );
      report.resume = {
        providerKind: latestWorkspace.agentProvider.kind,
        mode: "tailored_per_job",
        draftId: resumeWorkspace.draft.id,
        draftStatus: resumeWorkspace.draft.status,
        generationMethod: resumeWorkspace.draft.generationMethod,
        sectionCount: resumeWorkspace.draft.sections.length,
        exportId: exportedResume.id,
        exportPageCount: exportedResume.pageCount,
        approved: resumeWorkspace.exports.some(
          (entry) => entry.id === exportedResume.id && entry.isApproved,
        ),
        validationIssues: (resumeWorkspace.validation?.issues ?? []).map(
          (issue) => ({
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
          }),
        ),
      };
    }

    latestWorkspace = await runPhase("approve_apply_prepare_only", () =>
      withTimeout(
        page.evaluate(
          (jobId) =>
            window.unemployed.jobFinder.startApplyCopilotRun(jobId, {
              visualCheckpointsEnabled: false,
            }),
          selectedJob.id,
        ),
        applyTimeoutMs,
        "Prepare-only application flow",
      ),
    );
    const attempt = findLatestAttempt(latestWorkspace, selectedJob.id);
    if (!attempt) {
      throw new SmokeBlocker(
        "inspect_prepare_only_result",
        "Prepare-only execution returned without an application attempt record.",
      );
    }
    report.application = {
      attemptId: attempt.id,
      state: attempt.state,
      outcome: attempt.outcome,
      summary: attempt.summary,
      detail: attempt.detail,
      nextActionLabel: attempt.nextActionLabel,
      checkpoints: attempt.checkpoints,
      blocker: attempt.blocker,
      questionCount: attempt.questions.length,
      questionEvidence: attempt.questions.map((question) => ({
        kind: question.kind,
        required: question.isRequired,
        status: question.status,
        hasSubmittedAnswer: Boolean(question.submittedAnswer),
        suggestedSourceKinds: [
          ...new Set(
            question.suggestedAnswers.map((answer) => answer.sourceKind),
          ),
        ],
      })),
      resumeUploadVerified: attempt.questions.some(
        (question) =>
          question.kind === "resume" && question.status === "answered",
      ),
      finalControl: summarizeFinalControl(attempt),
    };
    report.outcome =
      report.application.finalControl.state === "reached_without_submit"
        ? "passed_final_checkpoint_without_submit"
        : expectedBlockerCode && attempt.blocker?.code === expectedBlockerCode
          ? "passed_expected_human_handoff_without_submit"
          : "passed_safe_blocker_without_submit";
  } catch (error) {
    latestWorkspace = (await getWorkspaceSafely(page)) ?? latestWorkspace;
    report.outcome = "blocked_without_submit";
    report.blocker = {
      stage: error instanceof SmokeBlocker ? error.stage : "unexpected",
      summary: summarizeError(error),
    };
  } finally {
    latestWorkspace = (await getWorkspaceSafely(page)) ?? latestWorkspace;
    const safety = summarizeSafety(latestWorkspace);
    report.assertions = {
      isolatedTemporaryProfile: true,
      onlyConfiguredSource:
        latestWorkspace?.searchPreferences?.discovery?.targets?.length === 1 &&
        latestWorkspace.searchPreferences.discovery.targets[0]?.id ===
          target.id &&
        latestWorkspace.searchPreferences.discovery.targets[0]?.startingUrl ===
          target.startingUrl,
      deterministicResumeProvider:
        report.resume === null ||
        report.resume.providerKind === "deterministic",
      approvedResumeBeforeApply:
        report.application === null || report.resume?.approved === true,
      submittedNeverOccurred: safety.submittedNeverOccurred,
      submittedAttemptIds: safety.submittedAttemptIds,
      submittedJobIds: safety.submittedJobIds,
      submittedRecordIds: safety.submittedRecordIds,
    };
    if (!safety.submittedNeverOccurred) {
      safetyViolation = new SafetyViolation(
        "Prepare-only smoke detected submitted application state.",
      );
      report.outcome = "failed_submit_safety_assertion";
      report.blocker = {
        stage: "submit_safety_assertion",
        summary: safetyViolation.message,
      };
    }
    if (
      requireFinalCheckpoint &&
      report.outcome !== "passed_final_checkpoint_without_submit"
    ) {
      acceptanceViolation = new Error(
        `Complete-flow acceptance required the final checkpoint, but the run ended as '${report.outcome}'.`,
      );
      report.blocker = report.blocker ?? {
        stage: "final_checkpoint_acceptance",
        summary: acceptanceViolation.message,
      };
    }
    if (
      expectedBlockerCode &&
      report.outcome !== "passed_expected_human_handoff_without_submit"
    ) {
      acceptanceViolation = new Error(
        `Acceptance required blocker '${expectedBlockerCode}', but the run ended as '${report.outcome}' with '${report.application?.blocker?.code ?? "no blocker"}'.`,
      );
      report.blocker = report.blocker ?? {
        stage: "human_handoff_acceptance",
        summary: acceptanceViolation.message,
      };
    }
    await closeCurrentApp();
    if (!keepTemporaryProfile) {
      try {
        await rm(userDataDirectory, { recursive: true, force: true });
        report.isolation.cleanedUp = true;
      } catch (error) {
        report.isolation.cleanupError = summarizeError(error);
      }
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`Prepare-only smoke outcome: ${report.outcome}\n`);
  process.stdout.write(`Saved prepare-only smoke report to ${reportPath}\n`);
  if (report.blocker) {
    process.stdout.write(
      `Blocker (${report.blocker.stage}): ${report.blocker.summary}\n`,
    );
  }
  if (safetyViolation) {
    throw safetyViolation;
  }
  if (acceptanceViolation) {
    throw acceptanceViolation;
  }
}

await runPrepareOnlySmoke().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
