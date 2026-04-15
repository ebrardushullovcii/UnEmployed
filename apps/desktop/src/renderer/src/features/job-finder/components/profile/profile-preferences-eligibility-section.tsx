import { useId } from 'react'
import { candidateAnswerKindValues } from '@unemployed/contracts'
import type { Control, UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { EmptyState } from '../empty-state'
import { FormSelect } from '../form-select'
import type { BooleanSelectValue } from '../../lib/job-finder-types'
import type { ProfileEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel } from '../../lib/job-finder-utils'
import { ProfileInput, ProfileTextarea, profileSelectTriggerClassName } from './profile-form-primitives'
import { ProfileOptionalSection } from './profile-optional-section'
import type { ProfileFieldArrayKeyName } from './profile-field-array-types'
import { ProfileRecordCard } from './profile-record-card'
import { ProfileSectionHeader } from './profile-section-header'

const booleanSelectOptions = [
  { label: 'Not set', value: '' },
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' }
]

function BooleanSelectField(props: {
  control: Control<ProfileEditorValues>
  id?: string
  label: string
  name:
    | 'eligibility.remoteEligible'
    | 'eligibility.requiresVisaSponsorship'
    | 'eligibility.willingToRelocate'
    | 'eligibility.willingToTravel'
}) {
  const generatedId = useId()
  const fieldId = props.id ?? generatedId

  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
          <FieldLabel htmlFor={fieldId}>{props.label}</FieldLabel>
          <FormSelect
            onValueChange={(value) => field.onChange(value as BooleanSelectValue)}
            options={booleanSelectOptions}
            placeholder="Not set"
            triggerClassName={profileSelectTriggerClassName}
            triggerId={fieldId}
            value={field.value}
          />
        </div>
      )}
    />
  )
}

