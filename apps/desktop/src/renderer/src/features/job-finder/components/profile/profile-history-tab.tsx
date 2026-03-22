import { candidateLinkKindValues, type WorkMode, workModeValues } from '@unemployed/contracts'
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Button } from '../../../../components/ui/button'
import { Field, FieldLabel } from '../../../../components/ui/field'
import { Input } from '../../../../components/ui/input'
import { Textarea } from '../../../../components/ui/textarea'
import { CheckboxField } from '../checkbox-field'
import { EmptyState } from '../empty-state'
import { FormSelect } from '../form-select'
import type { ProfileEditorValues } from '../../lib/profile-editor'
import { formatStatusLabel } from '../../lib/job-finder-utils'

interface ProfileHistoryTabProps {
  busy: boolean
  certificationArray: UseFieldArrayReturn<ProfileEditorValues, 'records.certifications', 'id'>
  educationArray: UseFieldArrayReturn<ProfileEditorValues, 'records.education', 'id'>
  experienceArray: UseFieldArrayReturn<ProfileEditorValues, 'records.experiences', 'id'>
  languageArray: UseFieldArrayReturn<ProfileEditorValues, 'languages', 'id'>
  linkArray: UseFieldArrayReturn<ProfileEditorValues, 'links', 'id'>
  onSaveProfile: () => void
  profileForm: UseFormReturn<ProfileEditorValues>
  projectArray: UseFieldArrayReturn<ProfileEditorValues, 'projects', 'id'>
}

