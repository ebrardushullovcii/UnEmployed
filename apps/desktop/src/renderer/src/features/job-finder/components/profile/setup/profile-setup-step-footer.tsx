import {
  normalizeProfileSetupStep,
  type ProfileSetupStep,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { PROFILE_SETUP_VALIDATION_ALERT_ID } from "./profile-setup-screen-helpers";
import { getNextProfileSetupStep } from "./profile-setup-steps";

const CONTINUE_LABEL_BY_STEP: Record<string, string> = {
  import: "Save and go to Basics",
  essentials: "Save and continue to Work history",
  background: "Save and continue to Job targets",
  targeting: "Save and continue to Extras",
};

export const PROFILE_SETUP_FINISH_LABEL = "Finish setup and find jobs";

/**
 * The finish action lives on Job targets — the last required step — and stays
 * available on the optional Extras step. Every other step keeps its plain
 * "save and continue" primary, so there is exactly one primary per step.
 */
export function getProfileSetupStepFooterPrimary(input: {
  canFinishSetup: boolean;
  currentStep: ProfileSetupStep;
  onSaveAndFinish: () => void;
  onSaveAndGoToStep: (step: ProfileSetupStep) => void;
}): {
  disabled: boolean;
  label: string;
  onPrimary: (() => void) | null;
} {
  const currentStep = normalizeProfileSetupStep(input.currentStep);
  const canOfferFinish =
    currentStep === "targeting" || currentStep === "extras";

  if (canOfferFinish && input.canFinishSetup) {
    return {
      disabled: false,
      label: PROFILE_SETUP_FINISH_LABEL,
      onPrimary: input.onSaveAndFinish,
    };
  }

  if (currentStep === "extras") {
    // The last step has nowhere to continue to; it states why finishing is
    // still blocked through the readiness line beside it.
    return {
      disabled: true,
      label: PROFILE_SETUP_FINISH_LABEL,
      onPrimary: null,
    };
  }

  const nextStep = getNextProfileSetupStep(currentStep);

  return {
    disabled: false,
    label: CONTINUE_LABEL_BY_STEP[currentStep] ?? "Save and continue",
    onPrimary: () => input.onSaveAndGoToStep(nextStep ?? "extras"),
  };
}

/**
 * One readiness sentence for the whole of setup, in one place. The stepper
 * chips own per-step review counts; this line owns whether setup can finish
 * and what is still required, naming the items instead of counting them a
 * second time.
 */
export function formatProfileSetupFinishReadiness(input: {
  canFinishSetup: boolean;
  remainingBlockerLabels: readonly string[];
}): string {
  if (input.canFinishSetup) {
    return "Everything required is in. You can finish setup.";
  }

  if (input.remainingBlockerLabels.length === 0) {
    return "Setup cannot finish yet.";
  }

  return `Still needed to finish: ${input.remainingBlockerLabels.join(" · ")}.`;
}

export function ProfileSetupStepFooter(props: {
  canFinishSetup: boolean;
  currentStep: ProfileSetupStep;
  hasUnsavedChanges: boolean;
  /**
   * True only once the user has edited something. Right after an import the
   * step is dirty because Job Finder filled it in, which is not "changes you
   * left behind" and must not be reported as such.
   */
  hasUserEdits?: boolean;
  isProfileSetupPending: boolean;
  onSaveAndFinish: () => void;
  onSaveAndGoToStep: (step: ProfileSetupStep) => void;
  onSaveCurrentStep: () => void;
  /** Named canonical blockers still standing between here and Finish. */
  remainingBlockerLabels?: readonly string[];
  validationMessage: string | null;
}) {
  const primary = getProfileSetupStepFooterPrimary({
    canFinishSetup: props.canFinishSetup,
    currentStep: props.currentStep,
    onSaveAndFinish: props.onSaveAndFinish,
    onSaveAndGoToStep: props.onSaveAndGoToStep,
  });
  const readinessMessage = formatProfileSetupFinishReadiness({
    canFinishSetup: props.canFinishSetup,
    remainingBlockerLabels: props.remainingBlockerLabels ?? [],
  });

  return (
    // F82: `sm:flex-wrap` + `justify-between` meant that whenever the status
    // text was long enough to push the action cluster onto a second row, that
    // row held a single item and `justify-between` left-aligned it - so the
    // wizard's primary jumped ~750px horizontally between consecutive steps.
    // One stated rule now: the action cluster is always the rightmost item on
    // the footer's first row, and the status text wraps inside its own column.
    <div
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:px-5"
      data-profile-workspace-actions
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-1">
          {/* Same unambiguous save state as the Profile footer: a dot and a
              colour carry it as well as the words, so "is my work saved?" is
              answered at a glance rather than read out of muted body text. */}
          <p
            className={
              props.hasUnsavedChanges
                ? "flex items-center gap-2 text-sm font-medium leading-6 text-(--warning-text)"
                : "flex items-center gap-2 text-sm leading-6 text-foreground-soft"
            }
            data-profile-save-state={
              props.hasUnsavedChanges ? "dirty" : "clean"
            }
          >
            <span
              aria-hidden="true"
              className={
                props.hasUnsavedChanges
                  ? "size-2 shrink-0 rounded-full bg-(--warning-text)"
                  : "size-2 shrink-0 rounded-full bg-(--disabled-foreground)"
              }
            />
            {props.hasUnsavedChanges
              ? props.hasUserEdits === false
                ? // Right after an import the step is dirty because Job Finder
                  // filled it in. Saying "unsaved changes" there accuses the
                  // user of leaving work behind before they have typed anything.
                  "Imported details on this step are not saved yet."
                : "Unsaved changes on this step."
              : "No unsaved changes."}
          </p>
          <p
            className="min-w-0 break-words text-sm leading-6 text-foreground-soft"
            data-profile-setup-finish-readiness
            id="profile-setup-finish-blocker-summary"
          >
            {readinessMessage}
          </p>
          {props.validationMessage ? (
            <p
              className="text-sm leading-6 text-destructive"
              id={PROFILE_SETUP_VALIDATION_ALERT_ID}
              role="alert"
            >
              {props.validationMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
        <Button
          disabled={props.isProfileSetupPending || !props.hasUnsavedChanges}
          pending={props.isProfileSetupPending}
          onClick={props.onSaveCurrentStep}
          type="button"
          variant="secondary"
        >
          Save changes
        </Button>
        <Button
          aria-describedby={
            primary.disabled
              ? "profile-setup-finish-blocker-summary"
              : undefined
          }
          disabled={
            props.isProfileSetupPending ||
            primary.disabled ||
            !primary.onPrimary
          }
          pending={props.isProfileSetupPending}
          onClick={primary.onPrimary ?? undefined}
          type="button"
          // F29: on the one step whose required work is outstanding, a filled
          // "Save and continue" made moving on the visually loudest action
          // while the gating control sat as an outline button inside a warning
          // strip. While anything required is still missing, continuing is a
          // secondary action and the blockers named beside it are the path.
          variant={
            props.canFinishSetup ||
            (props.remainingBlockerLabels ?? []).length === 0
              ? "primary"
              : "secondary"
          }
        >
          {primary.label}
        </Button>
      </div>
    </div>
  );
}
