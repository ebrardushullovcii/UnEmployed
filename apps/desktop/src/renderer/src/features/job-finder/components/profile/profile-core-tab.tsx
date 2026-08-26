import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import type { ProfileEditorValues } from "../../lib/profile-editor";
import { joinListInput, parseListInput } from "../../lib/job-finder-utils";
import { ProfileOptionalSection } from "./profile-optional-section";
import { ProfileInput, ProfileTextarea } from "./profile-form-primitives";
import { ProfileListEditor } from "./profile-list-editor";
import { ProfileSectionHeader } from "./profile-section-header";

interface ProfileCoreTabProps {
  profileForm: UseFormReturn<ProfileEditorValues>;
}

function buildProfileCoreFieldId(field: string) {
  return `profile-core-field-${field}`;
}

export function ProfileCoreTab({ profileForm }: ProfileCoreTabProps) {
  const { register, setValue, watch } = profileForm;
  const listFieldOptions = {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  } as const;
  const careerThemesId = useId();
  const nextChapterSummaryId = useId();
  const leadershipSummaryId = useId();
  const careerTransitionSummaryId = useId();

  return (
    <div className="grid gap-6">
      <section className="grid content-start gap-(--gap-card)">
        <ProfileSectionHeader
          eyebrow="Basics"
          title="Personal details"
          description="Start with the basics employers expect first: name, contact info, location, and key links."
        />

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">
            Name and headline
          </p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("first-name")}>
                First name
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("first-name")}
                {...register("identity.firstName")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("last-name")}>
                Last name
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("last-name")}
                {...register("identity.lastName")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("preferred-name")}>
                Preferred name
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("preferred-name")}
                placeholder="Use this if it differs from your first name"
                {...register("identity.preferredDisplayName")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("headline")}>
                Headline
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("headline")}
                {...register("identity.headline")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("years-experience")}>
                Years of experience
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("years-experience")}
                min="0"
                step="1"
                type="number"
                {...register("identity.yearsExperience")}
              />
            </Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">
            Contact
          </p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("email")}>
                Email
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("email")}
                {...register("identity.email")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("phone")}>
                Phone
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("phone")}
                {...register("identity.phone")}
              />
            </Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">
            Location
          </p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("city")}>
                City
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("city")}
                {...register("identity.currentCity")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("region")}>
                State or region
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("region")}
                {...register("identity.currentRegion")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("country")}>
                Country
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("country")}
                {...register("identity.currentCountry")}
              />
            </Field>
            <Field>
              <FieldLabel
                htmlFor={buildProfileCoreFieldId("displayed-location")}
              >
                Displayed location
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("displayed-location")}
                placeholder="Shown on generated resumes"
                {...register("identity.currentLocation")}
              />
            </Field>
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">
            Links
          </p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("linkedin-url")}>
                LinkedIn URL
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("linkedin-url")}
                {...register("identity.linkedinUrl")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("website")}>
                Website
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("website")}
                {...register("identity.portfolioUrl")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("github-url")}>
                GitHub URL
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("github-url")}
                {...register("identity.githubUrl")}
              />
            </Field>
          </div>
        </article>

        <ProfileOptionalSection
          description="Keep the main profile focused on the details Job Finder uses most often. Open this only when an application needs the extras."
          title="More personal details"
        >
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("middle-name")}>
                Middle name
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("middle-name")}
                {...register("identity.middleName")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("time-zone")}>
                Time zone
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("time-zone")}
                {...register("identity.timeZone")}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor={buildProfileCoreFieldId("extra-website")}>
                Extra website
              </FieldLabel>
              <ProfileInput
                id={buildProfileCoreFieldId("extra-website")}
                {...register("identity.personalWebsiteUrl")}
              />
            </Field>
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
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">
            Positioning
          </p>
          <div className="grid gap-(--gap-content)">
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("short-summary")}>
                Short summary
              </FieldLabel>
              <ProfileTextarea
                id={buildProfileCoreFieldId("short-summary")}
                className="min-h-(--textarea-compact) max-h-(--textarea-compact)"
                rows={3}
                {...register("summary.shortValueProposition")}
              />
            </Field>
            <Field>
              <FieldLabel
                htmlFor={buildProfileCoreFieldId("professional-summary")}
              >
                Professional summary
              </FieldLabel>
              <ProfileTextarea
                id={buildProfileCoreFieldId("professional-summary")}
                className="min-h-(--textarea-default) max-h-(--textarea-default)"
                rows={5}
                {...register("summary.fullSummary")}
              />
            </Field>
            <Field>
              <FieldLabel
                htmlFor={buildProfileCoreFieldId("professional-story")}
              >
                Professional story
              </FieldLabel>
              <ProfileTextarea
                id={buildProfileCoreFieldId("professional-story")}
                className="min-h-(--textarea-default) max-h-(--textarea-default)"
                rows={5}
                {...register("narrative.professionalStory")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("strengths")}>
                Strengths
              </FieldLabel>
              <ProfileTextarea
                id={buildProfileCoreFieldId("strengths")}
                className="min-h-(--textarea-tall) max-h-(--textarea-tall)"
                rows={4}
                {...register("summary.strengths")}
              />
            </Field>
          </div>
        </article>

        <ProfileOptionalSection
          description="Add the extra context that helps with targeted rewriting, without keeping the main summary path overloaded."
          title="More context for tailoring"
        >
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={careerThemesId}>Career themes</FieldLabel>
              <ProfileTextarea
                id={careerThemesId}
                className="min-h-(--textarea-tall) max-h-(--textarea-tall)"
                rows={4}
                {...register("summary.careerThemes")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={nextChapterSummaryId}>
                Next chapter
              </FieldLabel>
              <ProfileTextarea
                id={nextChapterSummaryId}
                className="min-h-(--textarea-compact) max-h-(--textarea-compact)"
                rows={4}
                {...register("narrative.nextChapterSummary")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={leadershipSummaryId}>
                Leadership experience
              </FieldLabel>
              <ProfileTextarea
                id={leadershipSummaryId}
                className="min-h-(--textarea-compact) max-h-(--textarea-compact)"
                rows={4}
                {...register("summary.leadershipSummary")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={careerTransitionSummaryId}>
                Career transition context
              </FieldLabel>
              <ProfileTextarea
                id={careerTransitionSummaryId}
                className="min-h-(--textarea-compact) max-h-(--textarea-compact)"
                rows={4}
                {...register("narrative.careerTransitionSummary")}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor={buildProfileCoreFieldId("industry-focus")}>
                Industry focus
              </FieldLabel>
              <ProfileTextarea
                id={buildProfileCoreFieldId("industry-focus")}
                className="min-h-(--textarea-compact) max-h-(--textarea-compact)"
                rows={4}
                {...register("summary.domainFocusSummary")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={buildProfileCoreFieldId("differentiators")}>
                Differentiators
              </FieldLabel>
              <ProfileTextarea
                id={buildProfileCoreFieldId("differentiators")}
                className="min-h-(--textarea-compact) max-h-(--textarea-compact)"
                rows={4}
                {...register("narrative.differentiators")}
              />
            </Field>
            <Field>
              <FieldLabel
                htmlFor={buildProfileCoreFieldId("motivation-themes")}
              >
                Motivation themes
              </FieldLabel>
              <ProfileTextarea
                id={buildProfileCoreFieldId("motivation-themes")}
                className="min-h-(--textarea-compact) max-h-(--textarea-compact)"
                rows={4}
                {...register("narrative.motivationThemes")}
              />
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
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">
            Role-facing skills
          </p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <ProfileListEditor
              label="Main skills"
              onChange={(values) =>
                setValue(
                  "profileSkills",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Add a skill"
              values={parseListInput(watch("profileSkills"))}
            />
            <ProfileListEditor
              label="Skills to emphasize for target roles"
              onChange={(values) =>
                setValue(
                  "skillGroups.highlightedSkills",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Add a highlighted skill"
              values={parseListInput(watch("skillGroups.highlightedSkills"))}
            />
          </div>
        </article>

        <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
          <p className="text-[0.98rem] font-semibold text-(--text-headline)">
            Grouped skills
          </p>
          <div className="grid gap-(--gap-content) md:grid-cols-2">
            <ProfileListEditor
              label="Core strengths"
              onChange={(values) =>
                setValue(
                  "skillGroups.coreSkills",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Add a core strength"
              values={parseListInput(watch("skillGroups.coreSkills"))}
            />
            <ProfileListEditor
              label="Tools and platforms"
              onChange={(values) =>
                setValue(
                  "skillGroups.tools",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Add a tool"
              values={parseListInput(watch("skillGroups.tools"))}
            />
            <ProfileListEditor
              label="Languages and frameworks"
              onChange={(values) =>
                setValue(
                  "skillGroups.languagesAndFrameworks",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Add a language or framework"
              values={parseListInput(
                watch("skillGroups.languagesAndFrameworks"),
              )}
            />
            <ProfileListEditor
              label="Soft skills"
              onChange={(values) =>
                setValue(
                  "skillGroups.softSkills",
                  joinListInput(values),
                  listFieldOptions,
                )
              }
              placeholder="Add a soft skill"
              values={parseListInput(watch("skillGroups.softSkills"))}
            />
          </div>
        </article>
      </section>
    </div>
  );
}
