import { useEffect, useId, useState } from 'react'
import type { JobFinderSettings, ResumeTemplateDefinition } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { FormSelect } from '../../components/form-select'
import { ResumeThemePicker } from '../../components/resume-theme-picker'
import { ToggleField } from '../../components/toggle-field'

const fontPresetOptions: ReadonlyArray<{
  description: string
  label: string
  value: JobFinderSettings['fontPreset']
}> = [
  {
    description: 'Clean, compact, and the safest default for high-volume applications.',
    label: 'Clean sans',
    value: 'inter_requisite'
  },
  {
    description: 'A stronger display look that keeps more personality in the final PDF.',
    label: 'Display sans',
    value: 'space_grotesk_display'
  }
]

interface SettingsEditableDefaultsProps {
  actionMessage: string | null
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  isSavePending: boolean
  onSaveSettings: (settings: JobFinderSettings) => void
  settings: JobFinderSettings
}

export function SettingsEditableDefaults({
  actionMessage,
  availableResumeTemplates,
  isSavePending,
  onSaveSettings,
  settings
}: SettingsEditableDefaultsProps) {
  const appearanceId = useId()
  const fontPresetId = useId()
  const resumeTemplateDomId = useId()
  const [settingsForm, setSettingsForm] = useState(settings)
  const appearanceThemeOptions: ReadonlyArray<{ label: string; value: JobFinderSettings['appearanceTheme'] }> = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' }
  ]
  const isFontPresetOption = (value: string): value is JobFinderSettings['fontPreset'] =>
    fontPresetOptions.some((fontPreset) => fontPreset.value === value)
  const isResumeTemplateOption = (value: string): value is JobFinderSettings['resumeTemplateId'] =>
    availableResumeTemplates.some((template) => template.id === value)
  const isAppearanceThemeOption = (value: string): value is JobFinderSettings['appearanceTheme'] =>
    appearanceThemeOptions.some((option) => option.value === value)
  const updateSettingsForm = (updater: (current: JobFinderSettings) => JobFinderSettings) => {
    if (isSavePending) {
      return
    }

    setSettingsForm(updater)
  }
  const selectedFontPreset = fontPresetOptions.find(
    (fontPreset) => fontPreset.value === settingsForm.fontPreset
  )

  useEffect(() => {
    setSettingsForm(settings)
  }, [settings])

  return (
    <section className="surface-panel-shell relative grid content-start gap-3 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="grid gap-3">
        <section className="grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) p-3.5">
          <div className="grid gap-1">
            <h2 className="text-[1.02rem] font-semibold text-(--text-headline)">Default template picker</h2>
            <p className="max-w-[64ch] text-(length:--text-description) leading-5 text-foreground-soft">Choose the starting resume template here. The preview uses sample resume content rendered through the same template engine used for exports. Appearance and font defaults sit just below.</p>
          </div>

          <Field>
              <FieldLabel htmlFor={resumeTemplateDomId}>Default resume template</FieldLabel>
              <div className="grid gap-2.5">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="section">Applies to new drafts</Badge>
                  <Badge variant="section">Existing drafts unchanged</Badge>
                </div>
                <ResumeThemePicker
                  disabled={isSavePending}
                  id={resumeTemplateDomId}
                  onChange={(value) =>
                    updateSettingsForm((current) => ({
                      ...current,
                      resumeTemplateId: isResumeTemplateOption(value)
                        ? value
                        : current.resumeTemplateId,
                    }))
                  }
                  selectedThemeId={settingsForm.resumeTemplateId}
                  themes={availableResumeTemplates}
                />
              </div>
          </Field>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3.5 py-3">
              <FieldLabel htmlFor={appearanceId}>Appearance</FieldLabel>
              <FormSelect
                disabled={isSavePending}
                onValueChange={(value) => updateSettingsForm((current) => ({
                  ...current,
                  appearanceTheme: isAppearanceThemeOption(value) ? value : current.appearanceTheme
                }))}
                options={appearanceThemeOptions}
                placeholder="Select appearance"
                triggerId={appearanceId}
                value={settingsForm.appearanceTheme}
              />
              <p className="text-(length:--text-description) leading-5 text-foreground-soft">
                Use system if you want Job Finder to follow the OS, or pin a theme when you want a stable visual working environment.
              </p>
            </Field>
            <Field className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3.5 py-3">
              <FieldLabel htmlFor={fontPresetId}>Resume font</FieldLabel>
              <FormSelect
                disabled={isSavePending}
                onValueChange={(value) => updateSettingsForm((current) => ({
                  ...current,
                  fontPreset: isFontPresetOption(value) ? value : current.fontPreset
                }))}
                options={fontPresetOptions.map((fontPreset) => ({ label: fontPreset.label, value: fontPreset.value }))}
                placeholder="Select font"
                triggerId={fontPresetId}
                value={settingsForm.fontPreset}
              />
              <p className="text-(length:--text-description) leading-5 text-foreground-soft">
                Pick the default font pairing for exported resumes. This affects PDF tone, not the editor schema.
              </p>
            </Field>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-3">
              <span className="label-mono-xs">Selected font</span>
              <strong className="mt-1.5 block text-(length:--text-body) font-semibold text-foreground">
                {selectedFontPreset?.label ?? 'Font not available'}
              </strong>
              <p className="mt-1.5 text-(length:--text-description) leading-5 text-foreground-soft">
                {selectedFontPreset?.description ?? 'Choose the default font pairing for resume exports.'}
              </p>
            </div>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-3">
              <span className="label-mono-xs">Workflow defaults</span>
              <strong className="mt-1.5 block text-(length:--text-body) font-semibold text-foreground">
                {settingsForm.keepSessionAlive ? 'Keep browser open' : 'Close after runs'} · {settingsForm.discoveryOnly ? 'Shortlist only' : 'Save findings'}
              </strong>
              <p className="mt-1.5 text-(length:--text-description) leading-5 text-foreground-soft">
                Decide whether Job Finder reuses a warm browser session and whether new search results persist automatically.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) p-3.5">
          <div className="grid gap-1">
            <h2 className="text-[1.02rem] font-semibold text-(--text-headline)">Workspace behavior</h2>
            <p className="max-w-[72ch] text-(length:--text-description) leading-5 text-foreground-soft">Keep only the defaults you actually want Job Finder to reuse between searches and application steps.</p>
          </div>

          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <ToggleField
              checked={settingsForm.keepSessionAlive}
              description="Leave the browser open after searches and application steps instead of closing it when a run finishes."
              disabled={isSavePending}
              hint="Keep this off if you want the browser to fully close after each run."
              label="Keep browser open after runs"
              onCheckedChange={(checked) => updateSettingsForm((current) => ({ ...current, keepSessionAlive: checked }))}
            />
            <ToggleField
              checked={settingsForm.discoveryOnly}
              description="Keep new search results temporary until you shortlist them."
              disabled={isSavePending}
              hint="Useful if you want a cleaner workspace with fewer saved jobs."
              label="Only keep jobs I shortlist"
              onCheckedChange={(checked) => updateSettingsForm((current) => ({ ...current, discoveryOnly: checked }))}
            />
          </div>
        </section>

      </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/10 pt-2.5">
          <div className="min-h-[1.5rem] text-sm leading-6 text-foreground-soft">
            {actionMessage ? <p className="text-primary">{actionMessage}</p> : 'Only future work changes until you save these defaults.'}
          </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="section">New drafts inherit these defaults</Badge>
          <Button variant="primary" pending={isSavePending} onClick={() => onSaveSettings(settingsForm)} type="button">
            Save settings
          </Button>
        </div>
      </div>
    </section>
  )
}
