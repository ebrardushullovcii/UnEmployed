import { useEffect, useId, useState } from "react";
import type {
  JobFinderSettings,
  UpdateWorkspaceBehaviorInput,
} from "@unemployed/contracts";
import { ToggleField } from "../../components/toggle-field";
import { useRegisterSettingsDirtySection } from "./settings-dirty-sections";
import { SettingsSectionSaveControl } from "./settings-section-save-control";
import {
  hasOutstandingSectionChanges,
  useSettingsSectionSave,
} from "./settings-section-save";

interface SettingsWorkspaceBehaviorSectionProps {
  /** Reports staged behavior edits so a stale shell save retry is retired. */
  onSettingsDraftEdited?: () => void;
  onUpdateWorkspaceBehavior: (
    input: UpdateWorkspaceBehaviorInput,
  ) => Promise<boolean | void> | void;
  settings: JobFinderSettings;
}

export function SettingsWorkspaceBehaviorSection({
  onSettingsDraftEdited,
  onUpdateWorkspaceBehavior,
  settings,
}: SettingsWorkspaceBehaviorSectionProps) {
  const sectionHeadingId = useId();
  const [draftKeepSessionAlive, setDraftKeepSessionAlive] = useState(
    settings.keepSessionAlive,
  );
  const [draftDiscoveryOnly, setDraftDiscoveryOnly] = useState(
    settings.discoveryOnly,
  );
  const { resetSectionSave, runSectionSave, saveState } =
    useSettingsSectionSave();

  useEffect(() => {
    setDraftKeepSessionAlive(settings.keepSessionAlive);
  }, [settings.keepSessionAlive]);

  useEffect(() => {
    setDraftDiscoveryOnly(settings.discoveryOnly);
  }, [settings.discoveryOnly]);

  const isSavePending = saveState.status === "saving";
  const hasUnsavedChanges =
    draftKeepSessionAlive !== settings.keepSessionAlive ||
    draftDiscoveryOnly !== settings.discoveryOnly;
  const updateStagedDrafts = (updater: () => void) => {
    if (isSavePending) {
      return;
    }
    updater();
    resetSectionSave();
    onSettingsDraftEdited?.();
  };
  const saveWorkspaceBehavior = () => {
    if (!hasUnsavedChanges || isSavePending) {
      return;
    }
    void runSectionSave({
      execute: () =>
        onUpdateWorkspaceBehavior({
          discoveryOnly: draftDiscoveryOnly,
          keepSessionAlive: draftKeepSessionAlive,
        }),
      failedMessage:
        "Workspace behavior was not saved. Retry before leaving this page.",
      savedMessage: "Workspace behavior saved.",
    });
  };

  useRegisterSettingsDirtySection({
    anchorId: "settings-workspace-behavior",
    isDirty: hasOutstandingSectionChanges(hasUnsavedChanges, saveState),
    isSaving: isSavePending,
    label: "Browser & saved jobs",
    onSave: saveWorkspaceBehavior,
    order: 3,
    saveLabel: "Save workspace behavior",
  });

  return (
    <section className="surface-panel-shell grid min-w-0 content-start gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[72ch] flex-1 gap-1">
          <h3
            className="min-w-0 font-semibold text-(--text-headline)"
            id={sectionHeadingId}
          >
            Browser and saved jobs
          </h3>
          <p className="text-(length:--text-description) leading-5 text-foreground-soft">
            Keep only the defaults you actually want Job Finder to reuse between
            searches and application steps.
          </p>
        </div>
        <SettingsSectionSaveControl
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={saveWorkspaceBehavior}
          saveState={saveState}
          subject="workspace behavior"
          effect="Applies from your next search or application run."
        />
      </div>

      <div className="grid min-w-0 gap-(--gap-content) md:grid-cols-2">
        <ToggleField
          checked={draftKeepSessionAlive}
          description="Keep the agent’s tabs open after searches and application steps so the next run starts where the last one left off."
          disabled={isSavePending}
          hint="Off closes the tabs as soon as a run finishes and you are not looking at them. Sign-ins are kept either way."
          label="Keep browser tabs after runs"
          onCheckedChange={(checked) =>
            updateStagedDrafts(() => setDraftKeepSessionAlive(checked))
          }
        />
        <ToggleField
          checked={draftDiscoveryOnly}
          description="Keep new search results temporary until you shortlist them."
          disabled={isSavePending}
          hint="Useful if you want a cleaner workspace with fewer saved jobs."
          label="Only keep jobs I shortlist"
          onCheckedChange={(checked) =>
            updateStagedDrafts(() => setDraftDiscoveryOnly(checked))
          }
        />
      </div>
    </section>
  );
}
