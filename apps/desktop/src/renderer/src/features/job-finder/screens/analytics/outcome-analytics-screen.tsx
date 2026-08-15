import { useMemo, useState } from "react";
import type {
  JobSearchCampaign,
  OutcomeAnalyticsBucket,
  OutcomeAnalyticsOverview,
  OutcomeBucketDimension,
  OutcomeEvent,
  ResumeStrategy,
  SetOutcomeSuggestionEnabledInput,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { StatusBadge } from "../../components/status-badge";
import {
  OUTCOME_VIEW_MINIMUM_SAMPLE_FOR_CONFIDENCE,
  OUTCOME_VIEW_MINIMUM_SAMPLE_FOR_RATES,
  bucketDisplayLabel,
  countOutcomeEvents,
  deriveCampaignScopedOutcomeAnalytics,
  formatRate,
  formatSampleSize,
  formatUncertainty,
  formatUncertaintyLevel,
  outcomeDimensionLabels,
  outcomeDimensionNoun,
  outcomeDimensionOrder,
  outcomeEventsForCampaign,
} from "./outcome-analytics-presentation";

type OutcomeScope = { kind: "all" } | { kind: "campaign"; campaignId: string };

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesBucketQuery(
  bucket: OutcomeAnalyticsBucket,
  label: string,
  query: string,
): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return true;
  return (
    label.toLocaleLowerCase().includes(normalized) ||
    bucket.key.toLocaleLowerCase().includes(normalized)
  );
}

function OutcomeCounts(props: { bucket: OutcomeAnalyticsBucket }) {
  const { bucket } = props;
  const entries = Object.entries(bucket.outcomeCounts).sort(
    (left, right) => right[1] - left[1],
  );
  if (entries.length === 0) {
    return (
      <p className="text-(length:--text-small) leading-5 text-muted-foreground">
        No outcomes recorded for this group yet.
      </p>
    );
  }
  return (
    <p className="text-(length:--text-small) leading-5 text-foreground-soft">
      {entries
        .map(([outcome, count]) => `${count} ${outcome.replaceAll("_", " ")}`)
        .join(" · ")}
    </p>
  );
}

function SuggestionPanel(props: {
  bucket: OutcomeAnalyticsBucket;
  isPending: boolean;
  onDisable: (input: SetOutcomeSuggestionEnabledInput) => void;
  onReset: (input: SetOutcomeSuggestionEnabledInput) => void;
}) {
  const { bucket } = props;
  const suggestion = bucket.suggestion;

  if (suggestion.disabledByUser) {
    return (
      <div className="grid gap-2 rounded-(--radius-field) border border-border/50 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            Suggestion disabled by you
          </p>
          <Button
            disabled={props.isPending}
            onClick={() =>
              props.onReset({
                dimension: bucket.dimension,
                key: bucket.key,
                enabled: true,
                reset: true,
              })
            }
            pending={props.isPending}
            size="sm"
            type="button"
            variant="secondary"
          >
            Reset
          </Button>
        </div>
        <p className="text-(length:--text-small) leading-5 text-muted-foreground">
          Analytics will keep this suggestion off until you reset it. Nothing
          here changes objective job facts or filters.
        </p>
      </div>
    );
  }

  if (!suggestion.enabled || !suggestion.label) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-(--radius-field) border border-primary/25 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {suggestion.label}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={props.isPending}
            onClick={() =>
              props.onDisable({
                dimension: bucket.dimension,
                key: bucket.key,
                enabled: false,
                reset: false,
              })
            }
            pending={props.isPending}
            size="sm"
            type="button"
            variant="ghost"
          >
            Disable
          </Button>
          <Button
            disabled={props.isPending}
            onClick={() =>
              props.onReset({
                dimension: bucket.dimension,
                key: bucket.key,
                enabled: true,
                reset: true,
              })
            }
            pending={props.isPending}
            size="sm"
            type="button"
            variant="secondary"
          >
            Reset
          </Button>
        </div>
      </div>
      {suggestion.reason ? (
        <p className="text-(length:--text-small) leading-5 text-foreground-soft">
          {suggestion.reason}
        </p>
      ) : null}
      <p className="text-(length:--text-small) leading-5 text-muted-foreground">
        This is a suggestion only — it is never applied automatically and never
        changes objective job facts or filters.
      </p>
    </div>
  );
}

