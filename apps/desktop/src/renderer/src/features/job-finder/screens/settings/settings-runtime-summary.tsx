import { FileText, KeyRound, ShieldAlert } from 'lucide-react'
import type { BrowserSessionState, JobFinderSettings, ResumeTemplateDefinition } from '@unemployed/contracts'
import { SettingsStat } from '../../components/settings-stat'
import { formatStatusLabel } from '../../lib/job-finder-utils'

interface SettingsRuntimeSummaryProps {
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  browserSession: BrowserSessionState
  settings: JobFinderSettings
}

function getBrowserLabel(driver: BrowserSessionState['driver']): string {
  switch (driver) {
    case 'chrome_profile_agent':
      return 'Managed Chrome'
    default:
      return 'Catalog search'
  }
}

function getFontPresetLabel(fontPreset: JobFinderSettings['fontPreset']): string {
  switch (fontPreset) {
    case 'space_grotesk_display':
      return 'Display sans'
    default:
      return 'Clean sans'
  }
}

export function SettingsRuntimeSummary({
  availableResumeTemplates,
  browserSession,
  settings
}: SettingsRuntimeSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8">
        <div className="flex items-center gap-3">
          <KeyRound className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Display</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Appearance" value={formatStatusLabel(settings.appearanceTheme)} />
          <SettingsStat label="Stay signed in" value={settings.keepSessionAlive ? 'On' : 'Off'} />
        </div>
      </section>

      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8">
        <div className="flex items-center gap-3">
          <FileText className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Browser</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Browser" value={getBrowserLabel(browserSession.driver)} />
          <SettingsStat label="Status" value={formatStatusLabel(browserSession.status)} />
        </div>
      </section>

      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8">
        <div className="flex items-center gap-3">
          <FileText className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Resume defaults</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Resume font" value={getFontPresetLabel(settings.fontPreset)} />
          <SettingsStat
            label="Template"
            value={availableResumeTemplates.find((template) => template.id === settings.resumeTemplateId)?.label ?? formatStatusLabel(settings.resumeTemplateId)}
          />
        </div>
      </section>

      <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8 md:col-span-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="size-4 text-destructive" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Review safety</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsStat label="Approval required" value={settings.humanReviewRequired ? 'Yes' : 'No'} />
          <SettingsStat label="Apply automatically" value={settings.allowAutoSubmitOverride ? 'On' : 'Off'} />
        </div>
      </section>
    </div>
  )
}
