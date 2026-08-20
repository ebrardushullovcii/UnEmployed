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
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CollectionNoMatches,
  CollectionSearchToolbar,
  CollectionSavedViews,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { PageHeader } from "../../components/page-header";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";
import { CampaignRuleBuilder } from "./campaign-rule-builder";

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

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleString();
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
    name: "New job search",
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
  onCancel: () => void;
  onSave: (campaign: SaveJobSearchCampaignInput) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(props.campaign);
  const [pauseWindowStartsAt, setPauseWindowStartsAt] = useState("");
  const [pauseWindowEndsAt, setPauseWindowEndsAt] = useState("");
  const [pauseWindowReason, setPauseWindowReason] = useState("");
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
      limits: defaults.limits,
      stopRules: defaults.stopRules,
      applicationPolicy: defaults.applicationPolicy,
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

  return (
    <form
      className="surface-panel-shell grid gap-5 rounded-(--radius-panel) border border-(--surface-panel-border) p-5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave(draft);
      }}
    >
      <div>
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
          Campaign setup
        </p>
        <h2 className="mt-1 text-xl font-semibold text-(--text-headline)">
          {draft.id ? "Edit campaign" : "Create campaign"}
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
          <span className="font-medium">Mode</span>
          <select
            className="h-10 rounded-(--radius-field) border border-input bg-(--surface-panel-raised) px-3"
            onChange={(event) =>
              updateMode(event.target.value as JobSearchCampaignMode)
            }
            value={draft.mode}
          >
            <option value="precision">
              Precision — a small, deeply reviewed shortlist
            </option>
            <option value="scale">
              Scale — a large pool processed in batches
            </option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select
            className="h-10 rounded-(--radius-field) border border-input bg-(--surface-panel-raised) px-3"
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
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Purpose</span>
        <textarea
          className="min-h-20 rounded-(--radius-field) border border-input bg-(--surface-panel-raised) p-3"
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
                      checked={draft.searchPreferences.workModes.includes(mode)}
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
                    checked={draft.sourceTargetIds.includes(target.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        sourceTargetIds: event.target.checked
                          ? [...draft.sourceTargetIds, target.id]
                          : draft.sourceTargetIds.filter(
                              (id) => id !== target.id,
                            ),
                      })
                    }
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
                className="h-10 rounded-(--radius-field) border border-input bg-(--surface-panel-raised) px-3"
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
            Volume and quality
          </h3>
          <p className="text-xs text-foreground-muted">
            Minimum fit, retention, preparation batch, and daily limit are
            enforced by the campaign runner.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
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
          <label className="grid gap-1 text-sm">
            <span>Preparation batch</span>
            <Input
              max={500}
              min={1}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  limits: {
                    ...draft.limits,
                    preparationBatchSize: Number(event.target.value),
                  },
                })
              }
              type="number"
              value={draft.limits.preparationBatchSize}
            />
          </label>
        </div>
      </section>

      <details className="rounded-(--radius-field) border border-border-subtle p-4">
        <summary className="cursor-pointer font-semibold text-(--text-headline)">
          Saved safety and automation policy
        </summary>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span>Daily preparation limit</span>
              <Input
                min={1}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    limits: {
                      ...draft.limits,
                      dailyPreparationLimit: event.target.value
                        ? Number(event.target.value)
                        : null,
                    },
                  })
                }
                type="number"
                value={draft.limits.dailyPreparationLimit ?? ""}
              />
            </label>
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
            preparation runner: it pauses on configured login blockers, changed
            or unexpected forms, unresolved eligibility, and a configured
            cumulative blocked/failed rate after its minimum sample.
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
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={draft.applicationPolicy.requireReviewBeforePreparation}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  applicationPolicy: {
                    ...draft.applicationPolicy,
                    requireReviewBeforePreparation: event.target.checked,
                  },
                })
              }
              type="checkbox"
            />
            Require review before preparing application material
          </label>
          <label className="grid gap-1 text-sm">
            <span>Resume policy</span>
            <select
              className="h-10 rounded-(--radius-field) border border-input bg-(--surface-panel-raised) px-3"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  applicationPolicy: {
                    ...draft.applicationPolicy,
                    resumeStrategy: event.target
                      .value as typeof draft.applicationPolicy.resumeStrategy,
                  },
                })
              }
              value={draft.applicationPolicy.resumeStrategy}
            >
              <option value="job_specific">One resume per job</option>
              <option value="job_family_variants">
                Reuse reviewed job-family variants
              </option>
            </select>
          </label>
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
                className="h-10 rounded-(--radius-field) border border-input bg-(--surface-panel-raised) px-3"
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
          {draft.schedule.enabled && draft.schedule.mode === "selected_days" ? (
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
              The local scheduler runs this campaign automatically when its next
              run time is due, then persists the new next run. Pause windows and
              the global activity pause hold the run until they end.
            </p>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="text-sm">Pause windows</legend>
            <p className="text-xs text-foreground-muted">
              While any enabled pause window is active, a due scheduled run is
              held and executes once when the window ends. Manual Run now is not
              blocked by pause windows.
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
                  onChange={(event) => setPauseWindowEndsAt(event.target.value)}
                  type="datetime-local"
                  value={pauseWindowEndsAt}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Reason</span>
                <Input
                  aria-label="Pause window reason"
                  onChange={(event) => setPauseWindowReason(event.target.value)}
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
                {draft.schedule.runFacts.consecutiveFailures} consecutive failed
                run
                {draft.schedule.runFacts.consecutiveFailures === 1
                  ? ""
                  : "s"}{" "}
                recorded.
              </p>
            ) : null}
          </div>
          <p className="text-xs text-foreground-muted">
            Final submission remains locked. This campaign can prepare work, but
            it cannot authorize an external submit.
          </p>
        </div>
      </details>

      <p className="text-xs text-foreground-muted">
        Uses {draft.sourceTargetIds.length} sources and{" "}
        {draft.searchPreferences.targetRoles.length} target roles from its saved
        search scope.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={props.onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button
          disabled={draft.name.trim().length === 0}
          pending={props.pending}
          type="submit"
        >
          Save campaign
        </Button>
      </div>
    </form>
  );
}

