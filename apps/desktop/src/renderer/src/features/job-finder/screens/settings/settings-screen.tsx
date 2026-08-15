import type {
  ApplicationCrmSettings,
  BrowserSessionState,
  JobFinderSettings,
  ResumeTemplateDefinition,
} from "@unemployed/contracts";
import { ApplicationCrmSettingsSchema } from "@unemployed/contracts";
import { PageHeader } from "../../components/page-header";
import { SettingsEditableDefaults } from "./settings-editable-defaults";
import { SettingsCandidateAssets } from "./settings-candidate-assets";
import { SettingsRuntimeSummary } from "./settings-runtime-summary";
import { SettingsSupportControls } from "./settings-support-controls";
import { SettingsWorkspaceControls } from "./settings-workspace-controls";
import type { JobFinderSaveState } from "@renderer/pages/job-finder-save-state";
import { ApplicationsCrmSettingsEditor } from "../applications/applications-crm-settings";

export function SettingsScreen(props: {
  actionState: { message: string | null };
  availableResumeTemplates: readonly ResumeTemplateDefinition[];
  browserSession: BrowserSessionState;
  isSavePending: boolean;
  isWorkspaceResetPending: boolean;
  onResetWorkspace: () => void;
  onSaveApplicationCrmSettings: (
    settings: ApplicationCrmSettings,
  ) => Promise<void>;
  onSaveSettings: (settings: JobFinderSettings) => void;
  saveState: JobFinderSaveState;
  settings: JobFinderSettings;
}) {
  const {
    actionState,
    availableResumeTemplates,
    browserSession,
    isSavePending,
    isWorkspaceResetPending,
    onResetWorkspace,
    onSaveSettings,
    saveState,
    settings,
  } = props;

  return (
    <section className="grid gap-3 pb-8">
      <PageHeader
        compact
        eyebrow="Settings"
        title="Settings"
        description="Set the defaults Job Finder reuses for search, resume, and apply work."
      />

      <SettingsEditableDefaults
        actionMessage={actionState.message}
        availableResumeTemplates={availableResumeTemplates}
        isSavePending={isSavePending}
        onSaveSettings={onSaveSettings}
        saveState={saveState}
        settings={settings}
      />

      <SettingsCandidateAssets />

      <ApplicationsCrmSettingsEditor
        onSave={props.onSaveApplicationCrmSettings}
        settings={
          settings.applicationCrm ?? ApplicationCrmSettingsSchema.parse({})
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.32fr)_minmax(0,0.92fr)] xl:items-start">
        <SettingsRuntimeSummary
          browserSession={browserSession}
          settings={settings}
        />
        <div className="grid gap-3">
          <SettingsSupportControls />
          <SettingsWorkspaceControls
            isWorkspaceResetPending={isWorkspaceResetPending}
            onResetWorkspace={onResetWorkspace}
          />
        </div>
      </div>
    </section>
  );
}
