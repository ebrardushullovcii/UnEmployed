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
    <section className="grid gap-(--gap-section)">
      <PageHeader
        eyebrow="Settings"
        title="MVP defaults"
        description="The current slice keeps settings intentionally narrow: session persistence, resume defaults, and review safety controls."
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
