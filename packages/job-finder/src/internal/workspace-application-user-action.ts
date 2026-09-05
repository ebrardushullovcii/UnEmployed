import {
  JOB_FINDER_BROWSER_LABEL,
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
    instruction: `Complete sign-in in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder never receives or stores your credentials.`,
  },
  signup: {
    titleVerb: "Create your account",
    summaryStep: "account creation",
    instruction: `Create the account yourself in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder never creates accounts or receives your credentials.`,
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
    instruction: `Complete MFA yourself in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder never reads or stores security codes.`,
  },
  captcha: {
    titleVerb: "Complete the CAPTCHA",
    summaryStep: "human-verification",
    instruction: `Complete the CAPTCHA yourself in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder never solves or bypasses human-verification challenges.`,
  },
  existing_account_choice: {
    titleVerb: "Choose the account path",
    summaryStep: "account-choice",
    instruction: `Choose the appropriate account path yourself in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder never creates an account or chooses an identity for you.`,
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
    instruction: `Read and decide the consent yourself in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder never accepts legal terms on your behalf.`,
  },
  external_redirect: {
    titleVerb: "Review the external destination",
    summaryStep: "external-redirect",
    instruction: `Review and continue to the external destination yourself in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder keeps final submission disabled.`,
  },
  manual_upload: {
    titleVerb: "Attach the required file",
    summaryStep: "manual-upload",
    instruction: `Attach the requested file yourself in the ${JOB_FINDER_BROWSER_LABEL}. Job Finder does not infer that an upload succeeded from this button.`,
  },
  other: {
    titleVerb: "Complete the browser step",
    summaryStep: "manual",
    instruction: `Finish this step yourself in the ${JOB_FINDER_BROWSER_LABEL}.`,
  },
};

/**
 * The concrete reason the application paused, in the user's words: the
 * classified blocker's own summary plus its detail when that adds anything.
 * This keeps the Needs-you card specific ("the site tried to save a field
 * automatically") instead of a generic "complete the described step".
 */
/**
 * Runtime details name the interrupted field, but fall back to the literal
 * placeholder "application field" when none was captured. Quoting that
 * placeholder to the user reads as a real field name they can go and find.
 */
const PLACEHOLDER_FIELD_QUOTE = /['"‘’“”]application field['"‘’“”]/gi;

/**
 * The no-submit boundary is owned once by the Needs-you page header, so the
 * per-card reason does not restate it.
 */
const TRAILING_NO_SUBMIT_CLAUSE =
  /,?\s*instead of risking a final (?:application )?submission\b\.?/i;

/**
 * Words that carry no meaning for the redundancy comparison below, so
 * "The application page could not safely save a prepared field" is compared
 * on `application/page/safely/save/prepared/field`.
 */
const REASON_STOP_WORDS = new Set([
  "and",
  "any",
  "are",
  "but",
  "can",
  "could",
  "did",
  "for",
  "had",
  "has",
  "have",
  "into",
  "its",
  "not",
  "may",
  "might",
  "must",
  "own",
  "should",
  "still",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "this",
  "those",
  "was",
  "were",
  "when",
  "while",
  "with",
  "would",
  "your",
]);

function readReasonContentWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !REASON_STOP_WORDS.has(word)),
  );
}

/**
 * True when the detail already says what the summary says. A blocker summary
 * is a short label and its detail is the same event told at length, so
 * printing both produced cards that opened with two near-identical sentences
 * ("... could not safely save a prepared field. The application site tried to
 * save a field while it was being prepared."). When the detail's first
 * sentence already carries most of the summary's meaning, the detail — which
 * is strictly more specific — is the only sentence worth showing.
 */
const REASON_RESTATEMENT_OVERLAP = 0.6;

