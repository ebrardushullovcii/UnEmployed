import type { ProfileSetupStep } from '@unemployed/contracts'
import type { UseFormReturn } from 'react-hook-form'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { EmptyState } from '../../empty-state'
import { formatStatusLabel } from '../../../lib/job-finder-utils'
import type { ProfileEditorValues } from '../../../lib/profile-editor'
import type { ProfileBackgroundArrays } from '../profile-field-array-types'
import { ProfileInput, ProfileTextarea } from '../profile-form-primitives'
import { ProfileRecordCard } from '../profile-record-card'
import type { RenderFooter } from './profile-setup-step-sections'

export function ProfileSetupNarrativeStep(props: {
  backgroundArrays: ProfileBackgroundArrays
  isProfileSetupPending: boolean
  nextStep: ProfileSetupStep | null
  onSaveAndGoToStep: (step: ProfileSetupStep) => void
  profileForm: UseFormReturn<ProfileEditorValues>
  renderFooter: RenderFooter
}) {
  const professionalStoryId = 'profile-setup-field-narrative-professional-story'
  const nextChapterId = 'profile-setup-field-narrative-next-chapter'
  const differentiatorsId = 'profile-setup-field-narrative-differentiators'
  const careerTransitionId = 'profile-setup-field-narrative-career-transition'
  const motivationThemesId = 'profile-setup-field-narrative-motivation-themes'

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Capture the story behind the facts</CardTitle>
        <CardDescription>
          Give the app a short professional story, differentiators, and proof that later resume or apply flows can reuse safely.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <Field><FieldLabel htmlFor={professionalStoryId}>Professional story</FieldLabel><ProfileTextarea id={professionalStoryId} rows={5} {...props.profileForm.register('narrative.professionalStory')} /></Field>
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <Field><FieldLabel htmlFor={nextChapterId}>Next chapter summary</FieldLabel><ProfileTextarea id={nextChapterId} rows={4} {...props.profileForm.register('narrative.nextChapterSummary')} /></Field>
          <Field><FieldLabel htmlFor={differentiatorsId}>Differentiators</FieldLabel><ProfileTextarea id={differentiatorsId} rows={4} {...props.profileForm.register('narrative.differentiators')} /></Field>
          <Field><FieldLabel htmlFor={careerTransitionId}>Career transition summary</FieldLabel><ProfileTextarea id={careerTransitionId} rows={4} {...props.profileForm.register('narrative.careerTransitionSummary')} /></Field>
          <Field><FieldLabel htmlFor={motivationThemesId}>Motivation themes</FieldLabel><ProfileTextarea id={motivationThemesId} rows={4} {...props.profileForm.register('narrative.motivationThemes')} /></Field>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Proof bank</p>
              <p className="text-sm text-foreground-soft">Save measurable wins and supporting context once.</p>
            </div>
            <Button
              disabled={props.isProfileSetupPending}
              onClick={() =>
                props.backgroundArrays.proofBankArray.append({
                  id: `proof_${crypto.randomUUID().slice(0, 8)}`,
                  title: '',
                  claim: '',
                  heroMetric: '',
                  supportingContext: '',
                  roleFamilies: '',
                  projectIds: '',
                  linkIds: '',
                })
              }
              type="button"
              variant="secondary"
            >
              Add proof
            </Button>
          </div>

          {props.backgroundArrays.proofBankArray.fields.length > 0 ? (
            props.backgroundArrays.proofBankArray.fields.map((entry, index) => (
              <ProfileRecordCard
                id={`proof-record-${entry.id}`}
                key={entry.fieldKey}
                summary={props.profileForm.watch(`proofBank.${index}.heroMetric`) || 'Add the claim and strongest supporting detail.'}
                title={props.profileForm.watch(`proofBank.${index}.title`)?.trim() || `Proof ${index + 1}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Proof details</p>
                  <Button disabled={props.isProfileSetupPending} onClick={() => props.backgroundArrays.proofBankArray.remove(index)} size="compact" type="button" variant="ghost">Remove</Button>
                </div>
                <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                  <Field><FieldLabel htmlFor={`proof-record-${entry.id}-title`}>Title</FieldLabel><ProfileInput id={`proof-record-${entry.id}-title`} {...props.profileForm.register(`proofBank.${index}.title`)} /></Field>
                  <Field><FieldLabel htmlFor={`proof-record-${entry.id}-hero-metric`}>Hero metric</FieldLabel><ProfileInput id={`proof-record-${entry.id}-hero-metric`} {...props.profileForm.register(`proofBank.${index}.heroMetric`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`proof-record-${entry.id}-claim`}>Claim</FieldLabel><ProfileTextarea id={`proof-record-${entry.id}-claim`} rows={4} {...props.profileForm.register(`proofBank.${index}.claim`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel htmlFor={`proof-record-${entry.id}-supporting-context`}>Supporting context</FieldLabel><ProfileTextarea id={`proof-record-${entry.id}-supporting-context`} rows={4} {...props.profileForm.register(`proofBank.${index}.supportingContext`)} /></Field>
                  <Field><FieldLabel htmlFor={`proof-record-${entry.id}-role-families`}>Relevant role families</FieldLabel><ProfileTextarea id={`proof-record-${entry.id}-role-families`} rows={4} {...props.profileForm.register(`proofBank.${index}.roleFamilies`)} /></Field>
                </div>
              </ProfileRecordCard>
            ))
          ) : (
            <EmptyState description="Add one or two strong proof points so the setup captures more than just raw role history." title="No proof points yet" />
          )}
        </div>

        {props.renderFooter({ nextLabel: 'Save and continue to answers', onPrimary: () => props.onSaveAndGoToStep(props.nextStep ?? 'answers') })}
      </CardContent>
    </Card>
  )
}

export function ProfileSetupAnswersStep(props: {
  backgroundArrays: ProfileBackgroundArrays
  isProfileSetupPending: boolean
  nextStep: ProfileSetupStep | null
  onSaveAndGoToStep: (step: ProfileSetupStep) => void
  profileForm: UseFormReturn<ProfileEditorValues>
  renderFooter: RenderFooter
}) {
  const availabilityAnswerId = 'profile-setup-field-answer-bank-availability'
  const visaAnswerId = 'profile-setup-field-answer-bank-visa-sponsorship'
  const relocationId = 'profile-setup-field-answer-bank-relocation'
  const selfIntroductionId = 'profile-setup-field-answer-bank-self-introduction'
  const careerTransitionId = 'profile-setup-field-answer-bank-career-transition'
  const preferredEmailId = 'profile-setup-field-application-identity-preferred-email'
  const preferredPhoneId = 'profile-setup-field-application-identity-preferred-phone'
  const preferredLinksId = 'profile-setup-field-application-identity-preferred-links'

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Save the answers you reuse most</CardTitle>
        <CardDescription>
          Capture work authorization, availability, and short reusable responses now so applications start from grounded defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <Field><FieldLabel htmlFor={availabilityAnswerId}>Availability</FieldLabel><ProfileTextarea id={availabilityAnswerId} rows={4} {...props.profileForm.register('answerBank.availability')} /></Field>
          <Field><FieldLabel htmlFor={visaAnswerId}>Visa sponsorship</FieldLabel><ProfileTextarea id={visaAnswerId} rows={4} {...props.profileForm.register('answerBank.visaSponsorship')} /></Field>
          <Field><FieldLabel htmlFor={relocationId}>Relocation</FieldLabel><ProfileTextarea id={relocationId} rows={4} {...props.profileForm.register('answerBank.relocation')} /></Field>
          <Field><FieldLabel htmlFor={selfIntroductionId}>Short self-introduction</FieldLabel><ProfileTextarea id={selfIntroductionId} rows={4} {...props.profileForm.register('answerBank.selfIntroduction')} /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor={careerTransitionId}>Career transition explanation</FieldLabel><ProfileTextarea id={careerTransitionId} rows={4} {...props.profileForm.register('answerBank.careerTransition')} /></Field>
          <Field><FieldLabel htmlFor={preferredEmailId}>Preferred application email</FieldLabel><ProfileInput id={preferredEmailId} {...props.profileForm.register('applicationIdentity.preferredEmail')} /></Field>
          <Field><FieldLabel htmlFor={preferredPhoneId}>Preferred application phone</FieldLabel><ProfileInput id={preferredPhoneId} {...props.profileForm.register('applicationIdentity.preferredPhone')} /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor={preferredLinksId}>Preferred public link IDs</FieldLabel><ProfileTextarea id={preferredLinksId} rows={4} {...props.profileForm.register('applicationIdentity.preferredLinkIds')} /></Field>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Reusable answers</p>
              <p className="text-sm text-foreground-soft">Save recurring screeners with labels and grounded answers.</p>
            </div>
            <Button
              disabled={props.isProfileSetupPending}
              onClick={() =>
                props.backgroundArrays.customAnswerArray.append({
                  id: `answer_${crypto.randomUUID().slice(0, 8)}`,
                  label: '',
                  question: '',
                  answer: '',
                  kind: 'other',
                  roleFamilies: '',
                  proofEntryIds: '',
                })
              }
              type="button"
              variant="secondary"
            >
              Add answer
            </Button>
          </div>

          {props.backgroundArrays.customAnswerArray.fields.length > 0 ? (
            props.backgroundArrays.customAnswerArray.fields.map((entry, index) => (
              <ProfileRecordCard
                id={`answer-record-${entry.id}`}
                key={entry.fieldKey}
                summary={props.profileForm.watch(`answerBank.customAnswers.${index}.question`) || 'Save the exact question and your reusable answer.'}
                title={props.profileForm.watch(`answerBank.customAnswers.${index}.label`)?.trim() || `Answer ${index + 1}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Reusable answer</p>
                  <Button disabled={props.isProfileSetupPending} onClick={() => props.backgroundArrays.customAnswerArray.remove(index)} size="compact" type="button" variant="ghost">Remove</Button>
                </div>
                <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                  <Field><FieldLabel>Label</FieldLabel><ProfileInput {...props.profileForm.register(`answerBank.customAnswers.${index}.label`)} /></Field>
                  <Field><FieldLabel>Kind</FieldLabel><ProfileInput {...props.profileForm.register(`answerBank.customAnswers.${index}.kind`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Question</FieldLabel><ProfileTextarea rows={4} {...props.profileForm.register(`answerBank.customAnswers.${index}.question`)} /></Field>
                  <Field className="md:col-span-2"><FieldLabel>Answer</FieldLabel><ProfileTextarea rows={4} {...props.profileForm.register(`answerBank.customAnswers.${index}.answer`)} /></Field>
                </div>
              </ProfileRecordCard>
            ))
          ) : (
            <EmptyState description="No custom answers yet. Add one when a recurring screener is worth saving." title="No reusable answers saved" />
          )}
        </div>

        {props.renderFooter({ nextLabel: 'Save and review readiness', onPrimary: () => props.onSaveAndGoToStep(props.nextStep ?? 'ready_check') })}
      </CardContent>
    </Card>
  )
}

export function ProfileSetupReadyCheckStep(props: {
  applyStatus: 'ready' | 'needs_review' | 'missing'
  blockingPendingItemsCount: number
  canFinishSetup: boolean
  discoveryStatus: 'ready' | 'needs_review' | 'missing'
  getReadinessTone: (status: 'ready' | 'needs_review' | 'missing') => 'default' | 'outline' | 'destructive'
  narrativeStatus: 'ready' | 'needs_review' | 'missing'
  onSaveAndFinish: () => void
  renderFooter: RenderFooter
}) {
  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Readiness check</CardTitle>
        <CardDescription>
          Finish setup only when the core profile is materially complete and blocking review items are resolved.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { label: 'Discovery', status: props.discoveryStatus, description: props.discoveryStatus === 'ready' ? 'Roles, locations, and eligibility are ready for targeted search.' : props.discoveryStatus === 'needs_review' ? 'Some targeting context exists, but discovery can still drift.' : 'Discovery is still missing roles or practical constraints.' },
            { label: 'Resume quality', status: props.narrativeStatus, description: props.narrativeStatus === 'ready' ? 'Narrative and proof exist for stronger summaries and bullets.' : props.narrativeStatus === 'needs_review' ? 'There is useful background, but the story still needs sharpening.' : 'The app still lacks enough story or proof to produce strong output.' },
            { label: 'Apply readiness', status: props.applyStatus, description: props.applyStatus === 'ready' ? 'Contact, eligibility, and reusable answers are ready for application defaults.' : props.applyStatus === 'needs_review' ? 'Some apply defaults exist, but repeated screeners will still need extra input.' : 'Applications still miss key contact, eligibility, or answer defaults.' },
          ].map((card) => (
            <div className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4" key={card.label}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{card.label}</p>
                <Badge variant={props.getReadinessTone(card.status)}>{formatStatusLabel(card.status)}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground-soft">{card.description}</p>
            </div>
          ))}
        </div>

        {props.blockingPendingItemsCount > 0 ? (
          <div className="rounded-(--radius-field) border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-foreground-soft">
            {props.blockingPendingItemsCount} blocking review item{props.blockingPendingItemsCount === 1 ? '' : 's'} still {props.blockingPendingItemsCount === 1 ? 'needs' : 'need'} attention before setup can finish.
          </div>
        ) : null}

        {props.renderFooter({ primaryDisabled: !props.canFinishSetup, primaryLabel: props.canFinishSetup ? 'Finish setup and open Profile' : 'Resolve blocking items to finish', onPrimary: props.canFinishSetup ? props.onSaveAndFinish : null })}
      </CardContent>
    </Card>
  )
}