function BucketCard(props: {
  activeCampaignId: string;
  bucket: OutcomeAnalyticsBucket;
  isPending: boolean;
  onDisable: (input: SetOutcomeSuggestionEnabledInput) => void;
  onReset: (input: SetOutcomeSuggestionEnabledInput) => void;
  resolvers: {
    campaignName: (campaignId: string) => string | null;
    resumeStrategyName: (strategyId: string) => string | null;
  };
}) {
  const { bucket } = props;
  const label = bucketDisplayLabel(bucket, props.resolvers);
  const isCurrentCampaign =
    bucket.dimension === "campaign" && bucket.key === props.activeCampaignId;
  const uncertaintyTone =
    bucket.uncertainty.level === "low"
      ? "positive"
      : bucket.uncertainty.level === "medium"
        ? "neutral"
        : "critical";

  return (
    <article className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-semibold text-foreground">
              {label}
            </h3>
            {isCurrentCampaign ? (
              <StatusBadge tone="active">Current campaign</StatusBadge>
            ) : null}
            {bucket.suggestion.disabledByUser ? (
              <StatusBadge tone="muted">Suggestion off</StatusBadge>
            ) : null}
          </div>
          <p className="mt-1 text-(length:--text-small) leading-5 text-muted-foreground">
            {formatSampleSize(bucket.sampleSize)} ·{" "}
            {formatUncertainty(bucket.uncertainty)}
          </p>
        </div>
        <StatusBadge tone={uncertaintyTone}>
          {formatUncertaintyLevel(bucket.uncertainty.level)}
        </StatusBadge>
      </div>

      <OutcomeCounts bucket={bucket} />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-(--radius-field) border border-border/50 bg-background/40 p-3">
          <p className="label-mono-xs">Response rate</p>
          <p className="mt-1 text-(length:--text-section-title) font-semibold text-foreground">
            {formatRate(bucket.responseRate)}
          </p>
          <p className="mt-1 text-(length:--text-small) leading-5 text-muted-foreground">
            {bucket.responseRate === null
              ? `Hidden until ${OUTCOME_VIEW_MINIMUM_SAMPLE_FOR_RATES} recorded applications.`
              : `${bucket.rateNumerators.response} responded out of ${bucket.sampleSize}.`}
          </p>
        </div>
        <div className="rounded-(--radius-field) border border-border/50 bg-background/40 p-3">
          <p className="label-mono-xs">Interview rate</p>
          <p className="mt-1 text-(length:--text-section-title) font-semibold text-foreground">
            {formatRate(bucket.interviewRate)}
          </p>
          <p className="mt-1 text-(length:--text-small) leading-5 text-muted-foreground">
            {bucket.interviewRate === null
              ? `Hidden until ${OUTCOME_VIEW_MINIMUM_SAMPLE_FOR_RATES} recorded applications.`
              : `${bucket.rateNumerators.interview} interviewed out of ${bucket.sampleSize}.`}
          </p>
        </div>
      </div>

      <SuggestionPanel
        bucket={bucket}
        isPending={props.isPending}
        onDisable={props.onDisable}
        onReset={props.onReset}
      />
    </article>
  );
}

