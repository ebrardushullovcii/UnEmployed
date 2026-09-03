import { describe, expect, it } from "vitest";

import {
  AbnormalFailurePauseSchema,
  ApplyGroupedManualAnswerInputSchema,
  CompanyApplicationCapSchema,
  CompanyAliasSchema,
  CompanyEntitySchema,
  CompanyIntelligenceMutationInputSchema,
  CompanyIntelligenceMutationSchema,
  CompanyMergeReviewCandidateSchema,
  CompanySalaryOfferEvidenceSchema,
  ContradictoryAnswerDetectionSchema,
  GroupedManualAnswerDecisionSchema,
  JobFinderIntelligenceSafeguardsSchema,
  JobFinderIntelligenceStateSchema,
  ListingSignalRecordSchema,
  OutcomeAnalyticsBucketSchema,
  OutcomeAnalyticsOverviewSchema,
  OutcomeEventSchema,
  PreparedBatchSampleReviewSchema,
  ProjectGroupedManualAnswerCommandSchema,
  RecommendResumeStrategyInputSchema,
  RecordOutcomeInputSchema,
  ResumeStrategyRecommendationSchema,
  ResumeStrategySchema,
  SetCampaignResumeStrategyDefaultInputSchema,
  SetOutcomeSuggestionEnabledInputSchema,
  genericCompanyNameValues,
  groupedDecisionForbiddenAuthorityValues,
  isGenericCompanyName,
  isListableCompanyName,
  isLikelyUtilitySiteChromeName,
  isUrlDerivedEmployerLabel,
  formatEmployerLabelFromSlug,
  sanitizeEmployerLabel,
  sanitizeObservedEmployerLabel,
  normalizeCompanyName,
  outcomeBucketDimensionValues,
} from "./job-finder-intelligence";

const now = "2026-08-15T10:00:00.000Z";
const hash = (char: string) => char.repeat(64);

const validGroupedDecisionInput = () => ({
  id: "decision-1",
  groupKey: "question-group-1",
  requestId: "request-1",
  applicationRecordId: "application-1",
  jobId: "job-1",
  questionId: "question-1",
  expectedRevision: 1,
  expectedQuestionRevision: 2,
  expectedAnswerRevision: 0,
  fingerprints: {
    questionMeaning: hash("a"),
    answerPolicy: hash("b"),
  },
  answer: { type: "text" as const, value: "Yes" },
  createdAt: now,
  updatedAt: now,
});

const parseGrouped = (overrides: Record<string, unknown>) =>
  GroupedManualAnswerDecisionSchema.safeParse({
    ...validGroupedDecisionInput(),
    ...overrides,
  });

const validBucketInput = (overrides: Record<string, unknown> = {}) => ({
  dimension: "campaign" as const,
  key: "campaign-1",
  label: "Fall campaign",
  sampleSize: 10,
  updatedAt: now,
  ...overrides,
});

const parseBucket = (overrides: Record<string, unknown> = {}) =>
  OutcomeAnalyticsBucketSchema.safeParse(validBucketInput(overrides));

