import {
  isActiveApplicationAuthorityEnvelope,
  isActiveSubmissionExecutionGrant,
  type ApplicationAuthorityEnvelope,
  type ApplicationAutomationMode,
  type Sha256Hex,
  type SubmissionAnswerSnapshotIdentity,
  type SubmissionExecutionGrant,
  type SubmissionFinalControlIdentity,
  type SubmissionObservationIdentity,
  type SubmissionPreflightRecord,
} from "@unemployed/contracts";

/**
 * ADR 0012 / ADR 0013 application submission policy gate.
 *
 * This is one pure, deterministic decision point between an observed
 * application form and the single final-submission external action. It owns
 * observe/propose/authorize/preflight checks only: no browser execution, no
 * persistence, no IPC, and no settings reads. Current production remains
 * prepare-only; a future executor consumes an `authorized` result later and
 * must still perform its own immediate recheck before acting.
 *
 * The function never throws for policy outcomes — every failure is a
 * `blocked` decision with an explicit reason enum and safe plain-text detail.
 * Malformed inputs that cannot even be compared (for example an unparseable
 * origin) fail closed instead of throwing.
 */

/** Tri-state idempotency observation for the preflight's bound key. */
export const submissionIdempotencyStateValues = [
  "unused",
  "executed",
  "outcome_uncertain",
] as const;
export type SubmissionIdempotencyState =
  (typeof submissionIdempotencyStateValues)[number];

/**
 * Explicit block reasons in the deterministic evaluation order. The first
 * failing check wins; reasons are mutually exclusive per decision.
 */
export const submissionPolicyBlockReasonValues = [
  "mode_mismatch",
  "prepare_only",
  "authority_inactive",
  "preflight_authority_mismatch",
  "preflight_lineage_mismatch",
  "scope_excluded",
  "origin_not_allowed",
  "resume_not_allowed",
  "observation_stale",
  "capacity_invalid",
  "idempotency_already_executed",
  "idempotency_outcome_uncertain",
  "execution_grant_invalid",
] as const;
export type SubmissionPolicyBlockReason =
  (typeof submissionPolicyBlockReasonValues)[number];

/** Modes whose authorization this gate can ever produce. */
export type AuthorizableSubmissionMode = Extract<
  ApplicationAutomationMode,
  "confirm_before_submit" | "autonomous_submit"
>;

export interface EvaluateApplicationSubmissionPolicyInput {
  /** Explicit caller clock; the policy never reads a wall clock itself. */
  now: string;
  /** Exact saved automation mode from durable preferences or settings. */
  savedMode: ApplicationAutomationMode;
  /** Current authority envelope exactly as saved and revisioned. */
  envelope: ApplicationAuthorityEnvelope;
  /** Durable preflight record produced before this attempt. */
  preflight: SubmissionPreflightRecord;
  /** Current job identity under consideration. */
  jobId: string;
  /** Current campaign identity, or null when the job has no campaign. */
  campaignId: string | null;
  /** Freshly observed HTTP(S) origin of the page about to be acted on. */
  origin: string;
  /** Freshly re-observed form identity (id, revision, digest). */
  formObservation: SubmissionObservationIdentity;
  /** Current resume SHA-256 digest in effect. */
  resumeSha256: Sha256Hex;
  /** Current answer-set revision and digest. */
  answers: SubmissionAnswerSnapshotIdentity;
  /** Current final-control signature and stable reference. */
  finalControl: SubmissionFinalControlIdentity;
  /** Current remaining per-run capacity at the moment of the decision. */
  remainingRunCapacity: number;
  /** Current remaining per-local-day capacity at the moment of the decision. */
  remainingDailyCapacity: number;
  /** Idempotency state of the preflight's bound key. */
  idempotency: SubmissionIdempotencyState;
  /**
   * Optional one-time execution grant. Consulted only by
   * `confirm_before_submit`; autonomous authority ignores it entirely and is
   * never derived from it.
   */
  executionGrant: SubmissionExecutionGrant | null;
}

/** Exact immutable execution binding handed to a future executor. */
export interface AuthorizedApplicationSubmission {
  status: "authorized";
  mode: AuthorizableSubmissionMode;
  preflightId: string;
  idempotencyKey: string;
  runId: string;
  jobId: string;
  resultId: string;
  applicationRecordId: string;
  authorityEnvelopeId: string;
  authorityRevision: number;
}

export interface BlockedApplicationSubmission {
  status: "blocked";
  reason: SubmissionPolicyBlockReason;
  detail: string;
}

export type ApplicationSubmissionDecision =
  | AuthorizedApplicationSubmission
  | BlockedApplicationSubmission;

/**
 * Canonical HTTP(S) origin of a URL string, or null when the value is not a
 * parseable HTTP(S) URL. Semantic equality compares these canonical forms so
 * default ports, case, paths, query strings, and fragments never create a
 * false mismatch — and non-HTTP(S) schemes never sneak through.
 */
function canonicalHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function describeAuthorityInactivity(
  envelope: ApplicationAuthorityEnvelope,
): string {
  if (envelope.status !== "active") {
    return `Authority envelope is ${envelope.status}, so it authorizes nothing.`;
  }
  return `Authority envelope expired at ${envelope.expiresAt ?? "an unrecorded time"}.`;
}

function describeStaleObservations(
  input: EvaluateApplicationSubmissionPolicyInput,
): string {
  const stale: string[] = [];
  const { preflight } = input;
  if (input.formObservation.id !== preflight.formObservation.id) {
    stale.push("form observation id");
  }
  if (input.formObservation.revision !== preflight.formObservation.revision) {
    stale.push("form observation revision");
  }
  if (input.formObservation.digest !== preflight.formObservation.digest) {
    stale.push("form observation digest");
  }
  if (input.answers.revision !== preflight.answers.revision) {
    stale.push("answer revision");
  }
  if (input.answers.digest !== preflight.answers.digest) {
    stale.push("answer digest");
  }
  if (input.finalControl.signature !== preflight.finalControl.signature) {
    stale.push("final control signature");
  }
  if (input.finalControl.ref !== preflight.finalControl.ref) {
    stale.push("final control ref");
  }
  return `Fresh observations differ from the preflight record: ${stale.join("; ")}.`;
}

function describeCapacityProblem(
  input: EvaluateApplicationSubmissionPolicyInput,
): string {
  if (
    input.remainingRunCapacity !== input.preflight.remainingRunCapacityBefore ||
    input.remainingDailyCapacity !==
      input.preflight.remainingDailyCapacityBefore
  ) {
    return `Remaining capacity changed since preflight (run ${input.preflight.remainingRunCapacityBefore} -> ${input.remainingRunCapacity}, day ${input.preflight.remainingDailyCapacityBefore} -> ${input.remainingDailyCapacity}).`;
  }
  if (input.remainingRunCapacity <= 0) {
    return "Remaining per-run capacity is exhausted.";
  }
  return "Remaining per-local-day capacity is exhausted.";
}

/**
 * Deterministic plain-text description of why the confirm-mode grant failed
 * its contract gate. Only identifiers, revisions, statuses, and timestamps
 * are echoed — never raw page content or credentials.
 */
function describeGrantRejection(
  grant: SubmissionExecutionGrant | null,
  now: string,
): string {
  if (grant === null) {
    return "confirm_before_submit mode requires an active user execution grant and none was provided.";
  }
  if (grant.status !== "active") {
    return `Execution grant is ${grant.status}, so it authorizes nothing.`;
  }
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) {
    return "Execution grant cannot be evaluated against an invalid clock.";
  }
  const expiresAtTime = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expiresAtTime)) {
    return "Execution grant has an invalid expiry and authorizes nothing.";
  }
  if (expiresAtTime <= nowTime) {
    return `Execution grant expired at ${grant.expiresAt}.`;
  }
  return "Execution grant does not bind this attempt's exact preflight, idempotency key, lineage, or authority revision.";
}

/**
 * One deterministic auditable decision point for the final-submission action.
 *
 * Checks fail closed in a fixed order (first failure wins):
 * 1. saved mode vs envelope mode
 * 2. prepare_only
 * 3. envelope active and unexpired at the caller's clock
 * 4. preflight binds the current envelope id + revision
 * 5. current job matches the preflight lineage
 * 6. job or exact campaign scope
 * 7. semantic equality with an allowed canonical origin
 * 8. resume digest allowlist + preflight match
 * 9. fresh observation/answer/final-control identity matches preflight
 * 10. capacity is integral, envelope-bounded, unchanged, and positive
 * 11. idempotency key unused (executed and uncertain block distinctly)
 * 12. confirm-mode only: the one-time user grant passes its contract gate
 *
 * In autonomous mode a provided grant is ignored — it can never strengthen or
 * substitute for envelope authority, and an authorized result never reports
 * grant-derived facts.
 */
