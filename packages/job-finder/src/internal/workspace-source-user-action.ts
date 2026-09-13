import {
  JOB_FINDER_BROWSER_LABEL,
  UserActionRequestSchema,
  type DiscoveryTargetExecution,
  type JobDiscoveryTarget,
  type SourceDebugRunRecord,
} from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";

import { deriveSourceAccessPrompts } from "./workspace-source-access-prompts";
import { resolveAdapterKind } from "./workspace-helpers";

function stableFingerprint(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export async function persistDiscoveryRunBlockerUserAction(input: {
  repository: JobFinderRepository;
  runId: string;
  target: JobDiscoveryTarget;
  execution: DiscoveryTargetExecution;
  occurredAt: string;
}): Promise<void> {
  const { accessBlockerReason: reason, parkedTab } = input.execution;
  // Raised from the observed wall, not from how the run happened to end.
  // Requiring a failed execution meant a source that showed "Verify you are
  // human" after it had already returned some listings — or one that stalled
  // on the wall without the agent reporting a failure — left Needs you
  // reading "Nothing needs you right now" while the browser sat on the check.
  // The parked tab is what the person is asked to open, so it is still
  // required: without one there is nowhere to send them.
  if (!reason || !parkedTab) return;

  const occurrenceFingerprint = stableFingerprint(
    [input.target.id, input.runId, reason].join("|"),
  );
  const dedupeKey = `discovery_access:${occurrenceFingerprint}`;
  const existingRequest = (
    await input.repository.listUserActionRequests()
  ).find((request) => request.dedupeKey === dedupeKey);
  if (existingRequest) return;

  const isLogin = reason === "auth_required";
  // A step only the person can take covers both a hold-to-verify puzzle and a
  // full-page message asking for a paid plan. Calling either one a
  // "human-verification page" would describe a page the user is not looking
  // at, so this branch says only what is true of both.
  const isManualStep = reason === "manual_step_required";
  const expectedOrigin = `${new URL(parkedTab.url).origin}/`;
  await input.repository.createUserActionRequest(
    UserActionRequestSchema.parse({
      id: `discovery_access_${occurrenceFingerprint}`,
      dedupeKey,
      revision: 1,
      kind: isLogin ? "login" : "captcha",
      state: "pending",
      requirement: "required",
      scope: {
        type: "discovery_source",
        targetId: input.target.id,
        source: resolveAdapterKind(input.target),
        sourceDebugRunId: null,
        sourceDebugAttemptId: null,
        discoveryRunId: input.runId,
        parkedTab,
      },
      verification: {
        type: "source_access",
        targetId: input.target.id,
        blockerFingerprint: `discovery_access:${occurrenceFingerprint}`,
        expectedOrigin,
      },
      title: isLogin
        ? `Sign in to ${input.target.label}`
        : isManualStep
          ? `Clear the page on ${input.target.label}`
          : `Finish the check on ${input.target.label}`,
      summary: isLogin
        ? `${input.target.label} stopped at a sign-in page before it could read any jobs.`
        : isManualStep
          ? `${input.target.label} covered its job listings with a full-page message that only you can clear, so nothing could be read.`
          : `${input.target.label} stopped at a human-verification page before it could read any jobs.`,
      instructions: [
        `Open the saved ${input.target.label} tab in ${JOB_FINDER_BROWSER_LABEL} and finish the step yourself.`,
        "Then return here and choose Done before searching this source again.",
      ],
      actionUrl: parkedTab.url,
      displayOrigin: expectedOrigin,
      credentialsPolicy: "browser_only",
      submitAuthorized: false,
      accountCreationAuthorized: false,
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      openedAt: null,
      resolvedAt: null,
      expiresAt: null,
    }),
  );
}

export async function persistDiscoveryLoginUserAction(input: {
  repository: JobFinderRepository;
  run: SourceDebugRunRecord;
}): Promise<void> {
  if (input.run.state !== "paused_manual") return;

  const [searchPreferences, sourceInstructionArtifacts, sourceDebugAttempts] =
    await Promise.all([
      input.repository.getSearchPreferences(),
      input.repository.listSourceInstructionArtifacts(),
      input.repository.listSourceDebugAttempts(),
    ]);
  const target = searchPreferences.discovery.targets.find(
    (candidate) => candidate.id === input.run.targetId,
  );
  if (!target) return;

  const prompt = deriveSourceAccessPrompts({
    targets: [{ ...target, lastDebugRunId: input.run.id }],
    recentSourceDebugRuns: [input.run],
    activeSourceDebugRun: null,
    sourceDebugAttempts,
    sourceInstructionArtifacts,
    searchPreferences,
    generatedAt: input.run.updatedAt,
  }).find((candidate) => candidate.state === "prompt_login_required");
  if (!prompt) return;

  const occurrenceFingerprint = stableFingerprint(
    [target.id, input.run.id, prompt.detail].join("|"),
  );
  const expectedOrigin = `${new URL(prompt.targetUrl).origin}/`;
  const dedupeKey = `source_login:${occurrenceFingerprint}`;
  const existingRequest = (
    await input.repository.listUserActionRequests()
  ).find((request) => request.dedupeKey === dedupeKey);
  if (existingRequest) return;

  await input.repository.createUserActionRequest(
    UserActionRequestSchema.parse({
      id: `source_login_${occurrenceFingerprint}`,
      dedupeKey,
      revision: 1,
      kind: "login",
      state: "pending",
      requirement: "required",
      scope: {
        type: "discovery_source",
        targetId: target.id,
        source: resolveAdapterKind(target),
        sourceDebugRunId: input.run.id,
        sourceDebugAttemptId: input.run.attemptIds.at(-1) ?? null,
      },
      verification: {
        type: "source_access",
        targetId: target.id,
        blockerFingerprint: `source_login:${occurrenceFingerprint}`,
        expectedOrigin,
      },
      title: prompt.actionLabel,
      summary: prompt.summary,
      instructions: [
        `Complete sign-in in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder never receives or stores your credentials.`,
        "Return to the action inbox and choose Done only after the browser step is complete.",
      ],
      actionUrl: prompt.targetUrl,
      displayOrigin: expectedOrigin,
      credentialsPolicy: "browser_only",
      submitAuthorized: false,
      accountCreationAuthorized: false,
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: input.run.updatedAt,
      updatedAt: input.run.updatedAt,
      openedAt: null,
      resolvedAt: null,
      expiresAt: null,
    }),
  );
}
