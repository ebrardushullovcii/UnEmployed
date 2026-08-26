import { z } from "zod";

import { IsoDateTimeSchema, NonEmptyStringSchema, UrlStringSchema } from "./base";

/**
 * ADR 0012 / ADR 0013 application-authority contracts.
 *
 * These schemas are the durable foundation for user-scoped autonomous
 * application execution. They are additive only: current production remains
 * prepare-only and no runtime behavior changes until these contracts are wired
 * through an explicit vertical slice per mode.
 *
 * Layering note: this module intentionally depends only on `./base`. The
 * apply-flow module imports from here, so shared origin/path validators are
 * re-declared locally (structurally identical to the privacy-receipt rules)
 * instead of imported from `./apply`, which would create a circular module
 * dependency.
 */

/** Lowercase hex SHA-256 digest used for every content binding in this file. */
export const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "SHA-256 must be 64 lowercase hexadecimal characters.");
export type Sha256Hex = z.infer<typeof Sha256HexSchema>;

/**
 * Durable application automation mode (ADR 0012).
 *
 * This is a separate axis from the `ApplyRunModeSchema` run strategy
 * (`copilot` / `single_job_auto` / `queue_auto`): a run strategy describes how
 * work is orchestrated, never whether final submission is authorized.
 */
export const applicationAutomationModeValues = [
  "prepare_only",
  "confirm_before_submit",
  "autonomous_submit",
] as const;
export const ApplicationAutomationModeSchema = z.enum(
  applicationAutomationModeValues,
);
export type ApplicationAutomationMode = z.infer<
  typeof ApplicationAutomationModeSchema
>;

export const applicationAuthorityStatusValues = [
  "active",
  "revoked",
  "expired",
] as const;
export const ApplicationAuthorityStatusSchema = z.enum(
  applicationAuthorityStatusValues,
);
export type ApplicationAuthorityStatus = z.infer<
  typeof ApplicationAuthorityStatusSchema
>;

/** Bounded collection sizes so no authority document grows unbounded. */
export const applicationAuthorityMaxScopedJobIds = 1000;
export const applicationAuthorityMaxResumeDigests = 20;
export const applicationAuthorityMaxOrigins = 50;

/**
 * Exact HTTP(S) origin scope. Structurally identical to the privacy-receipt
 * destination-origin rule; kept local to avoid a circular dependency on the
 * apply module.
 */
export const ApplicationAuthorityOriginSchema = UrlStringSchema.refine(
  (value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.username.length === 0 &&
        url.password.length === 0 &&
        url.pathname === "/" &&
        url.search.length === 0 &&
        url.hash.length === 0
      );
    } catch {
      return false;
    }
  },
  {
    message: "Allowed origin must contain only an HTTP(S) scheme and host.",
  },
);
export type ApplicationAuthorityOrigin = z.infer<
  typeof ApplicationAuthorityOriginSchema
>;

/** Redacted absolute path without query or fragment (privacy-receipt rule). */
const AuthoritySafePathSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^\/[^\s?#\\]*$/,
    "Safe path must be an absolute redacted path without a query or fragment.",
  );

export const ApplicationAuthorityScopeSchema = z
  .object({
    campaignId: NonEmptyStringSchema.nullable(),
    jobIds: z
      .array(NonEmptyStringSchema)
      .max(applicationAuthorityMaxScopedJobIds),
  })
  .strict();
export type ApplicationAuthorityScope = z.infer<
  typeof ApplicationAuthorityScopeSchema
>;

/**
 * Explicit, inspectable, revocable, scoped authority envelope (ADR 0012).
 *
 * Every field is required and explicit — there are no hidden product defaults
 * beyond the v1-pinned false account-creation capability. Model output can
 * never mint or widen this envelope; only the saved document, checked against
 * its exact revision, grants authority.
 *
 * Fail-closed invariants (superRefine):
 * - revoked status and revokedAt always appear together, never separately
 * - expiresAt must be strictly after createdAt; expired status requires an
 *   expiry timestamp; revokedAt cannot precede creation
 * - confirm_before_submit and autonomous_submit require a non-empty scope
 *   (campaign or jobs) and a non-empty resume allowlist
 * - duplicate job IDs, resume digests, and origins are rejected
 *
 * An envelope whose status is not `active` parses as data but must fail
 * closed at every use site; see `isActiveApplicationAuthorityEnvelope`.
 */
