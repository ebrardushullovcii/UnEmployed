import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Compass,
  FileSearch,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ProfileSetupReviewActionOptions,
  ProfileSetupState,
  ProfileSetupStep,
  ResumeImportFieldCandidateSummary,
  ResumeImportProgressEvent,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { Checkbox } from "@renderer/components/ui/checkbox";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import {
  formatProfileSetupStepLabel,
  profileSetupStepDefinitions,
} from "./profile-setup-steps";
import { ResumeImportProgress } from "../resume-import-progress";
import {
  badgeVariantForSeverity,
  canClearReviewItem,
  canConfirmReviewItem,
  formatReviewSeverity,
  formatReviewStatus,
  formatProfileSetupReviewValue,
  getReviewItemEditHint,
  type ProfileSetupReviewItemDisplay,
  isBlockingPendingReviewItem,
  isOptionalPendingReviewItem,
} from "./profile-setup-screen-helpers";

const stepIconById = {
  import: FileSearch,
  essentials: UserRound,
  background: CheckCircle2,
  targeting: Target,
  narrative: Sparkles,
  answers: Compass,
  ready_check: CheckCircle2,
} satisfies Record<ProfileSetupStep, typeof UserRound>;

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}% confidence`;
}

function getCandidateConflictLabel(
  candidate: ResumeImportFieldCandidateSummary | null,
): string | null {
  if (!candidate || (candidate.conflictChoices?.length ?? 0) < 2) {
    return null;
  }

  const sourceLabels = Array.from(
    new Set(
      (candidate.conflictChoices ?? []).map((choice) => choice.sourceLabel),
    ),
  );
  return sourceLabels.length > 0
    ? `Different values found in ${sourceLabels.join(" and ")}.`
    : "Different imported values need review.";
}

export function ProfileSetupSummaryCards(props: {
  actionMessage: string | null;
  importDisabledReason?: string | null;
  isImportResumePending: boolean;
  isProfileSetupPending: boolean;
  resumeImportProgress: ResumeImportProgressEvent | null;
  hasImportedResume: boolean;
  onImportResume: () => void;
  onOpenProfile: () => void;
  onResumeCurrentStep: () => void;
  onStartManually: () => void;
  profileSetupState: ProfileSetupState;
  readinessCards: ReadonlyArray<{ label: string; value: string }>;
  reviewItemCount: number;
  optionalReviewItemCount: number;
}) {
  const hasPendingReviewItems = props.reviewItemCount > 0;
  const hasOptionalSuggestions = props.optionalReviewItemCount > 0;
  const isPristine =
    props.profileSetupState.status === "not_started" &&
    !props.hasImportedResume;
  const currentStepLabel = formatProfileSetupStepLabel(
    props.profileSetupState.currentStep,
  );

  if (isPristine) {
    return (
      <Card className="overflow-hidden rounded-(--radius-panel) border-border/40 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface-panel)_90%,transparent),color-mix(in_srgb,var(--surface-panel-raised)_86%,transparent))]">
        <CardHeader className="gap-3 border-b border-border/30 pb-5">
          <Badge className="w-fit" variant="outline">
            First step
          </Badge>
          <CardTitle>Start with the résumé you already have.</CardTitle>
          <CardDescription className="max-w-2xl">
            Importing is the fastest path: Job Finder extracts your experience,
            then asks only about important gaps or uncertain details. The
            selected file is copied into this local workspace. If a model
            provider is configured, its extracted content may be sent to that
            provider for analysis; nothing is sent to an employer during setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,0.62fr)]">
            <button
              className="group rounded-(--radius-field) border border-foreground/20 bg-foreground p-5 text-left text-background transition-transform hover:-translate-y-0.5"
              disabled={
                props.isImportResumePending ||
                props.isProfileSetupPending ||
                Boolean(props.importDisabledReason)
              }
              aria-busy={props.isImportResumePending || undefined}
              onClick={props.onImportResume}
              type="button"
            >
              <span className="block text-base font-semibold">
                {props.isImportResumePending ? "Importing résumé…" : "Import my résumé"}
              </span>
              <span className="mt-2 block text-sm leading-6 text-background/70">
                PDF, DOCX, TXT, or Markdown · review before anything is approved
              </span>
            </button>
            <button
              className="group rounded-(--radius-field) border border-border/40 bg-background/55 p-5 text-left transition-colors hover:border-border hover:bg-secondary/35"
              aria-busy={props.isProfileSetupPending || undefined}
              disabled={props.isProfileSetupPending || props.isImportResumePending}
              onClick={props.onStartManually}
              type="button"
            >
              <span className="block text-base font-semibold text-foreground">
                Enter details manually
              </span>
              <span className="mt-2 block text-sm leading-6 text-foreground-soft">
                Begin with contact details and target roles; add the rest when
                it becomes useful.
              </span>
            </button>
          </div>
          {props.importDisabledReason ? (
            <p className="text-sm leading-6 text-foreground-soft">
              {props.importDisabledReason}
            </p>
          ) : null}
          {props.actionMessage ? (
            <div
              className="rounded-(--radius-field) border border-border/25 bg-background/70 p-4 text-sm text-foreground-soft"
              role="status"
            >
              {props.actionMessage}
            </div>
          ) : null}
          <ResumeImportProgress
            isPending={props.isImportResumePending}
            progress={props.resumeImportProgress}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Model processing, when enabled, follows your configured provider.
            Employer access stays off until you explicitly prepare a shortlisted
            application, and final submission remains unavailable.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden rounded-(--radius-panel) border-border/40 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface-panel)_88%,transparent),color-mix(in_srgb,var(--surface-panel-raised)_88%,transparent))]">
        <CardHeader className="gap-3 border-b border-border/30 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                props.profileSetupState.status === "completed"
                  ? "default"
                  : "outline"
              }
            >
              {props.profileSetupState.status.replace("_", " ")}
            </Badge>
            {props.reviewItemCount > 0 ? (
              <Badge variant="status">
                {props.reviewItemCount} review item
                {props.reviewItemCount === 1 ? "" : "s"} waiting
              </Badge>
            ) : null}
            {props.optionalReviewItemCount > 0 ? (
              <Badge variant="outline">
                {props.optionalReviewItemCount} optional suggestion
                {props.optionalReviewItemCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          <CardTitle>
            {props.profileSetupState.status === "not_started"
              ? "Build your job-search profile."
              : props.profileSetupState.status === "completed"
                ? "Your job-search profile is ready."
                : `${hasPendingReviewItems ? "Review" : "Continue with"} ${currentStepLabel}.`}
          </CardTitle>
          <CardDescription>
            {props.profileSetupState.status === "not_started"
              ? "Import a resume or start manually. Job Finder will show specific review items after it has something to evaluate."
              : hasOptionalSuggestions && !hasPendingReviewItems
                ? "Optional suggestions are available, but they do not block setup."
                : "Review any flagged details, then continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {props.readinessCards.map((card) => (
              <div
                key={card.label}
                className="rounded-(--radius-field) border border-border/30 bg-background/50 p-4"
              >
                <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {props.hasImportedResume ? (
              <>
                <Button
                  onClick={props.onResumeCurrentStep}
                  disabled={props.isImportResumePending}
                  pending={props.isProfileSetupPending}
                >
                  {hasPendingReviewItems
                    ? `Review ${currentStepLabel}`
                    : props.profileSetupState.status === "completed"
                      ? `Review ${currentStepLabel}`
                      : `Continue ${currentStepLabel}`}
                </Button>
                <Button
                  variant="secondary"
                  onClick={props.onImportResume}
                  disabled={Boolean(props.importDisabledReason)}
                  pending={props.isImportResumePending}
                >
                  Replace resume
                </Button>
              </>
            ) : (
              <Button
                onClick={props.onResumeCurrentStep}
                disabled={props.isImportResumePending}
                pending={props.isProfileSetupPending}
              >
                Start {currentStepLabel}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={props.onOpenProfile}
              disabled={props.isImportResumePending}
              pending={props.isProfileSetupPending}
            >
              Open full Profile
            </Button>
          </div>
          {props.importDisabledReason ? (
            <p className="text-sm leading-6 text-foreground-soft">
              {props.importDisabledReason}
            </p>
          ) : null}
          <ResumeImportProgress
            isPending={props.isImportResumePending}
            progress={props.resumeImportProgress}
          />
        </CardContent>
      </Card>

      <Card className="rounded-(--radius-panel) border-border/40">
        <CardHeader className="gap-2 border-b border-border/30 pb-5">
          <CardTitle>Current step</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <div>
            <p className="text-xl font-semibold text-foreground">
              {currentStepLabel}
            </p>
          </div>
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4 text-sm text-foreground-soft">
            {hasPendingReviewItems
              ? `${props.reviewItemCount} review item${props.reviewItemCount === 1 ? "" : "s"} still ${props.reviewItemCount === 1 ? "needs" : "need"} attention in this step before the setup feels trustworthy.`
              : hasOptionalSuggestions
                ? `${props.optionalReviewItemCount} optional suggestion${props.optionalReviewItemCount === 1 ? " is" : "s are"} available in this step. Optional suggestions do not block setup.`
                : props.profileSetupState.status === "not_started"
                  ? "Start by importing a resume or opening the current step to enter your details manually."
                  : "No review items here. Continue when you are ready."}
          </div>
          {props.actionMessage ? (
            <div
              className="rounded-(--radius-field) border border-border/25 bg-background/70 p-4 text-sm text-foreground-soft"
              role="status"
            >
              {props.actionMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

export function ProfileSetupPathCard(props: {
  currentStep: ProfileSetupStep;
  disabled?: boolean;
  onGoToStep: (step: ProfileSetupStep) => void;
  profileSetupState: ProfileSetupState;
}) {
  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Setup path</CardTitle>
        <CardDescription>
          Return to any step when needed. Review items stay saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-6">
        {profileSetupStepDefinitions.map((step, index) => {
          const StepIcon = stepIconById[step.id];
          const isActive = props.currentStep === step.id;
          const stepReviewItems = props.profileSetupState.reviewItems.filter(
            (item) => item.step === step.id,
          );
          const pendingReviewCount = stepReviewItems.filter(
            isBlockingPendingReviewItem,
          ).length;
          const optionalReviewCount = stepReviewItems.filter(
            isOptionalPendingReviewItem,
          ).length;
          const isComplete =
            pendingReviewCount === 0 &&
            (props.profileSetupState.status === "completed" ||
              profileSetupStepDefinitions.findIndex(
                (entry) => entry.id === props.currentStep,
              ) > index);

          return (
            <button
              key={step.id}
              className="group flex w-full items-start gap-4 rounded-(--radius-field) border border-border/30 bg-background/50 p-4 text-left transition-colors hover:border-border hover:bg-secondary/35"
              onClick={() => props.onGoToStep(step.id)}
              disabled={props.disabled}
              type="button"
            >
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/40 bg-secondary/50 text-foreground">
                {isComplete ? (
                  <CheckCircle2 className="size-4" />
                ) : isActive ? (
                  <StepIcon className="size-4" />
                ) : (
                  <Circle className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {step.label}
                  </span>
                  {isActive ? <Badge variant="default">Current</Badge> : null}
                  {pendingReviewCount > 0 ? (
                    <Badge variant="status">
                      {pendingReviewCount} to review
                    </Badge>
                  ) : optionalReviewCount > 0 ? (
                    <Badge variant="outline">
                      {optionalReviewCount} optional
                    </Badge>
                  ) : isComplete && !isActive ? (
                    <Badge variant="outline">Complete</Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm leading-6 text-foreground-soft">
                  {step.summary}
                </span>
                {pendingReviewCount > 0 ? (
                  <span className="mt-1 block text-xs leading-5 text-foreground-muted">
                    New imports or edits can add review items here; completing
                    another step does not clear them.
                  </span>
                ) : optionalReviewCount > 0 ? (
                  <span className="mt-1 block text-xs leading-5 text-foreground-muted">
                    Optional suggestions are available here, but they do not
                    block this step or setup completion.
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ProfileSetupReviewQueueCard(props: {
  actionsDisabledReason?: string | null;
  isReviewItemPending: (reviewItemId: string) => boolean;
  items: readonly ProfileSetupReviewItemDisplay[];
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[];
  onApplyReviewAction: (
    reviewItemId: string,
    action: "confirm" | "dismiss" | "clear_value",
    options?: ProfileSetupReviewActionOptions,
  ) => void;
  onEditReviewItem: (item: ProfileSetupReviewItemDisplay) => void;
}) {
  const [pendingReviewAction, setPendingReviewAction] = useState<{
    action: "confirm" | "dismiss" | "clear_value";
    selectedConflictChoiceId?: string;
    reviewItemId: string;
  } | null>(null);
  const blockingPendingCount = props.items.filter(
    isBlockingPendingReviewItem,
  ).length;
  const optionalPendingCount = props.items.filter(
    isOptionalPendingReviewItem,
  ).length;
  const resumeImportCandidateById = new Map(
    props.latestResumeImportReviewCandidates.map((candidate) => [
      candidate.id,
      candidate,
    ]),
  );
  const isPendingReviewActionStillPending = pendingReviewAction
    ? props.isReviewItemPending(pendingReviewAction.reviewItemId)
    : false;

  useEffect(() => {
    if (!pendingReviewAction || isPendingReviewActionStillPending) {
      return;
    }

    setPendingReviewAction(null);
  }, [isPendingReviewActionStillPending, pendingReviewAction]);

  const isReviewActionPending = (
    reviewItemId: string,
    action?: "confirm" | "dismiss" | "clear_value",
    selectedConflictChoiceId?: string,
  ) =>
    props.isReviewItemPending(reviewItemId) &&
    pendingReviewAction?.reviewItemId === reviewItemId &&
    (!action || pendingReviewAction.action === action) &&
    (!selectedConflictChoiceId ||
      pendingReviewAction.selectedConflictChoiceId ===
        selectedConflictChoiceId);

  const applyReviewAction = (
    reviewItemId: string,
    action: "confirm" | "dismiss" | "clear_value",
    options?: ProfileSetupReviewActionOptions,
  ) => {
    setPendingReviewAction(
      options?.selectedConflictChoiceId
        ? {
            action,
            reviewItemId,
            selectedConflictChoiceId: options.selectedConflictChoiceId,
          }
        : { action, reviewItemId },
    );
    props.onApplyReviewAction(reviewItemId, action, options);
  };

  return (
    <Card
      className="min-h-0 flex-1 overflow-hidden rounded-(--radius-panel) border-border/40"
      id="profile-setup-review-queue"
      tabIndex={-1}
    >
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Step review queue</CardTitle>
        <CardDescription>
          Imported suggestions and missing fields stay here until you confirm,
          dismiss, or clear them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
        <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4 text-sm leading-6 text-foreground-soft">
          {blockingPendingCount > 0
            ? `${blockingPendingCount} item${blockingPendingCount === 1 ? "" : "s"} still ${blockingPendingCount === 1 ? "needs" : "need"} confirmation or an edit in this step.${optionalPendingCount > 0 ? ` ${optionalPendingCount} optional suggestion${optionalPendingCount === 1 ? " is" : "s are"} also available.` : ""}`
            : optionalPendingCount > 0
              ? `${optionalPendingCount} optional suggestion${optionalPendingCount === 1 ? " is" : "s are"} available. Optional suggestions do not block setup.`
              : "Everything mapped to this step is already resolved in the saved workspace state."}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-3 pr-4">
            {props.items.length > 0 ? (
              props.items.map((item) => {
                const isRowReviewActionPending = isReviewActionPending(item.id);
                const linkedCandidate = item.sourceCandidateId
                  ? (resumeImportCandidateById.get(item.sourceCandidateId) ??
                    null)
                  : null;
                const conflictLabel =
                  getCandidateConflictLabel(linkedCandidate);

                return (
                  <div
                    key={item.id}
                    className="rounded-(--radius-field) border border-border/30 bg-background/50 p-4"
                  >
                    {getReviewItemEditHint(item) ? (
                      <div className="mb-3 rounded-(--radius-field) border border-dashed border-border/40 bg-background/70 p-3 text-sm leading-6 text-foreground-soft">
                        {getReviewItemEditHint(item)}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {item.label}
                          </p>
                          <Badge
                            variant={badgeVariantForSeverity(item.severity)}
                          >
                            {formatReviewSeverity(item.severity)}
                          </Badge>
                          <Badge
                            variant={
                              item.status === "pending" ? "outline" : "default"
                            }
                          >
                            {formatReviewStatus(item.status)}
                          </Badge>
                          {item.statusSource === "draft" ? (
                            <Badge variant="status">Unsaved draft</Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground-soft">
                          {item.reason}
                        </p>
                        {item.statusSource === "draft" ? (
                          <p className="mt-2 text-sm leading-6 text-foreground-soft">
                            This item is already resolved in your current draft.
                            Save this step to keep that resolution.
                          </p>
                        ) : null}
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={item.status !== "pending"}
                          disabled
                        />
                        {item.statusSource === "draft"
                          ? "Resolved in draft"
                          : "Resolved"}
                      </label>
                    </div>
                    {item.proposedValue ? (
                      <div className="mt-3 rounded-(--radius-field) border border-dashed border-border/40 bg-background/70 p-3">
                        <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">
                          Suggested value
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {formatProfileSetupReviewValue(item.proposedValue)}
                        </p>
                      </div>
                    ) : null}
                    {(linkedCandidate?.conflictChoices?.length ?? 0) >= 2 ? (
                      <div className="mt-3 rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-(--warning-text)">
                            Import comparison
                          </p>
                          {conflictLabel ? (
                            <Badge variant="status">Needs choice</Badge>
                          ) : null}
                        </div>
                        {conflictLabel ? (
                          <p className="mt-2 text-sm leading-6 text-foreground-soft">
                            {conflictLabel}
                          </p>
                        ) : null}
                        <div className="mt-3 grid gap-2">
                          {(linkedCandidate?.conflictChoices ?? []).map(
                            (choice) => (
                              <div
                                className="rounded-(--radius-field) border border-border/30 bg-background/70 p-3"
                                key={choice.id}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      variant={
                                        choice.recommended
                                          ? "default"
                                          : "outline"
                                      }
                                    >
                                      {choice.recommended
                                        ? "Recommended"
                                        : "Alternative"}
                                    </Badge>
                                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                      {choice.sourceLabel}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {formatConfidence(choice.confidence)}
                                    </span>
                                  </div>
                                  {item.status === "pending" ? (
                                    <Button
                                      disabled={
                                        Boolean(props.actionsDisabledReason) ||
                                        props.isReviewItemPending(item.id) ||
                                        !canConfirmReviewItem(item)
                                      }
                                      pending={isReviewActionPending(
                                        item.id,
                                        "confirm",
                                        choice.id,
                                      )}
                                      onClick={() =>
                                        applyReviewAction(item.id, "confirm", {
                                          selectedConflictChoiceId: choice.id,
                                        })
                                      }
                                      size="sm"
                                      type="button"
                                      variant={
                                        choice.recommended
                                          ? "primary"
                                          : "secondary"
                                      }
                                    >
                                      Use {choice.sourceLabel}
                                    </Button>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm text-foreground">
                                  {formatProfileSetupReviewValue(
                                    choice.valuePreview ?? choice.value,
                                  ) ?? "Review this imported value."}
                                </p>
                                {choice.evidenceText ? (
                                  <p className="mt-1 text-xs leading-5 text-foreground-soft">
                                    {choice.evidenceText}
                                  </p>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ) : null}
                    {item.sourceSnippet ? (
                      <div className="mt-3 flex gap-2 rounded-(--radius-field) bg-secondary/30 p-3 text-sm text-foreground-soft">
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <p>{item.sourceSnippet}</p>
                      </div>
                    ) : null}
                    {item.status === "pending" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          aria-label={`Edit ${item.label}`}
                          disabled={Boolean(props.actionsDisabledReason)}
                          onClick={() => props.onEditReviewItem(item)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Edit this
                        </Button>
                        {canConfirmReviewItem(item) ? (
                          <Button
                            disabled={
                              Boolean(props.actionsDisabledReason) ||
                              props.isReviewItemPending(item.id) ||
                              (linkedCandidate?.conflictChoices?.length ?? 0) >=
                                2
                            }
                            pending={isRowReviewActionPending}
                            onClick={() =>
                              applyReviewAction(item.id, "confirm")
                            }
                            size="sm"
                            type="button"
                          >
                            Confirm
                          </Button>
                        ) : null}
                        {canClearReviewItem(item) ? (
                          <Button
                            disabled={
                              Boolean(props.actionsDisabledReason) ||
                              props.isReviewItemPending(item.id)
                            }
                            pending={isRowReviewActionPending}
                            onClick={() =>
                              applyReviewAction(item.id, "clear_value")
                            }
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Clear current value
                          </Button>
                        ) : null}
                        <Button
                          disabled={
                            Boolean(props.actionsDisabledReason) ||
                            props.isReviewItemPending(item.id)
                          }
                          pending={isRowReviewActionPending}
                          onClick={() => applyReviewAction(item.id, "dismiss")}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Dismiss for now
                        </Button>
                      </div>
                    ) : null}
                    {item.status === "pending" &&
                    props.actionsDisabledReason ? (
                      <p className="mt-2 text-(length:--text-tiny) text-muted-foreground">
                        {props.actionsDisabledReason}
                      </p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-(--radius-field) border border-dashed border-border/40 bg-background/50 p-4 text-sm leading-6 text-foreground-soft">
                No review items for this step right now. Save any edits and
                continue when ready.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
