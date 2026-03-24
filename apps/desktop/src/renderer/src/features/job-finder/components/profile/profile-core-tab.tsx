import type { Control, UseFormRegister, UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import { Field, FieldLabel } from '../../../../components/ui/field'
import { Input } from '../../../../components/ui/input'
import { Textarea } from '../../../../components/ui/textarea'
import { FormSelect } from '../form-select'
import type { BooleanSelectValue } from '../../lib/job-finder-types'
import type { ProfileEditorValues } from '../../lib/profile-editor'

const booleanSelectOptions = [
  { label: 'Not set', value: '' },
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' }
]

interface ProfileCoreTabProps {
  busy: boolean
  onSaveProfile: () => void
  profileForm: UseFormReturn<ProfileEditorValues>
  validationMessage: string | null
}

function BooleanSelectField(props: {
  control: Control<ProfileEditorValues>
  label: string
  name:
    | 'eligibility.remoteEligible'
    | 'eligibility.requiresVisaSponsorship'
    | 'eligibility.willingToRelocate'
    | 'eligibility.willingToTravel'
}) {
  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <Field>
          <FieldLabel>{props.label}</FieldLabel>
          <FormSelect
            onValueChange={(value) => field.onChange(value as BooleanSelectValue)}
            options={booleanSelectOptions}
            placeholder="Not set"
            value={field.value}
          />
        </Field>
      )}
    />
  )
}

function NumberField(props: {
  label: string
  min?: string
  name:
    | 'eligibility.noticePeriodDays'
    | 'identity.yearsExperience'
  register: UseFormRegister<ProfileEditorValues>
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Input min={props.min} step="1" type="number" {...props.register(props.name)} />
    </Field>
  )
}

