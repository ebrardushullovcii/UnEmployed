import {
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  filterProfileSetupSources,
  formatProfileSetupReviewValue,
  getProfileSetupSourceGuidance,
  getProfileSetupSourceHost,
  getProfileSetupStarterAccessNote,
  isValidProfileSetupSourceUrl,
  PROFILE_SETUP_SOURCE_PAGE_SIZE,
} from "./profile-setup-screen-helpers";
import {
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileSetupStep,
  type ResumeApplicationMode,
  type ResumeImportFieldCandidateSummary,
  type ResumeImportProgressEvent,
  type ResumeImportRun,
} from "@unemployed/contracts";
import { getResumeImportStageFallbackNotes } from "../profile-resume-panel";
import { getResumeImportStageFallbackSummary } from "../resume-import-quality-note";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useController } from "react-hook-form";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Checkbox } from "@renderer/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { FieldLabel } from "@renderer/components/ui/field";
import { CheckboxField } from "../../checkbox-field";
import { FormSelect } from "../../form-select";
import {
  formatStatusLabel,
  joinListInput,
  parseListInput,
} from "../../../lib/job-finder-utils";
import type { BooleanSelectValue } from "../../../lib/job-finder-types";
import type {
  ProfileEditorValues,
  SearchPreferencesEditorValues,
} from "../../../lib/profile-editor";
import {
  ProfileInput,
  ProfileTextarea,
  profileSelectTriggerClassName,
} from "../profile-form-primitives";
import { ProfileBasicsFields } from "../profile-basics-fields";
import { ProfileListEditor } from "../profile-list-editor";
import { PROFILE_WORK_CONSTRAINT_COPY } from "../profile-work-constraints-copy";
import { ResumeImportProgress } from "../resume-import-progress";

const booleanSelectOptions = [
  { label: "Not set", value: "" },
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
] as const;

const tailoringModeOptions = [
  {
    description:
      "Use the exact file you imported. Job Finder will not rewrite it or create a tailored copy; you still review each job before any prepare-only application work.",
    label: "Use original resume unchanged",
    value: "original_resume",
  },
  {
    description:
      "Keep your wording and structure mostly intact, with small role-specific improvements.",
    label: "Light edit",
    value: "conservative",
  },
  {
    description:
      "Adapt emphasis and wording to the role while keeping the shape of your experience familiar.",
    label: "Balanced rewrite",
    value: "balanced",
  },
  {
    description:
      "Substantially rewrite, combine, or elaborate supported experience. Review every generated line; new facts and numbers are never invented.",
    label: "Strong rewrite",
    value: "aggressive",
  },
] as const;

function getImportConflictSummary(
  candidate: ResumeImportFieldCandidateSummary,
): string | null {
  if ((candidate.conflictChoices?.length ?? 0) < 2) {
    return null;
  }

  const sourceLabels = Array.from(
    new Set(
      (candidate.conflictChoices ?? []).map((choice) => choice.sourceLabel),
    ),
  );
  return sourceLabels.length > 0
    ? `Compare ${sourceLabels.join(" and ")} before confirming.`
    : "Compare imported alternatives before confirming.";
}

