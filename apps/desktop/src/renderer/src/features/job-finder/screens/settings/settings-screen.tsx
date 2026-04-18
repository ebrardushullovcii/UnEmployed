import type { BrowserSessionState, JobFinderSettings } from '@unemployed/contracts'
import { PageHeader } from '../../components/page-header'
import { SettingsEditableDefaults } from './settings-editable-defaults'
import { SettingsRuntimeSummary } from './settings-runtime-summary'
import { SettingsWorkspaceControls } from './settings-workspace-controls'

export function SettingsScreen(props: {
  actionState: { busy: boolean; message: string | null }
  browserSession: BrowserSessionState
  busy: boolean
  onResetWorkspace: () => void
  onSaveSettings: (settings: JobFinderSettings) => void
  settings: JobFinderSettings
}) {
  const {
    actionState,
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
        title="Settings"
        description="Set the defaults Job Finder uses before it searches, builds resumes, and starts supported applications."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(21rem,24rem)] xl:items-start">
        <SettingsEditableDefaults
          actionMessage={actionState.message}
          busy={busy}
          onSaveSettings={onSaveSettings}
          settings={settings}
        />

        <div className="grid gap-4">
          <SettingsRuntimeSummary
            browserSession={browserSession}
            settings={settings}
          />
          <SettingsWorkspaceControls busy={busy} onResetWorkspace={onResetWorkspace} />
        </div>
      </div>
    </section>
  )
}