export const ApplicationAuthorityEnvelopeSchema = z
  .object({
    id: NonEmptyStringSchema,
    mode: ApplicationAutomationModeSchema,
    status: ApplicationAuthorityStatusSchema,
    revision: z.number().int().positive(),
    scope: ApplicationAuthorityScopeSchema,
    maxApplicationsPerRun: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER),
    maxApplicationsPerLocalDay: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER),
    intermediateMutationsAuthorized: z.boolean(),
    // Pinned false for v1: autonomous authority never includes creating
    // employer accounts. Widening this requires an explicit contract change.
    accountCreationAuthorized: z.literal(false),
    allowedResumeSha256: z
      .array(Sha256HexSchema)
      .max(applicationAuthorityMaxResumeDigests),
    allowedOrigins: z
      .array(ApplicationAuthorityOriginSchema)
      .min(1)
      .max(applicationAuthorityMaxOrigins),
    createdAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema.nullable(),
    revokedAt: IsoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "revoked" && value.revokedAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A revoked authority envelope must record revokedAt.",
        path: ["revokedAt"],
      });
    }
    if (value.status !== "revoked" && value.revokedAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "revokedAt may only be recorded on a revoked authority envelope.",
        path: ["status"],
      });
    }

    if (
      value.expiresAt !== null &&
      Date.parse(value.expiresAt) <= Date.parse(value.createdAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expiresAt must be strictly after createdAt.",
        path: ["expiresAt"],
      });
    }
    if (value.status === "expired" && value.expiresAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An expired authority envelope must record expiresAt.",
        path: ["status"],
      });
    }

    if (
      value.revokedAt !== null &&
      Date.parse(value.revokedAt) < Date.parse(value.createdAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "revokedAt cannot precede createdAt.",
        path: ["revokedAt"],
      });
    }

    if (
      value.mode === "confirm_before_submit" ||
      value.mode === "autonomous_submit"
    ) {
      const hasExplicitScope =
        value.scope.campaignId !== null || value.scope.jobIds.length > 0;
      if (!hasExplicitScope) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Confirm and autonomous authority require an explicit campaign or job scope.",
          path: ["scope"],
        });
      }
      if (value.allowedResumeSha256.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Confirm and autonomous authority require an exact resume SHA-256 allowlist.",
          path: ["allowedResumeSha256"],
        });
      }
      if (value.expiresAt === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Confirm and autonomous authority require an explicit expiry.",
          path: ["expiresAt"],
        });
      }
    }

    if (new Set(value.scope.jobIds).size !== value.scope.jobIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scoped job IDs must be unique.",
        path: ["scope", "jobIds"],
      });
    }
    if (
      new Set(value.allowedResumeSha256).size !==
      value.allowedResumeSha256.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allowed resume digests must be unique.",
        path: ["allowedResumeSha256"],
      });
    }
    const canonicalOrigins = value.allowedOrigins.map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        // The element schema already reports the malformed origin. Preserve a
        // stable fallback here so semantic duplicate validation never throws.
        return origin;
      }
    });
    if (new Set(canonicalOrigins).size !== canonicalOrigins.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allowed origins must be unique.",
        path: ["allowedOrigins"],
      });
    }
  });
export type ApplicationAuthorityEnvelope = z.infer<
  typeof ApplicationAuthorityEnvelopeSchema
>;
export type ApplicationAuthorityEnvelopeInput = z.input<
  typeof ApplicationAuthorityEnvelopeSchema
>;

/**
 * Deterministic use-site gate: anything that is not explicitly active and
 * unexpired at the caller's clock fails closed. Expired and revoked envelopes
 * remain representable as data so history stays auditable, but they authorize
 * nothing.
 */
