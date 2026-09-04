import {
  getDefaultCampaignConfiguration,
  type CampaignPauseWindow,
  type CampaignRuleFunnelProjection,
  type JobSearchCampaign,
  type JobSearchCampaignMode,
  type JobSearchCampaignSchedule,
  type JobSearchPreferences,
  type SaveCampaignRuleInput,
  type SaveJobSearchCampaignInput,
} from "@unemployed/contracts";
import { ChevronRight } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CollectionNoMatches,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";
import { CampaignConfirmDialog } from "./campaign-confirm-dialog";
import { CampaignRuleBuilder } from "./campaign-rule-builder";
import { getJobFinderDateInputLocale } from "../../lib/job-finder-date-input-locale";

const jobFinderDateInputLocale = getJobFinderDateInputLocale();

const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const runOutcomeLabels: Record<
  NonNullable<JobSearchCampaignSchedule["runFacts"]["lastRunOutcome"]>,
  string
> = {
  success: "succeeded",
  partial: "partially completed",
  failed: "failed",
  skipped: "skipped",
};

/**
 * Minute precision, no seconds: a plan card repeated the same
 * "9/2/2026, 9:14:02 PM" string twice, which read as machine output rather
 * than a fact about the run.
 */
function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(parsed));
}

function describeNextRun(schedule: JobSearchCampaignSchedule): string {
  const nextRunAt = schedule.runFacts.nextRunAt;
  if (nextRunAt === null) {
    if (!schedule.enabled || schedule.mode === "manual") {
      return "No scheduled run";
    }
    return "Next run not scheduled yet";
  }
  return formatDateTime(nextRunAt) ?? "Next run not scheduled yet";
}

function describeLastRun(schedule: JobSearchCampaignSchedule): string {
  const facts = schedule.runFacts;
  if (facts.lastRunAt === null || facts.lastRunOutcome === null) {
    return "No run yet";
  }
  const outcome =
    runOutcomeLabels[facts.lastRunOutcome] ?? facts.lastRunOutcome;
  return `${outcome} · ${formatDateTime(facts.lastRunAt) ?? "unknown time"}`;
}

/** Converts a `datetime-local` input value to an ISO-8601 UTC instant. */
function toIsoDateTime(localValue: string): string | null {
  const trimmed = localValue.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function campaignToInput(
  campaign: JobSearchCampaign,
): SaveJobSearchCampaignInput {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    mode: campaign.mode,
    status: campaign.status,
    searchPreferences: campaign.searchPreferences,
    sourceTargetIds: campaign.sourceTargetIds,
    minimumFitScore: campaign.minimumFitScore,
    limits: campaign.limits,
    stopRules: campaign.stopRules,
    applicationPolicy: campaign.applicationPolicy,
    schedule: campaign.schedule,
    rules: campaign.rules,
    latestDigest: campaign.latestDigest,
  };
}

function newCampaignFrom(
  campaign: JobSearchCampaign | null,
): SaveJobSearchCampaignInput {
  const defaults = getDefaultCampaignConfiguration("precision");
  const searchPreferences: JobSearchPreferences =
    campaign?.searchPreferences ?? {
      targetRoles: [],
      jobFamilies: [],
      locations: [],
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
        minimum: null,
        maximum: null,
        interval: "year",
        currency: null,
        currencyStatus: "needs_clarification",
      },
      approvalMode: "review_before_submit",
      tailoringMode: "balanced",
      companyBlacklist: [],
      companyWhitelist: [],
      discovery: {
        targets: [],
        historyLimit: 5,
      },
    };
  return {
    id: null,
    name: "New search plan",
    description: "",
    mode: "precision",
    status: "active",
    searchPreferences,
    sourceTargetIds: campaign?.sourceTargetIds ?? [],
    minimumFitScore: campaign?.minimumFitScore ?? null,
    limits: defaults.limits,
    stopRules: defaults.stopRules,
    applicationPolicy: defaults.applicationPolicy,
    rules: [],
    latestDigest: null,
    schedule: {
      mode: "manual",
      enabled: false,
      daysOfWeek: [],
      localStartTime: null,
      timeZone: null,
      pauseWindows: [],
      runFacts: {
        nextRunAt: null,
        lastRunAt: null,
        lastRunOutcome: null,
        lastRunSummary: null,
        consecutiveFailures: 0,
      },
    },
  };
}

