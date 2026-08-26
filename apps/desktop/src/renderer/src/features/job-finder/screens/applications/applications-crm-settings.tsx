import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type {
  ApplicationCrmSettings,
  ApplicationCrmStageDefinition,
} from "@unemployed/contracts";
import { ApplicationCrmSettingsSchema } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";

import {
  APPLICATION_CRM_STAGE_LABELS,
  APPLICATION_CRM_STAGE_ORDER,
} from "./applications-crm-model";

const colors: readonly ApplicationCrmStageDefinition["color"][] = [
  "neutral",
  "blue",
  "cyan",
  "green",
  "amber",
  "red",
  "violet",
];

const fieldClassName =
  "h-10 w-full min-w-0 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-3 text-sm text-foreground outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]";

function createCustomStage(position: number): ApplicationCrmStageDefinition {
  return {
    id: `custom_stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: "New stage",
    baseStage: "reviewing",
    color: "neutral",
    position,
    isTerminal: false,
  };
}

export function ApplicationsCrmSettingsEditor(props: {
  settings: ApplicationCrmSettings;
  /** Reports staged tracker edits so a stale shell save retry is retired. */
  onDraftEdited?: () => void;
  onSave: (settings: ApplicationCrmSettings) => Promise<void>;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    control,
    formState: { isDirty, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<ApplicationCrmSettings>({
    defaultValues: props.settings,
    mode: "onSubmit",
    reValidateMode: "onBlur",
  });
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: "customStages",
  });

  useEffect(() => reset(props.settings), [props.settings, reset]);

  // Observe staged tracker edits without owning the form: every value change
  // while the form is dirty reports upward so an exact-request shell retry
  // captured before the edit can never resubmit stale CRM settings.
  const watchedValues = useWatch({ control });
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isDirty) {
      props.onDraftEdited?.();
    }
  }, [isDirty, props.onDraftEdited, watchedValues]);

  return (
    <form
      className="grid min-w-0 gap-5 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-5"
      onSubmit={(event) => {
        void handleSubmit(async (values) => {
          setSaveError(null);
          try {
            const parsed = ApplicationCrmSettingsSchema.parse({
              ...values,
              customStages: values.customStages.map((stage, position) => ({
                ...stage,
                position,
              })),
            });
            await props.onSave(parsed);
            reset(parsed);
          } catch (error) {
            setSaveError(
              error instanceof Error
                ? error.message
                : "The application tracker settings could not be saved.",
            );
          }
        })(event);
      }}
    >
      <div className="min-w-0">
        <p className="label-mono-xs">Application tracker</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          Follow-ups and custom stages
        </h2>
        <p className="mt-1 text-sm leading-6 text-foreground-soft">
          These settings only update your local tracker. They never contact an
          employer or submit an application.
        </p>
      </div>

      <fieldset className="grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end">
        <label className="flex min-w-0 items-start gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            {...register("noResponseAutomation.enabled")}
          />
          <span className="min-w-0">
            <strong className="block">Mark applications for follow-up</strong>
            <span className="mt-1 block text-foreground-soft">
              Move applied jobs to No response when the employer has not
              replied.
            </span>
          </span>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
          After days
          <input
            className={fieldClassName}
            max={365}
            min={1}
            type="number"
            {...register("noResponseAutomation.afterDays", {
              valueAsNumber: true,
            })}
          />
        </label>
      </fieldset>

      <section
        className="grid min-w-0 gap-3"
        aria-labelledby="custom-stages-heading"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="font-semibold text-foreground"
              id="custom-stages-heading"
            >
              Custom stages
            </h3>
            <p className="mt-1 text-sm text-foreground-soft">
              Add the wording your process uses while keeping a standard stage
              underneath for reporting.
            </p>
          </div>
          <Button
            onClick={() => append(createCustomStage(fields.length))}
            size="sm"
            type="button"
            variant="secondary"
          >
            Add stage
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) p-4 text-sm text-muted-foreground">
            No custom stages. The standard application stages will be used.
          </p>
        ) : (
          <ol className="grid min-w-0 gap-3">
            {fields.map((field, index) => (
              <li
                className="grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-3 lg:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_8rem_auto] lg:items-end"
                key={field.id}
              >
                <input
                  type="hidden"
                  {...register(`customStages.${index}.id`)}
                />
                <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
                  Name
                  <input
                    className={fieldClassName}
                    required
                    {...register(`customStages.${index}.label`)}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
                  Reports as
                  <select
                    className={fieldClassName}
                    {...register(`customStages.${index}.baseStage`)}
                  >
                    {APPLICATION_CRM_STAGE_ORDER.map((stage) => (
                      <option key={stage} value={stage}>
                        {APPLICATION_CRM_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
                  Color
                  <select
                    className={fieldClassName}
                    {...register(`customStages.${index}.color`)}
                  >
                    {colors.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex min-w-0 flex-wrap gap-1">
                  <Button
                    aria-label={`Move ${field.label} up`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Up
                  </Button>
                  <Button
                    aria-label={`Move ${field.label} down`}
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Down
                  </Button>
                  <Button
                    aria-label={`Remove ${field.label}`}
                    onClick={() => remove(index)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
                <label className="flex min-w-0 items-center gap-2 text-sm text-foreground lg:col-span-4">
                  <input
                    type="checkbox"
                    {...register(`customStages.${index}.isTerminal`)}
                  />
                  This stage ends the application process
                </label>
                <input
                  type="hidden"
                  value={index}
                  {...register(`customStages.${index}.position`, {
                    valueAsNumber: true,
                  })}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {saveError ? (
        <p className="text-sm text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-wrap justify-end gap-3">
        <Button disabled={!isDirty || isSubmitting} type="submit">
          {isSubmitting ? "Saving…" : "Save tracker settings"}
        </Button>
      </div>
    </form>
  );
}
