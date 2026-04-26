import { useId, type ReactNode } from 'react'
import {
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileSetupStep,
  type ResumeImportFieldCandidateSummary,
} from '@unemployed/contracts'
import type { UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { CheckboxField } from '../../checkbox-field'
import { FormSelect } from '../../form-select'
import { formatStatusLabel, joinListInput, parseListInput } from '../../../lib/job-finder-utils'
import type { BooleanSelectValue } from '../../../lib/job-finder-types'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from '../../../lib/profile-editor'
import {
  ProfileInput,
  ProfileTextarea,
  profileSelectTriggerClassName,
} from '../profile-form-primitives'
import { ProfileListEditor } from '../profile-list-editor'

const booleanSelectOptions = [
  { label: 'Not set', value: '' },
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
] as const

function SetupBooleanField(props: {
  control: UseFormReturn<ProfileEditorValues>['control']
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
            options={booleanSelectOptions.map((option) => ({ ...option }))}
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

interface FooterOptions {
  nextLabel?: string
  onPrimary?: (() => void) | null
  primaryDisabled?: boolean
  primaryLabel?: string
}

export type RenderFooter = (options?: FooterOptions) => ReactNode

export function ProfileSetupImportStep(props: {
  importDisabledReason?: string | null
  isImportResumePending: boolean
  isProfileSetupPending: boolean
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[]
  onContinueToProfile: () => void
  onImportResume: () => void
  onSaveAndGoToStep: (step: ProfileSetupStep) => void
  profile: CandidateProfile
  renderFooter: RenderFooter
  reviewItemCount: number
}) {
  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Start with your resume</CardTitle>
        <CardDescription>
          Import a resume first when you have one. Setup will turn low-confidence or missing details into focused review items instead of dropping you into the whole editor.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4"><p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">Imported file</p><p className="mt-2 text-sm font-medium text-foreground">{props.profile.baseResume.fileName}</p></div>
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4"><p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">Import status</p><p className="mt-2 text-sm font-medium text-foreground">{formatStatusLabel(props.profile.baseResume.extractionStatus)}</p></div>
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4"><p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">Review items</p><p className="mt-2 text-sm font-medium text-foreground">{props.reviewItemCount} in this step</p></div>
        </div>

        <div className="rounded-(--radius-field) border border-dashed border-border/40 bg-background/50 p-4 text-sm leading-6 text-foreground-soft">
          {props.latestResumeImportReviewCandidates.length > 0
            ? `Latest import kept ${props.latestResumeImportReviewCandidates.length} reviewable suggestion${props.latestResumeImportReviewCandidates.length === 1 ? '' : 's'} visible in setup.`
            : 'You can continue without a resume, but importing one usually gets you through setup faster.'}
        </div>

        {props.latestResumeImportReviewCandidates.length > 0 ? (
          <div className="grid gap-2">
            {props.latestResumeImportReviewCandidates.slice(0, 4).map((candidate) => (
              <div className="rounded-(--radius-field) border border-border/25 bg-background/70 px-4 py-3" key={candidate.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{candidate.label}</p>
                  <Badge variant="outline">{formatStatusLabel(candidate.resolution)}</Badge>
                </div>
                <p className="mt-1 text-sm text-foreground-soft">{candidate.valuePreview ?? candidate.evidenceText ?? 'Review this imported suggestion.'}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button disabled={Boolean(props.importDisabledReason)} pending={props.isImportResumePending} onClick={props.onImportResume} type="button">Import or refresh resume</Button>
          <Button pending={props.isProfileSetupPending} onClick={() => props.onSaveAndGoToStep('essentials')} type="button" variant="secondary">Continue without resume</Button>
          <Button pending={props.isProfileSetupPending} onClick={props.onContinueToProfile} type="button" variant="ghost">Open full Profile instead</Button>
        </div>
        {props.importDisabledReason ? (
          <p className="text-sm leading-6 text-foreground-soft">{props.importDisabledReason}</p>
        ) : null}

        {props.renderFooter({
          nextLabel: 'Save and go to essentials',
          onPrimary: () => props.onSaveAndGoToStep('essentials'),
        })}
      </CardContent>
    </Card>
  )
}

export function ProfileSetupEssentialsStep(props: {
  nextStep: ProfileSetupStep | null
  onSaveAndGoToStep: (step: ProfileSetupStep) => void
  profileForm: UseFormReturn<ProfileEditorValues>
  renderFooter: RenderFooter
}) {
  const displayNameId = useId()
  const headlineId = 'profile-setup-field-identity-headline'
  const yearsExperienceId = 'profile-setup-field-identity-years-experience'
  const currentLocationId = 'profile-setup-field-identity-current-location'
  const emailId = 'profile-setup-field-identity-email'
  const phoneId = 'profile-setup-field-identity-phone'
  const linkedinUrlId = 'profile-setup-field-identity-linkedin-url'
  const portfolioUrlId = 'profile-setup-field-identity-portfolio-url'
  const summaryId = 'profile-setup-field-identity-summary'

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Lock in the essentials</CardTitle>
        <CardDescription>
          Confirm the identity and contact details that discovery, resume exports, and applications all reuse.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <Field><FieldLabel htmlFor={displayNameId}>Preferred display name</FieldLabel><ProfileInput id={displayNameId} {...props.profileForm.register('identity.preferredDisplayName')} /></Field>
          <Field><FieldLabel htmlFor={headlineId}>Headline</FieldLabel><ProfileInput id={headlineId} {...props.profileForm.register('identity.headline')} /></Field>
          <Field><FieldLabel>First name</FieldLabel><ProfileInput {...props.profileForm.register('identity.firstName')} /></Field>
          <Field><FieldLabel>Last name</FieldLabel><ProfileInput {...props.profileForm.register('identity.lastName')} /></Field>
          <Field><FieldLabel htmlFor={yearsExperienceId}>Years of experience</FieldLabel><ProfileInput id={yearsExperienceId} min="0" step="1" type="number" {...props.profileForm.register('identity.yearsExperience')} /></Field>
          <Field><FieldLabel htmlFor={currentLocationId}>Displayed location</FieldLabel><ProfileInput id={currentLocationId} {...props.profileForm.register('identity.currentLocation')} /></Field>
          <Field><FieldLabel htmlFor={emailId}>Email</FieldLabel><ProfileInput id={emailId} {...props.profileForm.register('identity.email')} /></Field>
          <Field><FieldLabel htmlFor={phoneId}>Phone</FieldLabel><ProfileInput id={phoneId} {...props.profileForm.register('identity.phone')} /></Field>
          <Field><FieldLabel htmlFor={linkedinUrlId}>LinkedIn URL</FieldLabel><ProfileInput id={linkedinUrlId} {...props.profileForm.register('identity.linkedinUrl')} /></Field>
          <Field><FieldLabel htmlFor={portfolioUrlId}>Portfolio URL</FieldLabel><ProfileInput id={portfolioUrlId} {...props.profileForm.register('identity.portfolioUrl')} /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor={summaryId}>Short summary</FieldLabel><ProfileTextarea id={summaryId} rows={4} {...props.profileForm.register('identity.summary')} /></Field>
        </div>

        {props.renderFooter({
          nextLabel: 'Save and continue to background',
          onPrimary: () => props.onSaveAndGoToStep(props.nextStep ?? 'background'),
        })}
      </CardContent>
    </Card>
  )
}

export function ProfileSetupTargetingStep(props: {
  nextStep: ProfileSetupStep | null
  onSaveAndGoToStep: (step: ProfileSetupStep) => void
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  profileForm: UseFormReturn<ProfileEditorValues>
  renderFooter: RenderFooter
}) {
  const authorizedWorkCountriesId = 'profile-setup-field-eligibility-authorized-work-countries'
  const locationPreferencesId = useId()
  const targetRolesId = 'profile-setup-field-search-preferences-target-roles'
  const locationsId = 'profile-setup-field-search-preferences-locations'
  const workModesGroupId = 'profile-setup-field-search-preferences-work-modes'
  const requiresVisaSponsorshipId = 'profile-setup-field-eligibility-requires-visa-sponsorship'
  const remoteEligibleId = 'profile-setup-field-eligibility-remote-eligible'
  const willingToRelocateId = 'profile-setup-field-eligibility-willing-to-relocate'
  const willingToTravelId = 'profile-setup-field-eligibility-willing-to-travel'
  const listFieldOptions = { shouldDirty: true, shouldTouch: true, shouldValidate: true } as const

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Tell Job Finder what to optimize for</CardTitle>
        <CardDescription>
          Capture the roles, locations, work modes, and real constraints that make search and tailoring specific.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="rounded-(--radius-field) border border-dashed border-border/40 bg-background/50 p-4 text-sm leading-6 text-foreground-soft">
          <p>
            Use <span className="font-medium text-foreground">Preferred work modes</span> to tell Job Finder you want remote roles.
            Use <span className="font-medium text-foreground">Preferred locations</span> only when you want to narrow remote, hybrid, or onsite search to specific places.
          </p>
        </div>
        <ProfileListEditor
          inputId={targetRolesId}
          label="Target roles"
          onChange={(values) => props.preferencesForm.setValue('targetRoles', joinListInput(values), listFieldOptions)}
          placeholder="Add a target role"
          values={parseListInput(props.preferencesForm.watch('targetRoles'))}
        />
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <ProfileListEditor label="Job families" onChange={(values) => props.preferencesForm.setValue('jobFamilies', joinListInput(values), listFieldOptions)} placeholder="Add a related role area" values={parseListInput(props.preferencesForm.watch('jobFamilies'))} />
          <ProfileListEditor inputId={locationsId} label="Preferred locations" onChange={(values) => props.preferencesForm.setValue('locations', joinListInput(values), listFieldOptions)} placeholder="Add a preferred location" values={parseListInput(props.preferencesForm.watch('locations'))} />
        </div>
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <div className="grid min-w-0 content-start gap-(--gap-field)"><FieldLabel htmlFor={authorizedWorkCountriesId}>Authorized work countries</FieldLabel><ProfileTextarea id={authorizedWorkCountriesId} rows={4} {...props.profileForm.register('eligibility.authorizedWorkCountries')} /></div>
          <div className="grid min-w-0 content-start gap-(--gap-field)"><FieldLabel htmlFor={locationPreferencesId}>Relocation regions</FieldLabel><ProfileTextarea id={locationPreferencesId} rows={4} {...props.profileForm.register('eligibility.preferredRelocationRegions')} /></div>
          <SetupBooleanField control={props.profileForm.control} id={requiresVisaSponsorshipId} label="Requires visa sponsorship" name="eligibility.requiresVisaSponsorship" />
          <SetupBooleanField control={props.profileForm.control} id={remoteEligibleId} label="Remote eligible" name="eligibility.remoteEligible" />
          <SetupBooleanField control={props.profileForm.control} id={willingToRelocateId} label="Willing to relocate" name="eligibility.willingToRelocate" />
          <SetupBooleanField control={props.profileForm.control} id={willingToTravelId} label="Willing to travel" name="eligibility.willingToTravel" />
        </div>
        <fieldset aria-describedby={workModesGroupId} className="grid gap-(--gap-field)" id={workModesGroupId}>
          <legend className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">Preferred work modes</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {['remote', 'hybrid', 'onsite'].map((workMode) => (
              <Controller
                control={props.preferencesForm.control}
                key={workMode}
                name="workModes"
                render={({ field }) => (
                  <CheckboxField
                    checked={field.value.includes(workMode as JobSearchPreferences['workModes'][number])}
                    label={formatStatusLabel(workMode)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked ? [...field.value, workMode] : field.value.filter((value) => value !== workMode),
                      )
                    }
                  />
                )}
              />
            ))}
          </div>
        </fieldset>

        {props.renderFooter({
          nextLabel: 'Save and continue to narrative',
          onPrimary: () => props.onSaveAndGoToStep(props.nextStep ?? 'narrative'),
        })}
      </CardContent>
    </Card>
  )
}
