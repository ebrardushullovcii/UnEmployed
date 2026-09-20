import { useEffect, useId, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Input } from "@renderer/components/ui/input";
import {
  APPLY_MODE_OPTIONS,
  ChoiceCards,
} from "@renderer/features/job-finder/components/choice-cards";
import type { ApplicationAutomationMode } from "@unemployed/contracts";

/**
 * The three useful application defaults. The task-specific permission is
 * assembled when an application starts; Settings stores only the person's
 * ordinary choice, never an empty authority envelope.
 */
export function SettingsApplyModeSection(props: {
  headingId?: string;
  /** The saved mode; the switch is off until the person turns it on. */
  mode: ApplicationAutomationMode;
  /** The existing daily cap on applications, kept from ADR 0012. */
  maxApplicationsPerLocalDay: number;
  onSave: (input: {
    mode: ApplicationAutomationMode;
    maxApplicationsPerLocalDay: number;
  }) => void | Promise<void>;
  isSaving?: boolean;
}) {
  const { headingId, isSaving = false, mode, onSave } = props;
  const dailyCapId = useId();
  const [selectedMode, setSelectedMode] = useState(mode);
  const [dailyCap, setDailyCap] = useState(
    String(props.maxApplicationsPerLocalDay),
  );
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMode(mode);
  }, [mode]);
  useEffect(() => {
    setDailyCap(String(props.maxApplicationsPerLocalDay));
  }, [props.maxApplicationsPerLocalDay]);

  const parsedCap = Number.parseInt(dailyCap, 10);
  const capIsValid = Number.isFinite(parsedCap) && parsedCap > 0;
  const isDirty =
    selectedMode !== mode || parsedCap !== props.maxApplicationsPerLocalDay;

  return (
    <section className="surface-panel-shell grid min-w-0 content-start gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="grid min-w-0 max-w-[72ch] gap-1">
        <h3
          className="min-w-0 font-semibold text-(--text-headline)"
          id={headingId}
        >
          Applying
        </h3>
      </div>

      <ChoiceCards
        aria-label="Default application mode"
        disabled={isSaving}
        onChange={(value) => {
          setSelectedMode(value);
          setFailure(null);
        }}
        options={APPLY_MODE_OPTIONS}
        value={selectedMode}
      />

      <p className="text-sm leading-5 text-foreground-soft">
        Sign-in, security checks, and account creation pause for you. Job Finder
        never stores a password you provide for one task.
      </p>

      <Field>
        <FieldLabel htmlFor={dailyCapId}>
          Most applications in one day
        </FieldLabel>
        <Input
          id={dailyCapId}
          min="1"
          onChange={(event) => {
            setDailyCap(event.target.value);
            setFailure(null);
          }}
          type="number"
          value={dailyCap}
        />
      </Field>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          className="w-fit max-w-full"
          disabled={!capIsValid || !isDirty || isSaving}
          onClick={() => {
            setFailure(null);
            void Promise.resolve(
              onSave({
                mode: selectedMode,
                maxApplicationsPerLocalDay: parsedCap,
              }),
            ).catch(() => {
              setFailure("That did not save. Try again.");
            });
          }}
          pending={isSaving}
          type="button"
          variant="primary"
        >
          Save
        </Button>
        {failure ? (
          <p className="text-sm leading-5 text-destructive" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </section>
  );
}
