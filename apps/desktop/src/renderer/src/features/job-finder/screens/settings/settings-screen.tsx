import type {
  BrowserSessionState,
  JobFinderSettings,
  ResumeTemplateDefinition,
} from '@unemployed/contracts'
import { PageHeader } from '../../components/page-header'
import { SettingsEditableDefaults } from './settings-editable-defaults'
import { SettingsRuntimeSummary } from './settings-runtime-summary'
import { SettingsWorkspaceControls } from './settings-workspace-controls'

export function SettingsScreen(props: {
  actionState: { message: string | null }
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  browserSession: BrowserSessionState
  isSavePending: boolean
  isWorkspaceResetPending: boolean
  onResetWorkspace: () => void
  onSaveSettings: (settings: JobFinderSettings) => void
  settings: JobFinderSettings
}) {
  const {
    actionState,
    availableResumeTemplates,
    browserSession,
    isSavePending,
    isWorkspaceResetPending,
    onResetWorkspace,
    onSaveSettings,
    settings
  } = props

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
        settings={settings}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.32fr)_minmax(0,0.92fr)] xl:items-start">
        <SettingsRuntimeSummary
          browserSession={browserSession}
          settings={settings}
        />
        <SettingsWorkspaceControls isWorkspaceResetPending={isWorkspaceResetPending} onResetWorkspace={onResetWorkspace} />
      </div>
    </section>
  )
}