export function ProfileHistoryTab({
  busy,
  certificationArray,
  educationArray,
  experienceArray,
  languageArray,
  linkArray,
  onSaveProfile,
  profileForm,
  projectArray
}: ProfileHistoryTabProps) {
  const { control, register, watch } = profileForm

  return (
    <div className="grid gap-6">
      <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Experience timeline</p><p className="text-[0.84rem] leading-6 text-foreground-muted">Field-by-field reusable work history for ATS alignment, tailoring, and future form-fill.</p></div><Button variant="secondary" size="compact" disabled={busy} onClick={() => experienceArray.append({ id: `experience_${crypto.randomUUID().slice(0, 8)}`, companyName: '', companyUrl: '', title: '', employmentType: '', location: '', workMode: '', startDate: '', endDate: '', isCurrent: false, summary: '', achievements: '', skills: '', domainTags: '', peopleManagementScope: '', ownershipScope: '' })} type="button">Add experience</Button></div>
        <div className="grid gap-4">
          {experienceArray.fields.length > 0 ? experienceArray.fields.map((entry, index) => {
            const currentRole = watch(`records.experiences.${index}.isCurrent`)

            return (
              <article key={entry.id} className="grid gap-4 rounded-[0.55rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Role {index + 1}</p><Button variant="ghost" size="compact" disabled={busy} onClick={() => experienceArray.remove(index)} type="button">Remove</Button></div>
                <div className="grid gap-[0.9rem] md:grid-cols-2">
                  <Field><FieldLabel>Company</FieldLabel><Input {...register(`records.experiences.${index}.companyName`)} /></Field>
                  <Field><FieldLabel>Company URL</FieldLabel><Input {...register(`records.experiences.${index}.companyUrl`)} /></Field>
                  <Field><FieldLabel>Title</FieldLabel><Input {...register(`records.experiences.${index}.title`)} /></Field>
                  <Field><FieldLabel>Employment type</FieldLabel><Input {...register(`records.experiences.${index}.employmentType`)} /></Field>
                  <Field><FieldLabel>Location</FieldLabel><Input {...register(`records.experiences.${index}.location`)} /></Field>
                  <Controller control={control} name={`records.experiences.${index}.workMode`} render={({ field }) => (<Field><FieldLabel>Work mode</FieldLabel><FormSelect onValueChange={(value) => field.onChange(value as WorkMode | '')} options={[{ label: 'Select mode', value: '' }, ...workModeValues.map((workMode) => ({ label: formatStatusLabel(workMode), value: workMode }))]} placeholder="Select mode" value={field.value} /></Field>)} />
                  <Field><FieldLabel>Start date</FieldLabel><Input placeholder="YYYY-MM" {...register(`records.experiences.${index}.startDate`)} /></Field>
                  <Field><FieldLabel>End date</FieldLabel><Input disabled={currentRole} placeholder="YYYY-MM" {...register(`records.experiences.${index}.endDate`)} /></Field>
                  <Field><FieldLabel>Domain / industry tags</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register(`records.experiences.${index}.domainTags`)} /></Field>
                  <Field><FieldLabel>People-management scope</FieldLabel><Input {...register(`records.experiences.${index}.peopleManagementScope`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Ownership / budget scope</FieldLabel><Input {...register(`records.experiences.${index}.ownershipScope`)} /></Field>
                  <Controller control={control} name={`records.experiences.${index}.isCurrent`} render={({ field }) => (<CheckboxField checked={field.value} className="md:col-span-2" label="Current role" onCheckedChange={field.onChange} />)} />
                  <Field className="md:col-span-2"><FieldLabel>Role summary</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register(`records.experiences.${index}.summary`)} /></Field>
                  <Field><FieldLabel>Achievements</FieldLabel><Textarea rows={4} {...register(`records.experiences.${index}.achievements`)} /></Field>
                  <Field><FieldLabel>Skills used</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register(`records.experiences.${index}.skills`)} /></Field>
                </div>
              </article>
            )
          }) : <EmptyState title="No structured experience yet" description="Add each role with dedicated fields so tailoring and future form-fill flows do not depend on one large text box." />}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Education and credentials</p><p className="text-[0.84rem] leading-6 text-foreground-muted">Schools, degrees, certifications, and qualification metadata stored as explicit records.</p></div><div className="flex flex-wrap items-stretch gap-2.5"><Button variant="secondary" size="compact" disabled={busy} onClick={() => educationArray.append({ id: `education_${crypto.randomUUID().slice(0, 8)}`, schoolName: '', degree: '', fieldOfStudy: '', location: '', startDate: '', endDate: '', summary: '' })} type="button">Add education</Button><Button variant="secondary" size="compact" disabled={busy} onClick={() => certificationArray.append({ id: `certification_${crypto.randomUUID().slice(0, 8)}`, name: '', issuer: '', issueDate: '', expiryDate: '', credentialUrl: '' })} type="button">Add certification</Button></div></div>
          <div className="grid gap-4">
            {educationArray.fields.length > 0 ? educationArray.fields.map((entry, index) => (
              <article key={entry.id} className="grid gap-4 rounded-[0.55rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Education {index + 1}</p><Button variant="ghost" size="compact" disabled={busy} onClick={() => educationArray.remove(index)} type="button">Remove</Button></div>
                <div className="grid gap-[0.9rem] md:grid-cols-2">
                  <Field><FieldLabel>School</FieldLabel><Input {...register(`records.education.${index}.schoolName`)} /></Field>
                  <Field><FieldLabel>Degree</FieldLabel><Input {...register(`records.education.${index}.degree`)} /></Field>
                  <Field><FieldLabel>Field of study</FieldLabel><Input {...register(`records.education.${index}.fieldOfStudy`)} /></Field>
                  <Field><FieldLabel>Location</FieldLabel><Input {...register(`records.education.${index}.location`)} /></Field>
                  <Field><FieldLabel>Start date</FieldLabel><Input placeholder="YYYY-MM" {...register(`records.education.${index}.startDate`)} /></Field>
                  <Field><FieldLabel>End date</FieldLabel><Input placeholder="YYYY-MM" {...register(`records.education.${index}.endDate`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Notes</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register(`records.education.${index}.summary`)} /></Field>
                </div>
              </article>
            )) : <EmptyState title="No education records yet" description="Add schools and credentials here instead of burying them in one freeform summary box." />}

            {certificationArray.fields.map((entry, index) => (
              <article key={entry.id} className="grid gap-4 rounded-[0.55rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Certification {index + 1}</p><Button variant="ghost" size="compact" disabled={busy} onClick={() => certificationArray.remove(index)} type="button">Remove</Button></div>
                <div className="grid gap-[0.9rem] md:grid-cols-2">
                  <Field><FieldLabel>Name</FieldLabel><Input {...register(`records.certifications.${index}.name`)} /></Field>
                  <Field><FieldLabel>Issuer</FieldLabel><Input {...register(`records.certifications.${index}.issuer`)} /></Field>
                  <Field><FieldLabel>Issue date</FieldLabel><Input placeholder="YYYY-MM" {...register(`records.certifications.${index}.issueDate`)} /></Field>
                  <Field><FieldLabel>Expiry date</FieldLabel><Input placeholder="YYYY-MM" {...register(`records.certifications.${index}.expiryDate`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Credential URL</FieldLabel><Input {...register(`records.certifications.${index}.credentialUrl`)} /></Field>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Projects, proof, and languages</p><p className="text-[0.84rem] leading-6 text-foreground-muted">Portfolio projects, public links, and communication signals stored separately from the summary.</p></div><div className="flex flex-wrap items-stretch gap-2.5"><Button variant="secondary" size="compact" disabled={busy} onClick={() => projectArray.append({ id: `project_${crypto.randomUUID().slice(0, 8)}`, name: '', projectType: '', summary: '', role: '', skills: '', outcome: '', projectUrl: '', repositoryUrl: '', caseStudyUrl: '' })} type="button">Add project</Button><Button variant="secondary" size="compact" disabled={busy} onClick={() => linkArray.append({ id: `link_${crypto.randomUUID().slice(0, 8)}`, label: '', url: '', kind: '' })} type="button">Add link</Button><Button variant="secondary" size="compact" disabled={busy} onClick={() => languageArray.append({ id: `language_${crypto.randomUUID().slice(0, 8)}`, language: '', proficiency: '', interviewPreference: false, notes: '' })} type="button">Add language</Button></div></div>
          <div className="grid gap-4">
            {projectArray.fields.map((entry, index) => (
              <article key={entry.id} className="grid gap-4 rounded-[0.55rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Project {index + 1}</p><Button variant="ghost" size="compact" disabled={busy} onClick={() => projectArray.remove(index)} type="button">Remove</Button></div>
                <div className="grid gap-[0.9rem] md:grid-cols-2">
                  <Field><FieldLabel>Project name</FieldLabel><Input {...register(`projects.${index}.name`)} /></Field>
                  <Field><FieldLabel>Project type</FieldLabel><Input {...register(`projects.${index}.projectType`)} /></Field>
                  <Field><FieldLabel>Role</FieldLabel><Input {...register(`projects.${index}.role`)} /></Field>
                  <Field><FieldLabel>Skills used</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register(`projects.${index}.skills`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Summary</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register(`projects.${index}.summary`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Outcome / impact</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register(`projects.${index}.outcome`)} /></Field>
                  <Field><FieldLabel>Project URL</FieldLabel><Input {...register(`projects.${index}.projectUrl`)} /></Field>
                  <Field><FieldLabel>Repository URL</FieldLabel><Input {...register(`projects.${index}.repositoryUrl`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Case-study URL</FieldLabel><Input {...register(`projects.${index}.caseStudyUrl`)} /></Field>
                </div>
              </article>
            ))}

            {linkArray.fields.map((entry, index) => (
              <article key={entry.id} className="grid gap-4 rounded-[0.55rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Link {index + 1}</p><Button variant="ghost" size="compact" disabled={busy} onClick={() => linkArray.remove(index)} type="button">Remove</Button></div>
                <div className="grid gap-[0.9rem] md:grid-cols-2">
                  <Field><FieldLabel>Label</FieldLabel><Input {...register(`links.${index}.label`)} /></Field>
                  <Controller control={control} name={`links.${index}.kind`} render={({ field }) => (<Field><FieldLabel>Kind</FieldLabel><FormSelect onValueChange={field.onChange} options={[{ label: 'Select kind', value: '' }, ...candidateLinkKindValues.map((kind) => ({ label: formatStatusLabel(kind), value: kind }))]} placeholder="Select kind" value={field.value} /></Field>)} />
                  <Field className="md:col-span-2"><FieldLabel>URL</FieldLabel><Input {...register(`links.${index}.url`)} /></Field>
                </div>
              </article>
            ))}

            {languageArray.fields.map((entry, index) => (
              <article key={entry.id} className="grid gap-4 rounded-[0.55rem] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Language {index + 1}</p><Button variant="ghost" size="compact" disabled={busy} onClick={() => languageArray.remove(index)} type="button">Remove</Button></div>
                <div className="grid gap-[0.9rem] md:grid-cols-2">
                  <Field><FieldLabel>Language</FieldLabel><Input {...register(`languages.${index}.language`)} /></Field>
                  <Field><FieldLabel>Proficiency</FieldLabel><Input {...register(`languages.${index}.proficiency`)} /></Field>
                  <Controller control={control} name={`languages.${index}.interviewPreference`} render={({ field }) => (<CheckboxField checked={field.value} label="Preferred interview language" onCheckedChange={field.onChange} />)} />
                  <Field className="md:col-span-2"><FieldLabel>Notes</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register(`languages.${index}.notes`)} /></Field>
                </div>
              </article>
            ))}

            {projectArray.fields.length === 0 && linkArray.fields.length === 0 && languageArray.fields.length === 0 ? <EmptyState title="No supporting evidence yet" description="Add projects, links, and spoken languages as first-class records instead of burying them in general notes." /> : null}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy} onClick={onSaveProfile} type="button">Save profile</Button>
      </div>
    </div>
  )
}
