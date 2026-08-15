// @vitest-environment jsdom

import {
  CampaignRuleSchema,
  CampaignRuleFunnelProjectionSchema,
  type CampaignRuleFunnelProjection,
  type JobSearchCampaign,
  type SaveCampaignRuleInput,
} from "@unemployed/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignRuleBuilder } from "./campaign-rule-builder";

afterEach(() => {
  cleanup();
});

const recordedAt = "2026-08-15T10:00:00.000Z";
const measuredAt = "2026-08-15T12:00:00.000Z";

function createRule(input: {
  id: string;
  kind: "must_have" | "prefer" | "never";
  field: string;
  operator: string;
  value: string;
  enabled?: boolean;
  effect?: unknown;
}) {
  return CampaignRuleSchema.parse({
    id: input.id,
    kind: input.kind,
    field: input.field,
    operator: input.operator,
    value: input.value,
    enabled: input.enabled ?? true,
    provenance: { source: "user", recordedAt },
    effect: input.effect,
  });
}

function createCampaign(
  rules: ReturnType<typeof createRule>[] = [],
): JobSearchCampaign {
  return {
    id: "campaign_1",
    name: "Remote TypeScript",
    description: "Focused scope",
    mode: "precision",
    status: "active",
    sourceTargetIds: ["source-1"],
    jobIds: ["job_1", "job_2"],
    minimumFitScore: 70,
    searchPreferences: {
      targetRoles: ["Software Engineer"],
      jobFamilies: [],
      locations: ["Worldwide remote"],
      excludedLocations: [],
      workModes: ["remote"],
      seniorityLevels: [],
      targetIndustries: [],
      targetCompanyStages: [],
      employmentTypes: [],
      minimumSalaryUsd: null,
      targetSalaryUsd: null,
      salaryCurrency: "USD",
      compensation: {
        minimum: 2_000,
        maximum: 4_000,
        interval: "month",
        currency: "EUR",
        currencyStatus: "explicit",
      },
      approvalMode: "manual",
      tailoringMode: "balanced",
      companyBlacklist: [],
      companyWhitelist: [],
      discovery: {
        historyLimit: 5,
        targets: [],
      },
    },
    limits: {
      retainedJobTarget: 15,
      analysisConcurrency: 2,
      preparationBatchSize: 5,
      dailyPreparationLimit: 20,
    },
    stopRules: {
      pauseOnLoginRequired: false,
      pauseOnChangedForm: true,
      pauseOnUncertainEligibility: true,
      pauseOnFailureRatePercent: 30,
      failureRateMinimumSample: 5,
    },
    applicationPolicy: {
      resumeStrategy: "job_specific",
      requireReviewBeforePreparation: true,
      requireReviewBeforeExternalWrite: true,
      finalSubmitAuthorized: false,
    },
    schedule: {
      enabled: false,
      daysOfWeek: [],
      localStartTime: null,
      timeZone: null,
    },
    progress: {
      jobsFound: 10,
      jobsRetained: 3,
      applicationsPrepared: 1,
      applicationsApplied: 0,
      currentBatchCompleted: 0,
      currentBatchTotal: 0,
      blockedCount: 0,
      remainingQueueSize: 2,
      lastRunAt: null,
      lastUpdatedAt: "2026-08-15T09:00:00.000Z",
    },
    history: [],
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
    rules,
  } as unknown as JobSearchCampaign;
}

function createProjection(
  overrides: Partial<CampaignRuleFunnelProjection> = {},
): CampaignRuleFunnelProjection {
  return CampaignRuleFunnelProjectionSchema.parse({
    campaignId: "campaign_1",
    generatedAt: measuredAt,
    rules: [
      createRule({
        id: "rule_frontend",
        kind: "must_have",
        field: "role",
        operator: "contains",
        value: "frontend",
        effect: {
          sampleSize: 2,
          removedCount: 1,
          downgradedCount: 0,
          unknownCount: 0,
          measuredAt,
        },
      }),
    ],
    disabledRuleIds: ["rule_never_acme"],
    funnel: {
      sampleSize: 2,
      hardRemovedCount: 1,
      retainedCount: 1,
      preferDowngradedCount: 0,
      uncertainCount: 0,
      confirmedRetainedCount: 1,
      rankedJobIds: ["job_2"],
      measuredAt,
    },
    ...overrides,
  });
}

