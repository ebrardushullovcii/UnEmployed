import { useId, type ReactNode } from 'react'
import { formatProfileSetupReviewValue } from './profile-setup-screen-helpers'
import {
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileSetupStep,
  type ResumeImportFieldCandidateSummary,
  type ResumeImportProgressEvent,
} from '@unemployed/contracts'
import type { UseFormReturn } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { CheckboxField } from '../../checkbox-field'
import { FormSelect } from '../../form-select'
import {
  formatStatusLabel,
  joinListInput,
  parseListInput,
} from '../../../lib/job-finder-utils'
import type { BooleanSelectValue } from '../../../lib/job-finder-types'
import type {
  ProfileEditorValues,
  SearchPreferencesEditorValues,
} from '../../../lib/profile-editor'
import {
  ProfileInput,
  ProfileTextarea,
  profileSelectTriggerClassName,
} from '../profile-form-primitives'
import { ProfileListEditor } from '../profile-list-editor'
import { ResumeImportProgress } from '../resume-import-progress'

const booleanSelectOptions = [
  { label: 'Not set', value: '' },
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
] as const

function getImportConflictSummary(
  candidate: ResumeImportFieldCandidateSummary,
): string | null {
  if ((candidate.conflictChoices?.length ?? 0) < 2) {
    return null
  }

  const sourceLabels = Array.from(
    new Set(
      (candidate.conflictChoices ?? []).map((choice) => choice.sourceLabel),
    ),
  )
  return sourceLabels.length > 0
    ? `Compare ${sourceLabels.join(' and ')} before confirming.`
    : 'Compare imported alternatives before confirming.'
}

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
            onValueChange={(value) =>
              field.onChange(value as BooleanSelectValue)
            }
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
  resumeImportProgress: ResumeImportProgressEvent | null
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
          Import a resume first when you have one. Setup will turn
          low-confidence or missing details into focused review items instead of
          dropping you into the whole editor.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">
              Imported file
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {props.profile.baseResume.fileName}
            </p>
          </div>
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">
              Import status
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatStatusLabel(props.profile.baseResume.extractionStatus)}
            </p>
          </div>
          <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-muted-foreground">
              Review items
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {props.reviewItemCount} in this step
            </p>
          </div>
        </div>

        <div className="rounded-(--radius-field) border border-dashed border-border/40 bg-background/50 p-4 text-sm leading-6 text-foreground-soft">
          {props.latestResumeImportReviewCandidates.length > 0
            ? `Latest import kept ${props.latestResumeImportReviewCandidates.length} reviewable suggestion${props.latestResumeImportReviewCandidates.length === 1 ? '' : 's'} visible in setup.`
            : 'You can continue without a resume, but importing one usually gets you through setup faster.'}
        </div>

        {props.latestResumeImportReviewCandidates.length > 0 ? (
          <div className="grid gap-2">
            {props.latestResumeImportReviewCandidates
              .slice(0, 4)
              .map((candidate) => (
                <div
                  className="rounded-(--radius-field) border border-border/25 bg-background/70 px-4 py-3"
                  key={candidate.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {candidate.label}
                    </p>
                    <Badge variant="outline">
                      {formatStatusLabel(candidate.resolution)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground-soft">
                    {formatProfileSetupReviewValue(
                      candidate.valuePreview ?? candidate.value,
                    ) ??
                      candidate.evidenceText ??
                      'Review this imported suggestion.'}
                  </p>
                  {(() => {
                    const conflictSummary = getImportConflictSummary(candidate)
                    return conflictSummary ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {conflictSummary}
                      </p>
                    ) : null
                  })()}
                </div>
              ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            disabled={Boolean(props.importDisabledReason)}
            pending={props.isImportResumePending}
            onClick={props.onImportResume}
            type="button"
            variant={
              props.profile.baseResume.extractionStatus === 'ready'
                ? 'secondary'
                : 'primary'
            }
          >
            {props.profile.baseResume.extractionStatus === 'ready'
              ? 'Replace resume'
              : 'Import resume'}
          </Button>
          <Button
            pending={props.isProfileSetupPending}
            onClick={() => props.onSaveAndGoToStep('essentials')}
            type="button"
            variant={
              props.profile.baseResume.extractionStatus === 'ready'
                ? 'primary'
                : 'secondary'
            }
          >
            {props.profile.baseResume.extractionStatus === 'ready'
              ? 'Review profile details'
              : 'Continue without resume'}
          </Button>
          <Button
            onClick={props.onContinueToProfile}
            type="button"
            variant="ghost"
          >
            Open full Profile instead
          </Button>
        </div>
        {props.importDisabledReason ? (
          <p className="text-sm leading-6 text-foreground-soft">
            {props.importDisabledReason}
          </p>
        ) : null}
        <ResumeImportProgress
          isPending={props.isImportResumePending}
          progress={props.resumeImportProgress}
        />

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
  const firstNameId = 'profile-setup-field-identity-first-name'
  const lastNameId = 'profile-setup-field-identity-last-name'
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
          Confirm the identity and contact details that discovery, resume
          exports, and applications all reuse.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={displayNameId}>
              Preferred display name
            </FieldLabel>
            <ProfileInput
              id={displayNameId}
              {...props.profileForm.register('identity.preferredDisplayName')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={headlineId}>Headline</FieldLabel>
            <ProfileInput
              id={headlineId}
              {...props.profileForm.register('identity.headline')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={firstNameId}>First name</FieldLabel>
            <ProfileInput
              id={firstNameId}
              {...props.profileForm.register('identity.firstName')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={lastNameId}>Last name</FieldLabel>
            <ProfileInput
              id={lastNameId}
              {...props.profileForm.register('identity.lastName')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={yearsExperienceId}>
              Years of experience
            </FieldLabel>
            <ProfileInput
              id={yearsExperienceId}
              min="0"
              step="1"
              type="number"
              {...props.profileForm.register('identity.yearsExperience')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={currentLocationId}>
              Current / home location
            </FieldLabel>
            <ProfileInput
              id={currentLocationId}
              {...props.profileForm.register('identity.currentLocation')}
            />
            <p className="text-xs leading-5 text-foreground-muted">
              Shown on your profile and resume. Job Finder does not use this as
              a preferred search location unless you add it in Targeting.
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor={emailId}>Email</FieldLabel>
            <ProfileInput
              id={emailId}
              {...props.profileForm.register('identity.email')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={phoneId}>Phone</FieldLabel>
            <ProfileInput
              id={phoneId}
              {...props.profileForm.register('identity.phone')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={linkedinUrlId}>LinkedIn URL</FieldLabel>
            <ProfileInput
              id={linkedinUrlId}
              {...props.profileForm.register('identity.linkedinUrl')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={portfolioUrlId}>Portfolio URL</FieldLabel>
            <ProfileInput
              id={portfolioUrlId}
              {...props.profileForm.register('identity.portfolioUrl')}
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor={summaryId}>Short summary</FieldLabel>
            <ProfileTextarea
              id={summaryId}
              rows={4}
              {...props.profileForm.register('identity.summary')}
            />
          </Field>
        </div>

        {props.renderFooter({
          nextLabel: 'Save and continue to background',
          onPrimary: () =>
            props.onSaveAndGoToStep(props.nextStep ?? 'background'),
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
  const authorizedWorkCountriesId =
    'profile-setup-field-eligibility-authorized-work-countries'
  const locationPreferencesId = useId()
  const targetRolesId = 'profile-setup-field-search-preferences-target-roles'
  const locationsId = 'profile-setup-field-search-preferences-locations'
  const workModesGroupId = 'profile-setup-field-search-preferences-work-modes'
  const requiresVisaSponsorshipId =
    'profile-setup-field-eligibility-requires-visa-sponsorship'
  const remoteEligibleId = 'profile-setup-field-eligibility-remote-eligible'
  const willingToRelocateId =
    'profile-setup-field-eligibility-willing-to-relocate'
  const willingToTravelId = 'profile-setup-field-eligibility-willing-to-travel'
  const listFieldOptions = {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  } as const
  const discoveryTargets = props.preferencesForm.watch('discoveryTargets')

  const updateDiscoveryTargets = (
    nextTargets: SearchPreferencesEditorValues['discoveryTargets'],
  ) => {
    props.preferencesForm.setValue('discoveryTargets', nextTargets, listFieldOptions)
  }

  const createDiscoveryTargetId = () =>
    `target_${typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`

  const hasValidStartingUrl = (value: string) => {
    try {
      const url = new URL(value.trim())
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Tell Job Finder what to optimize for</CardTitle>
        <CardDescription>
          Capture the roles, locations, work modes, and real constraints that
          make search and tailoring specific.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="rounded-(--radius-field) border border-dashed border-border/40 bg-background/50 p-4 text-sm leading-6 text-foreground-soft">
          <p>
            Use{' '}
            <span className="font-medium text-foreground">
              Preferred work modes
            </span>{' '}
            to tell Job Finder you want remote roles. Use{' '}
            <span className="font-medium text-foreground">
              Preferred locations
            </span>{' '}
            only when you want to narrow remote, hybrid, or onsite search to
            specific places.
          </p>
        </div>
        <ProfileListEditor
          inputId={targetRolesId}
          label="Target roles"
          onChange={(values) =>
            props.preferencesForm.setValue(
              'targetRoles',
              joinListInput(values),
              listFieldOptions,
            )
          }
          placeholder="Add a target role"
          values={parseListInput(props.preferencesForm.watch('targetRoles'))}
        />
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <ProfileListEditor
            label="Job families"
            onChange={(values) =>
              props.preferencesForm.setValue(
                'jobFamilies',
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add a related role area"
            values={parseListInput(props.preferencesForm.watch('jobFamilies'))}
          />
          <div className="grid gap-2">
            <ProfileListEditor
              inputId={locationsId}
              label="Preferred job locations"
              onChange={(values) =>
                props.preferencesForm.setValue(
                  'locations',
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Example: Prishtina, Kosovo"
              values={parseListInput(props.preferencesForm.watch('locations'))}
            />
            <p className="px-1 text-xs leading-5 text-foreground-muted">
              Only add places where you want to work. A city and country entered
              together stay one location.
            </p>
          </div>
        </div>
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <div className="grid min-w-0 content-start gap-(--gap-field)">
            <FieldLabel htmlFor={authorizedWorkCountriesId}>
              Authorized work countries
            </FieldLabel>
            <ProfileTextarea
              id={authorizedWorkCountriesId}
              rows={4}
              {...props.profileForm.register(
                'eligibility.authorizedWorkCountries',
              )}
            />
          </div>
          <div className="grid min-w-0 content-start gap-(--gap-field)">
            <FieldLabel htmlFor={locationPreferencesId}>
              Relocation regions
            </FieldLabel>
            <ProfileTextarea
              id={locationPreferencesId}
              rows={4}
              {...props.profileForm.register(
                'eligibility.preferredRelocationRegions',
              )}
            />
          </div>
          <SetupBooleanField
            control={props.profileForm.control}
            id={requiresVisaSponsorshipId}
            label="Requires visa sponsorship"
            name="eligibility.requiresVisaSponsorship"
          />
          <SetupBooleanField
            control={props.profileForm.control}
            id={remoteEligibleId}
            label="Remote eligible"
            name="eligibility.remoteEligible"
          />
          <SetupBooleanField
            control={props.profileForm.control}
            id={willingToRelocateId}
            label="Willing to relocate"
            name="eligibility.willingToRelocate"
          />
          <SetupBooleanField
            control={props.profileForm.control}
            id={willingToTravelId}
            label="Willing to travel"
            name="eligibility.willingToTravel"
          />
        </div>
        <fieldset
          aria-describedby={workModesGroupId}
          className="grid gap-(--gap-field)"
          id={workModesGroupId}
        >
          <legend className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
            Preferred work modes
          </legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {['remote', 'hybrid', 'onsite'].map((workMode) => (
              <Controller
                control={props.preferencesForm.control}
                key={workMode}
                name="workModes"
                render={({ field }) => (
                  <CheckboxField
                    checked={field.value.includes(
                      workMode as JobSearchPreferences['workModes'][number],
                    )}
                    label={formatStatusLabel(workMode)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...field.value, workMode]
                          : field.value.filter((value) => value !== workMode),
                      )
                    }
                  />
                )}
              />
            ))}
          </div>
          {props.preferencesForm.watch('workModes').length === 0 ? (
            <p
              className="text-sm leading-6 text-(--warning-text)"
              role="status"
            >
              Choose at least one work mode before relying on discovery results.
            </p>
          ) : props.preferencesForm.watch('workModes').includes('remote') &&
            props.profileForm.watch('eligibility.remoteEligible') === '' ? (
            <p
              className="text-sm leading-6 text-(--warning-text)"
              role="status"
            >
              Remote is preferred, but Remote eligible is unanswered. Confirm
              whether you can legally work remotely from your location.
            </p>
          ) : (
            <p className="text-sm leading-6 text-foreground-muted">
              Work-mode preference describes what you want; eligibility
              describes what you can accept legally.
            </p>
          )}
        </fieldset>

        <section
          aria-labelledby="profile-setup-job-sources-heading"
          className="grid gap-4 rounded-(--radius-field) border border-border/35 bg-background/45 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <h3
                className="text-sm font-semibold text-foreground"
                id="profile-setup-job-sources-heading"
              >
                Job sources
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-foreground-soft">
                Add at least one public careers page or job-board URL. Job Finder
                cannot search until one valid source is included.
              </p>
            </div>
            <Button
              onClick={() =>
                updateDiscoveryTargets([
                  ...discoveryTargets,
                  {
                    id: createDiscoveryTargetId(),
                    label: '',
                    startingUrl: '',
                    enabled: true,
                    adapterKind: 'auto',
                    customInstructions: '',
                    instructionStatus: 'missing',
                    validatedInstructionId: null,
                    draftInstructionId: null,
                    lastDebugRunId: null,
                    lastVerifiedAt: null,
                    staleReason: null,
                  },
                ])
              }
              type="button"
              variant="secondary"
            >
              Add source
            </Button>
          </div>

          {discoveryTargets.length === 0 ? (
            <div className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-3 text-sm leading-6 text-(--warning-text)" role="status">
              No job source is configured. Add the public page where you would
              normally browse open roles.
            </div>
          ) : (
            <div className="grid gap-3">
              {discoveryTargets.map((target, index) => {
                const validUrl = hasValidStartingUrl(target.startingUrl)
                const sourceLabel = target.label.trim() || `Source ${index + 1}`

                return (
                  <div
                    className="grid gap-3 rounded-(--radius-field) border border-border/30 bg-background/65 p-4"
                    key={target.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {sourceLabel}
                      </p>
                      <Button
                        aria-label={`Remove ${sourceLabel}`}
                        onClick={() =>
                          updateDiscoveryTargets(
                            discoveryTargets.filter((entry) => entry.id !== target.id),
                          )
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="grid gap-(--gap-field)">
                        <FieldLabel htmlFor={`profile-setup-source-label-${target.id}`}>
                          Source name
                        </FieldLabel>
                        <ProfileInput
                          id={`profile-setup-source-label-${target.id}`}
                          onChange={(event) =>
                            updateDiscoveryTargets(
                              discoveryTargets.map((entry) =>
                                entry.id === target.id
                                  ? { ...entry, label: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          placeholder="Example: Acme careers"
                          value={target.label}
                        />
                      </div>
                      <div className="grid gap-(--gap-field)">
                        <FieldLabel htmlFor={`profile-setup-source-url-${target.id}`}>
                          Careers or job-board URL
                        </FieldLabel>
                        <ProfileInput
                          aria-invalid={target.startingUrl.trim().length > 0 && !validUrl}
                          id={`profile-setup-source-url-${target.id}`}
                          onChange={(event) =>
                            updateDiscoveryTargets(
                              discoveryTargets.map((entry) =>
                                entry.id === target.id
                                  ? {
                                      ...entry,
                                      startingUrl: event.target.value,
                                      instructionStatus: 'missing',
                                      validatedInstructionId: null,
                                      draftInstructionId: null,
                                      lastDebugRunId: null,
                                      lastVerifiedAt: null,
                                      staleReason: null,
                                    }
                                  : entry,
                              ),
                            )
                          }
                          placeholder="https://company.example/careers"
                          type="url"
                          value={target.startingUrl}
                        />
                      </div>
                    </div>
                    <CheckboxField
                      checked={target.enabled}
                      label="Include this source in searches"
                      onCheckedChange={(checked) =>
                        updateDiscoveryTargets(
                          discoveryTargets.map((entry) =>
                            entry.id === target.id
                              ? { ...entry, enabled: checked }
                              : entry,
                          ),
                        )
                      }
                    />
                    {target.enabled && !validUrl ? (
                      <p className="text-sm leading-6 text-(--warning-text)" role="status">
                        Enter a complete http or https URL before this source can
                        be used.
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {props.renderFooter({
          nextLabel: 'Save and continue to narrative',
          onPrimary: () =>
            props.onSaveAndGoToStep(props.nextStep ?? 'narrative'),
        })}
      </CardContent>
    </Card>
  )
}