function SetupBooleanField(props: {
  control: UseFormReturn<ProfileEditorValues>["control"];
  description?: string;
  id?: string;
  label: string;
  name:
    | "eligibility.remoteEligible"
    | "eligibility.requiresVisaSponsorship"
    | "eligibility.willingToRelocate"
    | "eligibility.willingToTravel";
}) {
  const generatedId = useId();
  const fieldId = props.id ?? generatedId;
  const descriptionId = `${fieldId}-help`;

  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
          <FieldLabel htmlFor={fieldId}>{props.label}</FieldLabel>
          <FormSelect
            onValueChange={(value) =>
              field.onChange(value as BooleanSelectValue)
            }
            options={booleanSelectOptions.map((option) => ({ ...option }))}
            placeholder="Not set"
            {...(props.description
              ? { triggerAriaDescribedBy: descriptionId }
              : {})}
            triggerClassName={profileSelectTriggerClassName}
            triggerId={fieldId}
            value={field.value}
          />
          {props.description ? (
            <p
              className="text-xs leading-5 text-foreground-muted"
              id={descriptionId}
            >
              {props.description}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

interface FooterOptions {
  nextLabel?: string;
  onPrimary?: (() => void) | null;
  primaryDisabled?: boolean;
  primaryLabel?: string;
}

export type RenderFooter = (options?: FooterOptions) => ReactNode;

export function ProfileSetupImportStep(props: {
  importDisabledReason?: string | null;
  isImportResumePending: boolean;
  isProfileSetupPending: boolean;
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[];
  latestResumeImportRun: ResumeImportRun | null;
  resumeImportProgress: ResumeImportProgressEvent | null;
  onContinueToProfile: () => void;
  onImportResume: () => void;
  onSaveAndGoToStep: (step: ProfileSetupStep) => void;
  profile: CandidateProfile;
  renderFooter: RenderFooter;
  /** Still passed by the shared step editor; the footer below already reports this count for every step. */
  reviewItemCount: number;
}) {
  // The visible import guard reason is associated with the import control so
  // assistive tech reads why the control cannot be used right now.
  const importDisabledReasonId = useId();
  const needsReadableText =
    props.profile.baseResume.extractionStatus === "needs_text";
  // Truthful detail straight from the persisted extraction warnings: deduped
  // and capped so recovery stays compact instead of turning into a log.
  const importRecoveryWarnings = needsReadableText
    ? Array.from(
        new Set(
          props.profile.baseResume.analysisWarnings
            .map((warning) => warning.trim())
            .filter(Boolean),
        ),
      ).slice(0, 2)
    : [];
  // The quality note used to live only near the bottom of the full Profile
  // screen in 11px uppercase mono, while this step said nothing but
  // "Ready" — so a degraded import read as a clean one. The note belongs
  // with the status it qualifies, in ordinary sentences.
  const importQualityNotes = getResumeImportStageFallbackNotes(
    props.profile.baseResume.analysisWarnings,
  );
  const importQualitySummary = getResumeImportStageFallbackSummary(
    props.latestResumeImportRun,
  );
  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Start with your resume</CardTitle>
        <CardDescription>
          Import a resume first when you have one. Setup will turn
          low-confidence or missing details into focused review items instead of
          dropping you into the whole editor.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">
              Imported file
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {props.profile.baseResume.fileName}
            </p>
          </div>
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">
              Import status
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatStatusLabel(props.profile.baseResume.extractionStatus)}
            </p>
            {importQualitySummary ? (
              <p
                className="mt-1 text-sm leading-6 text-foreground-soft"
                data-profile-setup-import-quality-hint
              >
                {importQualitySummary.hint}.
              </p>
            ) : null}
          </div>
        </div>

        {importQualityNotes.length > 0 ? (
          <div
            className="grid gap-2 rounded-(--radius-field) border border-border/30 bg-background/60 p-4 text-sm leading-6 text-foreground-soft"
            data-profile-setup-import-quality-note
          >
            {importQualityNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}

        {needsReadableText ? (
          <div
            className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-3 text-sm leading-6 text-(--warning-text)"
            role="status"
          >
            <p className="font-semibold">
              The file was saved, but Job Finder could not read text from it, so
              nothing was extracted into your profile yet.
            </p>
            <p className="mt-1">
              Choose Import resume to try again — text-based PDFs, TXT, or
              Markdown files read most reliably — or continue by entering your
              details manually. You can also paste plain text into the resume
              from the full Profile screen.
            </p>
            {importRecoveryWarnings.length > 0 ? (
              <ul className="mt-2 grid list-none gap-1 border-t border-(--warning-border) pt-2 text-xs leading-5">
                {importRecoveryWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-(--radius-field) border border-dashed border-border/40 bg-background/50 p-4 text-sm leading-6 text-foreground-soft">
          {props.latestResumeImportReviewCandidates.length > 0
            ? `Latest import kept ${props.latestResumeImportReviewCandidates.length} reviewable suggestion${props.latestResumeImportReviewCandidates.length === 1 ? "" : "s"} visible in setup.`
            : "You can continue without a resume, but importing one usually gets you through setup faster."}
        </div>

        {props.latestResumeImportReviewCandidates.length > 0 ? (
          <div className="grid gap-2">
            {props.latestResumeImportReviewCandidates
              .slice(0, 4)
              .map((candidate) => (
                <div
                  className="rounded-(--radius-field) border border-border/25 bg-background/70 px-4 py-3"
                  key={candidate.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {candidate.label}
                    </p>
                    <Badge variant="outline">
                      {formatStatusLabel(candidate.resolution)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground-soft">
                    {formatProfileSetupReviewValue(
                      candidate.valuePreview ?? candidate.value,
                    ) ??
                      candidate.evidenceText ??
                      "Review this imported suggestion."}
                  </p>
                  {(() => {
                    const conflictSummary = getImportConflictSummary(candidate);
                    return conflictSummary ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {conflictSummary}
                      </p>
                    ) : null;
                  })()}
                </div>
              ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            disabled={Boolean(props.importDisabledReason)}
            pending={props.isImportResumePending}
            onClick={props.onImportResume}
            type="button"
            aria-describedby={
              props.importDisabledReason ? importDisabledReasonId : undefined
            }
            variant={
              props.profile.baseResume.extractionStatus === "ready"
                ? "secondary"
                : "primary"
            }
          >
            {props.profile.baseResume.extractionStatus === "ready"
              ? "Replace resume"
              : "Import resume"}
          </Button>
          <Button
            className="border-(--border-strong)"
            onClick={props.onContinueToProfile}
            type="button"
            variant="ghost"
          >
            Open full Profile instead
          </Button>
        </div>
        {props.importDisabledReason ? (
          <p
            className="text-sm leading-6 text-foreground-soft"
            id={importDisabledReasonId}
          >
            {props.importDisabledReason}
          </p>
        ) : null}
        <ResumeImportProgress
          isPending={props.isImportResumePending}
          progress={props.resumeImportProgress}
        />

        {props.renderFooter({
          nextLabel: "Save and go to Basics",
          onPrimary: () => props.onSaveAndGoToStep("essentials"),
        })}
      </CardContent>
    </Card>
  );
}

export function ProfileSetupEssentialsStep(props: {
  nextStep: ProfileSetupStep | null;
  onSaveAndGoToStep: (step: ProfileSetupStep) => void;
  profileForm: UseFormReturn<ProfileEditorValues>;
  renderFooter: RenderFooter;
}) {
  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Basics</CardTitle>
        <CardDescription>
          Name, contact details, location, links, and summary. These go on every
          resume and application, and they are the same fields you will find
          later under Profile › Basics.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        {/* One shared field list with Profile › Basics: same fields, same
            order, same labels. */}
        <ProfileBasicsFields
          idPrefix="profile-setup-field-identity"
          profileForm={props.profileForm}
        />

        {props.renderFooter({
          nextLabel: "Save and continue to Work history",
          onPrimary: () =>
            props.onSaveAndGoToStep(props.nextStep ?? "background"),
        })}
      </CardContent>
    </Card>
  );
}

export function ProfileSetupTargetingStep(props: {
  nextStep: ProfileSetupStep | null;
  onSaveAndGoToStep: (step: ProfileSetupStep) => void;
  onResumeApplicationModeChange?: (mode: ResumeApplicationMode) => void;
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>;
  profileForm: UseFormReturn<ProfileEditorValues>;
  resumeApplicationMode?: ResumeApplicationMode;
  renderFooter: RenderFooter;
}) {
  const authorizedWorkCountriesId =
    "profile-setup-field-eligibility-authorized-work-countries";
  const locationPreferencesId = useId();
  const targetRolesId = "profile-setup-field-search-preferences-target-roles";
  const locationsId = "profile-setup-field-search-preferences-locations";
  const workModesGroupId = "profile-setup-field-search-preferences-work-modes";
  const workModesDescriptionId = `${workModesGroupId}-description`;
  const workModesGuidanceId = `${workModesGroupId}-guidance`;
  const tailoringModeGroupId =
    "profile-setup-field-search-preferences-tailoring-mode";
  const tailoringModeGuidanceId =
    "profile-setup-field-search-preferences-tailoring-mode-guidance";
  const tailoringModeWarningId =
    "profile-setup-field-search-preferences-tailoring-mode-warning";
  const requiresVisaSponsorshipId =
    "profile-setup-field-eligibility-requires-visa-sponsorship";
  const remoteEligibleId = "profile-setup-field-eligibility-remote-eligible";
  const willingToRelocateId =
    "profile-setup-field-eligibility-willing-to-relocate";
  const willingToTravelId = "profile-setup-field-eligibility-willing-to-travel";
  const listFieldOptions = {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  } as const;
  const discoveryTargetsField = useController({
    control: props.preferencesForm.control,
    name: "discoveryTargets",
  });
  const discoveryTargets = discoveryTargetsField.field.value ?? [];
  const sourceSearchInputId = useId();
  const [sourceQuery, setSourceQuery] = useState("");
  const deferredSourceQuery = useDeferredValue(sourceQuery);
  const [sourcePage, setSourcePage] = useState(0);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [isManualSourceOpen, setIsManualSourceOpen] = useState(false);
  const [manualSourceLabel, setManualSourceLabel] = useState("");
  const [manualSourceUrl, setManualSourceUrl] = useState("");
  const manualSourceLabelId = "profile-setup-field-manual-source-label";
  const manualSourceUrlId = "profile-setup-field-manual-source-url";
  const manualSourceUrlErrorId = "profile-setup-field-manual-source-url-error";

  const updateDiscoveryTargets = (
    nextTargets: SearchPreferencesEditorValues["discoveryTargets"],
  ) => {
    // Single write path: dual onChange + setValue re-entered watchers twice per
    // Enable click and could leave sibling fields undefined mid-render.
    props.preferencesForm.setValue(
      "discoveryTargets",
      nextTargets,
      listFieldOptions,
    );
  };

  const createDiscoveryTargetId = () =>
    `target_${typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
  const filteredSources = useMemo(
    () => filterProfileSetupSources(discoveryTargets, deferredSourceQuery),
    [deferredSourceQuery, discoveryTargets],
  );
  const sourcePageCount = Math.max(
    1,
    Math.ceil(filteredSources.length / PROFILE_SETUP_SOURCE_PAGE_SIZE),
  );
  const currentSourcePage = Math.min(sourcePage, sourcePageCount - 1);
  const visibleSources = filteredSources.slice(
    currentSourcePage * PROFILE_SETUP_SOURCE_PAGE_SIZE,
    (currentSourcePage + 1) * PROFILE_SETUP_SOURCE_PAGE_SIZE,
  );
  const firstVisibleSourceNumber =
    filteredSources.length === 0
      ? 0
      : currentSourcePage * PROFILE_SETUP_SOURCE_PAGE_SIZE + 1;
  const lastVisibleSourceNumber = Math.min(
    filteredSources.length,
    firstVisibleSourceNumber + visibleSources.length - 1,
  );
  const enabledSourceCount = discoveryTargets.filter(
    (target) => target.enabled,
  ).length;
  const isManualSourceComplete =
    manualSourceLabel.trim().length > 0 &&
    isValidProfileSetupSourceUrl(manualSourceUrl);
  const isManualSourceUrlInvalid =
    manualSourceUrl.trim().length > 0 &&
    !isValidProfileSetupSourceUrl(manualSourceUrl);

  const setSourceLibraryView = (nextQuery: string) => {
    setSourceQuery(nextQuery);
    setSourcePage(0);
  };

  const moveToSourcePage = (nextPage: number) => {
    const boundedPage = Math.min(Math.max(nextPage, 0), sourcePageCount - 1);
    setSourcePage(boundedPage);
    const revealSourceList = () => {
      const listHeading = document.getElementById(
        "profile-setup-job-sources-list-heading",
      );
      if (!listHeading) {
        return;
      }
      // Scroll with the full responsive header margins first (the heading
      // carries the shared scroll-margin trio), then claim focus with
      // preventScroll so the browser never lands it beneath the fixed shell
      // header or performs an uncontrolled ancestor jump.
      listHeading.scrollIntoView?.({ behavior: "auto", block: "start" });
      listHeading.focus({ preventScroll: true });
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(revealSourceList);
    } else {
      revealSourceList();
    }
  };

  // Every enablement is an explicit user action; searching or paging never
  // flips a source on.
  const setTargetEnabled = (targetId: string, enabled: boolean) => {
    updateDiscoveryTargets(
      discoveryTargets.map((entry) =>
        entry.id === targetId ? { ...entry, enabled } : entry,
      ),
    );
  };

  const addManualDiscoveryTarget = () => {
    if (!isManualSourceComplete) {
      return;
    }

    const targetId = createDiscoveryTargetId();
    updateDiscoveryTargets([
      ...discoveryTargets,
      {
        id: targetId,
        label: manualSourceLabel.trim(),
        startingUrl: manualSourceUrl.trim(),
        enabled: false,
        adapterKind: "auto",
        customInstructions: "",
        instructionStatus: "missing",
        validatedInstructionId: null,
        draftInstructionId: null,
        lastDebugRunId: null,
        lastVerifiedAt: null,
        staleReason: null,
      },
    ]);
    setManualSourceLabel("");
    setManualSourceUrl("");
    setIsManualSourceOpen(false);
    setEditingTargetId(null);
    setSourceLibraryView("");
    setSourcePage(
      Math.floor(discoveryTargets.length / PROFILE_SETUP_SOURCE_PAGE_SIZE),
    );
  };

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Tell Job Finder what to optimize for</CardTitle>
        <CardDescription>
          Capture the roles, locations, work modes, and work details that are
          true for you. Job Finder never guesses these.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        {discoveryTargets.length > 0 && enabledSourceCount === 0 ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-3 text-sm leading-6 text-(--warning-text)"
            role="status"
          >
            <p className="min-w-0 flex-1">
              Saved job sources are still off. Enable at least one before Search
              can run — jump to the source list below.
            </p>
            <Button
              aria-label="Show job sources to enable"
              data-profile-setup-jump-to-sources
              onClick={() => {
                const firstUsableSourceToggle =
                  document.querySelector<HTMLElement>(
                    "[data-profile-setup-source-enable]:not(:disabled)",
                  );
                const heading = document.getElementById(
                  "profile-setup-job-sources-heading",
                );
                const target = firstUsableSourceToggle ?? heading;

                // Land on the action the call-to-action promises, centered
                // clear of the shell header and pinned setup footer. Instant
                // scroll avoids racing a second click against an animation.
                target?.scrollIntoView({ behavior: "auto", block: "center" });
                target?.focus({ preventScroll: true });
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Show job sources
            </Button>
          </div>
        ) : null}
        <ProfileListEditor
          inputId={targetRolesId}
          label="Target roles"
          onChange={(values) =>
            props.preferencesForm.setValue(
              "targetRoles",
              joinListInput(values),
              listFieldOptions,
            )
          }
          placeholder="Add a target role"
          values={parseListInput(props.preferencesForm.watch("targetRoles"))}
        />
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <div className="grid gap-2">
            <ProfileListEditor
              label="Job families"
              onChange={(values) =>
                props.preferencesForm.setValue(
                  "jobFamilies",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Add a related role area"
              values={parseListInput(
                props.preferencesForm.watch("jobFamilies"),
              )}
            />
            <p className="px-1 text-xs leading-5 text-foreground-muted">
              Related titles you&apos;d also consider, e.g. Backend Engineer.
            </p>
          </div>
          <div className="grid gap-2">
            <ProfileListEditor
              inputId={locationsId}
              label="Preferred job locations"
              onChange={(values) =>
                props.preferencesForm.setValue(
                  "locations",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Example: Austin, TX"
              values={parseListInput(props.preferencesForm.watch("locations"))}
            />
            <p className="px-1 text-xs leading-5 text-foreground-muted">
              Only add places where you want to work. A city and country entered
              together stay one location.
            </p>
          </div>
        </div>
        <Controller
          control={props.preferencesForm.control}
          name="tailoringMode"
          render={({ field }) => (
            <fieldset
              aria-describedby={`${tailoringModeGuidanceId}${field.value === "aggressive" ? ` ${tailoringModeWarningId}` : ""}`}
              className="grid gap-(--gap-field)"
              id={tailoringModeGroupId}
            >
              <legend className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
                How strongly should Job Finder tailor each resume?
              </legend>
              <p
                className="text-sm leading-6 text-foreground-soft"
                id={tailoringModeGuidanceId}
              >
                This sets the default for reusable resume strategies and per-job
                drafts. You can change it later for a strategy or an individual
                job.
              </p>
              <div className="grid items-stretch gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {tailoringModeOptions.map((option) => {
                  const optionId = `${tailoringModeGroupId}-${option.value}`;
                  const selected =
                    option.value === "original_resume"
                      ? props.resumeApplicationMode === "original_resume"
                      : props.resumeApplicationMode !== "original_resume" &&
                        field.value === option.value;

                  return (
                    <label
                      className="grid h-full min-w-0 cursor-pointer content-start gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 p-4 text-left transition-colors hover:border-primary/35 has-[:checked]:border-primary/70 has-[:checked]:bg-primary/8"
                      htmlFor={optionId}
                      key={option.value}
                    >
                      <input
                        checked={selected}
                        className="peer sr-only"
                        id={optionId}
                        name={field.name}
                        onBlur={field.onBlur}
                        onChange={() => {
                          if (option.value === "original_resume") {
                            props.onResumeApplicationModeChange?.(
                              "original_resume",
                            );
                            return;
                          }

                          props.onResumeApplicationModeChange?.(
                            "tailored_per_job",
                          );
                          field.onChange(option.value);
                        }}
                        ref={
                          option.value === "original_resume"
                            ? undefined
                            : option.value === "conservative"
                              ? field.ref
                              : undefined
                        }
                        type="radio"
                        value={option.value}
                      />
                      <span className="font-semibold text-foreground">
                        {option.label}
                      </span>
                      <span className="text-sm leading-5 text-foreground-soft">
                        {option.description}
                      </span>
                    </label>
                  );
                })}
              </div>
              {field.value === "aggressive" ? (
                <p
                  className="text-sm leading-6 text-(--warning-text)"
                  id={tailoringModeWarningId}
                  role="status"
                >
                  Strong rewrite can substantially rewrite, combine, or
                  elaborate supported experience. Review every generated line:
                  Job Finder does not invent new facts or numbers, and it does
                  not auto-approve or submit applications.
                </p>
              ) : null}
            </fieldset>
          )}
        />
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <p
            className="text-sm leading-6 text-foreground-soft md:col-span-2"
            data-profile-setup-work-details-intro
          >
            These are facts, not preferences — leave Not set if you don&apos;t
            know.
          </p>
          <div className="grid min-w-0 content-start gap-(--gap-field)">
            <FieldLabel htmlFor={authorizedWorkCountriesId}>
              {PROFILE_WORK_CONSTRAINT_COPY.authorizedWorkCountries.label}
            </FieldLabel>
            <ProfileTextarea
              aria-describedby={`${authorizedWorkCountriesId}-help`}
              id={authorizedWorkCountriesId}
              placeholder={
                PROFILE_WORK_CONSTRAINT_COPY.authorizedWorkCountries.placeholder
              }
              rows={4}
              {...props.profileForm.register(
                "eligibility.authorizedWorkCountries",
              )}
            />
            <p
              className="text-xs leading-5 text-foreground-muted"
              id={`${authorizedWorkCountriesId}-help`}
            >
              {PROFILE_WORK_CONSTRAINT_COPY.authorizedWorkCountries.description}
            </p>
          </div>
          <div className="grid min-w-0 content-start gap-(--gap-field)">
            <FieldLabel htmlFor={locationPreferencesId}>
              {PROFILE_WORK_CONSTRAINT_COPY.preferredRelocationRegions.label}
            </FieldLabel>
            <ProfileTextarea
              aria-describedby={`${locationPreferencesId}-help`}
              id={locationPreferencesId}
              placeholder={
                PROFILE_WORK_CONSTRAINT_COPY.preferredRelocationRegions
                  .placeholder
              }
              rows={4}
              {...props.profileForm.register(
                "eligibility.preferredRelocationRegions",
              )}
            />
            <p
              className="text-xs leading-5 text-foreground-muted"
              id={`${locationPreferencesId}-help`}
            >
              {
                PROFILE_WORK_CONSTRAINT_COPY.preferredRelocationRegions
                  .description
              }
            </p>
          </div>
          <SetupBooleanField
            control={props.profileForm.control}
            description={
              PROFILE_WORK_CONSTRAINT_COPY.requiresVisaSponsorship.description
            }
            id={requiresVisaSponsorshipId}
            label={PROFILE_WORK_CONSTRAINT_COPY.requiresVisaSponsorship.label}
            name="eligibility.requiresVisaSponsorship"
          />
          <SetupBooleanField
            control={props.profileForm.control}
            description={
              PROFILE_WORK_CONSTRAINT_COPY.remoteEligible.description
            }
            id={remoteEligibleId}
            label={PROFILE_WORK_CONSTRAINT_COPY.remoteEligible.label}
            name="eligibility.remoteEligible"
          />
          <SetupBooleanField
            control={props.profileForm.control}
            description={
              PROFILE_WORK_CONSTRAINT_COPY.willingToRelocate.description
            }
            id={willingToRelocateId}
            label={PROFILE_WORK_CONSTRAINT_COPY.willingToRelocate.label}
            name="eligibility.willingToRelocate"
          />
          <SetupBooleanField
            control={props.profileForm.control}
            description={
              PROFILE_WORK_CONSTRAINT_COPY.willingToTravel.description
            }
            id={willingToTravelId}
            label={PROFILE_WORK_CONSTRAINT_COPY.willingToTravel.label}
            name="eligibility.willingToTravel"
          />
        </div>
        <fieldset
          aria-describedby={`${workModesDescriptionId} ${workModesGuidanceId}`}
          className="grid gap-(--gap-field)"
          id={workModesGroupId}
        >
          <legend className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
            {PROFILE_WORK_CONSTRAINT_COPY.workModes.label}
          </legend>
          <p
            className="text-sm leading-6 text-foreground-soft"
            id={workModesDescriptionId}
          >
            {PROFILE_WORK_CONSTRAINT_COPY.workModes.description}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {["remote", "hybrid", "onsite"].map((workMode) => (
              <Controller
                control={props.preferencesForm.control}
                key={workMode}
                name="workModes"
                render={({ field }) => {
                  const selectedWorkModes = field.value ?? [];
                  return (
                    <CheckboxField
                      checked={selectedWorkModes.includes(
                        workMode as JobSearchPreferences["workModes"][number],
                      )}
                      label={formatStatusLabel(workMode)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...selectedWorkModes, workMode]
                            : selectedWorkModes.filter(
                                (value) => value !== workMode,
                              ),
                        )
                      }
                    />
                  );
                }}
              />
            ))}
          </div>
          {(props.preferencesForm.watch("workModes") ?? []).length === 0 ? (
            <p
              className="text-sm leading-6 text-(--warning-text)"
              id={workModesGuidanceId}
              role="status"
            >
              Choose at least one work mode before relying on discovery results.
            </p>
          ) : (props.preferencesForm.watch("workModes") ?? []).includes(
              "remote",
            ) &&
            props.profileForm.watch("eligibility.remoteEligible") === "" ? (
            <p
              className="text-sm leading-6 text-foreground-muted"
              id={workModesGuidanceId}
            >
              Remote is your preference; whether you can work remotely is a
              separate answer you can leave Not set for now.
            </p>
          ) : (
            <p
              className="text-sm leading-6 text-foreground-muted"
              id={workModesGuidanceId}
            >
              Your preferred setup describes what you want; work details
              describe what you can accept.
            </p>
          )}
        </fieldset>

        <section
          aria-labelledby="profile-setup-job-sources-heading"
          className="grid gap-4 rounded-(--radius-field) border border-border/35 bg-background/45 p-4"
        >
          <div className="grid gap-1">
            <h3
              className="scroll-mt-4 text-sm font-semibold text-foreground outline-none sm:scroll-mt-[8.25rem] min-[1440px]:!scroll-mt-[4.5rem]"
              id="profile-setup-job-sources-heading"
              tabIndex={-1}
            >
              Job sources
            </h3>
            <p className="max-w-2xl text-sm leading-6 text-foreground-soft">
              Find a public careers page or job board you already know and
              enable it here. Sources stay off until you enable them, and Job
              Finder cannot search until at least one valid source is enabled.
            </p>
          </div>

          {discoveryTargets.length === 0 ? (
            <div
              className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-3 text-sm leading-6 text-(--warning-text)"
              role="status"
            >
              No job source is configured yet. Add the public page where you
              would normally browse open roles.
            </div>
          ) : (
            <>
              {enabledSourceCount === 0 ? (
                <div
                  className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-3 text-sm leading-6 text-(--warning-text)"
                  role="status"
                >
                  All {discoveryTargets.length} saved sources are turned off.
                  Enable at least one source below so Job Finder has somewhere
                  to search.
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="grid gap-(--gap-field)">
                  <FieldLabel htmlFor={sourceSearchInputId}>
                    Find a source
                  </FieldLabel>
                  <ProfileInput
                    autoComplete="off"
                    id={sourceSearchInputId}
                    onChange={(event) =>
                      setSourceLibraryView(event.target.value)
                    }
                    placeholder="Search by source name or URL"
                    type="search"
                    value={sourceQuery}
                  />
                </div>
                <p
                  aria-atomic="true"
                  aria-live="polite"
                  className="text-sm text-foreground-muted"
                  role="status"
                >
                  {filteredSources.length === discoveryTargets.length
                    ? `${discoveryTargets.length} sources`
                    : `${filteredSources.length} of ${discoveryTargets.length} sources`}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-3">
                <h4
                  className="scroll-mt-4 sm:scroll-mt-[8.25rem] min-[1440px]:!scroll-mt-[4.5rem] text-sm font-semibold text-foreground outline-none"
                  id="profile-setup-job-sources-list-heading"
                  tabIndex={-1}
                >
                  Source catalog
                </h4>
                {filteredSources.length > 0 ? (
                  <p className="text-xs text-foreground-muted">
                    {firstVisibleSourceNumber}–{lastVisibleSourceNumber} of{" "}
                    {filteredSources.length}
                  </p>
                ) : null}
              </div>
              <p
                aria-atomic="true"
                aria-live="polite"
                className="-mt-2 text-xs leading-5 text-foreground-muted"
                role="status"
              >
                {enabledSourceCount} of {discoveryTargets.length} sources
                enabled for search
              </p>

              {filteredSources.length === 0 ? (
                <div className="rounded-(--radius-field) border border-border/30 px-4 py-5 text-center">
                  <p className="font-medium text-foreground">
                    No sources match this search
                  </p>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Clear the search to return to the complete source catalog.
                  </p>
                  <Button
                    className="mt-3"
                    onClick={() => setSourceLibraryView("")}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Show all sources
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-2" data-profile-setup-source-page>
                    {visibleSources.map(({ target, index }) => {
                      const validUrl = isValidProfileSetupSourceUrl(
                        target.startingUrl,
                      );
                      const sourceUrlInvalid =
                        target.startingUrl.trim().length > 0 && !validUrl;
                      const sourceUrlErrorId = `profile-setup-source-url-error-${target.id}`;
                      const isEditing = editingTargetId === target.id;
                      const guidance = getProfileSetupSourceGuidance(target);
                      const starterAccessNote =
                        getProfileSetupStarterAccessNote(target.startingUrl);
                      const sourceLabel =
                        target.label.trim() || `Source ${index + 1}`;

                      return (
                        <div className="grid gap-2" key={target.id}>
                          <article
                            className="grid gap-3 rounded-(--radius-field) border border-border/30 bg-background/65 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                            data-profile-setup-source-card={target.id}
                          >
                            <div className="min-w-0">
                              {/* No Enabled/Disabled badge: the "Include in
                                  search" checkbox beside this row already
                                  states the source's state. */}
                              <p
                                className="min-w-0 max-w-full truncate text-sm font-semibold text-foreground"
                                title={sourceLabel}
                              >
                                {sourceLabel}
                              </p>
                              <p
                                className="mt-1 truncate text-sm text-foreground-muted"
                                title={target.startingUrl}
                              >
                                {getProfileSetupSourceHost(target.startingUrl)}
                              </p>
                              {guidance.label ? (
                                <p className="mt-1 text-xs leading-5 text-foreground-muted">
                                  {guidance.label}
                                </p>
                              ) : null}
                              {guidance.detail ? (
                                <p className="text-xs leading-5 text-foreground-muted">
                                  {guidance.detail}
                                </p>
                              ) : null}
                              {starterAccessNote ? (
                                <p className="text-xs leading-5 text-foreground-muted">
                                  {starterAccessNote}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                              {/* Same control as Profile › Job sources: one
                                  checkbox for the identical action, instead of
                                  an Enable button here and a checkbox there. */}
                              <label className="flex min-h-9 items-center gap-2 rounded-(--radius-button) border border-(--surface-panel-border) px-3 text-sm text-foreground-soft">
                                <Checkbox
                                  aria-label={`Include ${sourceLabel} in searches`}
                                  checked={target.enabled}
                                  data-profile-setup-source-enable={target.id}
                                  disabled={!validUrl && !target.enabled}
                                  onCheckedChange={(checked) =>
                                    setTargetEnabled(
                                      target.id,
                                      checked === true,
                                    )
                                  }
                                />
                                Include in search
                              </label>
                              <Button
                                aria-expanded={isEditing}
                                aria-label={
                                  isEditing
                                    ? `Close editor for ${sourceLabel}`
                                    : `Edit ${sourceLabel}`
                                }
                                onClick={() =>
                                  setEditingTargetId(
                                    isEditing ? null : target.id,
                                  )
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Edit source
                              </Button>
                            </div>
                          </article>
                          {sourceUrlInvalid && !isEditing ? (
                            <p
                              className="text-sm leading-6 text-(--warning-text)"
                              id={sourceUrlErrorId}
                              role="status"
                            >
                              This source needs a complete http or https URL.
                              Choose Edit to fix it before enabling it.
                            </p>
                          ) : null}
                          {isEditing ? (
                            <div className="grid gap-3 rounded-(--radius-field) border border-dashed border-border/40 bg-background/70 p-4">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="grid gap-(--gap-field)">
                                  <FieldLabel
                                    htmlFor={`profile-setup-source-label-${target.id}`}
                                  >
                                    Source name
                                  </FieldLabel>
                                  <ProfileInput
                                    id={`profile-setup-source-label-${target.id}`}
                                    onChange={(event) =>
                                      updateDiscoveryTargets(
                                        discoveryTargets.map((entry) =>
                                          entry.id === target.id
                                            ? {
                                                ...entry,
                                                label: event.target.value,
                                              }
                                            : entry,
                                        ),
                                      )
                                    }
                                    placeholder="Example: Acme careers"
                                    value={target.label}
                                  />
                                </div>
                                <div className="grid gap-(--gap-field)">
                                  <FieldLabel
                                    htmlFor={`profile-setup-source-url-${target.id}`}
                                  >
                                    Careers or job-board URL
                                  </FieldLabel>
                                  <ProfileInput
                                    aria-describedby={
                                      sourceUrlInvalid
                                        ? sourceUrlErrorId
                                        : undefined
                                    }
                                    aria-invalid={sourceUrlInvalid}
                                    id={`profile-setup-source-url-${target.id}`}
                                    onChange={(event) =>
                                      updateDiscoveryTargets(
                                        discoveryTargets.map((entry) =>
                                          entry.id === target.id
                                            ? {
                                                ...entry,
                                                startingUrl: event.target.value,
                                                instructionStatus: "missing",
                                                validatedInstructionId: null,
                                                draftInstructionId: null,
                                                lastDebugRunId: null,
                                                lastVerifiedAt: null,
                                                staleReason: null,
                                              }
                                            : entry,
                                        ),
                                      )
                                    }
                                    placeholder="https://company.example/careers"
                                    type="url"
                                    value={target.startingUrl}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                {sourceUrlInvalid ? (
                                  <p
                                    className="text-sm leading-6 text-(--warning-text)"
                                    id={sourceUrlErrorId}
                                    role="status"
                                  >
                                    Enter a complete http or https URL before
                                    this source can be used.
                                  </p>
                                ) : (
                                  <span />
                                )}
                                <Button
                                  aria-label={`Remove ${sourceLabel}`}
                                  onClick={() => {
                                    updateDiscoveryTargets(
                                      discoveryTargets.filter(
                                        (entry) => entry.id !== target.id,
                                      ),
                                    );
                                    setEditingTargetId(null);
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {sourcePageCount > 1 ? (
                    <nav
                      aria-label="Profile setup job source pages"
                      className="flex items-center justify-between gap-3 border-t border-border/30 pt-3"
                    >
                      <Button
                        disabled={currentSourcePage === 0}
                        onClick={() => moveToSourcePage(currentSourcePage - 1)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Previous
                      </Button>
                      <span
                        aria-current="page"
                        className="text-center text-xs text-foreground-muted"
                      >
                        Page {currentSourcePage + 1} of {sourcePageCount}
                      </span>
                      <Button
                        disabled={currentSourcePage >= sourcePageCount - 1}
                        onClick={() => moveToSourcePage(currentSourcePage + 1)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Next
                      </Button>
                    </nav>
                  ) : null}
                </>
              )}
            </>
          )}

          <div className="grid gap-3 border-t border-border/30 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid gap-0.5">
                <p className="text-sm font-semibold text-foreground">
                  Know the exact web address?
                </p>
                <p className="text-xs leading-5 text-foreground-muted">
                  Advanced option for a public careers page that is not in the
                  list above.
                </p>
              </div>
              <Button
                aria-expanded={isManualSourceOpen}
                onClick={() => setIsManualSourceOpen((open) => !open)}
                size="sm"
                type="button"
                variant="outline"
              >
                Add a source URL manually
              </Button>
            </div>
            {isManualSourceOpen ? (
              <form
                className="grid gap-3 rounded-(--radius-field) border border-border/30 bg-background/65 p-4"
                data-profile-setup-manual-source-form
                onSubmit={(event) => {
                  event.preventDefault();
                  addManualDiscoveryTarget();
                }}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-(--gap-field)">
                    <FieldLabel htmlFor={manualSourceLabelId}>
                      Source name
                    </FieldLabel>
                    <ProfileInput
                      id={manualSourceLabelId}
                      onChange={(event) =>
                        setManualSourceLabel(event.target.value)
                      }
                      placeholder="Example: Acme careers"
                      value={manualSourceLabel}
                    />
                  </div>
                  <div className="grid gap-(--gap-field)">
                    <FieldLabel htmlFor={manualSourceUrlId}>
                      Careers or job-board URL
                    </FieldLabel>
                    <ProfileInput
                      aria-describedby={
                        isManualSourceUrlInvalid
                          ? manualSourceUrlErrorId
                          : undefined
                      }
                      aria-invalid={isManualSourceUrlInvalid}
                      id={manualSourceUrlId}
                      onChange={(event) =>
                        setManualSourceUrl(event.target.value)
                      }
                      placeholder="https://company.example/careers"
                      type="url"
                      value={manualSourceUrl}
                    />
                  </div>
                </div>
                {isManualSourceUrlInvalid ? (
                  <p
                    className="text-sm leading-6 text-(--warning-text)"
                    id={manualSourceUrlErrorId}
                    role="status"
                  >
                    Enter a complete http or https URL before this source can be
                    used.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={!isManualSourceComplete} type="submit">
                    Add source
                  </Button>
                  <Button
                    onClick={() => {
                      setIsManualSourceOpen(false);
                      setManualSourceLabel("");
                      setManualSourceUrl("");
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  {!isManualSourceComplete && !isManualSourceUrlInvalid ? (
                    <p className="text-xs leading-5 text-foreground-muted">
                      Add a short name and a complete http or https URL.
                    </p>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
        </section>

        {props.renderFooter({
          nextLabel: "Save and continue to Extras",
          onPrimary: () => props.onSaveAndGoToStep(props.nextStep ?? "extras"),
        })}
      </CardContent>
    </Card>
  );
}
