import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { candidateLinkKindValues } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { CheckboxField } from '../checkbox-field'
import { EmptyState } from '../empty-state'
import { FormSelect } from '../form-select'
import type { ProfileEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel } from '../../lib/job-finder-utils'
import { ProfileInput, ProfileTextarea, profileSelectTriggerClassName } from './profile-form-primitives'
import { ProfileRecordCard } from './profile-record-card'
import { ProfileSectionHeader } from './profile-section-header'

interface ProfileBackgroundTabProps {
  backgroundArrays: {
    customAnswerArray: UseFieldArrayReturn<ProfileEditorValues, 'answerBank.customAnswers', 'id'>
    certificationArray: UseFieldArrayReturn<ProfileEditorValues, 'records.certifications', 'id'>
    educationArray: UseFieldArrayReturn<ProfileEditorValues, 'records.education', 'id'>
    languageArray: UseFieldArrayReturn<ProfileEditorValues, 'languages', 'id'>
    linkArray: UseFieldArrayReturn<ProfileEditorValues, 'links', 'id'>
    proofBankArray: UseFieldArrayReturn<ProfileEditorValues, 'proofBank', 'id'>
    projectArray: UseFieldArrayReturn<ProfileEditorValues, 'projects', 'id'>
  }
  busy: boolean
  profileForm: UseFormReturn<ProfileEditorValues>
}