export function isActiveApplicationAuthorityEnvelope(
  envelope: Pick<ApplicationAuthorityEnvelope, "status" | "expiresAt">,
  now: string,
): boolean {
  if (envelope.status !== "active") {
    return false;
  }
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) {
    return false;
  }
  return (
    envelope.expiresAt === null || Date.parse(envelope.expiresAt) > nowTime
  );
}

/**
 * Observation identity bound into a submission preflight. A fresh deterministic
 * recheck must reproduce this exact id + revision + digest before any external
 * action; any mismatch means the page changed under us and the action stops.
 */
export const SubmissionObservationIdentitySchema = z
  .object({
    id: NonEmptyStringSchema,
    revision: z.number().int().positive(),
    digest: Sha256HexSchema,
  })
  .strict();
export type SubmissionObservationIdentity = z.infer<
  typeof SubmissionObservationIdentitySchema
>;

/** Digest-bound answer-set identity; raw answers never enter the record. */
export const SubmissionAnswerSnapshotIdentitySchema = z
  .object({
    revision: z.number().int().positive(),
    digest: Sha256HexSchema,
  })
  .strict();
export type SubmissionAnswerSnapshotIdentity = z.infer<
  typeof SubmissionAnswerSnapshotIdentitySchema
>;

/** Stable final-control reference plus a digest signature of its identity. */
export const SubmissionFinalControlIdentitySchema = z
  .object({
    signature: Sha256HexSchema,
    ref: NonEmptyStringSchema,
  })
  .strict();
export type SubmissionFinalControlIdentity = z.infer<
  typeof SubmissionFinalControlIdentitySchema
>;

/**
 * One submission preflight record (ADR 0013 step 6).
 *
 * Carries every fact needed for a fresh deterministic recheck immediately
 * before the single external action: exact application lineage, exact
 * authority envelope id + revision, observation id/revision/digest, resume
 * digest, answer revision/digest, final-control signature/ref, and remaining
 * capacity captured before the attempt.
 *
 * Deliberately contains no raw answers, DOM snapshots, credentials, or URLs
 * with secrets — only digests, revisions, and stable references.
 */