function renderBuilder(props: {
  campaign?: JobSearchCampaign;
  projection?: CampaignRuleFunnelProjection | null;
  onSaveRule?: (rule: SaveCampaignRuleInput) => void;
  onClose?: () => void;
  onDeleteRule?: (ruleId: string) => void;
  onToggleRule?: (ruleId: string, enabled: boolean) => void;
}) {
  return render(
    <CampaignRuleBuilder
      campaign={props.campaign ?? createCampaign()}
      onClose={props.onClose ?? vi.fn()}
      onDeleteRule={props.onDeleteRule ?? vi.fn()}
      onSaveRule={props.onSaveRule ?? vi.fn()}
      onToggleRule={props.onToggleRule ?? vi.fn()}
      pending={false}
      projection={props.projection ?? null}
    />,
  );
}

describe("CampaignRuleBuilder", () => {
  it("shows rules grouped by kind with provenance and measured counts", () => {
    const rules = [
      createRule({
        id: "rule_frontend",
        kind: "must_have",
        field: "role",
        operator: "contains",
        value: "frontend",
        effect: {
          sampleSize: 2,
          removedCount: 1,
          downgradedCount: 0,
          unknownCount: 0,
          measuredAt,
        },
      }),
      createRule({
        id: "rule_never_acme",
        kind: "never",
        field: "company",
        operator: "equals",
        value: "Acme Corp",
        enabled: false,
      }),
      createRule({
        id: "rule_prefer_remote",
        kind: "prefer",
        field: "work_mode",
        operator: "equals",
        value: "remote",
      }),
    ];
    renderBuilder({
      campaign: createCampaign(rules),
      projection: createProjection(),
    });

    expect(screen.getByText("Must have · 1")).toBeTruthy();
    expect(screen.getByText("Prefer · 1")).toBeTruthy();
    expect(screen.getByText("Never · 1")).toBeTruthy();
    expect(screen.getByText("Role contains frontend")).toBeTruthy();
    expect(screen.getByText(/1 removed/)).toBeTruthy();
    expect(screen.getAllByText(/origin: You/)).toHaveLength(3);
    // Disabled rules are labeled and never reported as measured.
    expect(screen.getByText("Disabled — not measured")).toBeTruthy();
  });

  it("shows a truthful zeroed funnel when the campaign retains no jobs", () => {
    const zeroed = createProjection({
      rules: [],
      disabledRuleIds: [],
      funnel: {
        sampleSize: 0,
        hardRemovedCount: 0,
        retainedCount: 0,
        preferDowngradedCount: 0,
        uncertainCount: 0,
        confirmedRetainedCount: 0,
        rankedJobIds: [],
        measuredAt,
      },
    });
    renderBuilder({ projection: zeroed });
    expect(
      screen.getByText(/no funnel is projected/i),
    ).toBeTruthy();
    expect(screen.queryByText(/Hard removed/)).toBeNull();
  });

  it("searches rules by field, value, or kind and shows a no-match state", () => {
    const rules = [
      createRule({
        id: "rule_frontend",
        kind: "must_have",
        field: "role",
        operator: "contains",
        value: "frontend",
      }),
      createRule({
        id: "rule_never_acme",
        kind: "never",
        field: "company",
        operator: "equals",
        value: "Acme Corp",
      }),
    ];
    renderBuilder({ campaign: createCampaign(rules) });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search rules" }), {
      target: { value: "acme" },
    });
    expect(screen.getByText("Company equals Acme Corp")).toBeTruthy();
    expect(screen.queryByText("Role contains frontend")).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search rules" }), {
      target: { value: "no such rule" },
    });
    expect(screen.getByText("No rules match your search.")).toBeTruthy();
  });

  it("submits a new rule from the add form", () => {
    const onSaveRule = vi.fn<(rule: SaveCampaignRuleInput) => void>();
    renderBuilder({ onSaveRule });

    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "backend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    expect(onSaveRule).toHaveBeenCalledTimes(1);
    const saved = onSaveRule.mock.calls[0]?.[0];
    expect(saved?.kind).toBe("must_have");
    expect(saved?.field).toBe("role");
    expect(saved?.operator).toBe("contains");
    expect(saved?.value).toBe("backend");
    expect(saved?.provenance.source).toBe("user");
  });

  it("submits the add form on Enter from the value field", () => {
    const onSaveRule = vi.fn<(rule: SaveCampaignRuleInput) => void>();
    renderBuilder({ onSaveRule });

    const valueInput = screen.getByLabelText("Value");
    fireEvent.change(valueInput, { target: { value: "Berlin" } });
    fireEvent.keyDown(valueInput, { key: "Enter" });
    fireEvent.submit(valueInput.closest("form")!);

    expect(onSaveRule).toHaveBeenCalledTimes(1);
    expect(onSaveRule.mock.calls[0]?.[0]?.value).toBe("Berlin");
  });

  it("closes the builder on Escape", () => {
    const onClose = vi.fn();
    renderBuilder({ onClose });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