export function ProfileBackgroundTab({ backgroundArrays, busy, profileForm }: ProfileBackgroundTabProps) {
  const { certificationArray, educationArray, languageArray, linkArray, proofBankArray, projectArray } = backgroundArrays
  const { control, register, watch } = profileForm

  function joinParts(parts: Array<string | null | undefined>) {
    return parts.map((part) => part?.trim()).filter(Boolean).join(' | ')
  }

  return (
    <div className="grid gap-6">
      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Background"
          title="Education and credentials"
          description="Keep schools and certifications in their own cards so this section stays readable even when it grows."
          action={
            <div className="flex flex-wrap items-stretch gap-2.5">
              <Button
                disabled={busy}
                onClick={() =>
                  educationArray.append({
                    id: `education_${crypto.randomUUID().slice(0, 8)}`,
                    schoolName: '',
                    degree: '',
                    fieldOfStudy: '',
                    location: '',
                    startDate: '',
                    endDate: '',
                    summary: ''
                  })
                }
                type="button"
                variant="secondary"
                className="h-11 px-4"
              >
                Add education
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  certificationArray.append({
                    id: `certification_${crypto.randomUUID().slice(0, 8)}`,
                    name: '',
                    issuer: '',
                    issueDate: '',
                    expiryDate: '',
                    credentialUrl: ''
                  })
                }
                type="button"
                variant="secondary"
                className="h-11 px-4"
              >
                Add certification
              </Button>
            </div>
          }
        />

        <div className="grid gap-4">
          {educationArray.fields.length > 0 ? (
            educationArray.fields.map((entry, index) => (
              <ProfileRecordCard
                key={entry.id}
                defaultOpen={index === 0}
                summary={joinParts([
                  watch(`records.education.${index}.degree`),
                  watch(`records.education.${index}.schoolName`),
                  joinParts([
                    watch(`records.education.${index}.startDate`),
                    watch(`records.education.${index}.endDate`)
                  ])
                ])}
                title={watch(`records.education.${index}.degree`)?.trim() || watch(`records.education.${index}.schoolName`)?.trim() || `Education ${index + 1}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Education details</p>
                  <Button disabled={busy} onClick={() => educationArray.remove(index)} size="compact" type="button" variant="ghost">
                    Remove
                  </Button>
                </div>
                <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                  <Field><FieldLabel>School</FieldLabel><ProfileInput {...register(`records.education.${index}.schoolName`)} /></Field>
                  <Field><FieldLabel>Degree</FieldLabel><ProfileInput {...register(`records.education.${index}.degree`)} /></Field>
                  <Field><FieldLabel>Field of study</FieldLabel><ProfileInput {...register(`records.education.${index}.fieldOfStudy`)} /></Field>
                  <Field><FieldLabel>Location</FieldLabel><ProfileInput {...register(`records.education.${index}.location`)} /></Field>
                  <Field><FieldLabel>Start date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.education.${index}.startDate`)} /></Field>
                  <Field><FieldLabel>End date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.education.${index}.endDate`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Highlights</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`records.education.${index}.summary`)} /></Field>
                </div>
              </ProfileRecordCard>
            ))
          ) : (
            <EmptyState
              description="Add schools and qualifications here so they are easy to review later."
              title="No education records yet"
            />
          )}

          {certificationArray.fields.map((entry, index) => (
            <ProfileRecordCard
              key={entry.id}
              defaultOpen={index === 0 && educationArray.fields.length === 0}
              summary={joinParts([
                watch(`records.certifications.${index}.name`),
                watch(`records.certifications.${index}.issuer`)
              ])}
              title={watch(`records.certifications.${index}.name`)?.trim() || `Certification ${index + 1}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Certification details</p>
                <Button disabled={busy} onClick={() => certificationArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
              <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                <Field><FieldLabel>Name</FieldLabel><ProfileInput {...register(`records.certifications.${index}.name`)} /></Field>
                <Field><FieldLabel>Issuer</FieldLabel><ProfileInput {...register(`records.certifications.${index}.issuer`)} /></Field>
                <Field><FieldLabel>Issue date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.certifications.${index}.issueDate`)} /></Field>
                <Field><FieldLabel>Expiry date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.certifications.${index}.expiryDate`)} /></Field>
                <Field className="md:col-span-2"><FieldLabel>Credential URL</FieldLabel><ProfileInput {...register(`records.certifications.${index}.credentialUrl`)} /></Field>
              </div>
            </ProfileRecordCard>
          ))}
        </div>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Supporting detail"
          title="Projects, links, and languages"
          description="Use these records to add proof, public links, and language details without turning the page into one long form."
          action={
            <div className="flex flex-wrap items-stretch gap-2.5">
              <Button
                disabled={busy}
                onClick={() =>
                  projectArray.append({
                    id: `project_${crypto.randomUUID().slice(0, 8)}`,
                    name: '',
                    projectType: '',
                    summary: '',
                    role: '',
                    skills: '',
                    outcome: '',
                    projectUrl: '',
                    repositoryUrl: '',
                    caseStudyUrl: ''
                  })
                }
                type="button"
                variant="secondary"
                className="h-11 px-4"
              >
                Add project
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  linkArray.append({
                    id: `link_${crypto.randomUUID().slice(0, 8)}`,
                    label: '',
                    url: '',
                    kind: ''
                  })
                }
                type="button"
                variant="secondary"
                className="h-11 px-4"
              >
                Add link
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  languageArray.append({
                    id: `language_${crypto.randomUUID().slice(0, 8)}`,
                    language: '',
                    proficiency: '',
                    interviewPreference: false,
                    notes: ''
                  })
                }
                type="button"
                variant="secondary"
                className="h-11 px-4"
              >
                Add language
              </Button>
            </div>
          }
        />

        <div className="grid gap-4">
          {projectArray.fields.map((entry, index) => (
            <ProfileRecordCard
              key={entry.id}
              defaultOpen={index === 0}
              summary={joinParts([
                watch(`projects.${index}.name`),
                watch(`projects.${index}.role`),
                watch(`projects.${index}.projectType`)
              ])}
              title={watch(`projects.${index}.name`)?.trim() || `Project ${index + 1}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Project details</p>
                <Button disabled={busy} onClick={() => projectArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
                <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                  <Field><FieldLabel>Project name</FieldLabel><ProfileInput {...register(`projects.${index}.name`)} /></Field>
                  <Field><FieldLabel>Project type</FieldLabel><ProfileInput {...register(`projects.${index}.projectType`)} /></Field>
                  <Field><FieldLabel>Role</FieldLabel><ProfileInput {...register(`projects.${index}.role`)} /></Field>
                  <Field><FieldLabel>Project URL</FieldLabel><ProfileInput {...register(`projects.${index}.projectUrl`)} /></Field>
                  <Field><FieldLabel>Repository URL (optional)</FieldLabel><ProfileInput {...register(`projects.${index}.repositoryUrl`)} /></Field>
                  <Field><FieldLabel>Case study URL (optional)</FieldLabel><ProfileInput {...register(`projects.${index}.caseStudyUrl`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Skills used</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`projects.${index}.skills`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Summary</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`projects.${index}.summary`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Impact</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`projects.${index}.outcome`)} /></Field>
                </div>
            </ProfileRecordCard>
          ))}

          {linkArray.fields.map((entry, index) => (
            <ProfileRecordCard
              key={entry.id}
              defaultOpen={index === 0 && projectArray.fields.length === 0}
              summary={joinParts([
                watch(`links.${index}.label`),
                watch(`links.${index}.kind`) ? formatStatusLabel(watch(`links.${index}.kind`)) : null
              ])}
              title={watch(`links.${index}.label`)?.trim() || `Link ${index + 1}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Link details</p>
                <Button disabled={busy} onClick={() => linkArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
              <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                <Field><FieldLabel>Label</FieldLabel><ProfileInput {...register(`links.${index}.label`)} /></Field>
                <Controller
                  control={control}
                  name={`links.${index}.kind`}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>Type</FieldLabel>
                      <FormSelect
                        onValueChange={field.onChange}
                        options={[
                          { label: 'Select type', value: '' },
                          ...candidateLinkKindValues.map((kind) => ({
                            label: formatStatusLabel(kind),
                            value: kind
                          }))
                        ]}
                        placeholder="Select type"
                        triggerClassName={profileSelectTriggerClassName}
                        value={field.value}
                      />
                    </Field>
                  )}
                />
                <Field className="md:col-span-2"><FieldLabel>URL</FieldLabel><ProfileInput {...register(`links.${index}.url`)} /></Field>
              </div>
            </ProfileRecordCard>
          ))}

          {languageArray.fields.map((entry, index) => (
            <ProfileRecordCard
              key={entry.id}
              defaultOpen={index === 0 && projectArray.fields.length === 0 && linkArray.fields.length === 0}
              summary={joinParts([
                watch(`languages.${index}.language`),
                watch(`languages.${index}.proficiency`)
              ])}
              title={watch(`languages.${index}.language`)?.trim() || `Language ${index + 1}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Language details</p>
                <Button disabled={busy} onClick={() => languageArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
              <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                <Field><FieldLabel>Language</FieldLabel><ProfileInput {...register(`languages.${index}.language`)} /></Field>
                <Field><FieldLabel>Proficiency</FieldLabel><ProfileInput {...register(`languages.${index}.proficiency`)} /></Field>
                <Controller
                  control={control}
                  name={`languages.${index}.interviewPreference`}
                  render={({ field }) => (
                    <CheckboxField checked={field.value} label="Can interview in this language" onCheckedChange={field.onChange} />
                  )}
                />
                <Field className="md:col-span-2"><FieldLabel>Context (optional)</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`languages.${index}.notes`)} /></Field>
              </div>
            </ProfileRecordCard>
          ))}

          {projectArray.fields.length === 0 && linkArray.fields.length === 0 && languageArray.fields.length === 0 ? (
            <EmptyState
              description="Add projects, links, and languages here when they help support applications."
              title="Nothing added here yet"
            />
          ) : null}
        </div>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Proof bank"
          title="Reusable proof and case studies"
          description="Capture the strongest claims, metrics, and supporting links once so resumes and future applications can reuse them safely."
          action={(
            <Button
              disabled={busy}
              onClick={() =>
                proofBankArray.append({
                  id: `proof_${crypto.randomUUID().slice(0, 8)}`,
                  title: '',
                  claim: '',
                  heroMetric: '',
                  supportingContext: '',
                  roleFamilies: '',
                  projectIds: '',
                  linkIds: ''
                })
              }
              type="button"
              variant="secondary"
              className="h-11 px-4"
            >
              Add proof
            </Button>
          )}
        />

        <div className="grid gap-4">
          {proofBankArray.fields.length > 0 ? (
            proofBankArray.fields.map((entry, index) => (
              <ProfileRecordCard
                key={entry.id}
                defaultOpen={index === 0}
                summary={joinParts([
                  watch(`proofBank.${index}.title`),
                  watch(`proofBank.${index}.heroMetric`)
                ])}
                title={watch(`proofBank.${index}.title`)?.trim() || `Proof ${index + 1}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Proof details</p>
                  <Button disabled={busy} onClick={() => proofBankArray.remove(index)} size="compact" type="button" variant="ghost">
                    Remove
                  </Button>
                </div>
                <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                  <Field><FieldLabel>Title</FieldLabel><ProfileInput placeholder="Example: Led cross-functional redesign" {...register(`proofBank.${index}.title`)} /></Field>
                  <Field><FieldLabel>Hero metric</FieldLabel><ProfileInput placeholder="Example: Increased activation by 18%" {...register(`proofBank.${index}.heroMetric`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Claim</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`proofBank.${index}.claim`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Supporting context</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`proofBank.${index}.supportingContext`)} /></Field>
                  <Field><FieldLabel>Relevant role families</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`proofBank.${index}.roleFamilies`)} /></Field>
                  <Field><FieldLabel>Related project IDs</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`proofBank.${index}.projectIds`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Related public link IDs</FieldLabel><ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register(`proofBank.${index}.linkIds`)} /></Field>
                </div>
              </ProfileRecordCard>
            ))
          ) : (
            <EmptyState
              description="Add reusable proof points here when you want resumes and apply help to reuse verified wins instead of rewording the same story each time."
              title="No proof saved yet"
            />
          )}
        </div>
      </section>
    </div>
  )
}
