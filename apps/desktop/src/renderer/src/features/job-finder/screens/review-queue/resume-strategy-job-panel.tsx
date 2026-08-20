import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ResumeStrategy,
  ResumeStrategyRecommendation,
  ResumeStrategySelection,
  SelectResumeStrategyInput,
} from "@unemployed/contracts";

interface ResumeStrategyJobPanelProps {
  campaignId: string;
  isPending: boolean;
  jobId: string;
  onRecommend: (input: {
    jobId: string;
  }) => Promise<ResumeStrategyRecommendation | null>;
  onSelect: (input: SelectResumeStrategyInput) => void;
  selections: readonly ResumeStrategySelection[];
  strategies: readonly ResumeStrategy[];
}

function describeSelectionSource(
  source: ResumeStrategySelection["source"] | null | undefined,
): string {
  switch (source) {
    case "user":
      return "Your choice";
    case "campaign_default":
      return "Campaign default";
    case "rule_match":
      return "Role-family match";
    default:
      return "Selection";
  }
}

export function ResumeStrategyJobPanel(props: ResumeStrategyJobPanelProps) {
  const [recommendation, setRecommendation] =
    useState<ResumeStrategyRecommendation | null>(null);
  const [recommendationState, setRecommendationState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const onRecommendRef = useRef(props.onRecommend);
  const recommendationRequestRef = useRef<{
    jobId: string;
    promise: Promise<ResumeStrategyRecommendation | null>;
  } | null>(null);
  onRecommendRef.current = props.onRecommend;

  useEffect(() => {
    let cancelled = false;
    setRecommendationState("loading");
    setRecommendation(null);
    setRecommendError(null);

    const existingRequest = recommendationRequestRef.current;
    const request =
      existingRequest?.jobId === props.jobId
        ? existingRequest.promise
        : Promise.resolve().then(() =>
            onRecommendRef.current({ jobId: props.jobId }),
          );
    recommendationRequestRef.current = {
      jobId: props.jobId,
      promise: request,
    };

    void request
      .then((result) => {
        if (cancelled) return;
        setRecommendation(result);
        setRecommendationState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRecommendationState("error");
        setRecommendError(
          error instanceof Error
            ? error.message
            : "The strategy recommendation could not be loaded.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [props.jobId]);

  const selection = useMemo(
    () => props.selections.find((entry) => entry.jobId === props.jobId) ?? null,
    [props.jobId, props.selections],
  );

  const strategyById = useMemo(
    () => new Map(props.strategies.map((strategy) => [strategy.id, strategy])),
    [props.strategies],
  );
  const enabledStrategies = props.strategies.filter(
    (strategy) => strategy.enabled,
  );
  const recommendedId = recommendation?.strategyId ?? null;
  const selectionStrategy = selection
    ? (strategyById.get(selection.strategyId) ?? null)
    : null;

  const handleSelect = (strategyId: string) => {
    if (!strategyId) {
      return;
    }
    const strategy = strategyById.get(strategyId);
    if (!strategy) {
      return;
    }
    const reason =
      recommendedId === strategyId
        ? `User accepted the recommended strategy "${strategy.name}"${
            recommendation?.reason ? ` (${recommendation.reason})` : ""
          }.`
        : `User chose strategy "${strategy.name}" for this job instead of the recommendation.`;
    props.onSelect({
      jobId: props.jobId,
      campaignId: props.campaignId,
      strategyId,
      source: "manual",
      reason,
    });
  };

  return (
    <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
      <div className="grid gap-1">
        <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">
          Resume strategy
        </span>
        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
          Choosing or reusing a strategy never approves this résumé and never
          makes an artifact application-ready. Approval and staleness checks for
          this job stay authoritative.
        </p>
      </div>

      {recommendationState === "loading" ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className="text-(length:--text-small) leading-6 text-foreground-soft"
          role="status"
        >
          Checking strategies for this job…
        </p>
      ) : null}

      {recommendationState === "error" ? (
        <div
          className="grid gap-2 rounded-(--radius-small) border border-destructive/35 bg-destructive/8 px-3 py-2"
          role="alert"
        >
          <p className="text-(length:--text-small) font-semibold text-foreground">
            Strategy recommendation unavailable
          </p>
          <p className="text-(length:--text-small) leading-5 text-foreground-soft">
            {recommendError}
          </p>
        </div>
      ) : null}

      {recommendationState === "ready" ? (
        <div className="grid gap-2">
          {recommendedId && recommendation?.strategyName ? (
            <div className="grid gap-1 rounded-(--radius-small) border border-primary/25 bg-primary/5 px-3 py-2.5">
              <p className="text-(length:--text-small) font-semibold text-(--text-headline)">
                Recommended: {recommendation.strategyName}
              </p>
              <p className="text-(length:--text-small) leading-5 text-foreground-soft">
                {recommendation.reason}
              </p>
            </div>
          ) : (
            <div className="grid gap-1 rounded-(--radius-small) border border-border-subtle px-3 py-2.5">
              <p className="text-(length:--text-small) font-semibold text-(--text-headline)">
                No strategy recommended
              </p>
              <p className="text-(length:--text-small) leading-5 text-foreground-soft">
                {recommendation?.reason ??
                  "No enabled strategy matches this job's role family and no campaign default is set."}
              </p>
            </div>
          )}

          {selection && selectionStrategy ? (
            <div className="grid gap-1 rounded-(--radius-small) border border-border-subtle bg-background/35 px-3 py-2.5">
              <p className="text-(length:--text-small) font-semibold text-(--text-headline)">
                {describeSelectionSource(selection.source)}:{" "}
                {selectionStrategy.name}
              </p>
              <p className="text-(length:--text-small) leading-5 text-foreground-soft">
                {selection.reason}
              </p>
              {selection.selectedAt ? (
                <p className="text-(length:--text-tiny) leading-5 text-foreground-muted">
                  Selected {new Date(selection.selectedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          {enabledStrategies.length > 0 ? (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                Choose a strategy for this job
              </span>
              <select
                className="h-10 rounded-(--radius-field) border border-input bg-(--surface-panel-raised) px-3"
                disabled={props.isPending}
                onChange={(event) => handleSelect(event.target.value)}
                value=""
              >
                <option disabled value="">
                  {selection
                    ? "Change strategy…"
                    : recommendedId
                      ? "Apply the recommendation…"
                      : "Choose a strategy…"}
                </option>
                {enabledStrategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                    {recommendedId === strategy.id ? " (recommended)" : ""}
                    {selection?.strategyId === strategy.id ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-(length:--text-small) leading-5 text-foreground-soft">
              Create and enable a strategy on the Resume strategies screen to
              reuse targeting preferences here.
            </p>
          )}

          {props.isPending ? (
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-(length:--text-tiny) leading-5 text-foreground-muted"
              role="status"
            >
              Saving your strategy choice…
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