export const SubmissionPreflightRecordSchema = z
  .object({
    id: NonEmptyStringSchema,
    idempotencyKey: NonEmptyStringSchema,
    runId: NonEmptyStringSchema,
    jobId: NonEmptyStringSchema,
    resultId: NonEmptyStringSchema,
    applicationRecordId: NonEmptyStringSchema,
    authorityEnvelopeId: NonEmptyStringSchema,
    authorityRevision: z.number().int().positive(),
    formObservation: SubmissionObservationIdentitySchema,
    resumeSha256: Sha256HexSchema,
    answers: SubmissionAnswerSnapshotIdentitySchema,
    finalControl: SubmissionFinalControlIdentitySchema,
    remainingRunCapacityBefore: z.number().int().nonnegative(),
    remainingDailyCapacityBefore: z.number().int().nonnegative(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type SubmissionPreflightRecord = z.infer<
  typeof SubmissionPreflightRecordSchema
>;
export type SubmissionPreflightRecordInput = z.input<
  typeof SubmissionPreflightRecordSchema
>;

export const submissionExecutionGrantStatusValues = [
  "active",
  "revoked",
  "consumed",
  "expired",
] as const;
export const SubmissionExecutionGrantStatusSchema = z.enum(
  submissionExecutionGrantStatusValues,
);
export type SubmissionExecutionGrantStatus = z.infer<
  typeof SubmissionExecutionGrantStatusSchema
>;

/**
 * The exact one-time user grant for a single final-submission action in
 * `confirm_before_submit` mode (ADR 0012).
 *
 * The mode-bearing authority envelope never authorizes the final action in
 * this mode. Only this separate durable grant does, and it binds exactly one
 * preflight id + idempotency key + run/job/result/application-record lineage +
 * authority envelope id/revision tuple. `grantedBy` is pinned to the literal
 * `user`, so model output can never mint or widen a grant.
 *
 * Fail-closed invariants (superRefine), enforced in both directions:
 * - active grants record neither revokedAt nor consumedAt
 * - revoked grants require revokedAt and forbid consumedAt
 * - consumed grants require consumedAt and forbid revokedAt
 * - every grant has a bounded expiresAt; expired grants carry neither marker
 * - expiresAt must be strictly after grantedAt; revoke/consume cannot
 *   precede the grant
 *
 * Revoked, consumed, and expired grants stay representable for audit but
 * authorize nothing; see `isActiveSubmissionExecutionGrant`.
 */
export const SubmissionExecutionGrantSchema = z
  .object({
    id: NonEmptyStringSchema,
    preflightId: NonEmptyStringSchema,
    idempotencyKey: NonEmptyStringSchema,
    runId: NonEmptyStringSchema,
    jobId: NonEmptyStringSchema,
    resultId: NonEmptyStringSchema,
    applicationRecordId: NonEmptyStringSchema,
    authorityEnvelopeId: NonEmptyStringSchema,
    authorityRevision: z.number().int().positive(),
    // Pinned: this grant exists only for the confirm-before-submit flow. An
    // envelope in any other mode can never pair with it, and autonomous runs
    // proceed from an active envelope plus policy/preflight checks instead of
    // any grant.
    mode: z.literal("confirm_before_submit"),
    status: SubmissionExecutionGrantStatusSchema,
    grantedBy: z.literal("user"),
    grantedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    revokedAt: IsoDateTimeSchema.nullable(),
    consumedAt: IsoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const grantedAtTime = Date.parse(value.grantedAt);

    if (
      Date.parse(value.expiresAt) <= grantedAtTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expiresAt must be strictly after grantedAt.",
        path: ["expiresAt"],
      });
    }
    if (
      value.revokedAt !== null &&
      Date.parse(value.revokedAt) < grantedAtTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "revokedAt cannot precede grantedAt.",
        path: ["revokedAt"],
      });
    }
    if (
      value.consumedAt !== null &&
      Date.parse(value.consumedAt) < grantedAtTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "consumedAt cannot precede grantedAt.",
        path: ["consumedAt"],
      });
    }

    switch (value.status) {
      case "active":
        if (value.revokedAt !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An active grant cannot record revokedAt.",
            path: ["revokedAt"],
          });
        }
        if (value.consumedAt !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An active grant cannot record consumedAt.",
            path: ["consumedAt"],
          });
        }
        break;
      case "revoked":
        if (value.revokedAt === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A revoked grant must record revokedAt.",
            path: ["revokedAt"],
          });
        }
        if (value.consumedAt !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A revoked grant cannot also be consumed.",
            path: ["consumedAt"],
          });
        }
        break;
      case "consumed":
        if (value.consumedAt === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A consumed grant must record consumedAt.",
            path: ["consumedAt"],
          });
        }
        if (value.revokedAt !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A consumed grant cannot also be revoked.",
            path: ["revokedAt"],
          });
        }
        break;
      case "expired":
        if (value.revokedAt !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An expired grant cannot also be revoked.",
            path: ["revokedAt"],
          });
        }
        if (value.consumedAt !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "An expired grant cannot also be consumed.",
            path: ["consumedAt"],
          });
        }
        break;
    }
  });
export type SubmissionExecutionGrant = z.infer<
  typeof SubmissionExecutionGrantSchema
>;
export type SubmissionExecutionGrantInput = z.input<
  typeof SubmissionExecutionGrantSchema
>;

/**
 * Deterministic use-site gate for the single final-submission action of a
 * `confirm_before_submit` attempt: true only when the grant is explicitly
 * active, unexpired at the caller-provided clock, and bound to exactly the
 * preflight id, idempotency key, run/job/result/application-record lineage,
 * and authority envelope id/revision the executor is about to act on.
 *
 * The caller must supply its own clock (`now`) and the typed expected
 * preflight facts; a boolean flag or the envelope's mode can never stand in
 * for the grant. Invalid clocks fail closed. Anything false means no external
 * action happens.
 */
