import { useEffect, useId, useState } from "react";
import type {
  JobFinderSettings,
  ResumeApplicationMode,
  ResumeTemplateDefinition,
  UpdateApplicationDefaultsInput,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { FormSelect } from "../../components/form-select";
import { ResumeThemePicker } from "../../components/resume-theme-picker";
import { useSettingsSectionSave } from "./settings-section-save";

const fontPresetOptions: ReadonlyArray<{
  description: string;
  label: string;
  value: JobFinderSettings["fontPreset"];
}> = [
  {
    description:
      "Clean, compact, and the safest default for high-volume applications.",
    label: "Clean sans",
    value: "inter_requisite",
  },
  {
    description:
      "A stronger display look that keeps more personality in the final PDF.",
    label: "Display sans",
    value: "space_grotesk_display",
  },
];

const defaultResumeApplicationMode: ResumeApplicationMode = "tailored_per_job";

interface SettingsApplicationDefaultsSectionProps {
  availableResumeTemplates: readonly ResumeTemplateDefinition[];
  /** Reports staged default edits so a stale shell save retry is retired. */
  onSettingsDraftEdited?: () => void;
  onUpdateApplicationDefaults: (
    input: UpdateApplicationDefaultsInput,
  ) => Promise<boolean | void> | void;
  settings: JobFinderSettings;
}

export function SettingsApplicationDefaultsSection({
  availableResumeTemplates,
  onSettingsDraftEdited,
  onUpdateApplicationDefaults,
  settings,
}: SettingsApplicationDefaultsSectionProps) {
  const fontPresetId = useId();
  const resumeTemplateLabelId = useId();
  const savedResumeApplicationMode =
    settings.resumeApplicationMode ?? defaultResumeApplicationMode;
  const [selectedResumeApplicationMode, setSelectedResumeApplicationMode] =
    useState<ResumeApplicationMode>(savedResumeApplicationMode);
  const [draftFontPreset, setDraftFontPreset] = useState(settings.fontPreset);
  const [draftResumeTemplateId, setDraftResumeTemplateId] = useState(
    settings.resumeTemplateId,
  );
  const { runSectionSave, saveState } = useSettingsSectionSave();

  useEffect(() => {
    setSelectedResumeApplicationMode(savedResumeApplicationMode);
  }, [savedResumeApplicationMode]);

  useEffect(() => {
    setDraftFontPreset(settings.fontPreset);
  }, [settings.fontPreset]);

  useEffect(() => {
    setDraftResumeTemplateId(settings.resumeTemplateId);
  }, [settings.resumeTemplateId]);

  const isSavePending = saveState.status === "saving";
  const hasUnsavedChanges =
    selectedResumeApplicationMode !== savedResumeApplicationMode ||
    draftFontPreset !== settings.fontPreset ||
    draftResumeTemplateId !== settings.resumeTemplateId;
  const isFontPresetOption = (
    value: string,
  ): value is JobFinderSettings["fontPreset"] =>
    fontPresetOptions.some((fontPreset) => fontPreset.value === value);
  const isResumeTemplateOption = (
    value: string,
  ): value is JobFinderSettings["resumeTemplateId"] =>
    availableResumeTemplates.some((template) => template.id === value);
  const selectedFontPreset = fontPresetOptions.find(
    (fontPreset) => fontPreset.value === draftFontPreset,
  );
  const updateStagedDrafts = (updater: () => void) => {
    if (isSavePending) {
      return;
    }
    updater();
    onSettingsDraftEdited?.();
  };
  const saveButtonLabel =
    saveState.status === "saving"
      ? "Saving resume preference"
      : saveState.status === "failed"
        ? "Retry resume preference"
        : saveState.status === "saved" && !hasUnsavedChanges
          ? "Resume preference saved"
          : "Save resume preference";
  const saveApplicationDefaults = () => {
    if (!hasUnsavedChanges || isSavePending) {
      return;
    }
    void runSectionSave({
      execute: () =>
        onUpdateApplicationDefaults({
          fontPreset: draftFontPreset,
          resumeApplicationMode: selectedResumeApplicationMode,
          resumeTemplateId: draftResumeTemplateId,
        }),
      failedMessage:
        "Resume preference was not saved. Retry before leaving this page.",
      savedMessage: "Resume preference saved for newly shortlisted jobs.",
    });
  };

  return (
    <section className="surface-panel-shell relative grid min-w-0 content-start gap-3 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[72ch] flex-1 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-[1.02rem] font-semibold text-(--text-headline)">
              Resume used for applications
            </h3>
            <Badge variant="section">Default for newly shortlisted jobs</Badge>
          </div>
          <p className="text-(length:--text-description) leading-5 text-foreground-soft">
            Choose whether each job gets a tailored resume or the exact file
            you imported in Profile. You still decide job by job before Job
            Finder opens the application.
          </p>
        </div>
        <div className="grid min-w-0 max-w-full justify-items-end gap-1.5">
          <Button
            disabled={!hasUnsavedChanges || isSavePending}
            onClick={saveApplicationDefaults}
            pending={isSavePending}
            type="button"
            variant="primary"
          >
            {saveButtonLabel}
          </Button>
          {saveState.status === "idle" ? null : (
            <p
              className={
                saveState.status === "failed"
                  ? "min-w-0 max-w-80 break-words text-right text-xs leading-4 text-destructive"
                  : "min-w-0 max-w-80 break-words text-right text-xs leading-4 text-foreground-soft"
              }
              data-settings-save-state={saveState.status}
              role="status"
            >
              {saveState.message}
            </p>
          )}
        </div>
      </div>

      <div
        className="grid min-w-0 gap-2.5 md:grid-cols-2"
        role="radiogroup"
        aria-label="Resume application mode"
      >
        <button
          aria-checked={selectedResumeApplicationMode === "tailored_per_job"}
          className={`grid min-w-0 min-h-32 gap-2 rounded-(--radius-field) border p-4 text-left transition-colors ${selectedResumeApplicationMode === "tailored_per_job" ? "border-primary/70 bg-primary/8" : "border-(--surface-panel-border) bg-background/45 hover:border-primary/35"}`}
          disabled={isSavePending}
          onClick={() =>
            updateStagedDrafts(() =>
              setSelectedResumeApplicationMode("tailored_per_job"),
            )
          }
          role="radio"
          type="button"
        >
          <span className="font-semibold text-foreground">
            Tailor a resume for each job
          </span>
          <span className="text-(length:--text-description) leading-5 text-foreground-soft">
            Create, review, and approve a job-specific PDF before it can be
            attached.
          </span>
          <span className="label-mono-xs">
            {selectedResumeApplicationMode === "tailored_per_job"
              ? savedResumeApplicationMode === "tailored_per_job"
                ? "Saved default"
                : "Selected · save to apply"
              : "Job-specific rewriting"}
          </span>
        </button>
        <button
          aria-checked={selectedResumeApplicationMode === "original_resume"}
          className={`grid min-w-0 min-h-32 gap-2 rounded-(--radius-field) border p-4 text-left transition-colors ${selectedResumeApplicationMode === "original_resume" ? "border-primary/70 bg-primary/8" : "border-(--surface-panel-border) bg-background/45 hover:border-primary/35"}`}
          disabled={isSavePending}
          onClick={() =>
            updateStagedDrafts(() =>
              setSelectedResumeApplicationMode("original_resume"),
            )
          }
          role="radio"
          type="button"
        >
          <span className="font-semibold text-foreground">
            Use my original resume unchanged
          </span>
          <span className="text-(length:--text-description) leading-5 text-foreground-soft">
            Skip resume generation. Shortlisted shows the imported file and
            Job Finder attaches that same file.
          </span>
          <span className="label-mono-xs">
            {selectedResumeApplicationMode === "original_resume"
              ? savedResumeApplicationMode === "original_resume"
                ? "Saved default · no rewriting"
                : "Selected · save to apply"
              : "No rewriting or job removal"}
          </span>
        </button>
      </div>

      {selectedResumeApplicationMode === "original_resume" ? (
        <div
          className="grid min-w-0 gap-1 rounded-(--radius-field) border border-primary/25 bg-primary/6 px-3.5 py-3 text-sm leading-5 text-foreground-soft"
          aria-live="polite"
        >
          <strong className="text-foreground">
            {savedResumeApplicationMode === "original_resume"
              ? "Original resume is the saved application default."
              : "Save this preference before leaving Settings."}
          </strong>
          <p>
            Original-resume mode preserves the imported file byte for byte.
            Newly shortlisted jobs start with this choice, while every current
            job keeps its own selection. Template and font choices below only
            apply when tailored-resume mode is selected.
          </p>
        </div>
      ) : null}

      <section className="grid min-w-0 gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) p-3.5">
        <div className="grid gap-1">
          <h3 className="text-[1.02rem] font-semibold text-(--text-headline)">
            Default template picker
          </h3>
          <p className="max-w-(--workspace-state-card-max-width) text-(length:--text-description) leading-5 text-foreground-soft">
            Choose the starting resume template here. The preview uses sample
            resume content rendered through the same template engine used for
            exports. The resume font default sits just below.
          </p>
        </div>

        <Field>
          <FieldLabel id={resumeTemplateLabelId}>
            Default resume template
          </FieldLabel>
          <div className="grid min-w-0 gap-2.5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="section">Applies to new drafts</Badge>
              <Badge variant="section">Existing drafts unchanged</Badge>
            </div>
            <ResumeThemePicker
              disabled={isSavePending}
              labelledBy={resumeTemplateLabelId}
              onChange={(value) =>
                updateStagedDrafts(() =>
                  setDraftResumeTemplateId(
                    isResumeTemplateOption(value)
                      ? value
                      : draftResumeTemplateId,
                  ),
                )
              }
              selectedThemeId={draftResumeTemplateId}
              themes={availableResumeTemplates}
            />
          </div>
        </Field>

        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field className="min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3.5 py-3">
            <FieldLabel htmlFor={fontPresetId}>Resume font</FieldLabel>
            <FormSelect
              disabled={isSavePending}
              onValueChange={(value) =>
                updateStagedDrafts(() =>
                  setDraftFontPreset(
                    isFontPresetOption(value) ? value : draftFontPreset,
                  ),
                )
              }
              options={fontPresetOptions.map((fontPreset) => ({
                label: fontPreset.label,
                value: fontPreset.value,
              }))}
              placeholder="Select font"
              triggerId={fontPresetId}
              value={draftFontPreset}
            />
            <p className="text-(length:--text-description) leading-5 text-foreground-soft">
              Pick the default font pairing for exported resumes. This affects
              PDF tone, not the editor schema.
            </p>
          </Field>
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-3 md:col-span-2">
            <span className="label-mono-xs">Selected font</span>
            <strong className="mt-1.5 block text-(length:--text-body) font-semibold text-foreground">
              {selectedFontPreset?.label ?? "Font not available"}
            </strong>
            <p className="mt-1.5 text-(length:--text-description) leading-5 text-foreground-soft">
              {selectedFontPreset?.description ??
                "Choose the default font pairing for resume exports."}
            </p>
          </div>
        </div>
      </section>

      {hasUnsavedChanges && saveState.status !== "saving" ? (
        <p
          className="min-h-[1.5rem] min-w-0 text-sm leading-6 text-(--warning-text)"
          role="status"
        >
          You have unsaved resume preference changes.
        </p>
      ) : (
        <div className="min-h-[1.5rem]" />
      )}
    </section>
  );
}
