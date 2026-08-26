import type { ProfileSetupStep } from "@unemployed/contracts";
import type { UseFormReturn } from "react-hook-form";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { EmptyState } from "../../empty-state";
import { formatStatusLabel } from "../../../lib/job-finder-utils";
import type { ProfileEditorValues } from "../../../lib/profile-editor";
import type { ProfileBackgroundArrays } from "../profile-field-array-types";
import type { ProfileSetupReviewItemDisplay } from "./profile-setup-screen-helpers";
import { ProfileInput, ProfileTextarea } from "../profile-form-primitives";
import { ProfileRecordCard } from "../profile-record-card";
import { PreferredApplicationLinksField } from "../preferred-application-links-field";
import type { RenderFooter } from "./profile-setup-step-sections";

export function ProfileSetupNarrativeStep(props: {
  backgroundArrays: ProfileBackgroundArrays;
  isProfileSetupPending: boolean;
  nextStep: ProfileSetupStep | null;
  onSaveAndGoToStep: (step: ProfileSetupStep) => void;
  profileForm: UseFormReturn<ProfileEditorValues>;
  renderFooter: RenderFooter;
}) {
  const professionalStoryId =
    "profile-setup-field-narrative-professional-story";
  const nextChapterId = "profile-setup-field-narrative-next-chapter";
  const differentiatorsId = "profile-setup-field-narrative-differentiators";
  const careerTransitionId = "profile-setup-field-narrative-career-transition";
  const motivationThemesId = "profile-setup-field-narrative-motivation-themes";

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Capture the story behind the facts</CardTitle>
        <CardDescription>
          Give the app a short professional story, differentiators, and proof
          that later resume or apply flows can reuse safely.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <Field>
          <FieldLabel htmlFor={professionalStoryId}>
            Professional story
          </FieldLabel>
          <ProfileTextarea
            id={professionalStoryId}
            rows={5}
            {...props.profileForm.register("narrative.professionalStory")}
          />
        </Field>
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={nextChapterId}>
              Next chapter summary
            </FieldLabel>
            <ProfileTextarea
              id={nextChapterId}
              rows={4}
              {...props.profileForm.register("narrative.nextChapterSummary")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={differentiatorsId}>Differentiators</FieldLabel>
            <ProfileTextarea
              id={differentiatorsId}
              rows={4}
              {...props.profileForm.register("narrative.differentiators")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={careerTransitionId}>
              Career transition summary
            </FieldLabel>
            <ProfileTextarea
              id={careerTransitionId}
              rows={4}
              {...props.profileForm.register(
                "narrative.careerTransitionSummary",
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={motivationThemesId}>
              Motivation themes
            </FieldLabel>
            <ProfileTextarea
              id={motivationThemesId}
              rows={4}
              {...props.profileForm.register("narrative.motivationThemes")}
            />
          </Field>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Proof bank
              </p>
              <p className="text-sm text-foreground-soft">
                Save measurable wins and supporting context once.
              </p>
            </div>
            <Button
              disabled={props.isProfileSetupPending}
              onClick={() =>
                props.backgroundArrays.proofBankArray.append({
                  id: `proof_${crypto.randomUUID().slice(0, 8)}`,
                  title: "",
                  claim: "",
                  heroMetric: "",
                  supportingContext: "",
                  roleFamilies: "",
                  projectIds: "",
                  linkIds: "",
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
                summary={
                  props.profileForm.watch(`proofBank.${index}.heroMetric`) ||
                  props.profileForm.watch(`proofBank.${index}.claim`) ||
                  props.profileForm.watch(
                    `proofBank.${index}.supportingContext`,
                  ) ||
                  "Add the claim and strongest supporting detail."
                }
                title={
                  props.profileForm.watch(`proofBank.${index}.title`)?.trim() ||
                  `Proof ${index + 1}`
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">
                    Proof details
                  </p>
                  <Button
                    disabled={props.isProfileSetupPending}
                    onClick={() =>
                      props.backgroundArrays.proofBankArray.remove(index)
                    }
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                  <Field>
                    <FieldLabel htmlFor={`proof-record-${entry.id}-title`}>
                      Title
                    </FieldLabel>
                    <ProfileInput
                      id={`proof-record-${entry.id}-title`}
                      {...props.profileForm.register(
                        `proofBank.${index}.title`,
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`proof-record-${entry.id}-hero-metric`}
                    >
                      Hero metric
                    </FieldLabel>
                    <ProfileInput
                      id={`proof-record-${entry.id}-hero-metric`}
                      {...props.profileForm.register(
                        `proofBank.${index}.heroMetric`,
                      )}
                    />
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor={`proof-record-${entry.id}-claim`}>
                      Claim
                    </FieldLabel>
                    <ProfileTextarea
                      id={`proof-record-${entry.id}-claim`}
                      rows={4}
                      {...props.profileForm.register(
                        `proofBank.${index}.claim`,
                      )}
                    />
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel
                      htmlFor={`proof-record-${entry.id}-supporting-context`}
                    >
                      Supporting context
                    </FieldLabel>
                    <ProfileTextarea
                      id={`proof-record-${entry.id}-supporting-context`}
                      rows={4}
                      {...props.profileForm.register(
                        `proofBank.${index}.supportingContext`,
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`proof-record-${entry.id}-role-families`}
                    >
                      Relevant role families
                    </FieldLabel>
                    <ProfileTextarea
                      id={`proof-record-${entry.id}-role-families`}
                      rows={4}
                      {...props.profileForm.register(
                        `proofBank.${index}.roleFamilies`,
                      )}
                    />
                  </Field>
                </div>
              </ProfileRecordCard>
            ))
          ) : (
            <EmptyState
              description="Add one or two strong proof points so the setup captures more than just raw role history."
              title="No proof points yet"
            />
          )}
        </div>

        {props.renderFooter({
          nextLabel: "Save and continue to answers",
          onPrimary: () => props.onSaveAndGoToStep(props.nextStep ?? "answers"),
        })}
      </CardContent>
    </Card>
  );
}

export function ProfileSetupAnswersStep(props: {
  backgroundArrays: ProfileBackgroundArrays;
  isProfileSetupPending: boolean;
  nextStep: ProfileSetupStep | null;
  onSaveAndGoToStep: (step: ProfileSetupStep) => void;
  profileForm: UseFormReturn<ProfileEditorValues>;
  renderFooter: RenderFooter;
}) {
  const availabilityAnswerId = "profile-setup-field-answer-bank-availability";
  const visaAnswerId = "profile-setup-field-answer-bank-visa-sponsorship";
  const relocationId = "profile-setup-field-answer-bank-relocation";
  const selfIntroductionId =
    "profile-setup-field-answer-bank-self-introduction";
  const careerTransitionId =
    "profile-setup-field-answer-bank-career-transition";
  const preferredEmailId =
    "profile-setup-field-application-identity-preferred-email";
  const preferredPhoneId =
    "profile-setup-field-application-identity-preferred-phone";
  const preferredLinksId =
    "profile-setup-field-application-identity-preferred-links";
  const professionalStory = props.profileForm
    .watch("narrative.professionalStory")
    .trim();
  const transitionSummary = props.profileForm
    .watch("narrative.careerTransitionSummary")
    .trim();
  const selfIntroduction = props.profileForm
    .watch("answerBank.selfIntroduction")
    .trim();
  const careerTransition = props.profileForm
    .watch("answerBank.careerTransition")
    .trim();
  const copiedFieldOptions = {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  } as const;

  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Save the answers you reuse most</CardTitle>
        <CardDescription>
          Capture work authorization, availability, and short reusable responses
          now so applications start from grounded defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-(--gap-content) md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={availabilityAnswerId}>Availability</FieldLabel>
            <ProfileTextarea
              id={availabilityAnswerId}
              rows={4}
              {...props.profileForm.register("answerBank.availability")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={visaAnswerId}>Visa sponsorship</FieldLabel>
            <ProfileTextarea
              id={visaAnswerId}
              rows={4}
              {...props.profileForm.register("answerBank.visaSponsorship")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={relocationId}>Relocation</FieldLabel>
            <ProfileTextarea
              id={relocationId}
              rows={4}
              {...props.profileForm.register("answerBank.relocation")}
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor={selfIntroductionId}>
                Short self-introduction
              </FieldLabel>
              {!selfIntroduction && professionalStory ? (
                <Button
                  onClick={() =>
                    props.profileForm.setValue(
                      "answerBank.selfIntroduction",
                      professionalStory,
                      copiedFieldOptions,
                    )
                  }
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  Use professional story
                </Button>
              ) : null}
            </div>
            <ProfileTextarea
              id={selfIntroductionId}
              rows={4}
              {...props.profileForm.register("answerBank.selfIntroduction")}
            />
            <p className="text-xs leading-5 text-foreground-muted">
              Keep this consistent with your saved professional story; edit it
              into a concise spoken introduction.
            </p>
          </Field>
          <Field className="md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor={careerTransitionId}>
                Career transition explanation
              </FieldLabel>
              {!careerTransition && transitionSummary ? (
                <Button
                  onClick={() =>
                    props.profileForm.setValue(
                      "answerBank.careerTransition",
                      transitionSummary,
                      copiedFieldOptions,
                    )
                  }
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  Use transition summary
                </Button>
              ) : null}
            </div>
            <ProfileTextarea
              id={careerTransitionId}
              rows={4}
              {...props.profileForm.register("answerBank.careerTransition")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={preferredEmailId}>
              Preferred application email
            </FieldLabel>
            <ProfileInput
              id={preferredEmailId}
              {...props.profileForm.register(
                "applicationIdentity.preferredEmail",
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={preferredPhoneId}>
              Preferred application phone
            </FieldLabel>
            <ProfileInput
              id={preferredPhoneId}
              {...props.profileForm.register(
                "applicationIdentity.preferredPhone",
              )}
            />
          </Field>
          <PreferredApplicationLinksField
            fieldId={preferredLinksId}
            profileForm={props.profileForm}
          />
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Reusable answers
              </p>
              <p className="text-sm text-foreground-soft">
                Save recurring screeners with labels and grounded answers.
              </p>
            </div>
            <Button
              disabled={props.isProfileSetupPending}
              onClick={() =>
                props.backgroundArrays.customAnswerArray.append({
                  id: `answer_${crypto.randomUUID().slice(0, 8)}`,
                  label: "",
                  question: "",
                  answer: "",
                  kind: "other",
                  roleFamilies: "",
                  proofEntryIds: "",
                })
              }
              type="button"
              variant="secondary"
            >
              Add answer
            </Button>
          </div>

          {props.backgroundArrays.customAnswerArray.fields.length > 0 ? (
            props.backgroundArrays.customAnswerArray.fields.map(
              (entry, index) => {
                const fieldIdPrefix = `answer-record-${entry.id}`;
                return (
                  <ProfileRecordCard
                    id={fieldIdPrefix}
                    key={entry.fieldKey}
                    summary={
                      props.profileForm.watch(
                        `answerBank.customAnswers.${index}.question`,
                      ) || "Save the exact question and your reusable answer."
                    }
                    title={
                      props.profileForm
                        .watch(`answerBank.customAnswers.${index}.label`)
                        ?.trim() || `Answer ${index + 1}`
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">
                        Reusable answer
                      </p>
                      <Button
                        disabled={props.isProfileSetupPending}
                        onClick={() =>
                          props.backgroundArrays.customAnswerArray.remove(index)
                        }
                        size="compact"
                        type="button"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
                      <Field>
                        <FieldLabel htmlFor={`${fieldIdPrefix}-label`}>
                          Label
                        </FieldLabel>
                        <ProfileInput
                          id={`${fieldIdPrefix}-label`}
                          {...props.profileForm.register(
                            `answerBank.customAnswers.${index}.label`,
                          )}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${fieldIdPrefix}-kind`}>
                          Kind
                        </FieldLabel>
                        <ProfileInput
                          id={`${fieldIdPrefix}-kind`}
                          {...props.profileForm.register(
                            `answerBank.customAnswers.${index}.kind`,
                          )}
                        />
                      </Field>
                      <Field className="md:col-span-2">
                        <FieldLabel htmlFor={`${fieldIdPrefix}-question`}>
                          Question
                        </FieldLabel>
                        <ProfileTextarea
                          id={`${fieldIdPrefix}-question`}
                          rows={4}
                          {...props.profileForm.register(
                            `answerBank.customAnswers.${index}.question`,
                          )}
                        />
                      </Field>
                      <Field className="md:col-span-2">
                        <FieldLabel htmlFor={`${fieldIdPrefix}-answer`}>
                          Answer
                        </FieldLabel>
                        <ProfileTextarea
                          id={`${fieldIdPrefix}-answer`}
                          rows={4}
                          {...props.profileForm.register(
                            `answerBank.customAnswers.${index}.answer`,
                          )}
                        />
                      </Field>
                    </div>
                  </ProfileRecordCard>
                );
              },
            )
          ) : (
            <EmptyState
              description="No custom answers yet. Add one when a recurring screener is worth saving."
              title="No reusable answers saved"
            />
          )}
        </div>

        {props.renderFooter({
          nextLabel: "Save and review readiness",
          onPrimary: () =>
            props.onSaveAndGoToStep(props.nextStep ?? "ready_check"),
        })}
      </CardContent>
    </Card>
  );
}

export function ProfileSetupReadyCheckStep(props: {
  applyStatus: "ready" | "needs_review" | "missing";
  blockingPendingItems: readonly ProfileSetupReviewItemDisplay[];
  canFinishSetup: boolean;
  discoveryStatus: "ready" | "needs_review" | "missing";
  getReadinessTone: (
    status: "ready" | "needs_review" | "missing",
  ) => "default" | "outline" | "destructive";
  narrativeStatus: "ready" | "needs_review" | "missing";
  onGoToStep: (step: ProfileSetupStep) => void;
  onSaveAndFinish: () => void;
  readinessBlockers?: readonly {
    label: string;
    reason: string;
    step: ProfileSetupStep;
  }[];
  renderFooter: RenderFooter;
}) {
  return (
    <Card className="rounded-(--radius-panel) border-border/40">
      <CardHeader className="gap-2 border-b border-border/30 pb-5">
        <CardTitle>Readiness check</CardTitle>
        <CardDescription>
          Finish setup only when the core profile is materially complete and
          blocking review items are resolved.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              label: "Discovery",
              status: props.discoveryStatus,
              description:
                props.discoveryStatus === "ready"
                  ? "Roles, constraints, and at least one valid job source are ready for targeted search."
                  : props.discoveryStatus === "needs_review"
                    ? "Review the pending targeting or source items listed below before relying on search results."
                    : "Add a target role, real constraints, and at least one valid job source.",
            },
            {
              label: "Resume quality",
              status: props.narrativeStatus,
              description:
                props.narrativeStatus === "ready"
                  ? "Narrative and proof exist for stronger summaries and bullets."
                  : props.narrativeStatus === "needs_review"
                    ? "There is useful background, but the story still needs sharpening."
                    : "The app still lacks enough story or proof to produce strong output.",
            },
            {
              label: "Apply readiness",
              status: props.applyStatus,
              description:
                props.applyStatus === "ready"
                  ? "Contact, eligibility, and reusable answers are ready for application defaults."
                  : props.applyStatus === "needs_review"
                    ? "Review the pending contact, eligibility, or reusable-answer items listed below."
                    : "Add a contact method and the application defaults you want forms to reuse.",
            },
          ].map((card) => (
            <div
              className="rounded-(--radius-field) border border-border/30 bg-background/60 p-4"
              key={card.label}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {card.label}
                </p>
                <Badge variant={props.getReadinessTone(card.status)}>
                  {formatStatusLabel(card.status)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground-soft">
                {card.description}
              </p>
            </div>
          ))}
        </div>

        {(props.readinessBlockers?.length ?? 0) > 0 ? (
          <div className="grid gap-3 rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Finish these before continuing
              </p>
              <p className="mt-1 text-sm leading-6 text-foreground-soft">
                Each action opens the setup step that owns the missing
                information.
              </p>
            </div>
            <div className="grid gap-2">
              {(props.readinessBlockers ?? []).map((blocker) => (
                <div
                  className="flex flex-col gap-3 rounded-(--radius-field) border border-border/35 bg-background/75 p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={`${blocker.step}-${blocker.label}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {blocker.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-foreground-soft">
                      {blocker.reason}
                    </p>
                  </div>
                  <Button
                    onClick={() => props.onGoToStep(blocker.step)}
                    size="compact"
                    type="button"
                    variant="secondary"
                  >
                    Open {formatStatusLabel(blocker.step)}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {props.blockingPendingItems.length > 0 ? (
          <div className="grid gap-3 rounded-(--radius-field) border border-destructive/30 bg-destructive/5 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {props.blockingPendingItems.length} item
                {props.blockingPendingItems.length === 1 ? "" : "s"} to resolve
              </p>
              <p className="mt-1 text-sm leading-6 text-foreground-soft">
                Each item below links to the exact setup step where it can be
                confirmed or corrected.
              </p>
            </div>
            <div className="grid gap-2">
              {props.blockingPendingItems.map((item) => (
                <div
                  className="flex flex-col gap-3 rounded-(--radius-field) border border-border/35 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-foreground-soft">
                      {item.reason}
                    </p>
                  </div>
                  <Button
                    onClick={() => props.onGoToStep(item.step)}
                    size="compact"
                    type="button"
                    variant="secondary"
                  >
                    Review {formatStatusLabel(item.step)}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {props.renderFooter({
          primaryDisabled: !props.canFinishSetup,
          primaryLabel: props.canFinishSetup
            ? "Finish setup and open Profile"
            : "Complete the items above to finish",
          onPrimary: props.canFinishSetup ? props.onSaveAndFinish : null,
        })}
      </CardContent>
    </Card>
  );
}
