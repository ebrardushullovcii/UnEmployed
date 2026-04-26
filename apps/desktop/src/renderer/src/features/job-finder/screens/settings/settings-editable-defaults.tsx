import { useEffect, useId, useState } from 'react'
import type { JobFinderSettings } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { FormSelect } from '../../components/form-select'
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
  isSavePending: boolean
  onSaveSettings: (settings: JobFinderSettings) => void
  settings: JobFinderSettings
}

export function SettingsEditableDefaults({
  actionMessage,
  isSavePending,
  onSaveSettings,
  settings
}: SettingsEditableDefaultsProps) {
  const appearanceId = useId()
  const fontPresetId = useId()
  const [settingsForm, setSettingsForm] = useState(settings)
  const appearanceThemeOptions: ReadonlyArray<{ label: string; value: JobFinderSettings['appearanceTheme'] }> = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' }
  ]
  const isFontPresetOption = (value: string): value is JobFinderSettings['fontPreset'] =>
    fontPresetOptions.some((fontPreset) => fontPreset.value === value)
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
    <section className="surface-panel-shell relative grid content-start gap-8 rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <p className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Defaults</p>
          <p className="text-sm leading-6 text-foreground-soft">Keep the editable defaults here. Live browser status and destructive controls stay in the side rail.</p>
        </div>
      </div>
      <div className="grid gap-6">
        <section className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) p-5">
          <div className="grid gap-1">
            <h2 className="text-(length:--type-body-md) font-semibold text-(--text-headline)">Appearance and resume defaults</h2>
            <p className="text-(length:--text-description) leading-6 text-foreground-soft">These settings shape how the workspace looks and how the ATS-first resume export is rendered.</p>
          </div>

          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
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
            </Field>
            <Field className="md:col-span-2">
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
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="label-mono-xs">Resume layout</span>
              <strong className="mt-2 block text-(length:--text-body) font-semibold text-foreground">
                Classic ATS
              </strong>
              <p className="mt-2 text-(length:--text-description) leading-6 text-foreground-soft">
                Job Finder now ships one default single-column export so new resumes stay optimized for parser reliability and recruiter readability.
              </p>
            </div>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="label-mono-xs">Selected font</span>
              <strong className="mt-2 block text-(length:--text-body) font-semibold text-foreground">
                {selectedFontPreset?.label ?? 'Font not available'}
              </strong>
              <p className="mt-2 text-(length:--text-description) leading-6 text-foreground-soft">
                {selectedFontPreset?.description ?? 'Choose the default font pairing for resume exports.'}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) p-5">
          <div className="grid gap-1">
            <h2 className="text-(length:--type-body-md) font-semibold text-(--text-headline)">Workspace behavior</h2>
            <p className="text-(length:--text-description) leading-6 text-foreground-soft">Keep only the defaults you actually want Job Finder to reuse between searches and application steps.</p>
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

      <div className="mt-4 flex flex-wrap items-center justify-end gap-4 border-t border-border/10 pt-6">
        <Button variant="primary" pending={isSavePending} onClick={() => onSaveSettings(settingsForm)} type="button">
          Save settings
        </Button>
      </div>
      {actionMessage ? <p className="text-(length:--text-description) leading-6 text-foreground-muted">{actionMessage}</p> : null}
    </section>
  )
}