export function evaluateApplicationSubmissionPolicy(
  input: EvaluateApplicationSubmissionPolicyInput,
): ApplicationSubmissionDecision {
  const blocked = (
    reason: SubmissionPolicyBlockReason,
    detail: string,
  ): BlockedApplicationSubmission => ({ status: "blocked", reason, detail });

  if (input.savedMode !== input.envelope.mode) {
    return blocked(
      "mode_mismatch",
      `Saved automation mode ${input.savedMode} does not match authority envelope mode ${input.envelope.mode}.`,
    );
  }
  if (input.savedMode === "prepare_only") {
    return blocked(
      "prepare_only",
      "Prepare-only automation never authorizes final submission.",
    );
  }
  if (!isActiveApplicationAuthorityEnvelope(input.envelope, input.now)) {
    return blocked(
      "authority_inactive",
      describeAuthorityInactivity(input.envelope),
    );
  }
  if (
    input.preflight.authorityEnvelopeId !== input.envelope.id ||
    input.preflight.authorityRevision !== input.envelope.revision
  ) {
    return blocked(
      "preflight_authority_mismatch",
      `Preflight binds authority ${input.preflight.authorityEnvelopeId}@${input.preflight.authorityRevision} but the current envelope is ${input.envelope.id}@${input.envelope.revision}.`,
    );
  }
  if (input.jobId !== input.preflight.jobId) {
    return blocked(
      "preflight_lineage_mismatch",
      `Current job ${input.jobId} does not match preflight job ${input.preflight.jobId}.`,
    );
  }

  const jobInScope = input.envelope.scope.jobIds.includes(input.jobId);
  const campaignInScope =
    input.envelope.scope.campaignId !== null &&
    input.envelope.scope.campaignId === input.campaignId;
  if (!jobInScope && !campaignInScope) {
    return blocked(
      "scope_excluded",
      `Job ${input.jobId} is not in the scoped job list and campaign ${
        input.campaignId ?? "(none)"
      } is not the scoped campaign.`,
    );
  }

  const observedOrigin = canonicalHttpOrigin(input.origin);
  const allowedCanonicalOrigins = new Set(
    input.envelope.allowedOrigins.flatMap((allowed) => {
      const canonical = canonicalHttpOrigin(allowed);
      return canonical === null ? [] : [canonical];
    }),
  );
  if (
    observedOrigin === null ||
    !allowedCanonicalOrigins.has(observedOrigin)
  ) {
    return blocked(
      "origin_not_allowed",
      "Current page origin is not semantically equal to any allowed canonical origin.",
    );
  }

  if (
    !input.envelope.allowedResumeSha256.includes(input.resumeSha256) ||
    input.preflight.resumeSha256 !== input.resumeSha256
  ) {
    return blocked(
      "resume_not_allowed",
      input.envelope.allowedResumeSha256.includes(input.resumeSha256)
        ? "Current resume digest differs from the digest bound in the preflight record."
        : "Current resume digest is absent from the authority resume allowlist.",
    );
  }

  const { preflight } = input;
  if (
    input.formObservation.id !== preflight.formObservation.id ||
    input.formObservation.revision !== preflight.formObservation.revision ||
    input.formObservation.digest !== preflight.formObservation.digest ||
    input.answers.revision !== preflight.answers.revision ||
    input.answers.digest !== preflight.answers.digest ||
    input.finalControl.signature !== preflight.finalControl.signature ||
    input.finalControl.ref !== preflight.finalControl.ref
  ) {
    return blocked("observation_stale", describeStaleObservations(input));
  }

  if (
    !Number.isSafeInteger(input.remainingRunCapacity) ||
    !Number.isSafeInteger(input.remainingDailyCapacity) ||
    input.remainingRunCapacity > input.envelope.maxApplicationsPerRun ||
    input.remainingDailyCapacity >
      input.envelope.maxApplicationsPerLocalDay ||
    input.remainingRunCapacity !== preflight.remainingRunCapacityBefore ||
    input.remainingDailyCapacity !==
      preflight.remainingDailyCapacityBefore ||
    input.remainingRunCapacity <= 0 ||
    input.remainingDailyCapacity <= 0
  ) {
    return blocked("capacity_invalid", describeCapacityProblem(input));
  }

  if (input.idempotency === "executed") {
    return blocked(
      "idempotency_already_executed",
      `Idempotency key ${preflight.idempotencyKey} already executed a submission; retry is blocked.`,
    );
  }
  if (input.idempotency === "outcome_uncertain") {
    return blocked(
      "idempotency_outcome_uncertain",
      `A prior attempt for idempotency key ${preflight.idempotencyKey} ended outcome_uncertain; automatic retry is permanently blocked until resolved by a human.`,
    );
  }

  // Autonomous authority comes from the active envelope plus the checks
  // above; the optional grant is deliberately never consulted here.
  if (input.savedMode === "confirm_before_submit") {
    if (
      input.executionGrant === null ||
      !isActiveSubmissionExecutionGrant(
        input.executionGrant,
        input.now,
        input.preflight,
      )
    ) {
      return blocked(
        "execution_grant_invalid",
        describeGrantRejection(input.executionGrant, input.now),
      );
    }
  }

  return {
    status: "authorized",
    mode: input.savedMode,
    preflightId: preflight.id,
    idempotencyKey: preflight.idempotencyKey,
    runId: preflight.runId,
    jobId: preflight.jobId,
    resultId: preflight.resultId,
    applicationRecordId: preflight.applicationRecordId,
    authorityEnvelopeId: input.envelope.id,
    authorityRevision: input.envelope.revision,
  };
}
