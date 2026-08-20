import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RapidReviewDecision,
  RapidReviewDecisionLog,
  RapidReviewDecisionKind,
  RapidReviewMutationInput,
  SavedJob,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import {
  CollectionPagination,
  COLLECTION_PAGE_SIZE,
} from "../../components/collection-pagination";
import {
  CollectionNoMatches,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function buildLatestDecisionIndex(
  log: RapidReviewDecisionLog | null,
): ReadonlyMap<string, RapidReviewDecision> {
  const index = new Map<string, RapidReviewDecision>();
  if (!log) return index;

  for (const entry of log.entries) {
    if (entry.undo !== null) continue;
    const current = index.get(entry.jobId);
    if (!current || entry.revision >= current.revision) {
      index.set(entry.jobId, entry);
    }
  }

  return index;
}

function formatRecommendation(value: string): string {
  return value.replaceAll("_", " ");
}

export function RapidReviewScreen(props: {
  campaignId: string;
  campaignName: string;
  error?: string | null;
  jobs: readonly SavedJob[];
  log: RapidReviewDecisionLog | null;
  onInspectJob: (jobId: string) => void;
  onMutate: (input: RapidReviewMutationInput) => Promise<unknown>;
  pending: boolean;
}) {
  const view = usePersistedCollectionView("rapid-review", "comfortable");
  const [activeJobId, setActiveJobId] = useState<string | null>(
    props.jobs[0]?.id ?? null,
  );
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);
  const latestDecisions = useMemo(
    () => buildLatestDecisionIndex(props.log),
    [props.log],
  );

  const visibleJobs = useMemo(
    () =>
      props.jobs.filter((job) =>
        matchesCollectionSearch(view.query, [
          job.title,
          job.company,
          job.location,
          job.salaryText,
          job.matchAssessment.recommendationRationale,
          ...job.matchAssessment.reasons,
          ...job.matchAssessment.gaps,
        ]),
      ),
    [props.jobs, view.query],
  );
  const activeIndex = Math.max(
    0,
    visibleJobs.findIndex((job) => job.id === activeJobId),
  );
  const activeJob = visibleJobs[activeIndex] ?? null;
  const pageCount = Math.max(
    1,
    Math.ceil(visibleJobs.length / COLLECTION_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  const pagedVisibleJobs = useMemo(
    () =>
      visibleJobs.slice(
        (currentPage - 1) * COLLECTION_PAGE_SIZE,
        currentPage * COLLECTION_PAGE_SIZE,
      ),
    [currentPage, visibleJobs],
  );
  const comparedJobs = props.jobs
    .filter((job) => selectedIds.has(job.id))
    .slice(0, 4);

  useEffect(() => {
    if (visibleJobs.length === 0) return;
    if (!visibleJobs.some((job) => job.id === activeJobId)) {
      setActiveJobId(visibleJobs[0]!.id);
    }
  }, [activeJobId, visibleJobs]);

  useEffect(() => {
    setPage(1);
  }, [view.query]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, pageCount));
  }, [pageCount]);

  useEffect(() => {
    if (activeIndex < 0 || visibleJobs.length === 0) return;
    setPage(Math.floor(activeIndex / COLLECTION_PAGE_SIZE) + 1);
  }, [activeIndex, visibleJobs.length]);

  const move = useCallback(
    (offset: number) => {
      if (visibleJobs.length === 0) return;
      const next = Math.min(
        visibleJobs.length - 1,
        Math.max(0, activeIndex + offset),
      );
      setActiveJobId(visibleJobs[next]!.id);
      setPage(Math.floor(next / COLLECTION_PAGE_SIZE) + 1);
    },
    [activeIndex, visibleJobs],
  );

  const decide = useCallback(
    async (jobIds: readonly string[], decision: RapidReviewDecisionKind) => {
      if (jobIds.length === 0 || props.pending) return;
      setLocalError(null);
      try {
        await props.onMutate({
          type: "decide",
          campaignId: props.campaignId,
          jobIds: [...jobIds],
          decision,
          expectedRevisions: Object.fromEntries(
            jobIds.map((jobId) => [
              jobId,
              latestDecisions.get(jobId)?.revision ?? null,
            ]),
          ),
          reason: null,
        });
        setSelectedIds(new Set());
        if (jobIds.includes(activeJobId ?? "")) move(1);
      } catch (error) {
        setLocalError(
          error instanceof Error ? error.message : "The review action failed.",
        );
      }
    },
    [activeJobId, latestDecisions, move, props],
  );

  const undo = useCallback(
    async (jobId: string) => {
      const current = latestDecisions.get(jobId);
      if (!current || props.pending) return;
      setLocalError(null);
      try {
        await props.onMutate({
          type: "undo",
          campaignId: props.campaignId,
          jobId,
          expectedRevision: current.revision,
          reason: null,
        });
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "Undo failed.");
      }
    },
    [latestDecisions, props],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        isTypingTarget(event.target) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      const key = event.key.toLocaleLowerCase();
      if (key === "j" || event.key === "ArrowDown") move(1);
      else if (key === "k" || event.key === "ArrowUp") move(-1);
      else if (activeJob && key === "s")
        void decide([activeJob.id], "shortlist");
      else if (activeJob && key === "x") void decide([activeJob.id], "reject");
      else if (activeJob && key === "i") props.onInspectJob(activeJob.id);
      else if (activeJob && key === "u") void undo(activeJob.id);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeJob, decide, move, props, undo]);

  if (props.jobs.length === 0) {
    return (
      <section className="grid min-h-96 place-items-center p-8 text-center">
        <div className="max-w-lg space-y-2">
          <h1 className="text-3xl font-semibold">Rapid review</h1>
          <p className="text-foreground-soft">
            {props.campaignName} has no discovered jobs to review yet. Run the
            campaign first; no browser or application work starts here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 p-4" aria-busy={props.pending}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-foreground-muted">
            {props.campaignName}
          </p>
          <h1 className="text-3xl font-semibold">Rapid review</h1>
          <p className="text-sm text-foreground-soft">
            Review local job evidence only. Nothing here opens a browser or
            starts an application.
          </p>
        </div>
        <p className="text-xs text-foreground-muted">
          J/K move · S shortlist · X reject · I inspect · U undo
        </p>
      </header>

      <CollectionSearchToolbar
        density={view.density}
        label="Search this campaign"
        onDensityChange={view.setDensity}
        onQueryChange={view.setQuery}
        placeholder="Search roles, companies, locations, or evidence"
        query={view.query}
        totalCount={props.jobs.length}
        visibleCount={visibleJobs.length}
      />

      {props.error || localError ? (
        <p role="alert" className="border border-destructive/40 p-3 text-sm">
          {localError ?? props.error}
        </p>
      ) : null}

      {visibleJobs.length === 0 ? (
        <CollectionNoMatches
          noun="jobs"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.4fr)]">
          <div className="grid content-start gap-2">
            <ul
              className="grid content-start gap-2"
              aria-label="Jobs to review"
            >
              {pagedVisibleJobs.map((job) => {
                const current = latestDecisions.get(job.id);
                const active = activeJob?.id === job.id;
                return (
                  <li key={job.id} className="relative">
                    <button
                      aria-current={active ? "true" : undefined}
                      className={`w-full border p-3 text-left ${active ? "border-primary bg-secondary" : "border-border"}`}
                      onClick={() => setActiveJobId(job.id)}
                      type="button"
                    >
                      <span className="block font-semibold">{job.title}</span>
                      <span className="block text-sm text-foreground-soft">
                        {job.company} · {job.location}
                      </span>
                      <span className="mt-1 block text-xs text-foreground-muted">
                        {job.matchAssessment.score}% fit
                        {current
                          ? ` · ${formatRecommendation(current.kind)}`
                          : " · not reviewed"}
                      </span>
                    </button>
                    <label className="absolute right-3 top-3 flex items-center gap-1 text-xs">
                      <input
                        aria-label={`Select ${job.title} at ${job.company}`}
                        checked={selectedIds.has(job.id)}
                        onChange={(event) =>
                          setSelectedIds((currentIds) => {
                            const next = new Set(currentIds);
                            if (event.target.checked) next.add(job.id);
                            else next.delete(job.id);
                            return next;
                          })
                        }
                        type="checkbox"
                      />
                      Compare
                    </label>
                  </li>
                );
              })}
            </ul>
            <CollectionPagination
              itemLabel="jobs"
              onPageChange={setPage}
              page={currentPage}
              pageSize={COLLECTION_PAGE_SIZE}
              totalCount={visibleJobs.length}
            />
          </div>

          {activeJob ? (
            <article className="grid content-start gap-4 border border-border p-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-foreground-muted">
                  Listing facts
                </p>
                <h2 className="text-2xl font-semibold">{activeJob.title}</h2>
                <p>
                  {activeJob.company} · {activeJob.location} ·{" "}
                  {activeJob.workMode}
                </p>
                <p className="text-sm text-foreground-soft">
                  {activeJob.salaryText ?? "Compensation not listed"} ·{" "}
                  {activeJob.postedAtText ??
                    activeJob.postedAt ??
                    "Freshness unknown"}
                </p>
              </div>
              <div className="grid gap-2 border-t border-border pt-3">
                <p className="text-xs uppercase tracking-widest text-foreground-muted">
                  Model assessment — review, not fact
                </p>
                <p className="font-semibold">
                  {activeJob.matchAssessment.score}% ·{" "}
                  {formatRecommendation(
                    activeJob.matchAssessment.recommendation,
                  )}
                </p>
                <p>{activeJob.matchAssessment.recommendationRationale}</p>
                <p>
                  <strong>Strongest reason:</strong>{" "}
                  {activeJob.matchAssessment.reasons[0] ??
                    "No supporting reason recorded."}
                </p>
                <p>
                  <strong>Hard conflicts:</strong>{" "}
                  {activeJob.matchAssessment.requirements
                    .filter(
                      (item) =>
                        item.importance === "required" &&
                        item.status === "conflict",
                    )
                    .map((item) => item.label)
                    .join(", ") || "None recorded"}
                </p>
                <p>
                  <strong>Missing evidence:</strong>{" "}
                  {activeJob.matchAssessment.gaps.join(", ") || "None recorded"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button
                  pending={props.pending}
                  onClick={() => void decide([activeJob.id], "shortlist")}
                  type="button"
                >
                  Shortlist and next
                </Button>
                <Button
                  pending={props.pending}
                  onClick={() => void decide([activeJob.id], "reject")}
                  type="button"
                  variant="outline"
                >
                  Reject and next
                </Button>
                <Button
                  onClick={() => props.onInspectJob(activeJob.id)}
                  type="button"
                  variant="secondary"
                >
                  Inspect details
                </Button>
                {latestDecisions.has(activeJob.id) ? (
                  <Button
                    pending={props.pending}
                    onClick={() => void undo(activeJob.id)}
                    type="button"
                    variant="ghost"
                  >
                    Undo last decision
                  </Button>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      )}

      {comparedJobs.length >= 2 ? (
        <section
          aria-label="Job comparison"
          className="overflow-x-auto border border-border p-3"
        >
          <h2 className="mb-2 text-lg font-semibold">Compare selected jobs</h2>
          <div className="grid min-w-[42rem] grid-cols-2 gap-2 lg:grid-cols-4">
            {comparedJobs.map((job) => (
              <article className="border border-border p-3" key={job.id}>
                <h3 className="font-semibold">{job.title}</h3>
                <p className="text-sm">{job.company}</p>
                <p className="text-sm">
                  {job.location} · {job.workMode}
                </p>
                <p className="text-sm">{job.salaryText ?? "Pay unknown"}</p>
                <p className="mt-2 font-semibold">
                  {job.matchAssessment.score}% fit
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedIds.size > 0 ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 border border-primary/40 bg-background p-3 shadow-lg">
          <p>
            {selectedIds.size} selected. Bulk actions only change local review
            decisions.
          </p>
          <div className="flex gap-2">
            <Button
              pending={props.pending}
              onClick={() => void decide([...selectedIds], "shortlist")}
              type="button"
            >
              Shortlist selected
            </Button>
            <Button
              pending={props.pending}
              onClick={() => void decide([...selectedIds], "reject")}
              type="button"
              variant="outline"
            >
              Reject selected
            </Button>
            <Button
              onClick={() => setSelectedIds(new Set())}
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
