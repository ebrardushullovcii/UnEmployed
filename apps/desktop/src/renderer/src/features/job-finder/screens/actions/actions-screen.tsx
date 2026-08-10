import type {
  ApplicationAttemptQuestion,
  CandidateProfile,
  JobFinderWorkspaceSnapshot,
  UserActionCommandInput,
  UserActionRequest,
} from "@unemployed/contracts";
import {
  ArrowUpRight,
  Ban,
  Check,
  ExternalLink,
  SkipForward,
} from "lucide-react";

import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { PageHeader } from "../../components/page-header";
import { AnswerMemoryEditor } from "./answer-memory-editor";

const terminalStates = new Set<UserActionRequest["state"]>([
  "resolved",
  "skipped",
  "cancelled",
  "expired",
  "superseded",
]);

export const userActionKindPresentations: Record<
  UserActionRequest["kind"],
  { label: string; openLabel: string; doneLabel: string; guidance: string }
> = {
  login: {
    label: "Sign in",
    openLabel: "Open sign-in",
    doneLabel: "I'm signed in",
    guidance: "Complete sign-in in the browser.",
  },
  signup: {
    label: "Sign up",
    openLabel: "Open sign-up",
    doneLabel: "Account is ready",
    guidance: "Create the account yourself in the browser.",
  },
  mfa: {
    label: "MFA",
    openLabel: "Open MFA",
    doneLabel: "MFA is complete",
    guidance: "Complete the security-code challenge in the browser.",
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
    guidance: "Review and answer the question in the browser.",
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
    guidance: "Attach the requested file yourself in the browser.",
  },
  other: {
    label: "Other",
    openLabel: "Open browser step",
    doneLabel: "Step is complete",
    guidance: "Complete the described browser-owned step yourself.",
  },
};

export function listUnresolvedUserActions(
  requests: readonly UserActionRequest[],
): readonly UserActionRequest[] {
  return requests.filter((request) => !terminalStates.has(request.state));
}

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
  isPending: boolean;
  jobLabel: string | null;
  onCommand: (command: UserActionCommandInput) => void;
  onOpenScope: () => void;
  profile: CandidateProfile | null;
  question: ApplicationAttemptQuestion | null;
  request: UserActionRequest;
}) {
  const {
    isPending,
    jobLabel,
    onCommand,
    onOpenScope,
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

  return (
    <article className="grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                request.requirement === "required" ? "default" : "section"
              }
            >
              {request.requirement}
            </Badge>
            <Badge variant="status">{presentation.label}</Badge>
            <Badge variant="outline">
              {request.state.replaceAll("_", " ")}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold text-(--text-headline)">
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
      {request.displayOrigin ? (
        <p className="break-all text-xs text-muted-foreground">
          Browser: {request.displayOrigin}
        </p>
      ) : null}
      {request.instructions.length > 0 ? (
        <ol className="grid list-decimal gap-1 pl-5 text-sm leading-6 text-foreground-soft">
          {request.instructions.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>
      ) : null}

      {request.kind === "manual_answer" && profile && question ? (
        <AnswerMemoryEditor
          isPending={isPending}
          onSubmit={(answer, saveForFuture) =>
            onCommand({
              ...createCommand(request, "confirm_done"),
              action: "submit_manual_answer",
              answer,
              saveForFuture,
            })
          }
          profile={profile}
          question={question}
          request={request}
        />
      ) : null}
      <p className="rounded-md border border-border/60 bg-background/35 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {presentation.guidance}{" "}
        {request.kind === "manual_answer"
          ? "A one-use answer stays scoped to this application; future reuse requires the explicit save action."
          : "Credentials and security answers stay in the browser."}{" "}
        This action cannot authorize account creation or a final application
        submission.
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
        <Button
          onClick={() => onCommand(createCommand(request, "skip"))}
          pending={isPending}
          size="compact"
          type="button"
          variant="ghost"
        >
          <SkipForward aria-hidden="true" /> Skip
        </Button>
        <Button
          onClick={() => onCommand(createCommand(request, "cancel"))}
          pending={isPending}
          size="compact"
          type="button"
          variant="outline"
        >
          <Ban aria-hidden="true" /> Cancel
        </Button>
      </div>

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
          Working in the dedicated browser. This step is time-limited and the
          controls will re-enable automatically.
        </p>
      ) : null}

      {attemptsExhausted ? (
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          Automatic checks paused after {request.maxAttempts} attempts. You can
          reopen the browser step, then skip or cancel this request.
        </p>
      ) : null}
    </article>
  );
}

export function ActionsScreen(props: {
  applicationAttempts?: JobFinderWorkspaceSnapshot["applicationAttempts"];
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  isPending: (requestId: string) => boolean;
  onCommand: (command: UserActionCommandInput) => void;
  onNavigate: (path: string) => void;
  profile?: CandidateProfile;
  requests: readonly UserActionRequest[];
}) {
  const unresolved = listUnresolvedUserActions(props.requests);
  const groups = [
    {
      id: "application",
      title: "Applications",
      requests: unresolved.filter(
        (request) => request.scope.type === "application",
      ),
    },
    {
      id: "discovery_source",
      title: "Job sources",
      requests: unresolved.filter(
        (request) => request.scope.type === "discovery_source",
      ),
    },
  ] as const;

  return (
    <section className="grid gap-8 pb-8">
      <PageHeader
        description="Finish browser-owned steps, then tell Job Finder when to verify. The app never receives passwords, security codes, or final-submit authority."
        eyebrow="Needs you"
        title="Action inbox"
      />

      {unresolved.length === 0 ? (
        <div
          className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-6"
          role="status"
        >
          <h2 className="text-lg font-semibold text-(--text-headline)">
            Nothing needs you right now
          </h2>
          <p className="text-sm text-foreground-soft">
            Blocked sources and applications will appear here when a
            browser-only step needs your attention.
          </p>
        </div>
      ) : (
        groups.map((group) =>
          group.requests.length > 0 ? (
            <section
              className="grid gap-3"
              key={group.id}
              aria-labelledby={`action-group-${group.id}`}
            >
              <div className="flex items-center gap-2">
                <h2
                  className="text-xl font-semibold text-(--text-headline)"
                  id={`action-group-${group.id}`}
                >
                  {group.title}
                </h2>
                <Badge variant="section">{group.requests.length}</Badge>
              </div>
              <div className="grid gap-3">
                {group.requests.map((request) => {
                  const applicationScope =
                    request.scope.type === "application" ? request.scope : null;
                  const job = applicationScope
                    ? (props.discoveryJobs.find(
                        (candidate) => candidate.id === applicationScope.jobId,
                      ) ?? null)
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
                    questions.length === 1 ? (questions[0] ?? null) : null;
                  return (
                    <ActionCard
                      isPending={props.isPending(request.id)}
                      jobLabel={job ? `${job.title} at ${job.company}` : null}
                      key={request.id}
                      onCommand={props.onCommand}
                      profile={props.profile ?? null}
                      question={question}
                      onOpenScope={() =>
                        props.onNavigate(
                          request.scope.type === "application"
                            ? "/job-finder/applications"
                            : "/job-finder/discovery",
                        )
                      }
                      request={request}
                    />
                  );
                })}
              </div>
            </section>
          ) : null,
        )
      )}
    </section>
  );
}
