import { FileText, KeyRound, ShieldAlert } from 'lucide-react'
import type {
  AgentProviderStatus,
  BrowserSessionState,
  JobFinderSettings,
  ResumeTemplateDefinition
} from '@unemployed/contracts'
import { SettingsStat } from '../../components/settings-stat'
import { formatStatusLabel } from '../../lib/job-finder-utils'

interface SettingsRuntimeSummaryProps {
  agentProvider: AgentProviderStatus
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  browserSession: BrowserSessionState
  settings: JobFinderSettings
}

export function SettingsRuntimeSummary({
  agentProvider,
  availableResumeTemplates,
  browserSession,
  settings
}: SettingsRuntimeSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8">
        <div className="flex items-center gap-3">
          <KeyRound className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Session management</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Appearance" value={formatStatusLabel(settings.appearanceTheme)} />
          <SettingsStat label="Keep session alive" value={settings.keepSessionAlive ? 'Enabled' : 'Disabled'} />
          <SettingsStat label="Approval default" value={settings.humanReviewRequired ? 'Human review' : 'Auto'} />
        </div>
      </section>

      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8">
        <div className="flex items-center gap-3">
          <FileText className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Automation runtime</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Model provider" value={agentProvider.label} />
          <SettingsStat label="Browser driver" value={formatStatusLabel(browserSession.driver)} />
          <SettingsStat label="Session status" value={formatStatusLabel(browserSession.status)} />
        </div>
        {agentProvider.detail ? <p className="text-(length:--text-description) leading-6 text-foreground-muted">{agentProvider.detail}</p> : null}
        {browserSession.detail ? <p className="text-(length:--text-description) leading-6 text-foreground-muted">{browserSession.detail}</p> : null}
      </section>

      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8">
        <div className="flex items-center gap-3">
          <FileText className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Document defaults</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Export format" value={settings.resumeFormat.toUpperCase()} />
          <SettingsStat label="Font preset" value={formatStatusLabel(settings.fontPreset)} />
          <SettingsStat
            label="Template"
            value={availableResumeTemplates.find((template) => template.id === settings.resumeTemplateId)?.label ?? formatStatusLabel(settings.resumeTemplateId)}
          />
        </div>
      </section>

      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8 md:col-span-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="size-4 text-destructive" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Safety protocols</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Human in the loop" value={settings.humanReviewRequired ? 'Required' : 'Disabled'} />
          <SettingsStat label="Auto-submit override" value={settings.allowAutoSubmitOverride ? 'Enabled' : 'Disabled'} />
        </div>
      </section>
    </div>
  )
}
