import { useEffect, useState } from 'react'
import type { JobFinderSettings, ResumeTemplateDefinition } from '@unemployed/contracts'
import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import { Field, FieldLabel } from '../../../../components/ui/field'
import { FormSelect } from '../../components/form-select'
import { PreferenceList } from '../../components/preference-list'
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
    <section className="border border-border/20 bg-card px-8 py-8 grid content-start gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">Editable defaults</p>
        <Badge variant="section">Persist locally</Badge>
      </div>
      <div className="grid gap-[0.9rem] md:grid-cols-2">
        <Field>
          <FieldLabel>Resume format</FieldLabel>
          <FormSelect
            onValueChange={(value) => setSettingsForm((current) => ({ ...current, resumeFormat: value as JobFinderSettings['resumeFormat'] }))}
            options={[{ label: 'HTML', value: 'html' }, { label: 'PDF', value: 'pdf' }, { label: 'DOCX', value: 'docx' }]}
            placeholder="Select format"
            value={settingsForm.resumeFormat}
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
          <FieldLabel>Font preset</FieldLabel>
          <FormSelect
            onValueChange={(value) => setSettingsForm((current) => ({ ...current, fontPreset: value as JobFinderSettings['fontPreset'] }))}
            options={[{ label: 'Inter Requisite', value: 'inter_requisite' }, { label: 'Space Grotesk Display', value: 'space_grotesk_display' }]}
            placeholder="Select preset"
            value={settingsForm.fontPreset}
          />
        </Field>
        <ToggleField
          checked={settingsForm.keepSessionAlive}
          description="Keep browser session alive between discovery and apply runs."
          label="Persistence toggle"
          onCheckedChange={(checked) => setSettingsForm((current) => ({ ...current, keepSessionAlive: checked }))}
        />
        <ToggleField
          checked={settingsForm.humanReviewRequired}
          description="Require explicit human review before every Easy Apply attempt."
          label="Human review"
          onCheckedChange={(checked) => setSettingsForm((current) => ({ ...current, humanReviewRequired: checked }))}
        />
        <ToggleField
          checked={settingsForm.allowAutoSubmitOverride}
          className="md:col-span-2"
          description="Allow future adapter overrides to submit automatically when the flow is fully supported."
          label="Auto-submit override"
          onCheckedChange={(checked) => setSettingsForm((current) => ({ ...current, allowAutoSubmitOverride: checked }))}
        />
      </div>
      {availableResumeTemplates.length > 0 ? (
        <PreferenceList label="Template notes" values={availableResumeTemplates.map((template) => `${template.label}: ${template.description}`)} />
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/10 pt-6">
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-positive" />LOCAL_CACHE: SYNCED</span>
          <span className="opacity-30">|</span>
          <span>LAST_MODIFIED: 2024.05.12_14:22</span>
        </div>
        <Button variant="primary" disabled={busy} onClick={() => onSaveSettings(settingsForm)} type="button">
          Save settings
        </Button>
      </div>
      {actionMessage ? <p className="text-[0.84rem] leading-6 text-foreground-muted">{actionMessage}</p> : null}
    </section>
  )
}
