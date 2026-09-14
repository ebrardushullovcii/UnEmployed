import { useEffect, useId, useState } from "react";
import {
  CoverLetterPreferenceSchema,
  type CoverLetterLength,
  type CoverLetterPreference,
  type CoverLetterTone,
  type JobFinderSettings,
  type UpdateApplicationDefaultsInput,
} from "@unemployed/contracts";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";
import { FormSelect } from "../../components/form-select";
import { useRegisterSettingsDirtySection } from "./settings-dirty-sections";
import { SettingsSectionSaveControl } from "./settings-section-save-control";
import {
  hasOutstandingSectionChanges,
  useSettingsSectionSave,
} from "./settings-section-save";

/**
 * How a letter Job Finder writes should read.
 *
 * These settings change the writing, never the facts. Whatever is chosen here,
 * a letter only ever says things the resume, the profile, and the posting
 * already support.
 */

const toneOptions: ReadonlyArray<{ label: string; value: CoverLetterTone }> = [
  { label: "Plain and professional", value: "plain_professional" },
  { label: "Warm", value: "warm" },
  { label: "Direct and brief", value: "direct" },
  { label: "Formal", value: "formal" },
];

const lengthOptions: ReadonlyArray<{
  label: string;
  value: CoverLetterLength;
}> = [
  { label: "Short — about 120 words", value: "short" },
  { label: "Standard — about a page", value: "standard" },
  { label: "Detailed — a fuller page", value: "detailed" },
];

function toPreference(settings: JobFinderSettings): CoverLetterPreference {
  return CoverLetterPreferenceSchema.parse(settings.coverLetter ?? {});
}

interface SettingsCoverLetterSectionProps {
  onSettingsDraftEdited?: () => void;
  onUpdateApplicationDefaults: (
    input: UpdateApplicationDefaultsInput,
  ) => Promise<boolean | void> | void;
  settings: JobFinderSettings;
}

export function SettingsCoverLetterSection({
  onSettingsDraftEdited,
  onUpdateApplicationDefaults,
  settings,
}: SettingsCoverLetterSectionProps) {
  const toneId = useId();
  const lengthId = useId();
  const languageId = useId();
  const sampleId = useId();
  const saved = toPreference(settings);
  const [draft, setDraft] = useState<CoverLetterPreference>(saved);
  const { resetSectionSave, runSectionSave, saveState } =
    useSettingsSectionSave();

  useEffect(() => {
    setDraft(toPreference(settings));
  }, [settings]);

  const isSavePending = saveState.status === "saving";
  const hasUnsavedChanges =
    draft.tone !== saved.tone ||
    draft.length !== saved.length ||
    (draft.language ?? "") !== (saved.language ?? "") ||
    (draft.sample ?? "") !== (saved.sample ?? "");

  const edit = (next: Partial<CoverLetterPreference>) => {
    if (isSavePending) {
      return;
    }
    setDraft((current) => ({ ...current, ...next }));
    resetSectionSave();
    onSettingsDraftEdited?.();
  };

  const saveCoverLetterPreference = () => {
    if (!hasUnsavedChanges || isSavePending) {
      return;
    }
    void runSectionSave({
      execute: () =>
        onUpdateApplicationDefaults({
          coverLetter: {
            tone: draft.tone,
            length: draft.length,
            language: draft.language?.trim() ? draft.language.trim() : null,
            sample: draft.sample?.trim() ? draft.sample.trim() : null,
          },
        }),
      failedMessage:
        "Your letter preference was not saved. Retry before leaving this page.",
      savedMessage: "Saved. New letters will read this way.",
    });
  };

  useRegisterSettingsDirtySection({
    anchorId: "settings-cover-letter",
    isDirty: hasOutstandingSectionChanges(hasUnsavedChanges, saveState),
    isSaving: isSavePending,
    label: "Cover letters",
    onSave: saveCoverLetterPreference,
    order: 2,
    saveLabel: "Save letter preference",
  });

  return (
    <section
      className="surface-panel-shell relative grid min-w-0 content-start gap-3 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4"
      id="settings-cover-letter"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[72ch] flex-1 gap-1">
          <h3 className="min-w-0 font-semibold text-(--text-headline)">
            Cover letters
          </h3>
          <p className="text-(length:--text-description) leading-5 text-foreground-soft">
            When an application asks for a cover or motivation letter, Job
            Finder writes one from your resume, your profile, and the posting.
            These settings change how it reads, never what it claims.
          </p>
        </div>
        <SettingsSectionSaveControl
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={saveCoverLetterPreference}
          saveState={saveState}
          subject="letter preference"
          effect="Applies to letters written from now on."
        />
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={toneId}>How it should sound</FieldLabel>
          <FormSelect
            disabled={isSavePending}
            onValueChange={(value) => edit({ tone: value as CoverLetterTone })}
            options={toneOptions}
            triggerId={toneId}
            value={draft.tone}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={lengthId}>How long</FieldLabel>
          <FormSelect
            disabled={isSavePending}
            onValueChange={(value) =>
              edit({ length: value as CoverLetterLength })
            }
            options={lengthOptions}
            triggerId={lengthId}
            value={draft.length}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={languageId}>Language</FieldLabel>
        <Input
          disabled={isSavePending}
          id={languageId}
          onChange={(event) => edit({ language: event.target.value || null })}
          placeholder="Leave empty to match the job posting"
          value={draft.language ?? ""}
        />
        <p className="text-sm leading-5 text-foreground-soft">
          Left empty, letters are written in whatever language the posting uses,
          which is usually what the employer expects.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor={sampleId}>
          A letter of your own, as an example
        </FieldLabel>
        <Textarea
          disabled={isSavePending}
          id={sampleId}
          onChange={(event) => edit({ sample: event.target.value || null })}
          placeholder="Paste a letter you wrote yourself"
          rows={6}
          value={draft.sample ?? ""}
        />
        <p className="text-sm leading-5 text-foreground-soft">
          Optional. Job Finder copies how you sound, not what you said — nothing
          from this letter is reused as a fact about another job.
        </p>
      </Field>
    </section>
  );
}
