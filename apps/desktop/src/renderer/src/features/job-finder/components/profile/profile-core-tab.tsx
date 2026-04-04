import type { UseFormReturn } from 'react-hook-form'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import type { ProfileEditorValues } from '../../lib/profile-editor'
import { joinListInput, parseListInput } from '../../lib/job-finder-utils'
import { ProfileInput, ProfileTextarea } from './profile-form-primitives'
import { ProfileListEditor } from './profile-list-editor'
import { ProfileSectionHeader } from './profile-section-header'

interface ProfileCoreTabProps {
  profileForm: UseFormReturn<ProfileEditorValues>
}

export function ProfileCoreTab({ profileForm }: ProfileCoreTabProps) {
  const { register, setValue, watch } = profileForm
  const listFieldOptions = { shouldDirty: true, shouldTouch: true, shouldValidate: true } as const

  return (
    <div className="grid gap-6">
      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Basics"
          title="Personal details"
          description="Start with the basics people expect to see first: name, contact info, location, and public links."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Name and headline</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>First name</FieldLabel><ProfileInput {...register('identity.firstName')} /></Field>
            <Field><FieldLabel>Last name</FieldLabel><ProfileInput {...register('identity.lastName')} /></Field>
            <Field><FieldLabel>Middle name</FieldLabel><ProfileInput {...register('identity.middleName')} /></Field>
            <Field><FieldLabel>Preferred display name</FieldLabel><ProfileInput {...register('identity.preferredDisplayName')} /></Field>
            <Field><FieldLabel>Headline</FieldLabel><ProfileInput {...register('identity.headline')} /></Field>
            <Field><FieldLabel>Years of experience</FieldLabel><ProfileInput min="0" step="1" type="number" {...register('identity.yearsExperience')} /></Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Contact</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>Primary email</FieldLabel><ProfileInput {...register('identity.email')} /></Field>
            <Field><FieldLabel>Secondary email</FieldLabel><ProfileInput {...register('identity.secondaryEmail')} /></Field>
            <Field><FieldLabel>Phone</FieldLabel><ProfileInput {...register('identity.phone')} /></Field>
            <Field><FieldLabel>Timezone</FieldLabel><ProfileInput {...register('identity.timeZone')} /></Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Location</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>City</FieldLabel><ProfileInput {...register('identity.currentCity')} /></Field>
            <Field><FieldLabel>Region / state</FieldLabel><ProfileInput {...register('identity.currentRegion')} /></Field>
            <Field><FieldLabel>Country</FieldLabel><ProfileInput {...register('identity.currentCountry')} /></Field>
            <Field><FieldLabel>Location display</FieldLabel><ProfileInput {...register('identity.currentLocation')} /></Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Public links</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>LinkedIn URL</FieldLabel><ProfileInput {...register('identity.linkedinUrl')} /></Field>
            <Field><FieldLabel>Portfolio URL</FieldLabel><ProfileInput {...register('identity.portfolioUrl')} /></Field>
            <Field><FieldLabel>GitHub URL</FieldLabel><ProfileInput {...register('identity.githubUrl')} /></Field>
            <Field><FieldLabel>Personal website</FieldLabel><ProfileInput {...register('identity.personalWebsiteUrl')} /></Field>
          </div>
        </article>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Narrative"
          title="Summary"
          description="This is the part you would usually rewrite the most. Keep the short positioning clear, then expand into the fuller story."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Positioning</p>
          <div className="grid gap-(--gap-content)">
            <Field>
              <FieldLabel>Short value proposition</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={3} {...register('summary.shortValueProposition')} />
            </Field>
            <Field>
              <FieldLabel>Full summary</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-default) max-h-(--textarea-default)" rows={5} {...register('summary.fullSummary')} />
            </Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Supporting angles</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel>Career themes</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" rows={4} {...register('summary.careerThemes')} />
            </Field>
            <Field>
              <FieldLabel>Strengths / differentiators</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" rows={4} {...register('summary.strengths')} />
            </Field>
            <Field>
              <FieldLabel>Leadership summary</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register('summary.leadershipSummary')} />
            </Field>
            <Field>
              <FieldLabel>Domain focus</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register('summary.domainFocusSummary')} />
            </Field>
          </div>
        </article>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Skills"
          title="Skills"
          description="Keep your core skills tidy here so tailored resumes and future form fill stay grounded in the same set of facts."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Role-facing skills</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <ProfileListEditor
              label="General skills"
              onChange={(values) => setValue('profileSkills', joinListInput(values), listFieldOptions)}
              placeholder="Add a skill"
              values={parseListInput(watch('profileSkills'))}
            />
            <ProfileListEditor
              label="Highlighted skills for target roles"
              onChange={(values) => setValue('skillGroups.highlightedSkills', joinListInput(values), listFieldOptions)}
              placeholder="Add a highlighted skill"
              values={parseListInput(watch('skillGroups.highlightedSkills'))}
            />
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Grouped skills</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <ProfileListEditor
              label="Core skills"
              onChange={(values) => setValue('skillGroups.coreSkills', joinListInput(values), listFieldOptions)}
              placeholder="Add a core skill"
              values={parseListInput(watch('skillGroups.coreSkills'))}
            />
            <ProfileListEditor
              label="Tools / platforms"
              onChange={(values) => setValue('skillGroups.tools', joinListInput(values), listFieldOptions)}
              placeholder="Add a tool"
              values={parseListInput(watch('skillGroups.tools'))}
            />
            <ProfileListEditor
              label="Languages / frameworks"
              onChange={(values) => setValue('skillGroups.languagesAndFrameworks', joinListInput(values), listFieldOptions)}
              placeholder="Add a language or framework"
              values={parseListInput(watch('skillGroups.languagesAndFrameworks'))}
            />
            <ProfileListEditor
              label="Soft skills"
              onChange={(values) => setValue('skillGroups.softSkills', joinListInput(values), listFieldOptions)}
              placeholder="Add a soft skill"
              values={parseListInput(watch('skillGroups.softSkills'))}
            />
          </div>
        </article>
      </section>
    </div>
  )
}