describe("grouped reusable manual-answer decisions", () => {
  it("requires at least two exact request ids before reusing an answer", () => {
    expect(
      ApplyGroupedManualAnswerInputSchema.safeParse({
        decisionId: "decision-1",
        requestIds: ["request-1"],
        expectedRequestRevisions: { "request-1": 0 },
        answer: { type: "text", value: "Yes" },
      }).success,
    ).toBe(false);
    expect(
      ApplyGroupedManualAnswerInputSchema.safeParse({
        decisionId: "decision-1",
        requestIds: ["request-1", "request-2"],
        expectedRequestRevisions: { "request-1": 0, "request-2": 0 },
        answer: { type: "asset_ref", assetId: "resume-1" },
      }).success,
    ).toBe(false);
  });

  it("keeps backward-safe defaults on minimal input", () => {
    const decision = GroupedManualAnswerDecisionSchema.parse(
      validGroupedDecisionInput(),
    );

    expect(decision).toEqual(
      expect.objectContaining({
        kind: "manual_answer",
        blockerKind: "manual_answer",
        authority: "manual_answer",
        reuseScope: "reusable",
        resultId: null,
        approval: "pending",
        approvedAt: null,
        snooze: null,
        lineage: [],
      }),
    );
    expect(decision.conflict).toEqual(
      expect.objectContaining({ status: "none", detectedAt: null }),
    );
  });

  it.each([...groupedDecisionForbiddenAuthorityValues])(
    "rejects forbidden grouped decision kind %s",
    (kind) => {
      expect(parseGrouped({ kind }).success).toBe(false);
      expect(parseGrouped({ blockerKind: kind }).success).toBe(false);
      expect(parseGrouped({ authority: kind }).success).toBe(false);
    },
  );

  it("rejects a non-reusable or unknown reuse scope", () => {
    expect(parseGrouped({ reuseScope: "application_once" }).success).toBe(
      false,
    );
    expect(parseGrouped({ reuseScope: "unknown" }).success).toBe(false);
  });

  it("rejects attempts to smuggle forbidden authority keys", () => {
    expect(
      parseGrouped({ credentials: { username: "u", password: "p" } }).success,
    ).toBe(false);
    expect(parseGrouped({ captchaToken: "token" }).success).toBe(false);
    expect(parseGrouped({ mfaCode: "123456" }).success).toBe(false);
    expect(parseGrouped({ legalConsent: true }).success).toBe(false);
    expect(parseGrouped({ accountCreationAuthorized: true }).success).toBe(
      false,
    );
    expect(parseGrouped({ uploadAuthorized: true }).success).toBe(false);
    expect(parseGrouped({ redirectUrl: "https://example.com" }).success).toBe(
      false,
    );
    expect(parseGrouped({ submitAuthorized: true }).success).toBe(false);
  });

  it("requires explicit approval timestamps when approved", () => {
    expect(parseGrouped({ approval: "approved" }).success).toBe(false);
    expect(
      parseGrouped({
        approval: "approved",
        approvedAt: "2026-08-15T11:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(parseGrouped({ approvedAt: now }).success).toBe(false);
  });

  it("keeps conflict state consistent", () => {
    expect(parseGrouped({ conflict: { status: "detected" } }).success).toBe(
      false,
    );
    expect(
      parseGrouped({
        conflict: {
          status: "detected",
          detectedAt: "2026-08-15T10:30:00.000Z",
        },
      }).success,
    ).toBe(true);
    expect(
      parseGrouped({
        conflict: { status: "none", detectedAt: now },
      }).success,
    ).toBe(false);
  });

  it("records per-job lineage and optional snooze", () => {
    const decision = GroupedManualAnswerDecisionSchema.parse({
      ...validGroupedDecisionInput(),
      snooze: { until: "2026-08-16T10:00:00.000Z", reason: "Ask recruiter" },
      lineage: [
        {
          requestId: "request-2",
          jobId: "job-2",
          applicationRecordId: "application-2",
          questionId: "question-2",
          expectedRequestRevision: 1,
          expectedQuestionRevision: 1,
          expectedAnswerRevision: 0,
        },
      ],
    });

    expect(decision.snooze).toEqual(
      expect.objectContaining({ until: "2026-08-16T10:00:00.000Z" }),
    );
    expect(decision.lineage).toHaveLength(1);
    expect(decision.lineage[0]).toEqual(
      expect.objectContaining({ jobId: "job-2", appliedAt: null }),
    );
  });

  it("does not allow an approved decision to stay snoozed", () => {
    expect(
      parseGrouped({
        approval: "approved",
        approvedAt: now,
        snooze: { until: "2026-08-16T10:00:00.000Z" },
      }).success,
    ).toBe(false);
  });

  it("roots the create/project command in one pending request and text", () => {
    const command = ProjectGroupedManualAnswerCommandSchema.parse({
      groupKey: "group_1",
      requestId: "request-1",
      expectedRequestRevision: 2,
      answer: { type: "text", value: "Yes" },
    });
    expect(command).toEqual(
      expect.objectContaining({
        groupKey: "group_1",
        requestId: "request-1",
        expectedRequestRevision: 2,
        answer: { type: "text", value: "Yes" },
        saveScope: "reusable_profile",
      }),
    );
  });

  it("rejects unsafe or impossible project commands", () => {
    const base = {
      groupKey: "group_1",
      requestId: "request-1",
      expectedRequestRevision: 1,
      answer: { type: "text", value: "Yes" },
    };
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse(base).success,
    ).toBe(true);
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse({
        ...base,
        expectedRequestRevision: 0,
      }).success,
    ).toBe(false);
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse({
        ...base,
        answer: { type: "asset_ref", assetId: "resume-1" },
      }).success,
    ).toBe(false);
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse({
        ...base,
        answer: { type: "text", value: " " },
      }).success,
    ).toBe(false);
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse({
        ...base,
        saveScope: "application_once",
      }).success,
    ).toBe(false);
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse({
        ...base,
        saveScope: "reusable_profile",
      }).success,
    ).toBe(true);
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse({
        ...base,
        saveScope: "unknown",
      }).success,
    ).toBe(false);
    expect(
      ProjectGroupedManualAnswerCommandSchema.safeParse({
        ...base,
        credentials: { username: "u" },
      }).success,
    ).toBe(false);
  });
});

