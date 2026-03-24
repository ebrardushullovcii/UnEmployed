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

interface ProfileBackgroundTabProps {
  backgroundArrays: {
    certificationArray: UseFieldArrayReturn<ProfileEditorValues, 'records.certifications', 'id'>
    educationArray: UseFieldArrayReturn<ProfileEditorValues, 'records.education', 'id'>
    languageArray: UseFieldArrayReturn<ProfileEditorValues, 'languages', 'id'>
    linkArray: UseFieldArrayReturn<ProfileEditorValues, 'links', 'id'>
    projectArray: UseFieldArrayReturn<ProfileEditorValues, 'projects', 'id'>
  }
  busy: boolean
  profileForm: UseFormReturn<ProfileEditorValues>
}

export function ProfileBackgroundTab({ backgroundArrays, busy, profileForm }: ProfileBackgroundTabProps) {
  const { certificationArray, educationArray, languageArray, linkArray, projectArray } = backgroundArrays
  const { control, register } = profileForm

  return (
    <div className="grid gap-6">
      <section className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6 grid content-start gap-[var(--gap-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Education and credentials</p>
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">
              Schools, degrees, certifications, and qualification metadata stored as explicit records.
            </p>
          </div>
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
        </div>

        <div className="grid gap-4">
          {educationArray.fields.length > 0 ? (
            educationArray.fields.map((entry, index) => (
              <article
                key={entry.id}
                className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Education {index + 1}</p>
                  <Button disabled={busy} onClick={() => educationArray.remove(index)} size="compact" type="button" variant="ghost">
                    Remove
                  </Button>
                </div>
                <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
                  <Field><FieldLabel>School</FieldLabel><ProfileInput {...register(`records.education.${index}.schoolName`)} /></Field>
                  <Field><FieldLabel>Degree</FieldLabel><ProfileInput {...register(`records.education.${index}.degree`)} /></Field>
                  <Field><FieldLabel>Field of study</FieldLabel><ProfileInput {...register(`records.education.${index}.fieldOfStudy`)} /></Field>
                  <Field><FieldLabel>Location</FieldLabel><ProfileInput {...register(`records.education.${index}.location`)} /></Field>
                  <Field><FieldLabel>Start date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.education.${index}.startDate`)} /></Field>
                  <Field><FieldLabel>End date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.education.${index}.endDate`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Notes</FieldLabel><ProfileTextarea className="min-h-[var(--textarea-compact)] max-h-[var(--textarea-compact)]" rows={4} {...register(`records.education.${index}.summary`)} /></Field>
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              description="Add schools and credentials here instead of burying them in one freeform summary box."
              title="No education records yet"
            />
          )}

          {certificationArray.fields.map((entry, index) => (
            <article
              key={entry.id}
              className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Certification {index + 1}</p>
                <Button disabled={busy} onClick={() => certificationArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
              <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
                <Field><FieldLabel>Name</FieldLabel><ProfileInput {...register(`records.certifications.${index}.name`)} /></Field>
                <Field><FieldLabel>Issuer</FieldLabel><ProfileInput {...register(`records.certifications.${index}.issuer`)} /></Field>
                <Field><FieldLabel>Issue date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.certifications.${index}.issueDate`)} /></Field>
                <Field><FieldLabel>Expiry date</FieldLabel><ProfileInput placeholder="YYYY-MM" {...register(`records.certifications.${index}.expiryDate`)} /></Field>
                <Field className="md:col-span-2"><FieldLabel>Credential URL</FieldLabel><ProfileInput {...register(`records.certifications.${index}.credentialUrl`)} /></Field>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6 grid content-start gap-[var(--gap-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Projects, proof, and languages</p>
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">
              Portfolio projects, public links, and communication signals stored separately from the summary.
            </p>
          </div>
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
        </div>

        <div className="grid gap-4">
          {projectArray.fields.map((entry, index) => (
            <article
              key={entry.id}
              className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Project {index + 1}</p>
                <Button disabled={busy} onClick={() => projectArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
                <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
                  <Field><FieldLabel>Project name</FieldLabel><ProfileInput {...register(`projects.${index}.name`)} /></Field>
                  <Field><FieldLabel>Project type</FieldLabel><ProfileInput {...register(`projects.${index}.projectType`)} /></Field>
                  <Field><FieldLabel>Role</FieldLabel><ProfileInput {...register(`projects.${index}.role`)} /></Field>
                  <Field><FieldLabel>Project URL</FieldLabel><ProfileInput {...register(`projects.${index}.projectUrl`)} /></Field>
                  <Field><FieldLabel>Repository URL</FieldLabel><ProfileInput {...register(`projects.${index}.repositoryUrl`)} /></Field>
                  <Field><FieldLabel>Case-study URL</FieldLabel><ProfileInput {...register(`projects.${index}.caseStudyUrl`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Skills used</FieldLabel><ProfileTextarea className="min-h-[var(--textarea-compact)] max-h-[var(--textarea-compact)]" rows={4} {...register(`projects.${index}.skills`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Summary</FieldLabel><ProfileTextarea className="min-h-[var(--textarea-compact)] max-h-[var(--textarea-compact)]" rows={4} {...register(`projects.${index}.summary`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Outcome / impact</FieldLabel><ProfileTextarea className="min-h-[var(--textarea-compact)] max-h-[var(--textarea-compact)]" rows={4} {...register(`projects.${index}.outcome`)} /></Field>
                </div>
            </article>
          ))}

          {linkArray.fields.map((entry, index) => (
            <article
              key={entry.id}
              className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Link {index + 1}</p>
                <Button disabled={busy} onClick={() => linkArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
              <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
                <Field><FieldLabel>Label</FieldLabel><ProfileInput {...register(`links.${index}.label`)} /></Field>
                <Controller
                  control={control}
                  name={`links.${index}.kind`}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>Kind</FieldLabel>
                      <FormSelect
                        onValueChange={field.onChange}
                        options={[
                          { label: 'Select kind', value: '' },
                          ...candidateLinkKindValues.map((kind) => ({
                            label: formatStatusLabel(kind),
                            value: kind
                          }))
                        ]}
                        placeholder="Select kind"
                        triggerClassName={profileSelectTriggerClassName}
                        value={field.value}
                      />
                    </Field>
                  )}
                />
                <Field className="md:col-span-2"><FieldLabel>URL</FieldLabel><ProfileInput {...register(`links.${index}.url`)} /></Field>
              </div>
            </article>
          ))}

          {languageArray.fields.map((entry, index) => (
            <article
              key={entry.id}
              className="grid gap-4 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Language {index + 1}</p>
                <Button disabled={busy} onClick={() => languageArray.remove(index)} size="compact" type="button" variant="ghost">
                  Remove
                </Button>
              </div>
              <div className="grid gap-[var(--gap-content)] md:grid-cols-2 md:items-start">
                <Field><FieldLabel>Language</FieldLabel><ProfileInput {...register(`languages.${index}.language`)} /></Field>
                <Field><FieldLabel>Proficiency</FieldLabel><ProfileInput {...register(`languages.${index}.proficiency`)} /></Field>
                <Controller
                  control={control}
                  name={`languages.${index}.interviewPreference`}
                  render={({ field }) => (
                    <CheckboxField checked={field.value} label="Preferred interview language" onCheckedChange={field.onChange} />
                  )}
                />
                <Field className="md:col-span-2"><FieldLabel>Notes</FieldLabel><ProfileTextarea className="min-h-[var(--textarea-compact)] max-h-[var(--textarea-compact)]" rows={4} {...register(`languages.${index}.notes`)} /></Field>
              </div>
            </article>
          ))}

          {projectArray.fields.length === 0 && linkArray.fields.length === 0 && languageArray.fields.length === 0 ? (
            <EmptyState
              description="Add projects, links, and spoken languages as first-class records instead of burying them in general notes."
              title="No supporting evidence yet"
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}