export function CampaignsScreen(props: {
  activeCampaignId: string;
  campaigns: readonly JobSearchCampaign[];
  onSaveCampaign: (campaign: SaveJobSearchCampaignInput) => void;
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          compact
          eyebrow="Job Finder"
          title="Campaigns"
          description="Keep different job searches separate, with their own scope, volume, safety rules, and progress."
        />
        <Button
          onClick={() => setEditing(newCampaignFrom(activeCampaign ?? null))}
          type="button"
        >
          New campaign
        </Button>
      </div>

      {editing ? (
        <CampaignEditor
          campaign={editing}
          onCancel={() => setEditing(null)}
          onSave={(campaign) => props.onSaveCampaign(campaign)}
          pending={props.pending}
        />
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

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[min(100%,24rem)] flex-1">
          <CollectionSearchToolbar
            density={view.density}
            label="Search campaigns"
            onDensityChange={view.setDensity}
            onQueryChange={view.setQuery}
            placeholder="Search campaign name, mode, or status"
            query={view.query}
            totalCount={props.campaigns.length}
            visibleCount={filteredCampaigns.length}
          />
        </div>
        <CollectionSavedViews
          onApply={view.applySavedView}
          onDelete={view.deleteSavedView}
          onSave={(name) => view.saveCurrentView(name)}
          views={view.savedViews}
        />
      </div>

      {filteredCampaigns.length === 0 ? (
        <CollectionNoMatches
          noun="campaigns"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredCampaigns.map((campaign) => {
            const active = campaign.id === props.activeCampaignId;
            return (
              <article
                className={`surface-panel-shell grid min-w-0 gap-4 rounded-(--radius-panel) border p-5 ${active ? "border-accent/60" : "border-(--surface-panel-border)"}`}
                key={campaign.id}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        className="min-w-0 break-words text-lg font-semibold text-(--text-headline)"
                        title={campaign.name}
                      >
                        {campaign.name}
                      </h2>
                      {active ? (
                        <span className="rounded-full border border-accent/45 px-2 py-0.5 text-xs text-accent">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm capitalize text-foreground-soft">
                      {campaign.mode} mode · {campaign.status}
                    </p>
                  </div>
                  <strong className="shrink-0 text-sm text-(--text-headline)">
                    {campaign.progress.jobsRetained} retained
                  </strong>
                </div>
                <p className="text-sm text-foreground-soft">
                  {campaign.description || "No description yet."}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-foreground-muted">Found</dt>
                    <dd>{campaign.progress.jobsFound}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Prepared</dt>
                    <dd>{campaign.progress.applicationsPrepared}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Blocked</dt>
                    <dd>{campaign.progress.blockedCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Remaining</dt>
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
                      Latest digest ·{" "}
                      {formatDateTime(campaign.latestDigest.generatedAt) ??
                        "recent"}
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
                      Recent campaign history
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
                    onClick={() => setEditing(campaignToInput(campaign))}
                    type="button"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                  {!active ? (
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