export function ProfilePreferencesEligibilitySection(props: {
  busy: boolean
  customAnswerArray: UseFieldArrayReturn<ProfileEditorValues, 'answerBank.customAnswers', ProfileFieldArrayKeyName>
  profileForm: UseFormReturn<ProfileEditorValues>
}) {
  const { control: profileControl, getValues, register, watch } = props.profileForm
  const authorizedWorkCountriesId = 'profile-setup-field-eligibility-authorized-work-countries'
  const preferredRelocationRegionsId = 'profile-setup-field-eligibility-preferred-relocation-regions'
  const securityClearanceId = useId()
  const noticePeriodId = useId()
  const availableStartDateId = 'profile-setup-field-eligibility-available-start-date'
  const preferredApplicationEmailId = 'profile-setup-field-application-identity-preferred-email'
  const preferredApplicationPhoneId = 'profile-setup-field-application-identity-preferred-phone'
  const preferredApplicationLinksId = 'profile-setup-field-application-identity-preferred-links'
  const workAuthorizationAnswerId = useId()
  const visaSponsorshipAnswerId = 'profile-setup-field-answer-bank-visa-sponsorship'
  const relocationAnswerId = 'profile-setup-field-answer-bank-relocation'
  const travelAnswerId = useId()
  const noticePeriodAnswerId = useId()
  const availabilityAnswerId = 'profile-setup-field-answer-bank-availability'
  const salaryExpectationAnswerId = useId()
  const selfIntroductionAnswerId = 'profile-setup-field-answer-bank-self-introduction'
  const careerTransitionAnswerId = 'profile-setup-field-answer-bank-career-transition'

  return (
    <section className="grid content-start gap-(--gap-card)">
      <ProfileSectionHeader
        eyebrow="Preferences"
        title="Work eligibility"
        description="Keep screening answers separate from resume facts so they are easy to review when an application asks for them."
      />

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Authorization</h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
            <FieldLabel htmlFor={authorizedWorkCountriesId}>Authorized work countries</FieldLabel>
            <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" id={authorizedWorkCountriesId} placeholder="List countries where you can work without extra sponsorship" rows={4} {...register('eligibility.authorizedWorkCountries')} />
          </div>
          <BooleanSelectField control={profileControl} id="profile-setup-field-eligibility-requires-visa-sponsorship" label="Requires visa sponsorship" name="eligibility.requiresVisaSponsorship" />
          <BooleanSelectField control={profileControl} id="profile-setup-field-eligibility-remote-eligible" label="Can work remotely" name="eligibility.remoteEligible" />
        </div>
      </article>

      <ProfileOptionalSection
        defaultOpen={Boolean(getValues('eligibility.securityClearance'))}
        description="Only keep the screening details here that actually come up in your target roles."
        title="Extra screening details"
      >
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
            <FieldLabel htmlFor={securityClearanceId}>Security clearance</FieldLabel>
            <ProfileInput id={securityClearanceId} {...register('eligibility.securityClearance')} />
          </div>
        </div>
      </ProfileOptionalSection>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Relocation and travel</h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <BooleanSelectField control={profileControl} id="profile-setup-field-eligibility-willing-to-relocate" label="Willing to relocate" name="eligibility.willingToRelocate" />
          <BooleanSelectField control={profileControl} id="profile-setup-field-eligibility-willing-to-travel" label="Willing to travel" name="eligibility.willingToTravel" />
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
            <FieldLabel htmlFor={preferredRelocationRegionsId}>Preferred relocation locations</FieldLabel>
            <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" id={preferredRelocationRegionsId} rows={4} {...register('eligibility.preferredRelocationRegions')} />
          </div>
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Availability</h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={noticePeriodId}>Notice period (days)</FieldLabel><ProfileInput id={noticePeriodId} min="0" step="1" type="number" {...register('eligibility.noticePeriodDays')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={availableStartDateId}>Available start date</FieldLabel><ProfileInput id={availableStartDateId} placeholder="Leave blank if flexible" {...register('eligibility.availableStartDate')} /></div>
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Application defaults</h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={preferredApplicationEmailId}>Preferred application email</FieldLabel><ProfileInput id={preferredApplicationEmailId} placeholder="Leave blank to reuse your main email" {...register('applicationIdentity.preferredEmail')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={preferredApplicationPhoneId}>Preferred application phone</FieldLabel><ProfileInput id={preferredApplicationPhoneId} placeholder="Leave blank to reuse your main phone" {...register('applicationIdentity.preferredPhone')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2"><FieldLabel htmlFor={preferredApplicationLinksId}>Preferred public link IDs</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={preferredApplicationLinksId} rows={4} placeholder="Copy link IDs from the Background tab, one per line" {...register('applicationIdentity.preferredLinkIds')} /></div>
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">Reusable screener answers</h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={workAuthorizationAnswerId}>Work authorization answer</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={workAuthorizationAnswerId} rows={4} {...register('answerBank.workAuthorization')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={visaSponsorshipAnswerId}>Visa sponsorship answer</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={visaSponsorshipAnswerId} rows={4} {...register('answerBank.visaSponsorship')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={relocationAnswerId}>Relocation answer</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={relocationAnswerId} rows={4} {...register('answerBank.relocation')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={travelAnswerId}>Travel answer</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={travelAnswerId} rows={4} {...register('answerBank.travel')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={noticePeriodAnswerId}>Notice period answer</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={noticePeriodAnswerId} rows={4} {...register('answerBank.noticePeriod')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={availabilityAnswerId}>Availability answer</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={availabilityAnswerId} rows={4} {...register('answerBank.availability')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={salaryExpectationAnswerId}>Salary expectations answer</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={salaryExpectationAnswerId} rows={4} {...register('answerBank.salaryExpectations')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={selfIntroductionAnswerId}>Short self-introduction</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={selfIntroductionAnswerId} rows={4} {...register('answerBank.selfIntroduction')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2"><FieldLabel htmlFor={careerTransitionAnswerId}>Career transition explanation</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" id={careerTransitionAnswerId} rows={4} {...register('answerBank.careerTransition')} /></div>
        </div>
      </article>

      <ProfileOptionalSection
        defaultOpen={props.customAnswerArray.fields.length > 0}
        description="Save a few custom answers here when recurring applications ask the same question in slightly different words."
        title="Custom answer library"
      >
        <div className="grid gap-4">
          <div className="flex justify-end">
            <Button
              disabled={props.busy}
              onClick={() =>
                props.customAnswerArray.append({
                  id: `answer_${crypto.randomUUID().slice(0, 8)}`,
                  label: '',
                  question: '',
                  answer: '',
                  kind: 'other',
                  roleFamilies: '',
                  proofEntryIds: ''
                })
              }
              type="button"
              variant="secondary"
            >
              Add custom answer
            </Button>
          </div>

          {props.customAnswerArray.fields.length > 0 ? (
            props.customAnswerArray.fields.map((entry, index) => {
              function buildAnswerFieldId(field: string) {
                return `answer-record-${entry.id}-${field}`
              }

              return (
              <ProfileRecordCard
                id={`answer-record-${entry.id}`}
                key={entry.fieldKey}
                defaultOpen={index === 0}
                summary={watch(`answerBank.customAnswers.${index}.label`) || watch(`answerBank.customAnswers.${index}.question`) || ''}
                title={watch(`answerBank.customAnswers.${index}.label`)?.trim() || `Custom answer ${index + 1}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Answer details</p>
                  <Button disabled={props.busy} onClick={() => props.customAnswerArray.remove(index)} size="compact" type="button" variant="ghost">Remove</Button>
                </div>
                <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                  <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={buildAnswerFieldId('label')}>Label</FieldLabel><ProfileInput id={buildAnswerFieldId('label')} {...register(`answerBank.customAnswers.${index}.label`)} /></div>
                  <Controller
                    control={profileControl}
                    name={`answerBank.customAnswers.${index}.kind`}
                    render={({ field }) => (
                      <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
                        <FieldLabel htmlFor={buildAnswerFieldId('kind')}>Kind</FieldLabel>
                        <FormSelect
                          onValueChange={field.onChange}
                          options={candidateAnswerKindValues.map((kind) => ({ label: formatStatusLabel(kind), value: kind }))}
                          placeholder="Select kind"
                          triggerClassName={profileSelectTriggerClassName}
                          triggerId={buildAnswerFieldId('kind')}
                          value={field.value}
                        />
                      </div>
                    )}
                  />
                  <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2"><FieldLabel htmlFor={buildAnswerFieldId('question')}>Question</FieldLabel><ProfileTextarea id={buildAnswerFieldId('question')} className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`answerBank.customAnswers.${index}.question`)} /></div>
                  <div className="grid min-w-0 content-start gap-(--gap-field) h-full md:col-span-2"><FieldLabel htmlFor={buildAnswerFieldId('answer')}>Answer</FieldLabel><ProfileTextarea id={buildAnswerFieldId('answer')} className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`answerBank.customAnswers.${index}.answer`)} /></div>
                  <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={buildAnswerFieldId('role-families')}>Relevant role families</FieldLabel><ProfileTextarea id={buildAnswerFieldId('role-families')} className="min-h-(--textarea-compact) max-h-(--textarea-compact)" placeholder="Comma-separated role families, e.g. frontend, fullstack" rows={4} {...register(`answerBank.customAnswers.${index}.roleFamilies`)} /></div>
                  <div className="grid min-w-0 content-start gap-(--gap-field) h-full"><FieldLabel htmlFor={buildAnswerFieldId('proof-entry-ids')}>Supporting proof IDs</FieldLabel><ProfileTextarea id={buildAnswerFieldId('proof-entry-ids')} className="min-h-(--textarea-compact) max-h-(--textarea-compact)" placeholder="Copy proof bank entry IDs from the Background tab, one per line" rows={4} {...register(`answerBank.customAnswers.${index}.proofEntryIds`)} /></div>
                </div>
              </ProfileRecordCard>
              )
            })
          ) : (
            <EmptyState
              description="No reusable custom answers yet. Add one when you notice the same screener wording repeating across applications."
              title="No custom answers saved"
            />
          )}
        </div>
      </ProfileOptionalSection>
    </section>
  )
}