describe("outcome analytics buckets", () => {
  it("keeps outcome input scoped to a known job and explicit user choice", () => {
    expect(
      RecordOutcomeInputSchema.safeParse({
        jobId: "job-1",
        outcome: "application_completed",
      }).success,
    ).toBe(true);
    expect(
      RecordOutcomeInputSchema.safeParse({
        jobId: "job-1",
        outcome: "submitted_without_approval",
      }).success,
    ).toBe(false);
  });

  it("records only explicit user-controlled outcome events", () => {
    const input = {
      id: "outcome-1",
      outcome: "shortlisted",
      jobId: "job-1",
      campaignId: "campaign-1",
      source: "example",
      company: "Example Corp",
      jobTitle: "Software Engineer",
      occurredAt: now,
    };

    expect(OutcomeEventSchema.safeParse(input).success).toBe(false);
    expect(
      OutcomeEventSchema.safeParse({ ...input, userControlled: true }).success,
    ).toBe(true);
  });

  it.each(outcomeBucketDimensionValues)(
    "accepts the %s bucket dimension",
    (dimension) => {
      expect(parseBucket({ dimension }).success).toBe(true);
    },
  );

  it("keeps backward-safe nullable rates and hidden suggestions", () => {
    const bucket = OutcomeAnalyticsBucketSchema.parse(validBucketInput());

    expect(bucket.outcomeCounts).toEqual({});
    expect(bucket.appliedRate).toBeNull();
    expect(bucket.responseRate).toBeNull();
    expect(bucket.interviewRate).toBeNull();
    expect(bucket.offerRate).toBeNull();
    expect(bucket.uncertainty).toEqual(
      expect.objectContaining({
        level: "high",
        minimumSampleForConfidence: 30,
      }),
    );
    expect(bucket.suggestion).toEqual(
      expect.objectContaining({
        enabled: false,
        disabledByUser: false,
        resetRequested: false,
        lastResetAt: null,
      }),
    );
  });

  it("rejects a non-positive sample size", () => {
    expect(parseBucket({ sampleSize: 0 }).success).toBe(false);
    expect(parseBucket({ sampleSize: -3 }).success).toBe(false);
  });

  it("rejects outcome counts that exceed the sample size", () => {
    expect(
      parseBucket({ sampleSize: 2, outcomeCounts: { applied: 3 } }).success,
    ).toBe(false);
    expect(
      parseBucket({
        sampleSize: 5,
        outcomeCounts: { applied: 3, rejected: 2 },
      }).success,
    ).toBe(true);
  });

  it("enforces rate consistency with counts and the sample size", () => {
    expect(
      parseBucket({
        sampleSize: 10,
        outcomeCounts: { applied: 2, rejected: 1 },
        rateNumerators: { applied: 2 },
        appliedRate: 0.2,
      }).success,
    ).toBe(true);
    expect(
      parseBucket({
        sampleSize: 10,
        outcomeCounts: { applied: 2 },
        rateNumerators: { applied: 2 },
        appliedRate: 0.5,
      }).success,
    ).toBe(false);
    expect(
      parseBucket({
        sampleSize: 10,
        outcomeCounts: { interview: 1, offer: 1 },
        rateNumerators: { response: 2 },
        responseRate: 0.2,
      }).success,
    ).toBe(true);
    expect(
      parseBucket({
        sampleSize: 10,
        outcomeCounts: { interview: 1 },
        rateNumerators: { interview: 1 },
        interviewRate: 0.5,
      }).success,
    ).toBe(false);
    expect(parseBucket({ offerRate: 1.5 }).success).toBe(false);
  });

  it("shows visible uncertainty that requires a minimum sample", () => {
    expect(
      parseBucket({
        sampleSize: 5,
        uncertainty: { level: "low", minimumSampleForConfidence: 30 },
      }).success,
    ).toBe(false);
    expect(
      parseBucket({
        sampleSize: 30,
        uncertainty: { level: "low", minimumSampleForConfidence: 30 },
      }).success,
    ).toBe(true);
  });

  it("lets users disable or reset suggestions safely", () => {
    expect(
      parseBucket({
        suggestion: { enabled: true, disabledByUser: true },
      }).success,
    ).toBe(false);
    expect(parseBucket({ suggestion: { enabled: true } }).success).toBe(false);
    expect(
      parseBucket({
        suggestion: {
          enabled: true,
          kind: "pause_company",
          label: "Pause Acme",
          reason: "Repeated stale listings",
        },
      }).success,
    ).toBe(true);
    expect(
      parseBucket({
        suggestion: { disabledByUser: true, resetRequested: true },
      }).success,
    ).toBe(true);
  });

  it("defaults the overview to no buckets", () => {
    const overview = OutcomeAnalyticsOverviewSchema.parse({
      generatedAt: now,
    });
    expect(overview.buckets).toEqual([]);
  });

  it.each(outcomeBucketDimensionValues)(
    "accepts a suggestion disable for the %s dimension",
    (dimension) => {
      expect(
        SetOutcomeSuggestionEnabledInputSchema.safeParse({
          dimension,
          key: "bucket-key",
          enabled: false,
        }).success,
      ).toBe(true);
    },
  );

  it("distinguishes an explicit disable from an enable or reset", () => {
    const disable = SetOutcomeSuggestionEnabledInputSchema.parse({
      dimension: "source",
      key: "example",
      enabled: false,
    });
    expect(disable).toMatchObject({ enabled: false, reset: false });

    const enable = SetOutcomeSuggestionEnabledInputSchema.parse({
      dimension: "source",
      key: "example",
      enabled: true,
    });
    expect(enable).toMatchObject({ enabled: true, reset: false });

    const reset = SetOutcomeSuggestionEnabledInputSchema.parse({
      dimension: "source",
      key: "example",
      enabled: true,
      reset: true,
    });
    expect(reset).toMatchObject({ enabled: true, reset: true });

    const resetWithoutEnable = SetOutcomeSuggestionEnabledInputSchema.parse({
      dimension: "source",
      key: "example",
      enabled: false,
      reset: true,
    });
    expect(resetWithoutEnable).toMatchObject({ enabled: false, reset: true });
  });

  it("rejects a suggestion control without a dimension or key", () => {
    expect(
      SetOutcomeSuggestionEnabledInputSchema.safeParse({
        dimension: "source",
      } as unknown).success,
    ).toBe(false);
    expect(
      SetOutcomeSuggestionEnabledInputSchema.safeParse({
        key: "example",
        enabled: false,
      } as unknown).success,
    ).toBe(false);
  });

  it("rejects a record-outcome input for an unknown outcome kind", () => {
    expect(
      RecordOutcomeInputSchema.safeParse({
        jobId: "job-1",
        outcome: "submitted_without_approval",
      }).success,
    ).toBe(false);
  });

  it("accepts an optional resume strategy and note on a record-outcome input", () => {
    const input = RecordOutcomeInputSchema.parse({
      jobId: "job-1",
      outcome: "interview",
      resumeStrategyId: "strategy-1",
      note: "Recruiter reached out on LinkedIn",
    });
    expect(input).toMatchObject({
      jobId: "job-1",
      outcome: "interview",
      resumeStrategyId: "strategy-1",
      note: "Recruiter reached out on LinkedIn",
    });
  });
});

