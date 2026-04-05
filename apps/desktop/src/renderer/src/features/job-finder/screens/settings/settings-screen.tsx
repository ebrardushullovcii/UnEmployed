import type {
  AgentProviderStatus,
  BrowserSessionState,
  JobFinderSettings,
  ResumeTemplateDefinition
} from '@unemployed/contracts'
import { PageHeader } from '../../components/page-header'
import { SettingsEditableDefaults } from './settings-editable-defaults'
import { SettingsRuntimeSummary } from './settings-runtime-summary'
import { SettingsWorkspaceControls } from './settings-workspace-controls'

export function SettingsScreen(props: {
  actionState: { busy: boolean; message: string | null }
  agentProvider: AgentProviderStatus
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  browserSession: BrowserSessionState
  busy: boolean
  onResetWorkspace: () => void
  onSaveSettings: (settings: JobFinderSettings) => void
  settings: JobFinderSettings
}) {
  const {
    actionState,
    agentProvider,
    availableResumeTemplates,
    browserSession,
    busy,
    onResetWorkspace,
    onSaveSettings,
    settings
  } = props

  return (
    <section className="grid gap-(--gap-section) pb-8">
      <PageHeader
        eyebrow="Settings"
        title="Preferences"
        description="Choose how Job Finder saves your work, prepares resumes, and handles review safeguards."
      />

      <SettingsWorkspaceControls busy={busy} onResetWorkspace={onResetWorkspace} />
      <SettingsRuntimeSummary
        agentProvider={agentProvider}
        availableResumeTemplates={availableResumeTemplates}
        browserSession={browserSession}
        settings={settings}
      />
      <SettingsEditableDefaults
        actionMessage={actionState.message}
        availableResumeTemplates={availableResumeTemplates}
        busy={busy}
        onSaveSettings={onSaveSettings}
        settings={settings}
      />
    </section>
  )
}