export function OutcomeAnalyticsScreen(props: {
  actionMessage: string | null;
  activeCampaignId: string;
  campaigns: readonly JobSearchCampaign[];
  events: readonly OutcomeEvent[];
  generatedAt: string;
  isSuggestionPending: (
    dimension: OutcomeBucketDimension,
    key: string,
  ) => boolean;
  /** True while the analytics inputs are still loading (rare: analytics are
   * synchronous once the workspace snapshot is ready, so the page-level
   * loader normally covers this). */
  loading?: boolean;
  onSetOutcomeSuggestionEnabled: (
    input: SetOutcomeSuggestionEnabledInput,
  ) => Promise<boolean>;
  overview: OutcomeAnalyticsOverview | null;
  resumeStrategies: readonly ResumeStrategy[];
}) {
  const [scope, setScope] = useState<OutcomeScope>({
    kind: "campaign",
    campaignId: props.activeCampaignId,
  });
  const [dimension, setDimension] =
    useState<OutcomeBucketDimension>("campaign");
  const [query, setQuery] = useState("");

  const campaignById = useMemo(
    () => new Map(props.campaigns.map((campaign) => [campaign.id, campaign])),
    [props.campaigns],
  );
  const strategyById = useMemo(
    () =>
      new Map(
        props.resumeStrategies.map((strategy) => [strategy.id, strategy]),
      ),
    [props.resumeStrategies],
  );
  const resolvers = useMemo(
    () => ({
      campaignName: (campaignId: string) =>
        campaignById.get(campaignId)?.name ?? null,
      resumeStrategyName: (strategyId: string) =>
        strategyById.get(strategyId)?.name ?? null,
    }),
    [campaignById, strategyById],
  );

  // If the selected campaign no longer exists (for example the active
  // campaign changed), fall back to the all-campaigns view rather than
  // showing a stale or empty scope.
  const effectiveScope = useMemo<OutcomeScope>(
    () =>
      scope.kind === "campaign" && !campaignById.has(scope.campaignId)
        ? { kind: "all" }
        : scope,
    [campaignById, scope],
  );

  const scopedEvents = useMemo(
    () =>
      effectiveScope.kind === "all"
        ? props.events
        : outcomeEventsForCampaign(props.events, effectiveScope.campaignId),
    [effectiveScope, props.events],
  );

  const viewOverview = useMemo(() => {
    if (effectiveScope.kind === "campaign") {
      return deriveCampaignScopedOutcomeAnalytics({
        events: scopedEvents,
        generatedAt: props.generatedAt,
        previousOverview: props.overview,
      });
    }
    if (props.overview) {
      return props.overview;
    }
    if (scopedEvents.length > 0) {
      return deriveCampaignScopedOutcomeAnalytics({
        events: scopedEvents,
        generatedAt: props.generatedAt,
        previousOverview: null,
      });
    }
    return null;
  }, [effectiveScope, props.generatedAt, props.overview, scopedEvents]);

  const bucketsForDimension = useMemo(
    () =>
      (viewOverview?.buckets ?? []).filter(
        (bucket) => bucket.dimension === dimension,
      ),
    [dimension, viewOverview?.buckets],
  );

  const visibleBuckets = useMemo(
    () =>
      bucketsForDimension.filter((bucket) =>
        matchesBucketQuery(
          bucket,
          bucketDisplayLabel(bucket, resolvers),
          query,
        ),
      ),
    [bucketsForDimension, query, resolvers],
  );

  const totalEventCount = useMemo(
    () => countOutcomeEvents(props.events),
    [props.events],
  );
  const scopedEventCount = scopedEvents.length;
  const enabledSuggestionCount = useMemo(
    () =>
      (viewOverview?.buckets ?? []).filter(
        (bucket) => bucket.suggestion.enabled,
      ).length,
    [viewOverview?.buckets],
  );

  const activeCampaignName =
    campaignById.get(props.activeCampaignId)?.name ?? null;
  const scopeLabel =
    effectiveScope.kind === "all"
      ? "All campaigns"
      : (campaignById.get(effectiveScope.campaignId)?.name ??
          effectiveScope.campaignId);

  const hasAnyEvents = props.events.length > 0;
  const scopeHasEvents = scopedEvents.length > 0;
  const hasNoMatch =
    hasAnyEvents && visibleBuckets.length === 0 && normalizeQuery(query) !== "";

  const handleDisable = (input: SetOutcomeSuggestionEnabledInput) => {
    void props.onSetOutcomeSuggestionEnabled(input);
  };
  const handleReset = (input: SetOutcomeSuggestionEnabledInput) => {
    void props.onSetOutcomeSuggestionEnabled(input);
  };

  return (
    <section className="grid gap-4 pb-8">
      <PageHeader
        compact
        eyebrow="Analytics"
        title="Outcomes"
        description="Response and interview rates for the sources, titles, companies, campaigns, and resume strategies you apply to — derived only from outcomes you record. Suggestions here are never applied automatically and never change objective job facts."
      />

      {props.actionMessage ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className="rounded-(--radius-field) border border-border/50 bg-(--surface-panel-tint) px-3 py-2 text-(length:--text-small) leading-5 text-foreground-soft"
          role="status"
        >
          {props.actionMessage}
        </p>
      ) : null}

      {props.loading ? (
        <div
          aria-busy="true"
          className="grid min-h-40 place-items-center rounded-(--radius-field) border border-dashed border-border/70 bg-(--surface-panel-tint) px-5 py-8 text-center"
          role="status"
        >
          <p className="text-(length:--text-small) text-foreground-soft">
            Loading outcome analytics…
          </p>
        </div>
      ) : null}

      <div className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-4 sm:grid-cols-[minmax(14rem,0.8fr)_repeat(3,minmax(0,1fr))] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          Campaign scope
          <select
            className="h-10 w-full rounded-(--radius-field) border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            onChange={(event) => {
              const value = event.target.value;
              setScope(
                value === "__all__"
                  ? { kind: "all" }
                  : { kind: "campaign", campaignId: value },
              );
            }}
            value={effectiveScope.kind === "all" ? "__all__" : effectiveScope.campaignId}
          >
            <option value="__all__">All campaigns</option>
            {props.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-(--radius-field) border border-border/50 bg-background/40 p-3">
          <p className="label-mono-xs">Scope</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {scopeLabel}
          </p>
          <p className="mt-1 text-(length:--text-small) leading-5 text-muted-foreground">
            {scopedEventCount} outcome{" "}
            {scopedEventCount === 1 ? "event" : "events"} in scope
          </p>
        </div>
        <div className="rounded-(--radius-field) border border-border/50 bg-background/40 p-3">
          <p className="label-mono-xs">Outcome log</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {totalEventCount} recorded
          </p>
          <p className="mt-1 text-(length:--text-small) leading-5 text-muted-foreground">
            {activeCampaignName
              ? `Active campaign: ${activeCampaignName}`
              : "No active campaign"}
          </p>
        </div>
        <div className="rounded-(--radius-field) border border-border/50 bg-background/40 p-3">
          <p className="label-mono-xs">Suggestions</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {enabledSuggestionCount} active
          </p>
          <p className="mt-1 text-(length:--text-small) leading-5 text-muted-foreground">
            Shown only with enough data
          </p>
        </div>
      </div>

      {!hasAnyEvents ? (
        <EmptyState
          description="Record what happened to each application from Applications → Tracker: completed, abandoned, employer response, assessment, interview, offer, rejection, withdrawal, or no response. Rates and suggestions appear here only after you record outcomes — nothing is inferred."
          title="No outcomes recorded yet"
        />
      ) : !scopeHasEvents ? (
        <EmptyState
          description="This campaign has no recorded outcomes yet. Record what happened to its applications in Applications → Tracker, then return here."
          title="No outcomes in this campaign"
        />
      ) : (
        <div className="grid gap-3">
          <div
            aria-label="Analytics dimension"
            className="flex w-fit max-w-full flex-wrap gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-1"
            role="group"
          >
            {outcomeDimensionOrder.map((candidate) => (
              <Button
                aria-pressed={dimension === candidate}
                key={candidate}
                onClick={() => setDimension(candidate)}
                size="sm"
                type="button"
                variant={dimension === candidate ? "secondary" : "ghost"}
              >
                {outcomeDimensionLabels[candidate]}
              </Button>
            ))}
          </div>

          <div className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-3">
            <label
              className="grid gap-1.5 text-sm font-medium text-foreground"
              htmlFor="outcome-analytics-search"
            >
              Search {outcomeDimensionNoun(dimension)}
              <Input
                autoComplete="off"
                id="outcome-analytics-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Filter ${outcomeDimensionNoun(dimension)} by name`}
                type="search"
                value={query}
              />
            </label>
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-(length:--text-small) text-foreground-muted"
            >
              {normalizeQuery(query) !== ""
                ? `${visibleBuckets.length} of ${bucketsForDimension.length} ${outcomeDimensionNoun(dimension)} match`
                : `${bucketsForDimension.length} ${outcomeDimensionNoun(dimension)} in scope`}
            </p>
          </div>

          {hasNoMatch ? (
            <div className="grid min-h-40 place-items-center rounded-(--radius-field) border border-dashed border-border/70 bg-(--surface-panel-tint) px-5 py-8 text-center">
              <div className="grid max-w-md gap-3">
                <p className="font-semibold text-(--text-headline)">
                  No {outcomeDimensionNoun(dimension)} match “{query.trim()}”
                </p>
                <p className="text-sm text-foreground-soft">
                  Try a shorter phrase or switch to another dimension. Nothing
                  here has changed.
                </p>
                <Button
                  className="justify-self-center"
                  onClick={() => setQuery("")}
                  type="button"
                  variant="secondary"
                >
                  Clear search
                </Button>
              </div>
            </div>
          ) : (
            <ul className="grid gap-3">
              {visibleBuckets.map((bucket) => (
                <li key={`${bucket.dimension}:${bucket.key}`}>
                  <BucketCard
                    activeCampaignId={props.activeCampaignId}
                    bucket={bucket}
                    isPending={props.isSuggestionPending(
                      bucket.dimension,
                      bucket.key,
                    )}
                    onDisable={handleDisable}
                    onReset={handleReset}
                    resolvers={resolvers}
                  />
                </li>
              ))}
            </ul>
          )}

          {bucketsForDimension.length === 0 ? (
            <p className="text-(length:--text-small) leading-5 text-muted-foreground">
              No {outcomeDimensionNoun(dimension)} have recorded outcomes in
              this scope yet. Record outcomes from Applications → Tracker to
              build up this view.
            </p>
          ) : null}

          <div className="grid gap-1 rounded-(--radius-field) border border-border/40 bg-background/30 p-3">
            <p className="label-mono-xs">How to read this</p>
            <p className="text-(length:--text-small) leading-5 text-foreground-soft">
              Rates stay hidden until a group has at least{" "}
              {OUTCOME_VIEW_MINIMUM_SAMPLE_FOR_RATES} recorded applications so
              small samples are never presented as measured facts. Uncertainty
              is tied to sample size, and a 95% confidence-interval half-width
              is shown from {OUTCOME_VIEW_MINIMUM_SAMPLE_FOR_CONFIDENCE}{" "}
              applications. Suggestions appear only at that sample with a
              visible half-width, and you can disable or reset each one — they
              are never applied silently.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
