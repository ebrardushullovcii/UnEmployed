import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { workModeValues } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { CheckboxField } from '../checkbox-field'
import { EmptyState } from '../empty-state'
import type { ProfileEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel, joinListInput, parseListInput } from '../../lib/job-finder-utils'
import { ProfileInput, ProfileTextarea } from './profile-form-primitives'
import type { ProfileFieldArrayKeyName } from './profile-field-array-types'
import { ProfileListEditor } from './profile-list-editor'
import { ProfileRecordCard } from './profile-record-card'
import { ProfileSectionHeader } from './profile-section-header'

interface ProfileExperienceTabProps {
  isProfileSetupPending?: boolean
  experienceArray: UseFieldArrayReturn<ProfileEditorValues, 'records.experiences', ProfileFieldArrayKeyName>
  focusRecordOpenSignal?: string | null
  focusRecordId?: string | null
  profileForm: UseFormReturn<ProfileEditorValues>
}

export function ProfileExperienceTab({ isProfileSetupPending = false, experienceArray, focusRecordId = null, focusRecordOpenSignal = null, profileForm }: ProfileExperienceTabProps) {
  const { control, register, setValue, watch } = profileForm

  function buildExperienceFieldId(recordId: string, field: string) {
    return `experience-record-${recordId}-${field}`
  }

  function buildWorkModeFieldId(recordId: string, workMode: string) {
    return `experience-record-${recordId}-work-mode-${workMode}`
  }

  function buildRoleSummary(index: number) {
    const title = watch(`records.experiences.${index}.title`)?.trim()
    const company = watch(`records.experiences.${index}.companyName`)?.trim()
    const location = watch(`records.experiences.${index}.location`)?.trim()
    const startDate = watch(`records.experiences.${index}.startDate`)?.trim()
    const endDate = watch(`records.experiences.${index}.endDate`)?.trim()
    const isCurrent = watch(`records.experiences.${index}.isCurrent`)
    const primaryLine = [title, company].filter(Boolean).join(' - ') || 'New role'
    const detailLine = [location, [startDate, isCurrent ? 'Present' : endDate].filter(Boolean).join(' to ')].filter(Boolean).join(' | ')

    return detailLine ? `${primaryLine}. ${detailLine}` : primaryLine
  }

  return (
    <section className="grid content-start gap-(--gap-card)">
      <ProfileSectionHeader
        eyebrow="Experience"
        title="Work history"
        description="Keep one role per card so you can review it quickly, then expand only the entries that need more detail."
        action={
          <Button
            disabled={isProfileSetupPending}
            onClick={() =>
              experienceArray.append({
                id: `experience_${crypto.randomUUID().slice(0, 8)}`,
                companyName: '',
                companyUrl: '',
                title: '',
                employmentType: '',
                location: '',
                workMode: [],
                startDate: '',
                endDate: '',
                isCurrent: false,
                summary: '',
                achievements: '',
                skills: '',
                domainTags: '',
                peopleManagementScope: '',
                ownershipScope: ''
              })
            }
            type="button"
            variant="secondary"
            className="h-11 px-4"
          >
            Add experience
          </Button>
        }
      />

      <div className="grid gap-4">
        {experienceArray.fields.length > 0 ? (
          experienceArray.fields.map((entry, index) => {
            const currentRole = watch(`records.experiences.${index}.isCurrent`)

            return (
              <ProfileRecordCard
                id={`experience-record-${entry.id}`}
                key={entry.fieldKey}
                defaultOpen={index === 0 || currentRole || entry.id === focusRecordId}
                forceOpenSignal={entry.id === focusRecordId ? focusRecordOpenSignal : null}
                summary={buildRoleSummary(index)}
                title={watch(`records.experiences.${index}.title`)?.trim() || watch(`records.experiences.${index}.companyName`)?.trim() || `Role ${index + 1}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Role details</p>
                  <Button disabled={isProfileSetupPending} onClick={() => experienceArray.remove(index)} size="compact" type="button" variant="ghost">
                    Remove
                  </Button>
                </div>

                <div className="grid gap-(--gap-content) md:grid-cols-2">
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'company-name')}>Company</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'company-name')} {...register(`records.experiences.${index}.companyName`)} /></Field>
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'company-url')}>Company URL (optional)</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'company-url')} {...register(`records.experiences.${index}.companyUrl`)} /></Field>
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'title')}>Title</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'title')} {...register(`records.experiences.${index}.title`)} /></Field>
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'employment-type')}>Employment type</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'employment-type')} {...register(`records.experiences.${index}.employmentType`)} /></Field>
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'location')}>Location</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'location')} {...register(`records.experiences.${index}.location`)} /></Field>
                  <div className="grid gap-(--gap-field)" id={buildExperienceFieldId(entry.id, 'work-mode')}>
                    <FieldLabel>Work mode</FieldLabel>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {workModeValues.map((workMode) => (
                        <Controller
                          key={workMode}
                          control={control}
                          name={`records.experiences.${index}.workMode`}
                          render={({ field }) => (
                            <CheckboxField
                              checked={field.value.includes(workMode)}
                              inputId={buildWorkModeFieldId(entry.id, workMode)}
                              label={formatStatusLabel(workMode)}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked
                                    ? [...field.value, workMode]
                                    : field.value.filter((value) => value !== workMode)
                                )
                              }
                            />
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <Controller
                    control={control}
                    name={`records.experiences.${index}.isCurrent`}
                    render={({ field }) => (
                      <CheckboxField checked={field.value} className="md:col-span-2" inputId={buildExperienceFieldId(entry.id, 'is-current')} label="Current role" onCheckedChange={field.onChange} />
                    )}
                  />
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'start-date')}>Start date</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'start-date')} placeholder="YYYY-MM" {...register(`records.experiences.${index}.startDate`)} /></Field>
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'end-date')}>End date</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'end-date')} disabled={currentRole} placeholder="YYYY-MM" {...register(`records.experiences.${index}.endDate`)} /></Field>
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'people-management-scope')}>Team scope (optional)</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'people-management-scope')} {...register(`records.experiences.${index}.peopleManagementScope`)} /></Field>
                  <Field><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'ownership-scope')}>Ownership or budget scope (optional)</FieldLabel><ProfileInput id={buildExperienceFieldId(entry.id, 'ownership-scope')} {...register(`records.experiences.${index}.ownershipScope`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'domain-tags')}>Industries or domains</FieldLabel><ProfileTextarea id={buildExperienceFieldId(entry.id, 'domain-tags')} className="min-h-(--textarea-tall) max-h-(--textarea-tall)" rows={4} {...register(`records.experiences.${index}.domainTags`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={buildExperienceFieldId(entry.id, 'summary')}>Role overview</FieldLabel><ProfileTextarea id={buildExperienceFieldId(entry.id, 'summary')} className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`records.experiences.${index}.summary`)} /></Field>
                  <ProfileListEditor
                    className="md:col-span-2"
                    displayMode="rows"
                    emptyMessage="No achievements added yet."
                    label="Achievements"
                    onChange={(values) => setValue(`records.experiences.${index}.achievements`, joinListInput(values))}
                    placeholder="Add one achievement"
                    values={parseListInput(watch(`records.experiences.${index}.achievements`))}
                  />
                  <ProfileListEditor
                    className="md:col-span-2"
                    emptyMessage="No skills added yet."
                    label="Skills used"
                    onChange={(values) => setValue(`records.experiences.${index}.skills`, joinListInput(values))}
                    placeholder="Add one skill"
                    values={parseListInput(watch(`records.experiences.${index}.skills`))}
                  />
                </div>
              </ProfileRecordCard>
            )
          })
        ) : (
          <EmptyState
            description="Add each role separately so resumes and applications stay accurate."
            title="No structured experience yet"
          />
        )}
      </div>
    </section>
  )
}
