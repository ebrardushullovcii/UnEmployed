import {
  UserActionRequestSchema,
  type ApplicationAttemptBlocker,
  type ApplyJobState,
  type SavedJob,
  type UserActionRequest,
  type UserActionRequestKind,
} from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";

import {
  isUserActionTerminal,
  reduceUserActionSuperseded,
} from "../user-action-domain";

const applicationAuthenticationKinds = new Set<UserActionRequestKind>([
  "login",
  "signup",
  "email_verification",
  "mfa",
]);

const applicationKindCopy: Record<
  UserActionRequestKind,
  { titleVerb: string; summaryStep: string; instruction: string }
> = {
  login: {
    titleVerb: "Sign in",
    summaryStep: "sign-in",
    instruction:
      "Complete sign-in in the managed browser. Job Finder never receives or stores your credentials.",
  },
  signup: {
    titleVerb: "Create your account",
    summaryStep: "account creation",
    instruction:
      "Create the account yourself in the managed browser. Job Finder never creates accounts or receives your credentials.",
  },
  email_verification: {
    titleVerb: "Verify your email",
    summaryStep: "email-verification",
    instruction:
      "Complete email verification yourself. Job Finder never reads or stores verification links or security codes.",
  },
  mfa: {
    titleVerb: "Complete MFA",
    summaryStep: "multi-factor authentication",
    instruction:
      "Complete MFA yourself in the managed browser. Job Finder never reads or stores security codes.",
  },
  captcha: {
    titleVerb: "Complete the CAPTCHA",
    summaryStep: "human-verification",
    instruction:
      "Complete the CAPTCHA yourself in the managed browser. Job Finder never solves or bypasses human-verification challenges.",
  },
  existing_account_choice: {
    titleVerb: "Choose the account path",
    summaryStep: "account-choice",
    instruction:
      "Choose the appropriate account path yourself in the managed browser. Job Finder never creates an account or chooses an identity for you.",
  },
  manual_answer: {
    titleVerb: "Answer the required question",
    summaryStep: "manual-answer",
    instruction:
      "Review the question, then choose a one-use answer or explicitly save it for future reuse. Job Finder never silently promotes a one-use answer into Profile.",
  },
  legal_consent: {
    titleVerb: "Review the required consent",
    summaryStep: "legal-consent",
    instruction:
      "Read and decide the consent yourself in the managed browser. Job Finder never accepts legal terms on your behalf.",
  },
  external_redirect: {
    titleVerb: "Review the external destination",
    summaryStep: "external-redirect",
    instruction:
      "Review and continue to the external destination yourself in the managed browser. Job Finder keeps final submission disabled.",
  },
  manual_upload: {
    titleVerb: "Attach the required file",
    summaryStep: "manual-upload",
    instruction:
      "Attach the requested file yourself in the managed browser. Job Finder does not infer that an upload succeeded from this button.",
  },
  other: {
    titleVerb: "Complete the browser step",
    summaryStep: "manual",
    instruction:
      "Complete the described step yourself in the managed browser. Do not enter credentials or security answers anywhere except the browser page.",
  },
};