describe("reusable resume strategies", () => {
  const validStrategyInput = () => ({
    id: "strategy-1",
    name: "SWE generalist",
    roleFamily: "software_engineering",
    baseResumeDocumentId: "document-1",
    templateId: "classic_ats" as const,
    createdAt: now,
    updatedAt: now,
  });

  it("keeps conservative backward-safe defaults", () => {
    const strategy = ResumeStrategySchema.parse(validStrategyInput());

    expect(strategy).toEqual(
      expect.objectContaining({
        headlinePolicy: "fixed",
        skillsPolicy: "base_only",
        coveragePolicy: "base_omissions",
        tailoringStrength: "conservative",
        enabled: true,
      }),
    );
    expect(strategy.evidenceBoundaries).toEqual(
      expect.objectContaining({
        allowExactClaims: true,
        allowParaphrasedClaims: false,
        maxEvidenceRefsPerBullet: 3,
        requireVerifierPass: true,
      }),
    );
  });

  it("has no approval or application-ready flag", () => {
    const shape = Object.keys(ResumeStrategySchema.shape);
    expect(shape).not.toContain("approved");
    expect(shape).not.toContain("approval");
    expect(shape).not.toContain("approvedAt");
    expect(shape).not.toContain("applicationReady");
    expect(shape).not.toContain("readyForApproval");
    expect(shape).not.toContain("submitAuthorized");

    const parseStrategy = (overrides: Record<string, unknown>) =>
      ResumeStrategySchema.safeParse({ ...validStrategyInput(), ...overrides });

    expect(parseStrategy({ approved: true }).success).toBe(false);
    expect(parseStrategy({ applicationReady: true }).success).toBe(false);
  });

  it("rejects unsafe evidence boundaries", () => {
    expect(
      ResumeStrategySchema.safeParse({
        ...validStrategyInput(),
        evidenceBoundaries: { maxEvidenceRefsPerBullet: 11 },
      }).success,
    ).toBe(false);
    expect(
      ResumeStrategySchema.safeParse({
        ...validStrategyInput(),
        tailoringStrength: "aggressive",
      }).success,
    ).toBe(true);
  });
});

