import type { UseFormReturn } from 'react-hook-form'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import type { ProfileEditorValues } from '../../lib/profile-editor'
import { joinListInput, parseListInput } from '../../lib/job-finder-utils'
import { ProfileOptionalSection } from './profile-optional-section'
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
          description="Start with the basics employers expect first: name, contact info, location, and key links."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Name and headline</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>First name</FieldLabel><ProfileInput {...register('identity.firstName')} /></Field>
            <Field><FieldLabel>Last name</FieldLabel><ProfileInput {...register('identity.lastName')} /></Field>
            <Field><FieldLabel>Preferred name</FieldLabel><ProfileInput placeholder="Use this if it differs from your first name" {...register('identity.preferredDisplayName')} /></Field>
            <Field><FieldLabel>Headline</FieldLabel><ProfileInput {...register('identity.headline')} /></Field>
            <Field><FieldLabel>Years of experience</FieldLabel><ProfileInput min="0" step="1" type="number" {...register('identity.yearsExperience')} /></Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Contact</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>Email</FieldLabel><ProfileInput {...register('identity.email')} /></Field>
            <Field><FieldLabel>Phone</FieldLabel><ProfileInput {...register('identity.phone')} /></Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Location</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>City</FieldLabel><ProfileInput {...register('identity.currentCity')} /></Field>
            <Field><FieldLabel>State or region</FieldLabel><ProfileInput {...register('identity.currentRegion')} /></Field>
            <Field><FieldLabel>Country</FieldLabel><ProfileInput {...register('identity.currentCountry')} /></Field>
            <Field><FieldLabel>Displayed location</FieldLabel><ProfileInput placeholder="Shown on generated resumes" {...register('identity.currentLocation')} /></Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Links</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>LinkedIn URL</FieldLabel><ProfileInput {...register('identity.linkedinUrl')} /></Field>
            <Field><FieldLabel>Website</FieldLabel><ProfileInput {...register('identity.portfolioUrl')} /></Field>
            <Field><FieldLabel>GitHub URL</FieldLabel><ProfileInput {...register('identity.githubUrl')} /></Field>
          </div>
        </article>

        <ProfileOptionalSection
          description="Keep the main profile focused on the details Job Finder uses most often. Open this only when an application needs the extras."
          title="More personal details"
        >
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field><FieldLabel>Middle name</FieldLabel><ProfileInput {...register('identity.middleName')} /></Field>
            <Field><FieldLabel>Time zone</FieldLabel><ProfileInput {...register('identity.timeZone')} /></Field>
            <Field className="md:col-span-2"><FieldLabel>Extra website</FieldLabel><ProfileInput {...register('identity.personalWebsiteUrl')} /></Field>
          </div>
        </ProfileOptionalSection>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Narrative"
          title="Summary"
          description="Start with the short version of your story, then add the details that help resumes sound like you."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Positioning</p>
          <div className="grid gap-(--gap-content)">
            <Field>
              <FieldLabel>Short summary</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={3} {...register('summary.shortValueProposition')} />
            </Field>
            <Field>
              <FieldLabel>Professional summary</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-default) max-h-(--textarea-default)" rows={5} {...register('summary.fullSummary')} />
            </Field>
            <Field>
              <FieldLabel>Strengths</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" rows={4} {...register('summary.strengths')} />
            </Field>
          </div>
        </article>

        <ProfileOptionalSection
          description="Add the extra context that helps with targeted rewriting, without keeping the main summary path overloaded."
          title="More context for tailoring"
        >
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel>Career themes</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-tall) max-h-(--textarea-tall)" rows={4} {...register('summary.careerThemes')} />
            </Field>
            <Field>
              <FieldLabel>Leadership experience</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register('summary.leadershipSummary')} />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel>Industry focus</FieldLabel>
              <ProfileTextarea className="min-h-(--textarea-compact) max-h-(--textarea-compact)" rows={4} {...register('summary.domainFocusSummary')} />
            </Field>
          </div>
        </ProfileOptionalSection>
      </section>

      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Skills"
          title="Skills"
          description="Keep your main skills here so resumes and future forms stay grounded in the same facts."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">Role-facing skills</p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <ProfileListEditor
              label="Main skills"
              onChange={(values) => setValue('profileSkills', joinListInput(values), listFieldOptions)}
              placeholder="Add a skill"
              values={parseListInput(watch('profileSkills'))}
            />
            <ProfileListEditor
              label="Skills to emphasize for target roles"
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
              label="Core strengths"
              onChange={(values) => setValue('skillGroups.coreSkills', joinListInput(values), listFieldOptions)}
              placeholder="Add a core strength"
              values={parseListInput(watch('skillGroups.coreSkills'))}
            />
            <ProfileListEditor
              label="Tools and platforms"
              onChange={(values) => setValue('skillGroups.tools', joinListInput(values), listFieldOptions)}
              placeholder="Add a tool"
              values={parseListInput(watch('skillGroups.tools'))}
            />
            <ProfileListEditor
              label="Languages and frameworks"
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