function CampaignEditor(props: {
  campaign: SaveJobSearchCampaignInput;
  isCurrentPlan: boolean;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (campaign: SaveJobSearchCampaignInput) => Promise<boolean>;
  pending: boolean;
}) {
  const [initialCampaign] = useState(props.campaign);
  const [draft, setDraft] = useState(props.campaign);
  const [pauseWindowStartsAt, setPauseWindowStartsAt] = useState("");
  const [pauseWindowEndsAt, setPauseWindowEndsAt] = useState("");
  const [pauseWindowReason, setPauseWindowReason] = useState("");
  const [archiveOutcome, setArchiveOutcome] = useState<
    "archived" | "failed" | null
  >(null);
  const [saveOutcome, setSaveOutcome] = useState<"saved" | null>(null);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const dirty = draft !== initialCampaign;
  useEffect(() => {
    props.onDirtyChange?.(dirty);
  }, [dirty, props.onDirtyChange]);

  const requestCancel = () => {
    if (!dirty) {
      props.onCancel();
      return;
    }
    // Dirty editors meet an app-owned confirmation instead of a native
    // window.confirm; staying is the safe default.
    setDiscardConfirmationOpen(true);
  };
  const pauseWindowStart = toIsoDateTime(pauseWindowStartsAt);
  const pauseWindowEnd = toIsoDateTime(pauseWindowEndsAt);
  const pauseWindowValidationMessage =
    pauseWindowStartsAt.trim() && pauseWindowStart === null
      ? "Enter a valid pause start date and time."
      : pauseWindowEndsAt.trim() && pauseWindowEnd === null
        ? "Enter a valid pause end date and time."
        : pauseWindowStart !== null &&
            pauseWindowEnd !== null &&
            Date.parse(pauseWindowEnd) <= Date.parse(pauseWindowStart)
          ? "Pause window end must be later than its start."
          : null;
  const updateMode = (mode: JobSearchCampaignMode) => {
    const defaults = getDefaultCampaignConfiguration(mode);
    setDraft((current) => ({
      ...current,
      mode,
      limits: {
        ...current.limits,
        retainedJobTarget: defaults.limits.retainedJobTarget,
        analysisConcurrency: defaults.limits.analysisConcurrency,
        discoveryRunJobBudget: defaults.limits.discoveryRunJobBudget,
      },
    }));
  };

  const updateSchedule = (patch: Partial<JobSearchCampaignSchedule>) => {
    setDraft((current) => ({
      ...current,
      schedule: { ...current.schedule, ...patch },
    }));
  };

  const addPauseWindow = () => {
    if (
      pauseWindowStart === null ||
      pauseWindowEnd === null ||
      pauseWindowValidationMessage !== null
    ) {
      return;
    }
    const window: CampaignPauseWindow = {
      id: `pause_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startsAt: pauseWindowStart,
      endsAt: pauseWindowEnd,
      reason: pauseWindowReason.trim() || null,
      enabled: true,
    };
    updateSchedule({ pauseWindows: [...draft.schedule.pauseWindows, window] });
    setPauseWindowStartsAt("");
    setPauseWindowEndsAt("");
    setPauseWindowReason("");
  };

  const updatePauseWindow = (
    windowId: string,
    patch: Partial<CampaignPauseWindow>,
  ) => {
    updateSchedule({
      pauseWindows: draft.schedule.pauseWindows.map((window) =>
        window.id === windowId ? { ...window, ...patch } : window,
      ),
    });
  };

  const removePauseWindow = (windowId: string) => {
    updateSchedule({
      pauseWindows: draft.schedule.pauseWindows.filter(
        (window) => window.id !== windowId,
      ),
    });
  };

  const saveDraft = () => {
    setSaveOutcome(null);
    if (!(props.isCurrentPlan && draft.status === "archived")) {
      void props.onSave(draft).then((saved) => {
        if (saved && initialCampaign.id !== null) {
          setSaveOutcome("saved");
        }
      });
      return;
    }
    setArchiveOutcome(null);
    void props.onSave(draft).then((saved) => {
      setArchiveOutcome(saved ? "archived" : "failed");
    });
  };

  return (
    <>
      <form
        className="surface-panel-shell grid gap-5 rounded-(--radius-panel) border border-(--surface-panel-border) p-5"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            requestCancel();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          saveDraft();
        }}
      >
        <div>
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
            Search plan setup
          </p>
          <h2 className="mt-1 font-semibold text-(--text-headline)">
            {draft.id ? "Edit search plan" : "Create search plan"}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Name</span>
            <Input
              maxLength={120}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              required
              value={draft.name}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Volume</span>
            <select
              aria-label="Volume"
              className="h-10 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-3 outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]"
              onChange={(event) =>
                updateMode(event.target.value as JobSearchCampaignMode)
              }
              value={draft.mode}
            >
              <option value="precision">
                Precision — a smaller discovery pool
              </option>
              <option value="scale">Scale — a larger discovery pool</option>
            </select>
            <span className="text-xs text-foreground-muted">
              {draft.mode === "scale"
                ? "Use Scale to discover and retain a larger pool of matching jobs."
                : "Use Precision for a smaller discovery pool focused on the strongest matches."}
            </span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Status</span>
            <select
              className="h-10 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-3 outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target
                    .value as SaveJobSearchCampaignInput["status"],
                })
              }
              value={draft.status}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        {props.isCurrentPlan && draft.status === "archived" ? (
          <p className="text-sm text-foreground-muted">
            Archiving your current plan is allowed. When other non-archived
            plans remain, one of them becomes your current plan automatically.
          </p>
        ) : null}
        {archiveOutcome === "archived" && draft.status === "archived" ? (
          <p className="text-sm text-foreground" role="status">
            Search plan archived.
          </p>
        ) : null}
        {archiveOutcome === "failed" && draft.status === "archived" ? (
          <p className="text-sm text-destructive" role="alert">
            Archiving failed. Your search plan is unchanged.
          </p>
        ) : null}
        {saveOutcome === "saved" ? (
          <p className="text-sm text-foreground" role="status">
            Search plan saved.
          </p>
        ) : null}
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Plan purpose</span>
          <textarea
            className="min-h-20 rounded-(--radius-field) border border-(--field-border) bg-(--field) p-3 outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]"
            maxLength={2_000}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
            placeholder="Example: Remote TypeScript roles with strong product ownership"
            value={draft.description}
          />
        </label>

        <details
          className="rounded-(--radius-field) border border-border-subtle p-4"
          open
        >
          <summary className="cursor-pointer font-semibold text-(--text-headline)">
            Roles, locations, and work style
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Target roles</span>
              <Input
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    searchPreferences: {
                      ...draft.searchPreferences,
                      targetRoles: splitList(event.target.value),
                    },
                  })
                }
                placeholder="Software engineer, Frontend engineer"
                value={draft.searchPreferences.targetRoles.join(", ")}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Preferred locations</span>
              <Input
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    searchPreferences: {
                      ...draft.searchPreferences,
                      locations: splitList(event.target.value),
                    },
                  })
                }
                placeholder="Worldwide remote, Prishtina"
                value={draft.searchPreferences.locations.join(", ")}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Excluded locations</span>
              <Input
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    searchPreferences: {
                      ...draft.searchPreferences,
                      excludedLocations: splitList(event.target.value),
                    },
                  })
                }
                placeholder="Locations that cannot work"
                value={draft.searchPreferences.excludedLocations.join(", ")}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Excluded companies</span>
              <Input
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    searchPreferences: {
                      ...draft.searchPreferences,
                      companyBlacklist: splitList(event.target.value),
                    },
                  })
                }
                placeholder="Companies to skip"
                value={draft.searchPreferences.companyBlacklist.join(", ")}
              />
            </label>
            <fieldset className="grid gap-2 sm:col-span-2">
              <legend className="text-sm">Work modes</legend>
              <div className="flex flex-wrap gap-4">
                {(["remote", "hybrid", "onsite", "flexible"] as const).map(
                  (mode) => (
                    <label
                      className="flex items-center gap-2 text-sm capitalize"
                      key={mode}
                    >
                      <input
                        checked={draft.searchPreferences.workModes.includes(
                          mode,
                        )}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            searchPreferences: {
                              ...draft.searchPreferences,
                              workModes: event.target.checked
                                ? [...draft.searchPreferences.workModes, mode]
                                : draft.searchPreferences.workModes.filter(
                                    (item) => item !== mode,
                                  ),
                            },
                          })
                        }
                        type="checkbox"
                      />
                      {mode}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          </div>
        </details>

        <details className="rounded-(--radius-field) border border-border-subtle p-4">
          <summary className="cursor-pointer font-semibold text-(--text-headline)">
            Sources and compensation
          </summary>
          <div className="mt-4 grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm">Included sources</legend>
              <div className="grid max-h-44 gap-2 overflow-y-auto rounded-(--radius-field) border border-border-subtle p-3 sm:grid-cols-2">
                {draft.searchPreferences.discovery.targets.map((target) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={target.id}
                  >
                    <input
                      checked={target.enabled}
                      onChange={(event) => {
                        const nextTargets =
                          draft.searchPreferences.discovery.targets.map(
                            (candidate) =>
                              candidate.id === target.id
                                ? {
                                    ...candidate,
                                    enabled: event.target.checked,
                                  }
                                : candidate,
                          );
                        setDraft({
                          ...draft,
                          searchPreferences: {
                            ...draft.searchPreferences,
                            discovery: {
                              ...draft.searchPreferences.discovery,
                              targets: nextTargets,
                            },
                          },
                          // Keep the saved projection aligned with the plan's
                          // own targets; the service derives the same ids from
                          // `target.enabled`.
                          sourceTargetIds: nextTargets
                            .filter((candidate) => candidate.enabled)
                            .map((candidate) => candidate.id),
                        });
                      }}
                      type="checkbox"
                    />
                    {target.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="grid gap-1 text-sm">
                <span>Minimum compensation</span>
                <Input
                  min={0}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      searchPreferences: {
                        ...draft.searchPreferences,
                        compensation: {
                          ...draft.searchPreferences.compensation,
                          minimum: event.target.value
                            ? Number(event.target.value)
                            : null,
                        },
                      },
                    })
                  }
                  type="number"
                  value={draft.searchPreferences.compensation.minimum ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Currency</span>
                <Input
                  maxLength={3}
                  onChange={(event) => {
                    const currency = event.target.value.trim().toUpperCase();
                    setDraft({
                      ...draft,
                      searchPreferences: {
                        ...draft.searchPreferences,
                        compensation: {
                          ...draft.searchPreferences.compensation,
                          currency: currency || null,
                          currencyStatus: currency
                            ? "explicit"
                            : "needs_clarification",
                        },
                      },
                    });
                  }}
                  placeholder="USD"
                  value={draft.searchPreferences.compensation.currency ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Target compensation</span>
                <Input
                  min={0}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      searchPreferences: {
                        ...draft.searchPreferences,
                        compensation: {
                          ...draft.searchPreferences.compensation,
                          maximum: event.target.value
                            ? Number(event.target.value)
                            : null,
                        },
                      },
                    })
                  }
                  type="number"
                  value={draft.searchPreferences.compensation.maximum ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Pay interval</span>
                <select
                  className="h-10 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-3 outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      searchPreferences: {
                        ...draft.searchPreferences,
                        compensation: {
                          ...draft.searchPreferences.compensation,
                          interval: event.target
                            .value as typeof draft.searchPreferences.compensation.interval,
                        },
                      },
                    })
                  }
                  value={draft.searchPreferences.compensation.interval}
                >
                  <option value="hour">Hourly</option>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </label>
            </div>
          </div>
        </details>

        <section className="grid gap-3 rounded-(--radius-field) border border-border-subtle p-4">
          <div>
            <h3 className="font-semibold text-(--text-headline)">
              Discovery volume and review threshold
            </h3>
            <p className="text-xs text-foreground-muted">
              Minimum fit and retention shape which discovered jobs stay in this
              plan.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Minimum fit score</span>
              <Input
                max={100}
                min={0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    minimumFitScore: Number(event.target.value),
                  })
                }
                type="number"
                value={draft.minimumFitScore ?? 0}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Jobs to retain</span>
              <Input
                max={10_000}
                min={1}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    limits: {
                      ...draft.limits,
                      retainedJobTarget: Number(event.target.value),
                    },
                  })
                }
                type="number"
                value={draft.limits.retainedJobTarget}
              />
            </label>
          </div>
        </section>

        <details className="rounded-(--radius-field) border border-border-subtle p-4">
          <summary className="cursor-pointer font-semibold text-(--text-headline)">
            Saved safety and automation policy
          </summary>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>Pause above failure rate (%)</span>
                <Input
                  max={100}
                  min={1}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      stopRules: {
                        ...draft.stopRules,
                        pauseOnFailureRatePercent: Number(event.target.value),
                      },
                    })
                  }
                  type="number"
                  value={draft.stopRules.pauseOnFailureRatePercent}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>After at least this many attempts</span>
                <Input
                  min={1}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      stopRules: {
                        ...draft.stopRules,
                        failureRateMinimumSample: Number(event.target.value),
                      },
                    })
                  }
                  type="number"
                  value={draft.stopRules.failureRateMinimumSample}
                />
              </label>
            </div>
            <p className="text-xs text-foreground-muted">
              Failure-rate and page-change stop rules are enforced by the
              preparation runner: it pauses on configured login blockers,
              changed or unexpected forms, unresolved eligibility, and a
              configured cumulative blocked/failed rate after its minimum
              sample.
            </p>
            {(
              [
                ["pauseOnChangedForm", "Pause if an application form changes"],
                [
                  "pauseOnUncertainEligibility",
                  "Pause when eligibility is uncertain",
                ],
                ["pauseOnLoginRequired", "Pause when a source needs sign-in"],
              ] as const
            ).map(([key, label]) => (
              <label className="flex items-center gap-2 text-sm" key={key}>
                <input
                  checked={draft.stopRules[key]}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      stopRules: {
                        ...draft.stopRules,
                        [key]: event.target.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                {label}
              </label>
            ))}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={draft.schedule.enabled}
                  onChange={(event) =>
                    updateSchedule({ enabled: event.target.checked })
                  }
                  type="checkbox"
                />
                Enable schedule
              </label>
              <label className="grid gap-1 text-sm">
                <span>Schedule mode</span>
                <select
                  className="h-10 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-3 outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]"
                  disabled={!draft.schedule.enabled}
                  onChange={(event) =>
                    updateSchedule({
                      mode: event.target
                        .value as JobSearchCampaignSchedule["mode"],
                    })
                  }
                  value={draft.schedule.mode}
                >
                  <option value="manual">Manual only</option>
                  <option value="daily">Daily</option>
                  <option value="selected_days">Selected days</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>Local start time</span>
                <Input
                  disabled={!draft.schedule.enabled}
                  onChange={(event) =>
                    updateSchedule({
                      localStartTime: event.target.value || null,
                    })
                  }
                  type="time"
                  value={draft.schedule.localStartTime ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Time zone</span>
                <Input
                  disabled={!draft.schedule.enabled}
                  onChange={(event) =>
                    updateSchedule({ timeZone: event.target.value || null })
                  }
                  placeholder="Europe/Belgrade"
                  value={draft.schedule.timeZone ?? ""}
                />
              </label>
            </div>
            {draft.schedule.enabled &&
            draft.schedule.mode === "selected_days" ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm">Schedule days</legend>
                <div className="flex flex-wrap gap-3">
                  {[
                    [1, "Mon"],
                    [2, "Tue"],
                    [3, "Wed"],
                    [4, "Thu"],
                    [5, "Fri"],
                    [6, "Sat"],
                    [0, "Sun"],
                  ].map(([day, label]) => (
                    <label
                      className="flex items-center gap-1.5 text-sm"
                      key={day}
                    >
                      <input
                        checked={draft.schedule.daysOfWeek.includes(
                          day as number,
                        )}
                        onChange={(event) =>
                          updateSchedule({
                            daysOfWeek: event.target.checked
                              ? [...draft.schedule.daysOfWeek, day as number]
                              : draft.schedule.daysOfWeek.filter(
                                  (savedDay) => savedDay !== day,
                                ),
                          })
                        }
                        type="checkbox"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {draft.schedule.enabled && draft.schedule.mode !== "manual" ? (
              <p className="text-xs text-foreground-muted">
                The local scheduler runs this search plan automatically when its
                next run time is due, then persists the new next run. Pause
                windows and the global activity pause hold the run until they
                end.
              </p>
            ) : null}
            <fieldset className="grid gap-2">
              <legend className="text-sm">Pause windows</legend>
              <p className="text-xs text-foreground-muted">
                While any enabled pause window is active, a due scheduled run is
                held and executes once when the window ends. Manual Run now is
                not blocked by pause windows.
              </p>
              {draft.schedule.pauseWindows.length === 0 ? (
                <p className="text-xs text-foreground-muted">
                  No pause windows yet.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {draft.schedule.pauseWindows.map((window) => (
                    <li
                      className="grid gap-2 rounded-(--radius-field) border border-border-subtle p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                      key={window.id}
                    >
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          checked={window.enabled}
                          onChange={(event) =>
                            updatePauseWindow(window.id, {
                              enabled: event.target.checked,
                            })
                          }
                          type="checkbox"
                        />
                        {window.enabled ? "Active" : "Disabled"}
                      </label>
                      <div className="text-sm text-foreground-soft">
                        {formatDateTime(window.startsAt) ?? window.startsAt} →{" "}
                        {formatDateTime(window.endsAt) ?? window.endsAt}
                        {window.reason ? ` · ${window.reason}` : ""}
                      </div>
                      <Button
                        onClick={() => removePauseWindow(window.id)}
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="grid gap-1 text-sm">
                  <span>Starts</span>
                  <Input
                    aria-label="Pause window starts"
                    aria-describedby={
                      pauseWindowValidationMessage
                        ? "pause-window-validation"
                        : undefined
                    }
                    aria-invalid={
                      pauseWindowValidationMessage !== null &&
                      (pauseWindowStart === null || pauseWindowEnd !== null)
                    }
                    onChange={(event) =>
                      setPauseWindowStartsAt(event.target.value)
                    }
                    lang={jobFinderDateInputLocale}
                    type="datetime-local"
                    value={pauseWindowStartsAt}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Ends</span>
                  <Input
                    aria-label="Pause window ends"
                    aria-describedby={
                      pauseWindowValidationMessage
                        ? "pause-window-validation"
                        : undefined
                    }
                    aria-invalid={
                      pauseWindowValidationMessage !== null &&
                      (pauseWindowEnd === null || pauseWindowStart !== null)
                    }
                    onChange={(event) =>
                      setPauseWindowEndsAt(event.target.value)
                    }
                    lang={jobFinderDateInputLocale}
                    type="datetime-local"
                    value={pauseWindowEndsAt}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Reason</span>
                  <Input
                    aria-label="Pause window reason"
                    onChange={(event) =>
                      setPauseWindowReason(event.target.value)
                    }
                    placeholder="Vacation, meetings…"
                    value={pauseWindowReason}
                  />
                </label>
                <Button
                  className="self-end"
                  disabled={
                    pauseWindowStartsAt.trim().length === 0 ||
                    pauseWindowEndsAt.trim().length === 0 ||
                    pauseWindowValidationMessage !== null
                  }
                  onClick={addPauseWindow}
                  type="button"
                  variant="outline"
                >
                  Add pause window
                </Button>
              </div>
              {pauseWindowValidationMessage ? (
                <p
                  className="text-sm text-destructive"
                  id="pause-window-validation"
                  role="alert"
                >
                  {pauseWindowValidationMessage}
                </p>
              ) : null}
            </fieldset>
            <div className="grid gap-2 rounded-(--radius-field) border border-border-subtle p-3">
              <h4 className="text-sm font-semibold text-(--text-headline)">
                Run status
              </h4>
              <dl className="grid gap-1 text-sm text-foreground-soft sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-foreground-muted">Next run</dt>
                  <dd>{describeNextRun(draft.schedule)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground-muted">Last run</dt>
                  <dd>{describeLastRun(draft.schedule)}</dd>
                </div>
              </dl>
              {draft.schedule.runFacts.lastRunSummary ? (
                <p className="text-xs text-foreground-muted">
                  {draft.schedule.runFacts.lastRunSummary}
                </p>
              ) : null}
              {draft.schedule.runFacts.consecutiveFailures > 0 ? (
                <p className="text-xs text-foreground-muted">
                  {draft.schedule.runFacts.consecutiveFailures} consecutive
                  failed run
                  {draft.schedule.runFacts.consecutiveFailures === 1
                    ? ""
                    : "s"}{" "}
                  recorded.
                </p>
              ) : null}
            </div>
          </div>
        </details>

        <p className="text-xs text-foreground-muted">
          Uses{" "}
          {
            draft.searchPreferences.discovery.targets.filter(
              (target) => target.enabled,
            ).length
          }{" "}
          sources and {draft.searchPreferences.targetRoles.length} target roles
          from its saved search scope.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={requestCancel} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={draft.name.trim().length === 0}
            pending={props.pending}
            type="submit"
          >
            Save search plan
          </Button>
        </div>
      </form>
      <CampaignConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        detail={`${draft.name} still has edits that were not saved. Discarding loses them; saving keeps them. This cannot be undone.`}
        eyebrow="Unsaved search-plan draft"
        onCancel={() => setDiscardConfirmationOpen(false)}
        onConfirm={() => {
          // Close first, then cancel once: the dialog's own guard plus this
          // ordering make a double activation impossible to repeat.
          setDiscardConfirmationOpen(false);
          props.onCancel();
        }}
        open={discardConfirmationOpen}
        title="Discard unsaved search-plan changes?"
      />
    </>
  );
}

export function CampaignsScreen(props: {
  activeCampaignId: string;
  campaigns: readonly JobSearchCampaign[];
  onSaveCampaign: (campaign: SaveJobSearchCampaignInput) => Promise<boolean>;
  onDeleteCampaign?: (campaignId: string) => Promise<boolean>;
  onSelectCampaign: (campaignId: string) => void;
  onRunCampaignNow?: (campaignId: string) => void;
  runCampaignPending?: (campaignId: string) => boolean;
  pending: boolean;
  campaignRuleFunnel?: CampaignRuleFunnelProjection | null;
  campaignRulePending?: boolean;
  onDeleteCampaignRule?: (campaignId: string, ruleId: string) => void;
  onSaveCampaignRule?: (
    campaignId: string,
    rule: SaveCampaignRuleInput,
  ) => void;
  onToggleCampaignRule?: (
    campaignId: string,
    ruleId: string,
    enabled: boolean,
  ) => void;
  onRefreshCampaignRuleFunnel?: (campaignId: string) => void;
}) {
  const view = usePersistedCollectionView("campaigns", "comfortable");
  const [editing, setEditing] = useState<SaveJobSearchCampaignInput | null>(
    null,
  );
  const [editorSession, setEditorSession] = useState(0);
  const [editorDirty, setEditorDirty] = useState(false);
  const handleEditorDirtyChange = useCallback(
    (dirty: boolean) => setEditorDirty(dirty),
    [],
  );
  const [createdPlanNotice, setCreatedPlanNotice] = useState<{
    name: string;
    knownIds: readonly string[];
    resolvedId: string | null;
  } | null>(null);
  const campaignIdsRef = useRef<readonly string[]>([]);
  useEffect(() => {
    campaignIdsRef.current = props.campaigns.map((campaign) => campaign.id);
  }, [props.campaigns]);
  useEffect(() => {
    if (createdPlanNotice === null || createdPlanNotice.resolvedId !== null) {
      return;
    }
    const created = props.campaigns.find(
      (candidate) =>
        candidate.name === createdPlanNotice.name &&
        !createdPlanNotice.knownIds.includes(candidate.id),
    );
    if (created) {
      setCreatedPlanNotice({
        ...createdPlanNotice,
        resolvedId: created.id,
      });
    }
  }, [createdPlanNotice, props.campaigns]);
  const handleEditorSave = useCallback(
    (campaign: SaveJobSearchCampaignInput): Promise<boolean> =>
      Promise.resolve(props.onSaveCampaign(campaign)).then((saved) => {
        if (saved && campaign.id === null) {
          setCreatedPlanNotice({
            name: campaign.name,
            knownIds: campaignIdsRef.current,
            resolvedId: null,
          });
        }
        return saved;
      }),
    [props.onSaveCampaign],
  );

  const startEditing = useCallback((next: SaveJobSearchCampaignInput) => {
    setEditing(next);
    setEditorSession((session) => session + 1);
    setEditorDirty(false);
    setCreatedPlanNotice(null);
  }, []);

  const [pendingEditorSwitch, setPendingEditorSwitch] =
    useState<SaveJobSearchCampaignInput | null>(null);
  const beginEditing = (next: SaveJobSearchCampaignInput) => {
    if (editing !== null && editorDirty) {
      // Switching away from a dirty editor asks through the app-owned
      // confirmation dialog instead of window.confirm.
      setPendingEditorSwitch(next);
      return;
    }
    startEditing(next);
  };
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [deletePending, setDeletePending] = useState(false);
  const [deleteFailedId, setDeleteFailedId] = useState<string | null>(null);
  const confirmDeleteCampaign = (campaignId: string) => {
    if (!props.onDeleteCampaign) {
      return;
    }
    setDeletePending(true);
    void props
      .onDeleteCampaign(campaignId)
      .then((deleted) => {
        if (deleted) {
          setDeleteCandidateId(null);
          setDeleteFailedId(null);
        } else {
          setDeleteFailedId(campaignId);
        }
      })
      .finally(() => {
        setDeletePending(false);
      });
  };
  const [rulesCampaignId, setRulesCampaignId] = useState<string | null>(null);
  const rulesOpenerRef = useRef<HTMLButtonElement | null>(null);
  const wasRulesOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = wasRulesOpenRef.current;
    const isOpen = rulesCampaignId !== null;
    wasRulesOpenRef.current = isOpen;

    if (!isOpen && wasOpen) {
      rulesOpenerRef.current?.focus();
      rulesOpenerRef.current = null;
    }
  }, [rulesCampaignId]);
  const filteredCampaigns = useMemo(
    () =>
      props.campaigns.filter((campaign) =>
        matchesCollectionSearch(view.query, [
          campaign.name,
          campaign.description,
          campaign.mode,
          campaign.status,
        ]),
      ),
    [props.campaigns, view.query],
  );
  const activeCampaign =
    props.campaigns.find(
      (campaign) => campaign.id === props.activeCampaignId,
    ) ?? props.campaigns[0];
  const rulesCampaign =
    props.campaigns.find((campaign) => campaign.id === rulesCampaignId) ?? null;

  return (
    <section className="grid gap-5 pb-8">
      <PageHeader
        actions={
          // The banner below says most people should stay on the default
          // plan, so creating one is a secondary action, not the only filled
          // button on the page.
          <Button
            onClick={() =>
              beginEditing(newCampaignFrom(activeCampaign ?? null))
            }
            type="button"
            variant="secondary"
          >
            New search plan
          </Button>
        }
        description="Organize roles, sources, discovery volume, and progress into reusable plans."
        title="Search plans"
      />

      <details
        aria-labelledby="search-plans-guide"
        className="group rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-2.5 [&_summary::-webkit-details-marker]:hidden"
      >
        {/* The toggle used to sit as bare grey text at the far right edge of
            the banner, where it read as a stray label. It now sits under the
            explanation as a bordered control with a rotating chevron. */}
        <summary className="grid cursor-pointer gap-2 text-sm">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className="font-semibold text-(--text-headline)"
              id="search-plans-guide"
            >
              Search plans are optional.
            </span>
            <span className="min-w-0 flex-1 text-foreground-soft">
              The current default plan is already enough to use Find jobs.
              Create another plan when you want a reusable search setup with its
              own roles, sources, discovery volume, and progress.
            </span>
          </span>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-(--radius-button) border border-(--surface-panel-border) px-2.5 py-1 text-xs font-medium text-foreground">
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
            />
            <span className="group-open:hidden">How much a plan searches</span>
            <span className="hidden group-open:inline">
              Hide how much a plan searches
            </span>
          </span>
        </summary>
        <div className="grid gap-2 pt-2.5 text-sm text-foreground-soft sm:grid-cols-2">
          <p>
            <span className="font-medium text-foreground">Focused:</span> fewer
            jobs each run, chosen for a closer match.
          </p>
          <p>
            <span className="font-medium text-foreground">Wide:</span> more jobs
            each run, keeping more of them for review.
          </p>
        </div>
      </details>

      {editing ? (
        <CampaignEditor
          campaign={editing}
          isCurrentPlan={
            editing.id !== null && editing.id === props.activeCampaignId
          }
          key={`search-plan-editor-${editorSession}`}
          onCancel={() => {
            setEditing(null);
            setEditorDirty(false);
          }}
          onDirtyChange={handleEditorDirtyChange}
          onSave={handleEditorSave}
          pending={props.pending}
        />
      ) : null}

      {createdPlanNotice ? (
        <p
          className="flex flex-wrap items-center gap-3 rounded-(--radius-field) border border-border-subtle px-4 py-3 text-sm text-foreground"
          role="status"
        >
          {`Search plan "${createdPlanNotice.name}" created.`}
          {createdPlanNotice.resolvedId !== null ? (
            <Button
              onClick={() => {
                const resolvedId = createdPlanNotice.resolvedId;
                if (resolvedId !== null) {
                  props.onSelectCampaign(resolvedId);
                }
                setCreatedPlanNotice(null);
              }}
              size="xs"
              type="button"
              variant="outline"
            >
              Switch to it
            </Button>
          ) : null}
        </p>
      ) : null}

      {rulesCampaign ? (
        <CampaignRuleBuilder
          campaign={rulesCampaign}
          onClose={() => setRulesCampaignId(null)}
          onDeleteRule={(ruleId) =>
            props.onDeleteCampaignRule?.(rulesCampaign.id, ruleId)
          }
          onSaveRule={(rule) =>
            props.onSaveCampaignRule?.(rulesCampaign.id, rule)
          }
          onToggleRule={(ruleId, enabled) =>
            props.onToggleCampaignRule?.(rulesCampaign.id, ruleId, enabled)
          }
          pending={props.campaignRulePending ?? false}
          projection={
            props.campaignRuleFunnel?.campaignId === rulesCampaign.id
              ? props.campaignRuleFunnel
              : null
          }
        />
      ) : null}

      {/* Two rows of list chrome for a single plan is chrome, not a list.
          The search field returns once there is something to search. */}
      {props.campaigns.length > 1 ? (
        <CollectionSearchToolbar
          className="border-y-0 px-0"
          label="Search plans"
          onQueryChange={view.setQuery}
          placeholder="Search a plan by name or status"
          query={view.query}
          totalCount={props.campaigns.length}
          visibleCount={filteredCampaigns.length}
        />
      ) : null}

      {props.campaigns.length === 0 && view.query.trim() === "" ? (
        <EmptyState
          description="Create a search plan to save a reusable setup for roles, sources, discovery volume, and progress."
          title="No search plans yet"
        >
          <div className="flex justify-center">
            <Button
              onClick={() =>
                beginEditing(newCampaignFrom(activeCampaign ?? null))
              }
              type="button"
            >
              Create your first search plan
            </Button>
          </div>
        </EmptyState>
      ) : filteredCampaigns.length === 0 ? (
        <CollectionNoMatches
          noun="search plans"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : (
        <div
          className={
            filteredCampaigns.length === 1
              ? "grid gap-3"
              : "grid gap-3 xl:grid-cols-2"
          }
        >
          {filteredCampaigns.map((campaign) => {
            const active = campaign.id === props.activeCampaignId;
            const archived = campaign.status === "archived";
            return (
              <article
                className={`surface-panel-shell grid min-w-0 gap-4 rounded-(--radius-panel) border p-5 ${active ? "border-accent/60" : "border-(--surface-panel-border)"} ${archived ? "opacity-60" : ""}`}
                key={campaign.id}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        className="min-w-0 break-words font-semibold text-(--text-headline)"
                        title={campaign.name}
                      >
                        {campaign.name}
                      </h2>
                      {active ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                          Current
                        </span>
                      ) : null}
                      {archived ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    {/* "Precision volume" is internal vocabulary; the card
                        says what the setting actually does. */}
                    <p className="mt-1 text-sm capitalize text-foreground-soft">
                      {campaign.mode === "scale"
                        ? "Wider search"
                        : "Focused search"}{" "}
                      · {campaign.status}
                    </p>
                  </div>
                  <div className="grid shrink-0 justify-items-end">
                    <strong className="text-sm text-(--text-headline)">
                      {campaign.progress.jobsRetained}
                    </strong>
                    <span className="text-xs text-foreground-muted">
                      {campaign.progress.jobsRetained === 1
                        ? "job kept for review"
                        : "jobs kept for review"}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-foreground-soft">
                  {campaign.description || "No description yet."}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {/* Each number says what it counts; bare "Blocked 1" beside
                      "Remaining 1" explained neither. */}
                  <div>
                    <dt className="text-xs text-foreground-muted">
                      Jobs found
                    </dt>
                    <dd>{campaign.progress.jobsFound}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">
                      Applications prepared
                    </dt>
                    <dd>{campaign.progress.applicationsPrepared}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">
                      Waiting for you
                    </dt>
                    <dd>{campaign.progress.blockedCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">
                      Still to review
                    </dt>
                    <dd>{campaign.progress.remainingQueueSize}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-foreground-muted">Next run</dt>
                    <dd>{describeNextRun(campaign.schedule)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-foreground-muted">Last run</dt>
                    <dd>{describeLastRun(campaign.schedule)}</dd>
                  </div>
                </dl>
                {campaign.schedule.runFacts.consecutiveFailures > 0 ? (
                  <p className="text-xs text-foreground-muted">
                    {campaign.schedule.runFacts.consecutiveFailures} consecutive
                    failed run
                    {campaign.schedule.runFacts.consecutiveFailures === 1
                      ? ""
                      : "s"}{" "}
                    recorded.
                  </p>
                ) : null}
                {campaign.latestDigest ? (
                  <details className="rounded-(--radius-field) border border-(--surface-panel-border) px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      What the last run found
                    </summary>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm text-foreground-soft sm:grid-cols-6">
                      <div>
                        <dt className="text-xs text-foreground-muted">New</dt>
                        <dd>{campaign.latestDigest.counts.new}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-foreground-muted">
                          Changed
                        </dt>
                        <dd>{campaign.latestDigest.counts.changed}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-foreground-muted">
                          Reactivated
                        </dt>
                        <dd>{campaign.latestDigest.counts.reactivated}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-foreground-muted">
                          Inactive
                        </dt>
                        <dd>{campaign.latestDigest.counts.inactive}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-foreground-muted">Known</dt>
                        <dd>{campaign.latestDigest.counts.known}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-foreground-muted">
                          Skipped
                        </dt>
                        <dd>{campaign.latestDigest.counts.skipped}</dd>
                      </div>
                    </dl>
                    {campaign.latestDigest.failedSources.length > 0 ? (
                      <ul className="mt-3 grid gap-2 text-sm text-foreground-soft">
                        {campaign.latestDigest.failedSources.map((source) => (
                          <li key={source.sourceTargetId}>
                            <span className="font-medium text-foreground">
                              {source.sourceTargetId}
                            </span>{" "}
                            — {source.reason}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-foreground-muted">
                        No failed sources in this digest.
                      </p>
                    )}
                  </details>
                ) : null}
                {campaign.history.length > 0 ? (
                  <details className="rounded-(--radius-field) border border-(--surface-panel-border) px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      Recent search-plan history
                    </summary>
                    <ol className="mt-3 grid gap-2 text-sm text-foreground-soft">
                      {campaign.history.slice(0, 5).map((entry) => (
                        <li key={entry.id}>
                          <span className="font-medium text-foreground">
                            {new Date(entry.occurredAt).toLocaleString()}
                          </span>{" "}
                          — {entry.summary}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                {deleteCandidateId === campaign.id ? (
                  <div
                    aria-label={`Confirm deleting ${campaign.name}`}
                    className="grid gap-2 rounded-(--radius-field) border border-destructive/40 bg-destructive/10 p-3"
                    role="group"
                  >
                    <p className="text-sm text-foreground">
                      Permanently delete “{campaign.name}”? This cannot be
                      undone.
                    </p>
                    {active ? (
                      <p className="text-sm text-foreground-muted">
                        {props.campaigns.some(
                          (candidate) =>
                            candidate.id !== campaign.id &&
                            candidate.status !== "archived",
                        )
                          ? "This is your current plan. Your current plan switches automatically to another non-archived plan."
                          : "This is your current plan and no other non-archived plan exists. Deleting it leaves no current plan until you switch to or create one."}
                      </p>
                    ) : null}
                    {deleteFailedId === campaign.id ? (
                      <p className="text-sm text-destructive" role="alert">
                        Deleting this search plan failed. It was not removed.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        disabled={deletePending}
                        onClick={() => {
                          setDeleteCandidateId(null);
                          setDeleteFailedId(null);
                        }}
                        size="compact"
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => confirmDeleteCampaign(campaign.id)}
                        pending={deletePending}
                        size="compact"
                        type="button"
                        variant="destructive"
                      >
                        Delete plan
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {props.onRunCampaignNow ? (
                    <Button
                      onClick={() => props.onRunCampaignNow?.(campaign.id)}
                      pending={props.runCampaignPending?.(campaign.id) ?? false}
                      type="button"
                      variant="outline"
                    >
                      Run now
                    </Button>
                  ) : null}
                  <Button
                    onClick={(event) => {
                      rulesOpenerRef.current = event.currentTarget;
                      setRulesCampaignId(campaign.id);
                      props.onRefreshCampaignRuleFunnel?.(campaign.id);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Rules
                  </Button>
                  <Button
                    onClick={() => beginEditing(campaignToInput(campaign))}
                    type="button"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                  {!active && !archived ? (
                    <Button
                      onClick={() => props.onSelectCampaign(campaign.id)}
                      pending={props.pending}
                      type="button"
                      variant="outline"
                    >
                      Make current
                    </Button>
                  ) : null}
                </div>
                {/* Delete is not one of the safe actions. It sits on its own
                    row, at the opposite end, one deliberate reach away from
                    Edit. */}
                {props.onDeleteCampaign ? (
                  <div className="flex flex-wrap justify-start gap-2 border-t border-(--surface-panel-border) pt-2">
                    <Button
                      className="border-destructive/45 text-destructive hover:border-destructive hover:text-destructive"
                      onClick={() => {
                        setDeleteCandidateId(campaign.id);
                        setDeleteFailedId(null);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Delete plan
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <CampaignConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        detail={`The open search-plan editor still has unsaved edits. Switching to "${
          pendingEditorSwitch?.name ?? "another plan"
        }" now discards them. This cannot be undone.`}
        eyebrow="Unsaved search-plan draft"
        onCancel={() => setPendingEditorSwitch(null)}
        onConfirm={() => {
          const next = pendingEditorSwitch;
          // Close first so the switch runs exactly once per explicit confirm.
          setPendingEditorSwitch(null);
          if (next !== null) {
            startEditing(next);
          }
        }}
        open={pendingEditorSwitch !== null}
        title="Discard unsaved search-plan changes?"
      />
    </section>
  );
}