describe("conservative company entities", () => {
  it("uses one canonical company-name normalization with C++ and C# semantics", () => {
    expect(normalizeCompanyName("  Café C++ Labs  ")).toBe(
      "cafe cplusplus labs",
    );
    expect(normalizeCompanyName("C# Works")).toBe("csharp works");
    expect(
      CompanyAliasSchema.parse({
        alias: "C++ Works",
        normalized: "cplusplus works",
      }),
    ).toMatchObject({
      alias: "C++ Works",
      normalized: "cplusplus works",
      identityAuthority: "unknown",
    });
  });

  it("rejects polluted aliases whose persisted normalized key mismatches", () => {
    for (const identityAuthority of [
      "unknown",
      "user_approved_merge",
    ] as const) {
      expect(
        CompanyAliasSchema.safeParse({
          alias: "C++ Works",
          normalized: "c works",
          identityAuthority,
        }).success,
      ).toBe(false);
    }
  });

  it("bounds generic placeholders without rejecting named agencies", () => {
    for (const name of genericCompanyNameValues) {
      expect(isGenericCompanyName(name)).toBe(true);
      expect(isListableCompanyName(name)).toBe(false);
    }
    for (const name of [
      "Named Staffing Agency",
      "Recruiting Agency Partners",
    ]) {
      expect(isGenericCompanyName(name)).toBe(false);
      expect(isListableCompanyName(name)).toBe(true);
    }
    expect(isListableCompanyName("")).toBe(false);
    expect(isListableCompanyName("   ")).toBe(false);
  });

  it("excludes privacy-policy and site chrome shells from listable companies", () => {
    const priyaPrivacyShell = "Politikë e Privatësisë";
    expect(isLikelyUtilitySiteChromeName(priyaPrivacyShell)).toBe(true);
    expect(isListableCompanyName(priyaPrivacyShell)).toBe(false);
    expect(
      isListableCompanyName(
        "Politikë e Privatësisë dhe Mbrojtjes së të Dhënave Personale",
      ),
    ).toBe(false);
    expect(isListableCompanyName("Privacy Policy")).toBe(false);
    expect(isListableCompanyName("Cookie Policy")).toBe(false);
    expect(isListableCompanyName("Why Wellfound")).toBe(false);
    expect(isListableCompanyName("Sign up with Google")).toBe(false);
    expect(isListableCompanyName("Acme Robotics")).toBe(true);
  });

  it("rejects URL-derived and low-quality slug-inferred employer labels", () => {
    expect(isUrlDerivedEmployerLabel("https://therichmondmarketing.com")).toBe(
      true,
    );
    expect(isUrlDerivedEmployerLabel("Https Therichmondmarketing Com")).toBe(
      true,
    );
    expect(isUrlDerivedEmployerLabel("www.example.com")).toBe(true);
    expect(isUrlDerivedEmployerLabel("Signal Systems")).toBe(false);

    // Strong TLD tails (case-insensitive) drop hostname leftovers without a
    // length-only short-slug ban that would also kill real brands.
    expect(isUrlDerivedEmployerLabel("Dearhiringmanager IO")).toBe(true);
    expect(isUrlDerivedEmployerLabel("Scan Com")).toBe(true);
    expect(isUrlDerivedEmployerLabel("Scan COM")).toBe(true);
    expect(isUrlDerivedEmployerLabel("Scale AI")).toBe(false);
    expect(isUrlDerivedEmployerLabel("Acme Co")).toBe(false);
    expect(isUrlDerivedEmployerLabel("Tennr")).toBe(false);
    expect(isUrlDerivedEmployerLabel("Stockx")).toBe(false);

    expect(formatEmployerLabelFromSlug("signal-systems")).toBe(
      "Signal Systems",
    );
    expect(formatEmployerLabelFromSlug("scale-ai")).toBe("Scale AI");
    expect(formatEmployerLabelFromSlug("tennr")).toBe("Tennr");
    expect(formatEmployerLabelFromSlug("stockx")).toBe("Stockx");
    expect(formatEmployerLabelFromSlug("green-usd")).toBeNull();
    expect(formatEmployerLabelFromSlug("strongholdpay")).toBeNull();
    expect(formatEmployerLabelFromSlug("therichmondmarketing-com")).toBeNull();
    expect(formatEmployerLabelFromSlug("scan-com")).toBeNull();
    expect(formatEmployerLabelFromSlug("dearhiringmanager-io")).toBeNull();

    expect(sanitizeEmployerLabel("Employer not stated")).toBeNull();
    expect(sanitizeEmployerLabel("Https Therichmondmarketing Com")).toBeNull();
    expect(sanitizeEmployerLabel("Dearhiringmanager IO")).toBeNull();
    expect(sanitizeEmployerLabel("Scan Com")).toBeNull();
    expect(sanitizeEmployerLabel("Strongholdpay")).toBeNull();
    expect(sanitizeEmployerLabel("Tennr")).toBe("Tennr");
    expect(sanitizeEmployerLabel("Stockx")).toBe("Stockx");
    expect(sanitizeEmployerLabel("Scale AI")).toBe("Scale AI");
    expect(sanitizeObservedEmployerLabel("Confidential")).toBe("Confidential");
    expect(sanitizeObservedEmployerLabel("Confidential Careers")).toBe(
      "Confidential Careers",
    );
    expect(sanitizeObservedEmployerLabel("Scan Com")).toBeNull();
    expect(isListableCompanyName("Https Therichmondmarketing Com")).toBe(false);
    expect(isListableCompanyName("Dearhiringmanager IO")).toBe(false);
  });

  it("defaults legacy alias identity authority to unknown", () => {
    const company = CompanyEntitySchema.parse({
      id: "company-1",
      canonicalName: "Acme",
      aliases: [
        {
          alias: "Acme Corporation",
          normalized: "acme corporation",
          confidence: 1,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    expect(company.aliases[0]?.identityAuthority).toBe("unknown");
  });

  it("round-trips explicit alias identity authority values", () => {
    for (const identityAuthority of [
      "unknown",
      "user_approved_merge",
    ] as const) {
      expect(
        CompanyAliasSchema.parse({
          alias: "Acme Corporation",
          normalized: "acme corporation",
          confidence: 1,
          identityAuthority,
        }),
      ).toEqual({
        alias: "Acme Corporation",
        normalized: "acme corporation",
        confidence: 1,
        identityAuthority,
      });
    }
  });

  it("rejects invalid alias identity authority", () => {
    expect(
      CompanyAliasSchema.safeParse({
        alias: "Acme Corporation",
        normalized: "acme corporation",
        confidence: 1,
        identityAuthority: "automatic",
      }).success,
    ).toBe(false);
  });

  it("keeps merge review candidates pending by default", () => {
    const candidate = CompanyMergeReviewCandidateSchema.parse({
      candidateCompanyId: "company-2",
      reason: "Same careers domain",
    });

    expect(candidate.decision).toBe("pending");
    expect(candidate.decidedAt).toBeNull();
    expect(candidate.requiresUserDecision).toBe(true);
  });

  it("rejects automatic merge decisions", () => {
    const parseCandidate = (overrides: Record<string, unknown>) =>
      CompanyMergeReviewCandidateSchema.safeParse({
        candidateCompanyId: "company-2",
        reason: "Same careers domain",
        ...overrides,
      });

    expect(parseCandidate({ decision: "merged" }).success).toBe(false);
  });

  it("defaults company preference to neutral", () => {
    const company = CompanyEntitySchema.parse({
      id: "company-1",
      canonicalName: "Acme",
      createdAt: now,
      updatedAt: now,
    });

    expect(company.preference).toBe("neutral");
    expect(company.preferenceReason).toBeNull();
    expect(company.aliases).toEqual([]);
    expect(company.domains).toEqual([]);
    expect(company.mergeReviewCandidates).toEqual([]);
    expect(company.contacts).toEqual([]);
    expect(company.notes).toEqual([]);
    expect(company.sourceHistory).toEqual([]);
    expect(company.applicationRecordIds).toEqual([]);
  });

  it("allows only one primary domain", () => {
    expect(
      CompanyEntitySchema.safeParse({
        id: "company-1",
        canonicalName: "Acme",
        createdAt: now,
        updatedAt: now,
        domains: [
          { domain: "acme.com", primary: true },
          { domain: "acme.io", primary: true },
        ],
      }).success,
    ).toBe(false);
    expect(
      CompanyEntitySchema.safeParse({
        id: "company-1",
        canonicalName: "Acme",
        createdAt: now,
        updatedAt: now,
        domains: [{ domain: "acme.com", primary: true }],
      }).success,
    ).toBe(true);
  });

  it("rejects malformed company domains", () => {
    expect(
      CompanyEntitySchema.safeParse({
        id: "company-1",
        canonicalName: "Acme",
        createdAt: now,
        updatedAt: now,
        domains: [{ domain: "not-a-domain" }],
      }).success,
    ).toBe(false);
  });

  it("defaults salary/offer evidence to an empty list", () => {
    const company = CompanyEntitySchema.parse({
      id: "company-1",
      canonicalName: "Acme",
      createdAt: now,
      updatedAt: now,
    });

    expect(company.salaryOfferEvidence).toEqual([]);
  });
});

describe("company salary/offer evidence", () => {
  const validEvidence = (overrides: Record<string, unknown> = {}) => ({
    id: "evidence-1",
    kind: "offer",
    summary: "Verbal offer of 190k",
    currency: "USD",
    minimum: 190000,
    maximum: 190000,
    period: "year",
    offerStatus: "active",
    jobId: null,
    applicationRecordId: null,
    source: "manual",
    recordedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  it("parses a fully specified offer record", () => {
    const evidence = CompanySalaryOfferEvidenceSchema.parse(validEvidence());
    expect(evidence).toMatchObject({
      kind: "offer",
      summary: "Verbal offer of 190k",
      offerStatus: "active",
    });
  });

  it("defaults kinds, source, and optional money fields safely", () => {
    const evidence = CompanySalaryOfferEvidenceSchema.parse({
      id: "evidence-1",
      summary: "Glassdoor range",
      recordedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    expect(evidence.kind).toBe("note");
    expect(evidence.source).toBe("manual");
    expect(evidence.currency).toBeNull();
    expect(evidence.minimum).toBeNull();
    expect(evidence.maximum).toBeNull();
    expect(evidence.period).toBeNull();
    expect(evidence.offerStatus).toBeNull();
  });

  it("rejects a maximum below the minimum", () => {
    expect(
      CompanySalaryOfferEvidenceSchema.safeParse(
        validEvidence({ minimum: 200000, maximum: 190000 }),
      ).success,
    ).toBe(false);
  });

  it("requires an explicit currency when money is present", () => {
    expect(
      CompanySalaryOfferEvidenceSchema.safeParse(
        validEvidence({ currency: null }),
      ).success,
    ).toBe(false);
    expect(
      CompanySalaryOfferEvidenceSchema.safeParse(
        validEvidence({ minimum: null, maximum: null, period: null }),
      ).success,
    ).toBe(true);
  });

  it("rejects a period without any amount", () => {
    expect(
      CompanySalaryOfferEvidenceSchema.safeParse(
        validEvidence({ minimum: null, maximum: null, period: "year" }),
      ).success,
    ).toBe(false);
  });

  it("never carries submission or approval authority", () => {
    expect(
      CompanySalaryOfferEvidenceSchema.safeParse(
        validEvidence({ submitAuthorized: true }),
      ).success,
    ).toBe(false);
    expect(
      CompanySalaryOfferEvidenceSchema.safeParse(
        validEvidence({ approvedAt: now }),
      ).success,
    ).toBe(false);
  });
});

describe("company intelligence mutations", () => {
  const contact = {
    id: "contact-1",
    name: "Ada",
    role: null,
    email: null,
    phone: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
  const note = {
    id: "note-1",
    body: "First call went well",
    createdAt: now,
    updatedAt: now,
  };
  const evidence = {
    id: "evidence-1",
    summary: "Offer 190k",
    currency: "USD",
    minimum: 190000,
    maximum: 190000,
    period: "year",
    offerStatus: "active",
    jobId: null,
    applicationRecordId: null,
    source: "manual",
    recordedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  it("accepts each local mutation kind", () => {
    for (const mutation of [
      { type: "upsert_contact", contact },
      { type: "remove_contact", contactId: "contact-1" },
      { type: "add_note", note },
      { type: "remove_note", noteId: "note-1" },
      { type: "upsert_salary_offer_evidence", evidence },
      { type: "remove_salary_offer_evidence", evidenceId: "evidence-1" },
    ] as const) {
      expect(
        CompanyIntelligenceMutationSchema.safeParse(mutation).success,
      ).toBe(true);
      expect(
        CompanyIntelligenceMutationInputSchema.safeParse({
          companyId: "company-1",
          expectedUpdatedAt: now,
          mutation,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown mutation kinds and authority-carrying payloads", () => {
    expect(
      CompanyIntelligenceMutationSchema.safeParse({
        type: "merge_companies",
        companyId: "company-2",
      } as unknown).success,
    ).toBe(false);
    expect(
      CompanyIntelligenceMutationSchema.safeParse({
        type: "upsert_contact",
        contact: { ...contact, submitAuthorized: true },
      }).success,
    ).toBe(false);
  });

  it("requires exact lineage fields for new salary and offer evidence", () => {
    const mutation = (overrides: Record<string, unknown>) => ({
      type: "upsert_salary_offer_evidence",
      evidence: { ...evidence, ...overrides },
    });

    expect(
      CompanyIntelligenceMutationSchema.safeParse(
        mutation({ kind: "listed_salary" }),
      ).success,
    ).toBe(false);
    expect(
      CompanyIntelligenceMutationSchema.safeParse(
        mutation({ kind: "listed_salary", jobId: "job-1" }),
      ).success,
    ).toBe(true);
    expect(
      CompanyIntelligenceMutationSchema.safeParse(
        mutation({ kind: "offer", jobId: "job-1" }),
      ).success,
    ).toBe(false);
    expect(
      CompanyIntelligenceMutationSchema.safeParse(
        mutation({
          kind: "offer",
          jobId: "job-1",
          applicationRecordId: "application-1",
        }),
      ).success,
    ).toBe(true);
    expect(
      CompanyIntelligenceMutationSchema.safeParse(
        mutation({ applicationRecordId: "application-1" }),
      ).success,
    ).toBe(false);
  });

  it("requires the company scope and a compare-and-swap timestamp", () => {
    expect(
      CompanyIntelligenceMutationInputSchema.safeParse({
        companyId: "company-1",
        mutation: { type: "remove_note", noteId: "note-1" },
      } as unknown).success,
    ).toBe(false);
    expect(
      CompanyIntelligenceMutationInputSchema.safeParse({
        companyId: "company-1",
        expectedUpdatedAt: "not-a-date",
        mutation: { type: "remove_note", noteId: "note-1" },
      } as unknown).success,
    ).toBe(false);
    expect(
      CompanyIntelligenceMutationInputSchema.safeParse({
        expectedUpdatedAt: now,
        mutation: { type: "remove_note", noteId: "note-1" },
      } as unknown).success,
    ).toBe(false);
  });
});

describe("high-volume safeguards", () => {
  it("rejects invalid per-company caps", () => {
    expect(
      CompanyApplicationCapSchema.safeParse({
        id: "cap-1",
        companyId: "company-1",
        maxApplicationsPerWindow: 0,
        windowDays: 7,
        windowStartedAt: now,
        explanation: "Rate limit",
        recoveryGuidance: "Wait for the window to roll over.",
      }).success,
    ).toBe(false);

    expect(
      CompanyApplicationCapSchema.safeParse({
        id: "cap-1",
        companyId: "company-1",
        maxApplicationsPerWindow: 5,
        windowDays: 0,
        windowStartedAt: now,
        explanation: "Rate limit",
        recoveryGuidance: "Wait for the window to roll over.",
      }).success,
    ).toBe(false);

    expect(
      CompanyApplicationCapSchema.safeParse({
        id: "cap-1",
        companyId: "company-1",
        maxApplicationsPerWindow: 5,
        windowDays: 7,
        currentWindowCount: 6,
        limitReached: true,
        windowStartedAt: now,
        explanation: "Rate limit",
        recoveryGuidance: "Wait for the window to roll over.",
      }).success,
    ).toBe(true);

    expect(
      CompanyApplicationCapSchema.safeParse({
        id: "cap-1",
        companyId: "company-1",
        maxApplicationsPerWindow: 5,
        windowDays: 7,
        currentWindowCount: 6,
        limitReached: false,
        windowStartedAt: now,
        explanation: "Rate limit",
        recoveryGuidance: "Wait for the window to roll over.",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid listing signals", () => {
    const parseSignal = (overrides: Record<string, unknown>) =>
      ListingSignalRecordSchema.safeParse({
        id: "signal-1",
        jobId: "job-1",
        signal: "stale",
        detectedAt: now,
        confidence: 0.9,
        provenance: "provider",
        explanation: "Listing is stale",
        recoveryGuidance: "Pause and re-verify.",
        ...overrides,
      });

    expect(parseSignal({ signal: "open" }).success).toBe(false);
    expect(parseSignal({ signal: "" }).success).toBe(false);

    for (const signal of ["stale", "closed", "suspicious"] as const) {
      expect(parseSignal({ signal }).success).toBe(true);
    }
  });

  it("rejects abnormal failure pauses below the minimum sample", () => {
    expect(
      AbnormalFailurePauseSchema.safeParse({
        id: "pause-1",
        windowStartedAt: now,
        failuresInWindow: 2,
        sampleSize: 3,
        failureRatePercent: (2 / 3) * 100,
        minimumSample: 5,
        paused: true,
        explanation: "Elevated failure rate",
        recoveryGuidance: "Inspect the last failure evidence.",
      }).success,
    ).toBe(false);

    expect(
      AbnormalFailurePauseSchema.safeParse({
        id: "pause-1",
        windowStartedAt: now,
        failuresInWindow: 4,
        sampleSize: 6,
        failureRatePercent: (4 / 6) * 100,
        minimumSample: 5,
        paused: true,
        explanation: "Elevated failure rate",
        recoveryGuidance: "Inspect the last failure evidence.",
      }).success,
    ).toBe(true);
  });

  it("rejects out-of-range failure rates", () => {
    expect(
      AbnormalFailurePauseSchema.safeParse({
        id: "pause-1",
        windowStartedAt: now,
        failuresInWindow: 5,
        sampleSize: 5,
        failureRatePercent: 101,
        explanation: "Elevated failure rate",
        recoveryGuidance: "Inspect the last failure evidence.",
      }).success,
    ).toBe(false);
  });

  it("enforces prepared-batch sample review constraints", () => {
    expect(
      PreparedBatchSampleReviewSchema.safeParse({
        id: "review-1",
        batchId: "batch-1",
        preparedCount: 4,
        sampleCount: 5,
        explanation: "Sample review before submission",
        recoveryGuidance: "Reduce the sample to the batch size.",
      }).success,
    ).toBe(false);

    expect(
      PreparedBatchSampleReviewSchema.safeParse({
        id: "review-1",
        batchId: "batch-1",
        preparedCount: 100,
        sampleCount: 10,
        requiredSampleRatio: 0.2,
        explanation: "Sample review before submission",
        recoveryGuidance: "Review the required sample.",
      }).success,
    ).toBe(false);

    expect(
      PreparedBatchSampleReviewSchema.safeParse({
        id: "review-1",
        batchId: "batch-1",
        preparedCount: 100,
        sampleCount: 20,
        requiredSampleRatio: 0.2,
        reviewedCount: 20,
        reviewCompleted: true,
        explanation: "Sample review before submission",
        recoveryGuidance: "Review the required sample.",
      }).success,
    ).toBe(true);

    expect(
      PreparedBatchSampleReviewSchema.safeParse({
        id: "review-1",
        batchId: "batch-1",
        preparedCount: 100,
        sampleCount: 20,
        requiredSampleRatio: 0.2,
        reviewedCount: 10,
        reviewCompleted: true,
        explanation: "Sample review before submission",
        recoveryGuidance: "Review the required sample.",
      }).success,
    ).toBe(false);
  });

  it("rejects contradictory answer detections with invalid scores or identical questions", () => {
    expect(
      ContradictoryAnswerDetectionSchema.safeParse({
        id: "detection-1",
        questionA: "question-1",
        questionB: "question-2",
        answerA: "Yes",
        answerB: "No",
        contradictionScore: 1.5,
        detectedAt: now,
        explanation: "Answers conflict",
        recoveryGuidance: "Ask the user to resolve.",
      }).success,
    ).toBe(false);

    expect(
      ContradictoryAnswerDetectionSchema.safeParse({
        id: "detection-1",
        questionA: "question-1",
        questionB: "question-1",
        answerA: "Yes",
        answerB: "No",
        contradictionScore: 1,
        detectedAt: now,
        explanation: "Answers conflict",
        recoveryGuidance: "Ask the user to resolve.",
      }).success,
    ).toBe(false);

    expect(
      ContradictoryAnswerDetectionSchema.safeParse({
        id: "detection-1",
        questionA: "question-1",
        questionB: "question-2",
        answerA: "Yes",
        answerB: "No",
        contradictionScore: 0.9,
        status: "resolved",
        detectedAt: now,
        explanation: "Answers conflict",
        recoveryGuidance: "Ask the user to resolve.",
      }).success,
    ).toBe(false);
  });

  it("defaults safeguard collections to empty and safe", () => {
    const safeguards = JobFinderIntelligenceSafeguardsSchema.parse({
      updatedAt: now,
    });

    expect(safeguards.companyApplicationCaps).toEqual([]);
    expect(safeguards.simultaneousApplicationConflicts).toEqual([]);
    expect(safeguards.listingSignals).toEqual([]);
    expect(safeguards.abnormalFailurePauses).toEqual([]);
    expect(safeguards.preparedBatchSampleReviews).toEqual([]);
    expect(safeguards.contradictoryAnswerDetections).toEqual([]);
  });

  it("defaults the durable intelligence state without granting authority", () => {
    expect(JobFinderIntelligenceStateSchema.parse({})).toEqual({
      rapidReviewLogs: [],
      groupedDecisions: [],
      outcomeEvents: [],
      outcomeAnalytics: null,
      resumeStrategies: [],
      resumeStrategySelections: [],
      companies: [],
      safeguards: {
        companyApplicationCaps: [],
        simultaneousApplicationConflicts: [],
        listingSignals: [],
        abnormalFailurePauses: [],
        preparedBatchSampleReviews: [],
        contradictoryAnswerDetections: [],
        safeguardDismissals: [],
        updatedAt: null,
      },
      updatedAt: null,
    });
  });

  it("validates resume strategy recommendations without granting approval or readiness", () => {
    expect(
      ResumeStrategyRecommendationSchema.safeParse({
        jobId: "job-1",
        campaignId: "campaign-1",
        roleFamily: "Backend Engineering",
        strategyId: "strategy-1",
        strategyName: "Backend",
        source: "role_family",
        reason: "Exact enabled role family match.",
      }).success,
    ).toBe(true);

    // A non-none source must reference a strategy id.
    expect(
      ResumeStrategyRecommendationSchema.safeParse({
        jobId: "job-1",
        campaignId: "campaign-1",
        roleFamily: null,
        strategyId: null,
        strategyName: null,
        source: "campaign_default",
        reason: "Using the campaign default.",
      }).success,
    ).toBe(false);

    // A none source cannot reference a strategy id.
    expect(
      ResumeStrategyRecommendationSchema.safeParse({
        jobId: "job-1",
        campaignId: null,
        roleFamily: null,
        strategyId: "strategy-1",
        strategyName: "Backend",
        source: "none",
        reason: "No match.",
      }).success,
    ).toBe(false);

    // A role-family recommendation must expose the matched role family.
    expect(
      ResumeStrategyRecommendationSchema.safeParse({
        jobId: "job-1",
        campaignId: "campaign-1",
        roleFamily: null,
        strategyId: "strategy-1",
        strategyName: "Backend",
        source: "role_family",
        reason: "Role family match.",
      }).success,
    ).toBe(false);

    // The recommendation contract is strict and can never carry approval or
    // application-readiness authority.
    expect(
      ResumeStrategyRecommendationSchema.safeParse({
        jobId: "job-1",
        campaignId: "campaign-1",
        roleFamily: null,
        strategyId: null,
        strategyName: null,
        source: "none",
        reason: "No match.",
        approvedAt: now,
        applicationReady: true,
      }).success,
    ).toBe(false);
  });

  it("validates recommendation and campaign-default input commands", () => {
    expect(
      RecommendResumeStrategyInputSchema.safeParse({ jobId: "job-1" }).success,
    ).toBe(true);
    expect(
      RecommendResumeStrategyInputSchema.safeParse({
        jobId: "job-1",
        campaignId: "campaign-1",
      }).success,
    ).toBe(true);
    expect(
      RecommendResumeStrategyInputSchema.safeParse({ jobId: "" }).success,
    ).toBe(false);
    expect(
      RecommendResumeStrategyInputSchema.safeParse({
        jobId: "job-1",
        extra: true,
      }).success,
    ).toBe(false);

    expect(
      SetCampaignResumeStrategyDefaultInputSchema.safeParse({
        campaignId: "campaign-1",
        strategyId: "strategy-1",
      }).success,
    ).toBe(true);
    expect(
      SetCampaignResumeStrategyDefaultInputSchema.safeParse({
        campaignId: "campaign-1",
        strategyId: null,
      }).success,
    ).toBe(true);
    expect(
      SetCampaignResumeStrategyDefaultInputSchema.safeParse({
        campaignId: "campaign-1",
      }).success,
    ).toBe(false);
  });

  it("keeps the strict strategy record incapable of carrying approval or readiness flags", () => {
    expect(
      ResumeStrategySchema.safeParse({
        id: "strategy-1",
        name: "Backend",
        roleFamily: "Backend Engineering",
        baseResumeDocumentId: "document-1",
        templateId: "classic_ats",
        enabled: true,
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        applicationReady: true,
      }).success,
    ).toBe(false);
  });
});