export function isActiveSubmissionExecutionGrant(
  grant: Pick<
    SubmissionExecutionGrant,
    | "status"
    | "expiresAt"
    | "preflightId"
    | "idempotencyKey"
    | "runId"
    | "jobId"
    | "resultId"
    | "applicationRecordId"
    | "authorityEnvelopeId"
    | "authorityRevision"
  >,
  now: string,
  expectedPreflight: Pick<
    SubmissionPreflightRecord,
    | "id"
    | "idempotencyKey"
    | "runId"
    | "jobId"
    | "resultId"
    | "applicationRecordId"
    | "authorityEnvelopeId"
    | "authorityRevision"
  >,
): boolean {
  if (grant.status !== "active") {
    return false;
  }
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) {
    return false;
  }
  const expiresAtTime = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expiresAtTime) || expiresAtTime <= nowTime) {
    return false;
  }
  return (
    grant.preflightId === expectedPreflight.id &&
    grant.idempotencyKey === expectedPreflight.idempotencyKey &&
    grant.runId === expectedPreflight.runId &&
    grant.jobId === expectedPreflight.jobId &&
    grant.resultId === expectedPreflight.resultId &&
    grant.applicationRecordId === expectedPreflight.applicationRecordId &&
    grant.authorityEnvelopeId === expectedPreflight.authorityEnvelopeId &&
    grant.authorityRevision === expectedPreflight.authorityRevision
  );
}

/**
 * Tri-state terminal outcome of one final-submission attempt (ADR 0013).
 *
 * Only fresh external evidence proves `submitted`; internal clicks and intents
 * are structurally unrepresentable here because every evidence entry is an
 * externally observed employer-site state, confirmation artifact, or operator
 * confirmation. `outcome_uncertain` permanently blocks automatic retry for the
 * bound idempotency key; resolution happens through a human and, when proven,
 * through a new outcome record sharing the same key.
 */
export const submissionOutcomeValues = [
  "submitted",
  "not_submitted",
  "outcome_uncertain",
] as const;
export const SubmissionOutcomeValueSchema = z.enum(submissionOutcomeValues);
export type SubmissionOutcomeValue = z.infer<typeof SubmissionOutcomeValueSchema>;

export const submissionOutcomeEvidenceKindValues = [
  "employer_site_state",
  "confirmation_artifact",
  "operator_confirmation",
] as const;
export const SubmissionOutcomeEvidenceKindSchema = z.enum(
  submissionOutcomeEvidenceKindValues,
);
export type SubmissionOutcomeEvidenceKind = z.infer<
  typeof SubmissionOutcomeEvidenceKindSchema
>;

export const submissionOutcomeMaxEvidenceEntries = 50;

export const SubmissionEvidenceDestinationSchema = z
  .object({
    origin: ApplicationAuthorityOriginSchema,
    safePath: AuthoritySafePathSchema,
  })
  .strict();
export type SubmissionEvidenceDestination = z.infer<
  typeof SubmissionEvidenceDestinationSchema
>;

export const SubmissionOutcomeEvidenceEntrySchema = z
  .object({
    id: NonEmptyStringSchema,
    kind: SubmissionOutcomeEvidenceKindSchema,
    observedAt: IsoDateTimeSchema,
    destination: SubmissionEvidenceDestinationSchema,
    artifactRefId: NonEmptyStringSchema.nullable(),
    summary: NonEmptyStringSchema.max(500),
  })
  .strict();
export type SubmissionOutcomeEvidenceEntry = z.infer<
  typeof SubmissionOutcomeEvidenceEntrySchema
>;

export const submissionRetryBlockReasonValues = [
  "submission_confirmed",
  "outcome_uncertain",
  "authority_no_longer_valid",
  "policy_decision",
] as const;
export const SubmissionRetryBlockReasonSchema = z.enum(
  submissionRetryBlockReasonValues,
);
export type SubmissionRetryBlockReason = z.infer<
  typeof SubmissionRetryBlockReasonSchema
