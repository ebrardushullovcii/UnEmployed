import { useEffect, useState } from 'react'
import type { JobFinderSettings, ResumeTemplateDefinition } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { FormSelect } from '../../components/form-select'
import { ToggleField } from '../../components/toggle-field'

interface SettingsEditableDefaultsProps {
  actionMessage: string | null
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  busy: boolean
  onSaveSettings: (settings: JobFinderSettings) => void
  settings: JobFinderSettings
}

export function SettingsEditableDefaults({
  actionMessage,
  availableResumeTemplates,
  busy,
  onSaveSettings,
  settings
}: SettingsEditableDefaultsProps) {
  const [settingsForm, setSettingsForm] = useState(settings)

  useEffect(() => {
    setSettingsForm(settings)
  }, [settings])

  return (
    <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8 grid content-start gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Edit preferences</p>
        <Badge variant="section">Saved on this device</Badge>
      </div>
      <div className="grid gap-(--gap-content) md:grid-cols-2">
        <Field>
          <FieldLabel>Appearance</FieldLabel>
          <FormSelect
            onValueChange={(value) => setSettingsForm((current) => ({ ...current, appearanceTheme: value as JobFinderSettings['appearanceTheme'] }))}
            options={[
              { label: 'System', value: 'system' },
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' }
            ]}
            placeholder="Select appearance"
            value={settingsForm.appearanceTheme}
          />
        </Field>
        <Field>
          <FieldLabel>Resume template</FieldLabel>
          <FormSelect
            onValueChange={(value) => setSettingsForm((current) => ({ ...current, resumeTemplateId: value as JobFinderSettings['resumeTemplateId'] }))}
            options={availableResumeTemplates.map((template) => ({ label: template.label, value: template.id }))}
            placeholder="Select template"
            value={settingsForm.resumeTemplateId}
          />
        </Field>
        <Field>
          <FieldLabel>Resume font</FieldLabel>
          <FormSelect
            onValueChange={(value) => setSettingsForm((current) => ({ ...current, fontPreset: value as JobFinderSettings['fontPreset'] }))}
            options={[{ label: 'Clean sans', value: 'inter_requisite' }, { label: 'Display sans', value: 'space_grotesk_display' }]}
            placeholder="Select font"
            value={settingsForm.fontPreset}
          />
        </Field>
        <ToggleField
          checked={settingsForm.keepSessionAlive}
          description="Keep your browser session available between searches and application steps."
          label="Keep browser signed in"
          onCheckedChange={(checked) => setSettingsForm((current) => ({ ...current, keepSessionAlive: checked }))}
        />
        <ToggleField
          checked={settingsForm.humanReviewRequired}
          description="Require a manual review before a job can move into Applied."
          label="Resume review"
          onCheckedChange={(checked) => setSettingsForm((current) => ({ ...current, humanReviewRequired: checked }))}
        />
        <ToggleField
          checked={settingsForm.allowAutoSubmitOverride}
          description="Allow supported application flows to submit automatically when that option is available."
          label="Automatic submission"
          onCheckedChange={(checked) => setSettingsForm((current) => ({ ...current, allowAutoSubmitOverride: checked }))}
        />
        <ToggleField
          checked={settingsForm.discoveryOnly}
          description="Keep search results separate from your shortlist until you decide to move a job forward."
          label="Browse without shortlisting"
          onCheckedChange={(checked) => setSettingsForm((current) => ({ ...current, discoveryOnly: checked }))}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-4 border-t border-border/10 pt-6">
        <Button variant="primary" disabled={busy} onClick={() => onSaveSettings(settingsForm)} type="button">
          Save settings
        </Button>
      </div>
      {actionMessage ? <p className="text-(length:--text-description) leading-6 text-foreground-muted">{actionMessage}</p> : null}
    </section>
  )
}