function detailRestatesSummary(summary: string, detail: string): boolean {
  const summaryWords = readReasonContentWords(summary);
  if (summaryWords.size === 0) {
    return true;
  }

  const detailOpening = detail.split(/(?<=[.!?])\s+/)[0] ?? detail;
  const detailWords = readReasonContentWords(detailOpening);
  const shared = [...summaryWords].filter((word) =>
    detailWords.has(word),
  ).length;

  return shared / summaryWords.size >= REASON_RESTATEMENT_OVERLAP;
}

export function describeApplicationBlockerReason(
  blocker: Pick<ApplicationAttemptBlocker, "summary" | "detail">,
): string {
  const summary = blocker.summary.trim();
  const summarySentence = /[.!?]$/.test(summary) ? summary : `${summary}.`;
  const detail = (blocker.detail?.trim() ?? "")
    .replace(PLACEHOLDER_FIELD_QUOTE, "a field")
    .replace(TRAILING_NO_SUBMIT_CLAUSE, "")
    .trim();
  const normalizedDetail =
    detail.length > 0 && !/[.!?]$/.test(detail) ? `${detail}.` : detail;
  if (normalizedDetail.length === 0 || normalizedDetail === summarySentence) {
    return summarySentence;
  }
  if (detailRestatesSummary(summarySentence, normalizedDetail)) {
    return normalizedDetail;
  }
  return `${summarySentence} ${normalizedDetail}`;
}

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
    case "application_page_unreachable":
      // Technical failure: never surfaced as a user-owned browser step.
      return "other";
    case "requires_manual_review":
    case "unknown":
      return "other";
  }
}

/**
 * True for runtime technical failures that are not the user's responsibility.
 * These blockers must never create a Needs-you user-action request.
 */
export function isApplicationTechnicalFailureBlocker(
  blocker: ApplicationAttemptBlocker,
): boolean {
  return blocker.code === "application_page_unreachable";
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
  applicationRecordId: string;
  occurredAt: string;
}): Promise<void> {
  const sameRecordRequests = (await input.repository.listUserActionRequests())
    .filter(
      (request) =>
        request.scope.type === "application" &&
        request.scope.applicationRecordId === input.applicationRecordId,
    )
    .sort(compareApplicationActionRecency);
  const latest = sameRecordRequests[0];
  if (!latest) return;

  for (const candidate of sameRecordRequests.slice(1)) {
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
  applicationRecordId: string;
  resultId: string;
  resultStartedAt: string;
  occurredAt: string;
}): Promise<void> {
  const olderActionableRequests = (
    await input.repository.listUserActionRequests()
  ).filter(
    (request) =>
      request.scope.type === "application" &&
      request.scope.applicationRecordId === input.applicationRecordId &&
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
  applicationRecordId: string;
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
        applicationRecordId: input.applicationRecordId,
        resultId: input.resultId,
        resultStartedAt: input.resultStartedAt,
        occurredAt: input.occurredAt,
      });
    }
    return;
  }
  // Technical failures own no browser step. The employer page never opened,
  // so there is nothing for the user to do and no request is created.
  if (isApplicationTechnicalFailureBlocker(input.blocker)) {
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
      input.applicationRecordId,
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
      existingRequest.scope.applicationRecordId !== input.applicationRecordId ||
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
      applicationRecordId: input.applicationRecordId,
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
      applicationRecordId: input.applicationRecordId,
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
    summary: `${describeApplicationBlockerReason(input.blocker)} Complete this ${copy.summaryStep} step in the ${JOB_FINDER_BROWSER_LABEL}, then return so Job Finder can verify the exact blocker no longer appears.`,
    instructions: [
      copy.instruction,
      "Return to Needs you and confirm completion only after the browser step is complete.",
      isApplicationAuthenticationUserActionKind(kind)
        ? "After access verification, Job Finder retries this exact application once."
        : "After confirmation, Job Finder runs one exact prepare-only retry to verify the blocker.",
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
    applicationRecordId: input.applicationRecordId,
    occurredAt: input.occurredAt,
  });
}
export const persistApplicationLoginUserAction = persistApplicationUserAction;