>;

export const SubmissionOutcomeRetryEligibilitySchema = z
  .object({
    eligible: z.boolean(),
    blockReason: SubmissionRetryBlockReasonSchema.nullable(),
  })
  .strict();
export type SubmissionOutcomeRetryEligibility = z.infer<
  typeof SubmissionOutcomeRetryEligibilitySchema
>;

/**
 * Refinement matrix enforced here and relied upon by receipts/packets:
 * - `submitted`: retry permanently blocked as `submission_confirmed`,
 *   verifiedAt required, at least one external evidence entry required
 * - `outcome_uncertain`: retry permanently blocked as `outcome_uncertain`,
 *   verifiedAt forbidden (nothing was proven)
 * - `not_submitted`: retry is allowed only through an explicit
 *   `{ eligible: true, blockReason: null }`; blocking requires an explicit
 *   reason
 */
export const SubmissionOutcomeRecordSchema = z
  .object({
    id: NonEmptyStringSchema,
    preflightId: NonEmptyStringSchema,
    idempotencyKey: NonEmptyStringSchema,
    authorityEnvelopeId: NonEmptyStringSchema,
    authorityRevision: z.number().int().positive(),
    runId: NonEmptyStringSchema,
    jobId: NonEmptyStringSchema,
    resultId: NonEmptyStringSchema,
    applicationRecordId: NonEmptyStringSchema,
    outcome: SubmissionOutcomeValueSchema,
    attemptedAt: IsoDateTimeSchema,
    verifiedAt: IsoDateTimeSchema.nullable(),
    evidence: z
      .array(SubmissionOutcomeEvidenceEntrySchema)
      .max(submissionOutcomeMaxEvidenceEntries),
    retry: SubmissionOutcomeRetryEligibilitySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const attemptedAt = Date.parse(value.attemptedAt);
    if (
      value.verifiedAt !== null &&
      Date.parse(value.verifiedAt) < attemptedAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "verifiedAt cannot precede attemptedAt.",
        path: ["verifiedAt"],
      });
    }
    value.evidence.forEach((entry, index) => {
      if (Date.parse(entry.observedAt) < attemptedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Submission outcome evidence cannot predate the attempt.",
          path: ["evidence", index, "observedAt"],
        });
      }
    });

    if (value.outcome === "submitted") {
      if (
        value.retry.eligible !== false ||
        value.retry.blockReason !== "submission_confirmed"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A confirmed submission is never retryable; retry must be blocked as submission_confirmed.",
          path: ["retry"],
        });
      }
      if (value.verifiedAt === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Only externally verified submissions may be marked submitted; verifiedAt is required.",
          path: ["verifiedAt"],
        });
      }
      if (value.evidence.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "A submitted outcome requires at least one externally observed evidence entry.",
          path: ["evidence"],
        });
      }
    }

    if (value.outcome === "outcome_uncertain") {
      if (
        value.retry.eligible !== false ||
        value.retry.blockReason !== "outcome_uncertain"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Outcome uncertainty permanently blocks automatic retry for this idempotency key.",
          path: ["retry"],
        });
      }
      if (value.verifiedAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "An uncertain outcome proved nothing, so verifiedAt must stay null.",
          path: ["verifiedAt"],
        });
      }
    }

    if (value.outcome === "not_submitted") {
      if (value.retry.eligible && value.retry.blockReason !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "An eligible retry must not declare a block reason; blocking must be explicit instead.",
          path: ["retry", "blockReason"],
        });
      }
      if (!value.retry.eligible && value.retry.blockReason === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Blocking a not_submitted retry requires an explicit block reason.",
          path: ["retry", "blockReason"],
        });
      }
    }
  });
export type SubmissionOutcomeRecord = z.infer<
  typeof SubmissionOutcomeRecordSchema
>;
export type SubmissionOutcomeRecordInput = z.input<
  typeof SubmissionOutcomeRecordSchema
>;