function stableFingerprint(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeBlockerPageIdentity(value: string | null): string {
  if (!value) return "";

  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin.toLowerCase()}${pathname}`;
  } catch {
    return "";
  }
}

export function buildApplicationBlockerFingerprint(
  blocker: ApplicationAttemptBlocker,
): string {
  const kind = mapApplicationBlockerToUserActionKind(blocker);
  return `application_blocker:${stableFingerprint(
    [
      kind,
      blocker.code,
      [...blocker.questionIds].sort().join(","),
      normalizeBlockerPageIdentity(blocker.url),
    ].join("|"),
  )}`;
}

function getSafeBrowserTarget(
  blocker: ApplicationAttemptBlocker,
  job: SavedJob,
): { actionUrl: string; expectedOrigin: string } | null {
  const candidateUrl =
    blocker.url?.trim() ||
    job.applicationUrl?.trim() ||
    job.canonicalUrl.trim();

  try {
    const parsed = new URL(candidateUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return {
      actionUrl: parsed.toString(),
      expectedOrigin: `${parsed.origin}/`,
    };
  } catch {
    return null;
  }
}

export function mapApplicationBlockerToUserActionKind(
  blocker: ApplicationAttemptBlocker,
): UserActionRequestKind {
  if (blocker.userActionKind) return blocker.userActionKind;

  switch (blocker.code) {
    case "site_login_required":
      return "login";
    case "missing_candidate_answer":
      return "manual_answer";
    case "missing_resume":
      return "manual_upload";
    case "missing_consent":
      return "legal_consent";
    case "external_redirect":
    case "unsupported_apply_path":
      return "external_redirect";
    case "requires_manual_review":
    case "unknown":
      return "other";
  }
}

export function isApplicationAuthenticationUserActionKind(
  kind: UserActionRequestKind,
): kind is "login" | "signup" | "email_verification" | "mfa" {
  return applicationAuthenticationKinds.has(kind);
}

export function isApplicationPrepareOnlyUserAction(
  request: UserActionRequest,
): boolean {
  return (
    request.scope.type === "application" &&
    request.verification.type === "page_blocker_absent"
  );
}

function compareApplicationActionRecency(
  left: UserActionRequest,
  right: UserActionRequest,
): number {
  const createdAtComparison = right.createdAt.localeCompare(left.createdAt);
  return createdAtComparison !== 0
    ? createdAtComparison
    : right.id.localeCompare(left.id);
}

async function commitApplicationActionSuperseded(input: {
  repository: JobFinderRepository;
  request: UserActionRequest;
  supersedingReferenceId: string;
  occurredAt: string;
}): Promise<void> {
  let current = input.request;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (isUserActionTerminal(current.state)) return;
    const supersededAt =
      current.updatedAt > input.occurredAt
        ? current.updatedAt
        : input.occurredAt;
    const transition = reduceUserActionSuperseded(
      current,
      input.supersedingReferenceId,
      supersededAt,
    );
    if (transition.status !== "applied") return;

    const commit = await input.repository.commitUserActionTransition({
      request: transition.request,
      event: transition.event,
    });
    if (commit.status !== "stale") return;
    current = commit.request;
  }
}

async function keepOnlyLatestApplicationActionable(input: {
  repository: JobFinderRepository;
  jobId: string;
  occurredAt: string;
}): Promise<void> {
  const sameJobRequests = (await input.repository.listUserActionRequests())
    .filter(
      (request) =>
        request.scope.type === "application" &&
        request.scope.jobId === input.jobId,
    )
    .sort(compareApplicationActionRecency);
  const latest = sameJobRequests[0];
  if (!latest) return;

  for (const candidate of sameJobRequests.slice(1)) {
    await commitApplicationActionSuperseded({
      repository: input.repository,
      request: candidate,
      supersedingReferenceId: latest.id,
      occurredAt: input.occurredAt,
    });
  }
}

async function supersedeActionsClearedByNewerResult(input: {
  repository: JobFinderRepository;
  jobId: string;
  resultId: string;
  resultStartedAt: string;
  occurredAt: string;
}): Promise<void> {
  const olderActionableRequests = (
    await input.repository.listUserActionRequests()
  ).filter(
    (request) =>
      request.scope.type === "application" &&
      request.scope.jobId === input.jobId &&
      request.createdAt <= input.resultStartedAt &&
      !isUserActionTerminal(request.state),
  );

  for (const request of olderActionableRequests) {
    await commitApplicationActionSuperseded({
      repository: input.repository,
      request,
      supersedingReferenceId: input.resultId,
      occurredAt: input.occurredAt,
    });
  }
}

export async function persistApplicationUserAction(input: {
  repository: JobFinderRepository;
  job: SavedJob;
  runId: string;
  resultId: string | null;
  resultState?: ApplyJobState;
  resultStartedAt?: string;
  replayCheckpointId: string | null;
  blocker: ApplicationAttemptBlocker | null;
  occurredAt: string;
}): Promise<void> {
  if (!input.resultId || !input.replayCheckpointId) return;
  if (!input.blocker) {
    if (input.resultState === "awaiting_review" && input.resultStartedAt) {
      await supersedeActionsClearedByNewerResult({
        repository: input.repository,
        jobId: input.job.id,
        resultId: input.resultId,
        resultStartedAt: input.resultStartedAt,
        occurredAt: input.occurredAt,
      });
    }
    return;
  }

  const kind = mapApplicationBlockerToUserActionKind(input.blocker);
  const browserTarget = getSafeBrowserTarget(input.blocker, input.job);
  const copy = applicationKindCopy[kind];
  const blockerFingerprint = buildApplicationBlockerFingerprint(input.blocker);
  const targetId =
    input.job.provenance.at(-1)?.targetId ??
    input.job.provenance[0]?.targetId ??
    null;
  const occurrenceFingerprint = stableFingerprint(
    [
      input.runId,
      input.job.id,
      input.resultId,
      input.replayCheckpointId,
      kind,
      blockerFingerprint,
      browserTarget?.expectedOrigin ?? "no_safe_browser_origin",
    ].join("|"),
  );
  const dedupeKey = `application_${kind}:${occurrenceFingerprint}`;
  const existingRequest = (
    await input.repository.listUserActionRequests()
  ).find((request) => request.dedupeKey === dedupeKey);
  if (existingRequest) {
    if (
      existingRequest.kind !== kind ||
      existingRequest.scope.type !== "application" ||
      existingRequest.scope.runId !== input.runId ||
      existingRequest.scope.jobId !== input.job.id ||
      existingRequest.scope.resultId !== input.resultId ||
      existingRequest.scope.replayCheckpointId !== input.replayCheckpointId ||
      existingRequest.scope.source !== input.job.source ||
      !("blockerFingerprint" in existingRequest.verification) ||
      existingRequest.verification.blockerFingerprint !== blockerFingerprint
    ) {
      throw new Error(
        `Application ${kind} action dedupe collision for '${dedupeKey}'.`,
      );
    }
    await keepOnlyLatestApplicationActionable({
      repository: input.repository,
      jobId: input.job.id,
      occurredAt: input.occurredAt,
    });
    return;
  }

  const request = UserActionRequestSchema.parse({
    id: `application_${kind}_${occurrenceFingerprint}`,
    dedupeKey,
    revision: 1,
    kind,
    state: "pending",
    requirement: "required",
    scope: {
      type: "application",
      runId: input.runId,
      jobId: input.job.id,
      resultId: input.resultId,
      replayCheckpointId: input.replayCheckpointId,
      source: input.job.source,
    },
    verification: isApplicationAuthenticationUserActionKind(kind)
      ? {
          type: "source_access",
          targetId,
          blockerFingerprint,
          expectedOrigin: browserTarget?.expectedOrigin ?? null,
        }
      : {
          type: "page_blocker_absent",
          blockerFingerprint,
          expectedPageFingerprint: null,
        },
    title: `${copy.titleVerb} to continue the ${input.job.company} application`,
    summary: `This application is paused at a browser-owned ${copy.summaryStep} step. Complete it in the managed browser, then return so Job Finder can verify the exact blocker no longer appears.`,
    instructions: [
      copy.instruction,
      "Return to the action inbox and confirm completion only after the browser step is complete.",
      isApplicationAuthenticationUserActionKind(kind)
        ? "After access verification, Job Finder retries this exact application once and stops before final submission."
        : "After confirmation, Job Finder runs one exact prepare-only retry to verify the blocker and stops before final submission.",
    ],
    actionUrl: browserTarget?.actionUrl ?? null,
    displayOrigin: browserTarget?.expectedOrigin ?? null,
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
  });
  await input.repository.createUserActionRequest(request);
  await keepOnlyLatestApplicationActionable({
    repository: input.repository,
    jobId: input.job.id,
    occurredAt: input.occurredAt,
  });
}
export const persistApplicationLoginUserAction = persistApplicationUserAction;
