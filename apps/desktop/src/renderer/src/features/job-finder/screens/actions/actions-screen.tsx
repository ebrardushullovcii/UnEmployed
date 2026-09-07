import {
  CONFIRM_STEP_DONE_ACTION,
  JOB_FINDER_BROWSER_NAME,
  OPEN_JOB_FINDER_BROWSER_ACTION,
} from "../../lib/job-finder-browser-handoff-copy";
import type {
  ApplicationAttemptQuestion,
  ApplyGroupedManualAnswerInput,
  CandidateProfile,
  GroupedManualAnswerDecision,
  JobFinderWorkspaceSnapshot,
  ProjectGroupedManualAnswerCommand,
  SnoozeGroupedDecisionInput,
  UserActionCommandInput,
  UserActionRequest,
} from "@unemployed/contracts";
import { ArrowUpRight, Ban, BellOff, Check, ExternalLink } from "lucide-react";

import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  CollectionPagination,
  COLLECTION_PAGE_SIZE,
} from "../../components/collection-pagination";
import { formatDateOnly } from "../../lib/job-finder-utils";
import { buildJobFinderContextRoute } from "../../lib/job-finder-context-navigation";
import {
  CollectionNoMatches,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { PageHeaderStack } from "../../components/page-header";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";
import {
  AnswerMemoryEditor,
  deriveGroupedAnswerGroupKey,
} from "./answer-memory-editor";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

const terminalStates = new Set<UserActionRequest["state"]>([
  "resolved",
  "skipped",
  "cancelled",
  "expired",
  "superseded",
]);

type DiscoveryJob = JobFinderWorkspaceSnapshot["discoveryJobs"][number];

export function getUserActionContextRoute(
  request: Pick<UserActionRequest, "scope">,
  applicationRecords?: readonly JobFinderWorkspaceSnapshot["applicationRecords"][number][],
): string {
  if (request.scope.type === "discovery_source") {
    return buildJobFinderContextRoute("/job-finder/discovery", {
      targetId: request.scope.targetId,
    });
  }

  const applicationScope = request.scope;
  if (applicationScope.applicationRecordId) {
    return buildJobFinderContextRoute("/job-finder/applications", {
      applicationRecordId: applicationScope.applicationRecordId,
      jobId: applicationScope.jobId,
    });
  }

  const matchingRecords = (applicationRecords ?? []).filter(
    (record) => record.jobId === applicationScope.jobId,
  );
  const applicationRecordId =
    matchingRecords.length === 1 ? (matchingRecords[0]?.id ?? null) : null;

  return buildJobFinderContextRoute(
    "/job-finder/applications",
    applicationRecordId
      ? { applicationRecordId, jobId: applicationScope.jobId }
      : { jobId: applicationScope.jobId },
  );
}

export const userActionKindPresentations: Record<
  UserActionRequest["kind"],
  { label: string; openLabel: string; doneLabel: string; guidance: string }
> = {
  login: {
    label: "Sign in",
    openLabel: "Open sign-in",
    doneLabel: "I'm signed in",
    guidance: `Complete sign-in in ${JOB_FINDER_BROWSER_NAME}.`,
  },
  signup: {
    label: "Sign up",
    openLabel: "Open sign-up",
    doneLabel: "Account is ready",
    guidance: `Create the account yourself in ${JOB_FINDER_BROWSER_NAME}.`,
  },
  mfa: {
    label: "MFA",
    openLabel: "Open MFA",
    doneLabel: "MFA is complete",
    guidance: `Complete the security-code challenge in ${JOB_FINDER_BROWSER_NAME}.`,
  },
  email_verification: {
    label: "Email verification",
    openLabel: "Open verification",
    doneLabel: "Email is verified",
    guidance: "Use the verification link or code yourself.",
  },
  captcha: {
    label: "CAPTCHA",
    openLabel: "Open CAPTCHA",
    doneLabel: "CAPTCHA is complete",
    guidance: "Complete the human-verification challenge yourself.",
  },
  existing_account_choice: {
    label: "Account choice",
    openLabel: "Open account choice",
    doneLabel: "Choice is complete",
    guidance: "Choose the appropriate account path yourself.",
  },
  manual_answer: {
    label: "Manual answer",
    openLabel: "Open question",
    doneLabel: "Answer is complete",
    guidance: `Review and answer the question in ${JOB_FINDER_BROWSER_NAME}.`,
  },
  legal_consent: {
    label: "Legal consent",
    openLabel: "Open consent",
    doneLabel: "Decision is complete",
    guidance: "Read and decide the legal consent yourself.",
  },
  external_redirect: {
    label: "External redirect",
    openLabel: "Open destination",
    doneLabel: "Destination is ready",
    guidance: "Review the external destination before continuing.",
  },
  manual_upload: {
    label: "Manual upload",
    openLabel: "Open upload",
    doneLabel: "File is attached",
    guidance: `Attach the requested file yourself in ${JOB_FINDER_BROWSER_NAME}.`,
  },
  other: {
    label: "Other",
    openLabel: OPEN_JOB_FINDER_BROWSER_ACTION,
    doneLabel: CONFIRM_STEP_DONE_ACTION,
    guidance: "Complete the described browser-owned step yourself.",
  },
};

export function listUnresolvedUserActions(
  requests: readonly UserActionRequest[],
): readonly UserActionRequest[] {
  return requests.filter((request) => !terminalStates.has(request.state));
}

/**
 * Indexes the discovery jobs by id once per snapshot so scope lookups stay
 * one-pass instead of scanning the job array for every action card.
 */
export function buildJobIndexById(
  jobs: readonly DiscoveryJob[],
): Map<string, DiscoveryJob> {
  return new Map(jobs.map((job) => [job.id, job]));
}

/**
 * A whole instruction that only restates the safety boundary — the runtime
 * writes one per request ("…and stops before final submission").
 */
const SAFETY_ONLY_INSTRUCTION =
  /^(?:after (?:access verification|confirmation)|job finder)\b[^.]*\b(?:stops? before final submission|never (?:receives|handles|stores))/i;

/**
 * A trailing safety clause appended to an otherwise actionable step, e.g.
 * "Complete sign-in in the Job Finder browser. Job Finder never receives or
 * stores your credentials."
 */
const TRAILING_SAFETY_CLAUSE =
  /(?:\s|^)(?:job finder (?:never|cannot)[^.]*\.|do not enter (?:credentials|passwords)[^.]*\.)\s*$/i;

/**
 * The card already ends with one safety sentence and the page header owns the
 * credentials boundary, so the numbered steps stay purely about what the user
 * does: open the page, finish the step, come back and confirm.
 */
export function toActionableInstructions(
  instructions: readonly string[],
): readonly string[] {
  return instructions
    .map((instruction) => instruction.trim())
    .filter(
      (instruction) =>
        instruction.length > 0 && !SAFETY_ONLY_INSTRUCTION.test(instruction),
    )
    .map((instruction) =>
      instruction.replace(TRAILING_SAFETY_CLAUSE, "").trim(),
    )
    .filter((instruction) => instruction.length > 0);
}

/** Below this many open actions the list is scannable without a search field. */
const ACTION_SEARCH_MIN_ITEMS = 5;

function createCommand(
  request: UserActionRequest,
  action: "open_page" | "confirm_done" | "skip" | "cancel",
): UserActionCommandInput {
  const base = {
    requestId: request.id,
    commandId: `user_action_${action}_${globalThis.crypto.randomUUID()}`,
    expectedRevision: request.revision,
    credentialsPolicy: "browser_only" as const,
    submitAuthorized: false as const,
    accountCreationAuthorized: false as const,
  };

  return action === "skip" || action === "cancel"
    ? { ...base, action, reason: null }
    : { ...base, action };
}

function ActionCard(props: {
  isGroupedProjectPending: (groupKey: string) => boolean;
  isPending: boolean;
  jobLabel: string | null;
  onCommand: (command: UserActionCommandInput) => void;
  onOpenScope: () => void;
  onProjectGroupedManualAnswer: (
    command: ProjectGroupedManualAnswerCommand,
  ) => void;
  profile: CandidateProfile | null;
  question: ApplicationAttemptQuestion | null;
  request: UserActionRequest;
}) {
  const {
    isGroupedProjectPending,
    isPending,
    jobLabel,
    onCommand,
    onOpenScope,
    onProjectGroupedManualAnswer,
    profile,
    question,
    request,
  } = props;
  const isVerifying = request.state === "verifying";
  const attemptsExhausted = request.attemptCount >= request.maxAttempts;
  const presentation = userActionKindPresentations[request.kind];
  const scopeLabel =
    request.scope.type === "application" ? "application" : "job source";
  const missingBrowserLinkDescriptionId = `${request.id}-missing-browser-link`;
  const cancelConsequenceId = `${request.id}-cancel-consequence`;
  const actionableInstructions = toActionableInstructions(request.instructions);

  return (
    <article className="grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Everything in a queue called "Needs you" is required, so a
                REQUIRED chip on every card carried no information. Only the
                exception — a step you may skip — is worth a chip. */}
            {request.requirement === "required" ? null : (
              <Badge variant="section">Optional</Badge>
            )}
            {/* "Other" names nothing; the request summary already says what
            the step is, so only classified kinds earn a category badge. */}
            {request.kind === "other" ? null : (
              <Badge variant="status">{presentation.label}</Badge>
            )}
            <Badge variant="outline">
              {request.state.replaceAll("_", " ")}
            </Badge>
          </div>
          <h3 className="font-semibold text-(--text-headline)">
            {request.title}
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-foreground-soft">
            {request.summary}
          </p>
        </div>
        <Button
          onClick={onOpenScope}
          size="compact"
          type="button"
          variant="ghost"
        >
          View {request.scope.type === "application" ? "application" : "source"}
          <ArrowUpRight aria-hidden="true" />
        </Button>
      </div>

      {jobLabel ? (
        <p className="text-sm font-medium text-foreground">{jobLabel}</p>
      ) : null}
      {/* The verification origin is deliberately path-stripped, so showing
          it alone told the user only "wellfound.com". The exact page the
          action opens is the useful fact; the bare origin is the fallback. */}
      {(request.actionUrl ?? request.displayOrigin) ? (
        <p className="break-all text-xs text-muted-foreground">
          Page: {request.actionUrl ?? request.displayOrigin}
        </p>
      ) : null}
      {actionableInstructions.length > 0 ? (
        <ol className="grid list-decimal gap-1 pl-5 text-sm leading-6 text-foreground-soft">
          {actionableInstructions.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>
      ) : null}

      {request.kind === "manual_answer" && profile && question ? (
        <AnswerMemoryEditor
          isPending={isPending}
          onProjectGrouped={onProjectGroupedManualAnswer}
          onSubmit={(answer, saveForFuture) =>
            onCommand({
              ...createCommand(request, "confirm_done"),
              action: "submit_manual_answer",
              answer,
              saveForFuture,
            })
          }
          profile={profile}
          projectPending={isGroupedProjectPending(
            deriveGroupedAnswerGroupKey(request.id),
          )}
          question={question}
          request={request}
        />
      ) : null}
      {/* The boxed treatment framed the boundary as fine print and repeated
          the steps above it inside a grey rectangle. The per-kind sentence
          and the one no-submit sentence stay; the box does not. */}
      <p className="text-xs leading-5 text-muted-foreground">
        {presentation.guidance}{" "}
        {request.kind === "manual_answer"
          ? "A one-use answer stays scoped to this application; future reuse requires the explicit save action. "
          : ""}
        Confirming here cannot create an account or submit an application.
      </p>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={`Actions for ${request.title}`}
      >
        {request.actionUrl ? (
          <Button
            onClick={() => onCommand(createCommand(request, "open_page"))}
            pending={isPending}
            size="compact"
            type="button"
          >
            <ExternalLink aria-hidden="true" /> {presentation.openLabel}
          </Button>
        ) : (
          <Button
            aria-describedby={missingBrowserLinkDescriptionId}
            onClick={onOpenScope}
            size="compact"
            type="button"
            variant="secondary"
          >
            <ArrowUpRight aria-hidden="true" /> Review {scopeLabel}
          </Button>
        )}
        {request.kind !== "manual_answer" || !profile || !question ? (
          <Button
            disabled={isVerifying || attemptsExhausted}
            onClick={() => onCommand(createCommand(request, "confirm_done"))}
            pending={isPending}
            size="compact"
            type="button"
            variant="secondary"
          >
            <Check aria-hidden="true" />
            {isVerifying
              ? "Verifying"
              : attemptsExhausted
                ? "Attempts exhausted"
                : presentation.doneLabel}
          </Button>
        ) : null}
        {/* "Skip" and "Cancel" were peers with no stated difference and the
            same outcome: both close the request without doing the step. One
            dismissal, named for what it does. */}
        {/* The label said nothing about the consequence, so cancelling read
            as "put this aside" rather than "this application stops here". */}
        <Button
          aria-describedby={cancelConsequenceId}
          onClick={() => onCommand(createCommand(request, "cancel"))}
          pending={isPending}
          size="compact"
          type="button"
          variant="ghost"
        >
          <Ban aria-hidden="true" /> Cancel this step
        </Button>
      </div>
      <p
        className="text-xs leading-5 text-muted-foreground"
        id={cancelConsequenceId}
      >
        Cancelling closes this step without doing it. Job Finder stops working
        on it and nothing is sent; you can still finish it yourself on the job
        site.
      </p>

      {!request.actionUrl ? (
        <p
          className="rounded-md border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-xs leading-5 text-foreground-soft"
          id={missingBrowserLinkDescriptionId}
          role="status"
        >
          The saved browser link is unavailable. Review the {scopeLabel} to
          restart or recover this step; if the correct browser page is already
          open, finish there and then use the confirmation action above.
        </p>
      ) : null}

      {isPending ? (
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          {`Working in ${JOB_FINDER_BROWSER_NAME}. This step is time-limited and the controls will re-enable automatically.`}
        </p>
      ) : null}

      {attemptsExhausted ? (
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          Automatic checks paused after {request.maxAttempts} attempts. You can
          reopen the step in {JOB_FINDER_BROWSER_NAME}, then skip or cancel this
          request.
        </p>
      ) : null}
    </article>
  );
}

const snoozeDayMs = 86_400_000;

/**
 * Builds the typed approval payload that covers exactly the persisted decision
 * lineage ids/revisions plus the persisted answer. No client-side fan-out is
 * ever constructed here: the service applies the full lineage atomically.
 */
export function buildGroupedApplyInput(
  decision: GroupedManualAnswerDecision,
): ApplyGroupedManualAnswerInput {
  return {
    decisionId: decision.id,
    requestIds: decision.lineage.map((entry) => entry.requestId),
    expectedRequestRevisions: Object.fromEntries(
      decision.lineage.map((entry) => [
        entry.requestId,
        entry.expectedRequestRevision,
      ]),
    ),
    answer: decision.answer,
  };
}

function buildGroupedSnoozeInput(
  decision: GroupedManualAnswerDecision,
  days: number,
): SnoozeGroupedDecisionInput {
  return {
    decisionId: decision.id,
    expectedRevision: decision.expectedRevision,
    until: new Date(Date.now() + days * snoozeDayMs).toISOString(),
    reason: null,
  };
}

function GroupedDecisionCard(props: {
  compact?: boolean;
  decision: GroupedManualAnswerDecision;
  isApplyPending: boolean;
  isSnoozePending: boolean;
  jobsById: ReadonlyMap<string, DiscoveryJob>;
  onApply: (input: ApplyGroupedManualAnswerInput) => void;
  onSnooze: (input: SnoozeGroupedDecisionInput) => void;
}) {
  const { compact = false, decision, jobsById } = props;
  const hasConflict = decision.conflict.status === "detected";
  const uniqueJobCount = new Set(decision.lineage.map((entry) => entry.jobId))
    .size;
  const jobLabel = (jobId: string) => {
    const job = jobsById.get(jobId);
    return job
      ? `${job.title} at ${job.company}`
      : `Application for job ${jobId}`;
  };
  const jobNoun = uniqueJobCount === 1 ? "job" : "jobs";

  return (
    <article
      aria-label={`Reusable answer ${decision.id}`}
      className="grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="status">Manual answer</Badge>
            <Badge variant="outline">Pending reuse</Badge>
            {hasConflict ? (
              <Badge variant="outline">Conflict detected</Badge>
            ) : null}
          </div>
          <h3 className="font-semibold text-(--text-headline)">
            {compact
              ? `Snoozed reusable answer for ${uniqueJobCount} ${jobNoun}`
              : `Reuse one answer across ${uniqueJobCount} ${jobNoun}`}
          </h3>
        </div>
      </div>

      <div className="rounded-md border border-border/70 bg-background/45 p-4">
        <p className="text-xs text-muted-foreground">Reusable answer</p>
        <p className="mt-1 min-w-0 wrap-anywhere whitespace-pre-wrap text-sm leading-6 text-foreground">
          {decision.answer.value}
        </p>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Scope</dt>
          <dd className="font-medium text-foreground">
            {decision.lineage.length} pending application question
            {decision.lineage.length === 1 ? "" : "s"} across {uniqueJobCount}{" "}
            {jobNoun}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="font-medium text-foreground">
            {formatDateOnly(decision.createdAt)}
          </dd>
        </div>
      </dl>

      <ul className="grid gap-1 text-sm leading-6 text-foreground-soft">
        {decision.lineage.map((entry) => (
          <li
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0"
            key={entry.requestId}
          >
            <span className="font-medium text-foreground">
              {jobLabel(entry.jobId)}
            </span>
            <span className="text-xs text-muted-foreground">
              request {entry.requestId} · revision{" "}
              {entry.expectedRequestRevision}
            </span>
          </li>
        ))}
      </ul>

      {hasConflict ? (
        <p
          className="rounded-md border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-xs leading-5 text-foreground-soft"
          role="status"
        >
          {decision.conflict.summary ??
            "A conflicting saved answer was detected for this question."}{" "}
          Approval stays disabled until the conflict is resolved. Resolve it in
          Profile, then return here to approve reuse.
        </p>
      ) : null}

      {!compact ? (
        <p className="rounded-md border border-border/60 bg-background/35 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Approving fills only these pending application questions with the
          exact answer above. Job Finder cannot create an account or submit an
          application. Review and submit on the employer site yourself.
        </p>
      ) : null}

      <div
        aria-label={`Actions for reusable answer ${decision.id}`}
        className="flex flex-wrap gap-2"
        role="group"
      >
        <Button
          disabled={hasConflict}
          onClick={() => props.onApply(buildGroupedApplyInput(decision))}
          pending={props.isApplyPending}
          size="compact"
          type="button"
        >
          <Check aria-hidden="true" /> Approve &amp; reuse for {uniqueJobCount}{" "}
          {jobNoun}
        </Button>
        {!compact ? (
          <>
            <Button
              onClick={() =>
                props.onSnooze(buildGroupedSnoozeInput(decision, 1))
              }
              pending={props.isSnoozePending}
              size="compact"
              type="button"
              variant="secondary"
            >
              Snooze 1 day
            </Button>
            <Button
              onClick={() =>
                props.onSnooze(buildGroupedSnoozeInput(decision, 3))
              }
              pending={props.isSnoozePending}
              size="compact"
              type="button"
              variant="secondary"
            >
              Snooze 3 days
            </Button>
            <Button
              onClick={() =>
                props.onSnooze(buildGroupedSnoozeInput(decision, 7))
              }
              pending={props.isSnoozePending}
              size="compact"
              type="button"
              variant="secondary"
            >
              Snooze 7 days
            </Button>
          </>
        ) : null}
      </div>

      {decision.snooze ? (
        <p
          className="flex items-center gap-2 text-xs leading-5 text-muted-foreground"
          role="status"
        >
          <BellOff aria-hidden="true" className="size-3.5 shrink-0" />
          Snoozed until {formatDateOnly(decision.snooze.until)}
          {decision.snooze.reason ? ` · ${decision.snooze.reason}` : ""}.
        </p>
      ) : null}
    </article>
  );
}

export function ActionsScreen(props: {
  applicationAttempts?: JobFinderWorkspaceSnapshot["applicationAttempts"];
  applicationRecords?: JobFinderWorkspaceSnapshot["applicationRecords"];
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  groupedDecisions?: readonly GroupedManualAnswerDecision[];
  isGroupedApplyPending?: (decisionId: string) => boolean;
  isGroupedProjectPending?: (groupKey: string) => boolean;
  isGroupedSnoozePending?: (decisionId: string) => boolean;
  isPending: (requestId: string) => boolean;
  onApplyGroupedManualAnswer?: (input: ApplyGroupedManualAnswerInput) => void;
  onCommand: (command: UserActionCommandInput) => void;
  onNavigate: (path: string) => void;
  onProjectGroupedManualAnswer?: (
    command: ProjectGroupedManualAnswerCommand,
  ) => void;
  onSnoozeGroupedDecision?: (input: SnoozeGroupedDecisionInput) => void;
  profile?: CandidateProfile;
  requests: readonly UserActionRequest[];
}) {
  const groupedDecisions = props.groupedDecisions ?? [];
  const pendingDecisions = groupedDecisions.filter(
    (decision) => decision.approval === "pending",
  );
  // Ordinary member cards stay hidden only while a persisted pending grouped
  // decision represents them, so the same question is never surfaced twice.
  const representedRequestIds = new Set(
    pendingDecisions.flatMap((decision) =>
      decision.lineage.map((entry) => entry.requestId),
    ),
  );
  const unresolved = listUnresolvedUserActions(props.requests).filter(
    (request) => !representedRequestIds.has(request.id),
  );
  const activeDecisions = pendingDecisions.filter(
    (decision) => decision.snooze === null,
  );
  const snoozedDecisions = pendingDecisions.filter(
    (decision) => decision.snooze !== null,
  );
  const view = usePersistedCollectionView("needs-you", "comfortable");
  const deferredQuery = useDeferredValue(view.query);
  const jobsById = useMemo(
    () => buildJobIndexById(props.discoveryJobs),
    [props.discoveryJobs],
  );
  const visibleRequests = useMemo(
    () =>
      unresolved.filter((request) => {
        const applicationScope =
          request.scope.type === "application" ? request.scope : null;
        const job = applicationScope
          ? (jobsById.get(applicationScope.jobId) ?? null)
          : null;
        return matchesCollectionSearch(deferredQuery, [
          request.title,
          userActionKindPresentations[request.kind].label,
          request.scope.type,
          job?.title,
          job?.company,
          ...request.instructions,
        ]);
      }),
    [deferredQuery, jobsById, unresolved],
  );
  const [page, setPage] = useState(1);
  const pageCount = Math.max(
    1,
    Math.ceil(visibleRequests.length / COLLECTION_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  const pagedRequests = useMemo(
    () =>
      visibleRequests.slice(
        (currentPage - 1) * COLLECTION_PAGE_SIZE,
        currentPage * COLLECTION_PAGE_SIZE,
      ),
    [currentPage, visibleRequests],
  );

  useEffect(() => {
    setPage(1);
  }, [view.query]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const groups = [
    {
      id: "application" as const,
      title: "Applications",
      totalCount: visibleRequests.filter(
        (request) => request.scope.type === "application",
      ).length,
    },
    {
      id: "discovery_source" as const,
      title: "Job sources",
      totalCount: visibleRequests.filter(
        (request) => request.scope.type === "discovery_source",
      ).length,
    },
  ];

  const hasPendingDecisionCards = pendingDecisions.length > 0;

  return (
    <section className="grid gap-5 pb-8">
      <PageHeaderStack
        // Each card already carries the exact no-submit boundary for the
        // action it offers; the page header owns the credential boundary
        // only, so the promise is stated once per card instead of three
        // times on the same screen.
        description={`Finish each step in ${JOB_FINDER_BROWSER_NAME}, right here in the app, then come back and confirm. Passwords and security codes stay with you.`}
        title="Needs you"
      />

      {/* A search field plus a "1 result" counter above a single card is
          dead chrome in the first viewport. Search appears once the list is
          long enough to need it, or while a query is already narrowing it. */}
      {unresolved.length >= ACTION_SEARCH_MIN_ITEMS || view.query.length > 0 ? (
        <CollectionSearchToolbar
          label="Find an action"
          onQueryChange={view.setQuery}
          placeholder="Search jobs, companies, sources, or action type"
          placement="page"
          query={view.query}
          totalCount={unresolved.length}
          visibleCount={visibleRequests.length}
        />
      ) : null}

      {activeDecisions.length > 0 ? (
        <section
          aria-labelledby="reusable-answers-heading"
          className="grid gap-3"
        >
          <div className="flex items-center gap-2">
            <h2
              className="font-semibold text-(--text-headline)"
              id="reusable-answers-heading"
            >
              Reusable answers
            </h2>
            <Badge variant="section">{activeDecisions.length}</Badge>
          </div>
          <div className="grid gap-3">
            {activeDecisions.map((decision) => (
              <GroupedDecisionCard
                decision={decision}
                isApplyPending={
                  props.isGroupedApplyPending?.(decision.id) ?? false
                }
                isSnoozePending={
                  props.isGroupedSnoozePending?.(decision.id) ?? false
                }
                jobsById={jobsById}
                key={decision.id}
                onApply={(input) => props.onApplyGroupedManualAnswer?.(input)}
                onSnooze={(input) => props.onSnoozeGroupedDecision?.(input)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {snoozedDecisions.length > 0 ? (
        <section aria-labelledby="snoozed-heading" className="grid gap-3">
          <div className="flex items-center gap-2">
            <h2
              className="font-semibold text-(--text-headline)"
              id="snoozed-heading"
            >
              Snoozed
            </h2>
            <Badge variant="section">{snoozedDecisions.length}</Badge>
          </div>
          <div className="grid gap-3">
            {snoozedDecisions.map((decision) => (
              <GroupedDecisionCard
                compact
                decision={decision}
                isApplyPending={
                  props.isGroupedApplyPending?.(decision.id) ?? false
                }
                isSnoozePending={
                  props.isGroupedSnoozePending?.(decision.id) ?? false
                }
                jobsById={jobsById}
                key={decision.id}
                onApply={(input) => props.onApplyGroupedManualAnswer?.(input)}
                onSnooze={(input) => props.onSnoozeGroupedDecision?.(input)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {unresolved.length === 0 && !hasPendingDecisionCards ? (
        <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-5">
          <div className="grid gap-2" role="status">
            <h2 className="font-semibold text-(--text-headline)">
              Nothing needs you right now
            </h2>
            <p className="text-sm text-foreground-soft">
              Blocked sources and applications will appear here when a
              browser-only step needs your attention.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => props.onNavigate("/job-finder/discovery")}
              size="compact"
              type="button"
            >
              <ArrowUpRight aria-hidden="true" /> Find jobs
            </Button>
          </div>
        </div>
      ) : unresolved.length > 0 && visibleRequests.length === 0 ? (
        <CollectionNoMatches
          noun="actions"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : (
        <>
          {groups.map((group) => {
            const totalCount = group.totalCount;
            if (totalCount === 0) {
              return null;
            }
            const pageRequests = pagedRequests.filter(
              (request) => request.scope.type === group.id,
            );
            return (
              <section
                className="grid gap-3"
                key={group.id}
                aria-labelledby={`action-group-${group.id}`}
              >
                <div className="flex items-center gap-2">
                  <h2
                    className="font-semibold text-(--text-headline)"
                    id={`action-group-${group.id}`}
                  >
                    {group.title}
                  </h2>
                  {/* Canonical count across every matching action, independent
                  of the mounted page window. */}
                  <Badge variant="section">{totalCount}</Badge>
                </div>
                {pageRequests.length === 0 ? (
                  <p className="text-sm leading-6 text-foreground-soft">
                    All {totalCount} on another page.
                  </p>
                ) : (
                  <>
                    {pageRequests.length < totalCount ? (
                      <p className="text-sm leading-6 text-foreground-soft">
                        Showing {pageRequests.length} of {totalCount} on this
                        page.
                      </p>
                    ) : null}
                    <div className="grid gap-3">
                      {pageRequests.map((request) => {
                        const applicationScope =
                          request.scope.type === "application"
                            ? request.scope
                            : null;
                        const job = applicationScope
                          ? (jobsById.get(applicationScope.jobId) ?? null)
                          : null;
                        const matchingAttempt = applicationScope
                          ? ([...(props.applicationAttempts ?? [])]
                              .filter(
                                (attempt) =>
                                  attempt.jobId === applicationScope.jobId &&
                                  attempt.blocker?.code ===
                                    "missing_candidate_answer",
                              )
                              .sort((left, right) =>
                                right.updatedAt.localeCompare(left.updatedAt),
                              )[0] ?? null)
                          : null;
                        const questions =
                          matchingAttempt?.questions.filter(
                            (question) => question.status === "detected",
                          ) ?? [];
                        const question =
                          questions.length === 1
                            ? (questions[0] ?? null)
                            : null;
                        return (
                          <ActionCard
                            isGroupedProjectPending={
                              props.isGroupedProjectPending ?? (() => false)
                            }
                            isPending={props.isPending(request.id)}
                            jobLabel={
                              job ? `${job.title} at ${job.company}` : null
                            }
                            key={request.id}
                            onCommand={props.onCommand}
                            onProjectGroupedManualAnswer={
                              props.onProjectGroupedManualAnswer ??
                              (() => undefined)
                            }
                            profile={props.profile ?? null}
                            question={question}
                            onOpenScope={() =>
                              props.onNavigate(
                                getUserActionContextRoute(
                                  request,
                                  props.applicationRecords,
                                ),
                              )
                            }
                            request={request}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            );
          })}
          <CollectionPagination
            itemLabel="actions"
            onPageChange={setPage}
            page={currentPage}
            pageSize={COLLECTION_PAGE_SIZE}
            totalCount={visibleRequests.length}
          />
        </>
      )}
    </section>
  );
}
