import { workModeValues } from "@unemployed/contracts";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import { FieldLabel } from "@renderer/components/ui/field";
import { CheckboxField } from "../checkbox-field";
import { FormSelect } from "../form-select";
import type { SearchPreferencesEditorValues } from "../../lib/profile-editor";
import {
  formatStatusLabel,
  joinListInput,
  parseListInput,
} from "../../lib/job-finder-utils";
import {
  ProfileInput,
  profileSelectTriggerClassName,
} from "./profile-form-primitives";
import { ProfileListEditor } from "./profile-list-editor";
import { ProfileSectionHeader } from "./profile-section-header";

export function ProfilePreferencesTargetingSection(props: {
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>;
}) {
  const { control, register, setValue, watch } = props.preferencesForm;
  const tailoringModeId = useId();
  const minimumSalaryId = useId();
  const targetSalaryId = useId();
  const compensationIntervalId = useId();
  const salaryCurrencyId = useId();
  const listFieldOptions = {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  } as const;

  return (
    <section className="grid content-start gap-(--gap-card)">
      <ProfileSectionHeader
        eyebrow="Targeting"
        title="Job preferences"
        description="Use this section to specify the roles, locations, and companies to focus on."
      />

      <article
        className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4"
        id="profile-target-roles"
      >
        <h3
          className="scroll-mt-4 text-[0.98rem] font-semibold text-(--text-headline) outline-none"
          id="profile-target-roles-heading"
          tabIndex={-1}
        >
          Target roles
        </h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <ProfileListEditor
            inputId="profile-setup-field-search-preferences-target-roles"
            label="Target roles"
            onChange={(values) =>
              setValue("targetRoles", joinListInput(values), listFieldOptions)
            }
            placeholder="Add a target role"
            values={parseListInput(watch("targetRoles"))}
          />
          <ProfileListEditor
            label="Related role areas"
            onChange={(values) =>
              setValue("jobFamilies", joinListInput(values), listFieldOptions)
            }
            placeholder="Add a related role area"
            values={parseListInput(watch("jobFamilies"))}
          />
          <ProfileListEditor
            label="Seniority levels"
            onChange={(values) =>
              setValue(
                "seniorityLevels",
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add a seniority level"
            values={parseListInput(watch("seniorityLevels"))}
          />
          <ProfileListEditor
            label="Employment types"
            onChange={(values) =>
              setValue(
                "employmentTypes",
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add an employment type"
            values={parseListInput(watch("employmentTypes"))}
          />
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">
          Location preferences
        </h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <ProfileListEditor
            inputId="profile-setup-field-search-preferences-locations"
            label="Preferred locations"
            onChange={(values) =>
              setValue("locations", joinListInput(values), listFieldOptions)
            }
            placeholder="Add a preferred location"
            values={parseListInput(watch("locations"))}
          />
          <ProfileListEditor
            label="Excluded locations"
            onChange={(values) =>
              setValue(
                "excludedLocations",
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add an excluded location"
            values={parseListInput(watch("excludedLocations"))}
          />
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">
          Company preferences
        </h3>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <ProfileListEditor
            label="Industries"
            onChange={(values) =>
              setValue(
                "targetIndustries",
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add an industry"
            values={parseListInput(watch("targetIndustries"))}
          />
          <ProfileListEditor
            label="Company stages or sizes"
            onChange={(values) =>
              setValue(
                "targetCompanyStages",
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add a company stage or size"
            values={parseListInput(watch("targetCompanyStages"))}
          />
          <ProfileListEditor
            label="Preferred companies"
            onChange={(values) =>
              setValue(
                "companyWhitelist",
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add a preferred company"
            values={parseListInput(watch("companyWhitelist"))}
          />
          <ProfileListEditor
            label="Companies to exclude"
            onChange={(values) =>
              setValue(
                "companyBlacklist",
                joinListInput(values),
                listFieldOptions,
              )
            }
            placeholder="Add a company to exclude"
            values={parseListInput(watch("companyBlacklist"))}
          />
        </div>
      </article>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <div className="grid gap-1">
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">
            Work mode and compensation
          </h3>
          <p className="text-sm leading-relaxed text-foreground-muted">
            These values guide job matching. The minimum is your consideration
            floor, not the salary answer sent with an application. Save that
            separately under{" "}
            <a
              className="font-medium text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground"
              href="#profile-expected-salary-answer-field"
              onClick={(event) => {
                const salaryAnswerField = document.getElementById(
                  "profile-expected-salary-answer",
                );
                if (!salaryAnswerField) {
                  return;
                }

                event.preventDefault();
                salaryAnswerField.scrollIntoView({ block: "center" });
                salaryAnswerField.focus({ preventScroll: true });
              }}
            >
              Reusable screener answers
            </a>
            .
          </p>
        </div>
        <div className="grid gap-(--gap-content) md:grid-cols-2 md:items-start">
          <fieldset
            className="grid gap-(--gap-field) md:col-span-2"
            id="profile-setup-field-search-preferences-work-modes"
          >
            <legend className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
              Work modes
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {workModeValues.map((workMode) => (
                <Controller
                  key={workMode}
                  control={control}
                  name="workModes"
                  render={({ field }) => (
                    <CheckboxField
                      checked={field.value.includes(workMode)}
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
          </fieldset>

          <Controller
            control={control}
            name="tailoringMode"
            render={({ field }) => (
              <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
                <FieldLabel htmlFor={tailoringModeId}>
                  Default resume tailoring style
                </FieldLabel>
                <FormSelect
                  onValueChange={field.onChange}
                  options={[
                    { label: "Light touch", value: "conservative" },
                    { label: "Balanced", value: "balanced" },
                    { label: "Strong rewrite", value: "aggressive" },
                  ]}
                  placeholder="Select a style"
                  triggerClassName={profileSelectTriggerClassName}
                  triggerId={tailoringModeId}
                  value={field.value}
                />
              </div>
            )}
          />

          <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
            <FieldLabel htmlFor={minimumSalaryId}>
              Minimum worth considering
            </FieldLabel>
            <ProfileInput
              id={minimumSalaryId}
              min="0"
              step="1"
              type="number"
              {...register("minimumSalaryUsd")}
            />
            <p className="text-xs leading-relaxed text-foreground-muted">
              Used as a matching floor. Strong-fit roles can still be reviewed
              deliberately.
            </p>
          </div>
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
            <FieldLabel htmlFor={targetSalaryId}>
              Search range maximum (optional)
            </FieldLabel>
            <ProfileInput
              id={targetSalaryId}
              min="0"
              step="1"
              type="number"
              {...register("targetSalaryUsd")}
            />
            <p className="text-xs leading-relaxed text-foreground-muted">
              Leave blank when higher compensation is always welcome.
            </p>
          </div>
          <Controller
            control={control}
            name="compensationInterval"
            render={({ field }) => (
              <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
                <FieldLabel htmlFor={compensationIntervalId}>
                  Compensation interval
                </FieldLabel>
                <FormSelect
                  onValueChange={field.onChange}
                  options={[
                    { label: "Hourly", value: "hour" },
                    { label: "Daily", value: "day" },
                    { label: "Weekly", value: "week" },
                    { label: "Monthly", value: "month" },
                    { label: "Yearly", value: "year" },
                  ]}
                  triggerClassName={profileSelectTriggerClassName}
                  triggerId={compensationIntervalId}
                  value={field.value}
                />
              </div>
            )}
          />
          <div className="grid min-w-0 content-start gap-(--gap-field) h-full">
            <FieldLabel htmlFor={salaryCurrencyId}>
              Compensation currency
            </FieldLabel>
            <ProfileInput
              id={salaryCurrencyId}
              maxLength={3}
              placeholder="USD or EUR"
              {...register("salaryCurrency")}
            />
            {!watch("salaryCurrency").trim() &&
            (watch("minimumSalaryUsd").trim() ||
              watch("targetSalaryUsd").trim()) ? (
              <p className="text-xs leading-5 text-(--warning-text)">
                Add a three-letter currency before relying on compensation
                matching.
              </p>
            ) : null}
          </div>
        </div>
      </article>

      <article className="surface-card-tint grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <div>
          <h3 className="text-[0.98rem] font-semibold text-(--text-headline)">
            How broadly should Job Finder collect?
          </h3>
          <p className="mt-1 text-[0.9rem] leading-6 text-foreground-soft">
            By default, Job Finder keeps jobs visible and explains where they
            miss your preferences. Turn on strict collection only when your
            target roles, preferred locations, and work modes are true
            deal-breakers.
          </p>
        </div>
        <Controller
          control={control}
          name="collectOnlyHardCriteriaMatches"
          render={({ field }) => (
            <CheckboxField
              checked={field.value}
              label="Collect only jobs that meet my hard role, location, and work-mode criteria"
              onCheckedChange={field.onChange}
            />
          )}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Strict collection can reduce application volume and may hide adjacent
          roles. Explicitly excluded companies and locations are always skipped.
        </p>
      </article>
    </section>
  );
}