export function ProfileCoreTab({ busy, onSaveProfile, profileForm, validationMessage }: ProfileCoreTabProps) {
  const { control, register } = profileForm

  return (
    <div className="grid gap-6">
      <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Identity and contact</p>
            <p className="text-[0.84rem] leading-6 text-foreground-muted">Explicit ATS-safe header fields, contact channels, location details, and public profile links.</p>
          </div>
          <Badge variant="section">Identity</Badge>
        </div>
        <div className="grid gap-[0.9rem] md:grid-cols-2">
          <Field><FieldLabel>First name</FieldLabel><Input {...register('identity.firstName')} /></Field>
          <Field><FieldLabel>Last name</FieldLabel><Input {...register('identity.lastName')} /></Field>
          <Field><FieldLabel>Middle name</FieldLabel><Input {...register('identity.middleName')} /></Field>
          <Field><FieldLabel>Preferred display name</FieldLabel><Input {...register('identity.preferredDisplayName')} /></Field>
          <Field><FieldLabel>Headline</FieldLabel><Input {...register('identity.headline')} /></Field>
          <NumberField label="Years of experience" min="0" name="identity.yearsExperience" register={register} />
          <Field><FieldLabel>Primary email</FieldLabel><Input {...register('identity.email')} /></Field>
          <Field><FieldLabel>Secondary email</FieldLabel><Input {...register('identity.secondaryEmail')} /></Field>
          <Field><FieldLabel>Phone</FieldLabel><Input {...register('identity.phone')} /></Field>
          <Field><FieldLabel>Timezone</FieldLabel><Input {...register('identity.timeZone')} /></Field>
          <Field><FieldLabel>City</FieldLabel><Input {...register('identity.currentCity')} /></Field>
          <Field><FieldLabel>Region / state</FieldLabel><Input {...register('identity.currentRegion')} /></Field>
          <Field><FieldLabel>Country</FieldLabel><Input {...register('identity.currentCountry')} /></Field>
          <Field><FieldLabel>Fallback location label</FieldLabel><Input {...register('identity.currentLocation')} /></Field>
          <Field><FieldLabel>LinkedIn URL</FieldLabel><Input {...register('identity.linkedinUrl')} /></Field>
          <Field><FieldLabel>Portfolio URL</FieldLabel><Input {...register('identity.portfolioUrl')} /></Field>
          <Field><FieldLabel>GitHub URL</FieldLabel><Input {...register('identity.githubUrl')} /></Field>
          <Field><FieldLabel>Personal website</FieldLabel><Input {...register('identity.personalWebsiteUrl')} /></Field>
          <Field className="md:col-span-2"><FieldLabel>Resume text for agents</FieldLabel><Textarea rows={8} {...register('identity.resumeText')} /></Field>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Work eligibility and logistics</p>
              <p className="text-[0.84rem] leading-6 text-foreground-muted">Structured screening answers for authorization, relocation, travel, and availability.</p>
            </div>
            <Badge variant="section">Eligibility</Badge>
          </div>
          <div className="grid gap-[0.9rem] md:grid-cols-2">
            <Field><FieldLabel>Authorized work countries</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('eligibility.authorizedWorkCountries')} /></Field>
            <Field><FieldLabel>Preferred relocation regions</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('eligibility.preferredRelocationRegions')} /></Field>
            <BooleanSelectField control={control} label="Requires visa sponsorship" name="eligibility.requiresVisaSponsorship" />
            <BooleanSelectField control={control} label="Willing to relocate" name="eligibility.willingToRelocate" />
            <BooleanSelectField control={control} label="Willing to travel" name="eligibility.willingToTravel" />
            <BooleanSelectField control={control} label="Remote eligible" name="eligibility.remoteEligible" />
            <NumberField label="Notice period (days)" min="0" name="eligibility.noticePeriodDays" register={register} />
            <Field><FieldLabel>Available start date</FieldLabel><Input placeholder="YYYY-MM-DD" {...register('eligibility.availableStartDate')} /></Field>
            <Field className="md:col-span-2"><FieldLabel>Security clearance</FieldLabel><Input {...register('eligibility.securityClearance')} /></Field>
          </div>
        </section>

        <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Professional summary layer</p>
              <p className="text-[0.84rem] leading-6 text-foreground-muted">Separate reusable narrative blocks from the raw factual record.</p>
            </div>
            <Badge variant="section">Narrative</Badge>
          </div>
          <div className="grid gap-[0.9rem]">
            <Field><FieldLabel>Short value proposition</FieldLabel><Textarea className="min-h-[4.6rem]" rows={3} {...register('summary.shortValueProposition')} /></Field>
            <Field><FieldLabel>Full summary</FieldLabel><Textarea rows={5} {...register('summary.fullSummary')} /></Field>
            <div className="grid gap-[0.9rem] md:grid-cols-2">
              <Field><FieldLabel>Career themes</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('summary.careerThemes')} /></Field>
              <Field><FieldLabel>Strengths / differentiators</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('summary.strengths')} /></Field>
              <Field><FieldLabel>Leadership summary</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('summary.leadershipSummary')} /></Field>
              <Field><FieldLabel>Domain focus</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('summary.domainFocusSummary')} /></Field>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Skills and evidence</p>
            <p className="text-[0.84rem] leading-6 text-foreground-muted">Maintain searchable skill groups and highlighted evidence alongside the general skills list.</p>
          </div>
          <Badge variant="section">Skills</Badge>
        </div>
        <div className="grid gap-[0.9rem] md:grid-cols-2">
          <Field><FieldLabel>General skills</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('profileSkills')} /></Field>
          <Field><FieldLabel>Highlighted skills for target roles</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('skillGroups.highlightedSkills')} /></Field>
          <Field><FieldLabel>Core skills</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('skillGroups.coreSkills')} /></Field>
          <Field><FieldLabel>Tools / platforms</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('skillGroups.tools')} /></Field>
          <Field><FieldLabel>Languages / frameworks</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('skillGroups.languagesAndFrameworks')} /></Field>
          <Field><FieldLabel>Soft skills</FieldLabel><Textarea className="min-h-[4.6rem]" rows={4} {...register('skillGroups.softSkills')} /></Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy} onClick={onSaveProfile} type="button">Save profile</Button>
        {validationMessage ? <p className="text-[0.84rem] leading-6 text-foreground-muted">{validationMessage}</p> : null}
      </div>
    </div>
  )
}
