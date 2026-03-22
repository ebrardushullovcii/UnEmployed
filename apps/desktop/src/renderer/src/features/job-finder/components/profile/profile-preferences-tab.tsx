import type { UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import { Field, FieldLabel } from '../../../../components/ui/field'
import { Input } from '../../../../components/ui/input'
import { Textarea } from '../../../../components/ui/textarea'
import { CheckboxField } from '../checkbox-field'
import { FormSelect } from '../form-select'
import type { SearchPreferencesEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel } from '../../lib/job-finder-utils'
import { workModeValues } from '@unemployed/contracts'

interface ProfilePreferencesTabProps {
  busy: boolean
  onSavePreferences: () => void
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  validationMessage: string | null
}

export function ProfilePreferencesTab({
  busy,
  onSavePreferences,
  preferencesForm,
  validationMessage
}: ProfilePreferencesTabProps) {
  const { control, register, watch } = preferencesForm
  const watchedWorkModes = watch('workModes')
  const watchedTargetRoles = watch('targetRoles')
  const watchedLocations = watch('locations')
  const watchedMinimumSalaryUsd = watch('minimumSalaryUsd')
  const watchedTargetSalaryUsd = watch('targetSalaryUsd')
  const watchedTailoringMode = watch('tailoringMode')

  return (
    <div className="grid w-full gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.8fr)]">
      <section className="w-full rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Discovery preferences</p><p className="text-[0.84rem] leading-6 text-foreground-muted">Role targeting stays separate from the canonical candidate record, but is now richer and more explicit.</p></div><Badge variant="section">Targeting</Badge></div>
        <div className="grid gap-[0.9rem] md:grid-cols-2">
          <Field><FieldLabel>Target roles</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('targetRoles')} /></Field>
          <Field><FieldLabel>Job families</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('jobFamilies')} /></Field>
          <Field><FieldLabel>Preferred locations</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('locations')} /></Field>
          <Field><FieldLabel>Excluded locations</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('excludedLocations')} /></Field>
          <Field><FieldLabel>Seniority</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('seniorityLevels')} /></Field>
          <Field><FieldLabel>Employment types</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('employmentTypes')} /></Field>
          <Field><FieldLabel>Industries</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('targetIndustries')} /></Field>
          <Field><FieldLabel>Company stages / sizes</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('targetCompanyStages')} /></Field>
          <div className="grid min-w-0 gap-[0.44rem]"><FieldLabel>Work modes</FieldLabel><div className="grid gap-2 md:grid-cols-2">{workModeValues.map((workMode) => (<Controller key={workMode} control={control} name="workModes" render={({ field }) => (<CheckboxField checked={field.value.includes(workMode)} label={formatStatusLabel(workMode)} onCheckedChange={(checked) => field.onChange(checked ? [...field.value, workMode] : field.value.filter((value) => value !== workMode))} />)} />))}</div></div>
          <Controller control={control} name="tailoringMode" render={({ field }) => (<Field><FieldLabel>Tailoring mode</FieldLabel><FormSelect onValueChange={field.onChange} options={[{ label: 'Conservative', value: 'conservative' }, { label: 'Balanced', value: 'balanced' }, { label: 'Aggressive', value: 'aggressive' }]} placeholder="Select mode" value={field.value} /></Field>)} />
          <Field><FieldLabel>Minimum salary</FieldLabel><Input min="0" step="1" type="number" {...register('minimumSalaryUsd')} /></Field>
          <Field><FieldLabel>Target salary</FieldLabel><Input min="0" step="1" type="number" {...register('targetSalaryUsd')} /></Field>
          <Field><FieldLabel>Salary currency</FieldLabel><Input {...register('salaryCurrency')} /></Field>
          <Field><FieldLabel>Preferred companies</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('companyWhitelist')} /></Field>
          <Field><FieldLabel>Blocked companies</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('companyBlacklist')} /></Field>
        </div>
      </section>

      <aside className="grid content-start gap-4 rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 xl:sticky xl:top-6">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Preference snapshot</p>
          <h3 className="mt-2 font-display text-lg font-semibold uppercase tracking-[0.08em] text-foreground">Current targeting</h3>
        </div>
        <div className="grid gap-3 rounded-[0.42rem] border border-border-subtle bg-white/2 p-4">
          <span className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Roles configured</span>
          <strong className="text-lg text-foreground">{watchedTargetRoles.split(/\r?\n/).filter(Boolean).length || 0}</strong>
        </div>
        <div className="grid gap-3 rounded-[0.42rem] border border-border-subtle bg-white/2 p-4">
          <span className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Locations configured</span>
          <strong className="text-lg text-foreground">{watchedLocations.split(/\r?\n/).filter(Boolean).length || 0}</strong>
        </div>
        <div className="grid gap-3 rounded-[0.42rem] border border-border-subtle bg-white/2 p-4">
          <span className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Work modes</span>
          <div className="flex flex-wrap gap-2">
            {watchedWorkModes.length > 0 ? watchedWorkModes.map((mode) => <Badge key={mode} variant="outline">{formatStatusLabel(mode)}</Badge>) : <span className="text-[0.84rem] text-foreground-muted">No work modes selected.</span>}
          </div>
        </div>
        <div className="grid gap-3 rounded-[0.42rem] border border-border-subtle bg-white/2 p-4">
          <span className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Compensation band</span>
          <strong className="text-sm text-foreground">{watchedMinimumSalaryUsd || '0'} - {watchedTargetSalaryUsd || '0'} {preferencesForm.getValues('salaryCurrency') || 'USD'}</strong>
          <span className="text-[0.84rem] text-foreground-muted">Tailoring mode: {formatStatusLabel(watchedTailoringMode)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button variant="secondary" disabled={busy} onClick={onSavePreferences} type="button">Save preferences</Button>
          {validationMessage ? <p className="text-[0.84rem] leading-6 text-foreground-muted">{validationMessage}</p> : null}
        </div>
      </aside>
    </div>
  )
}
