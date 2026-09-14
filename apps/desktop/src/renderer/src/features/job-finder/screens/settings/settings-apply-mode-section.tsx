import { useEffect, useId, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Input } from "@renderer/components/ui/input";
import { ToggleField } from "@renderer/features/job-finder/components/toggle-field";
import type { ApplyMode } from "../../lib/apply-mode-contracts-stub";

/**
 * One switch, two sentences, one number (ADR 0022).
 *
 * This replaced a screen of authority envelopes, approval snapshots, resume
 * fingerprints, per-site permissions and a revoke confirmation. None of that
 * was a decision a job seeker wanted to make; the only decision is whether
 * Job Finder sends the application or leaves it for them to send. The
 * envelope underneath is still created and updated (ADR 0012) — by this
 * switch, never by hand.
 */
export function SettingsApplyModeSection(props: {
  headingId?: string;
  /** The saved mode; the switch is off until the person turns it on. */
  mode: ApplyMode;
  /** The existing daily cap on applications, kept from ADR 0012. */
  maxApplicationsPerLocalDay: number;
  onSave: (input: {
    mode: ApplyMode;
    maxApplicationsPerLocalDay: number;
  }) => void | Promise<void>;
  isSaving?: boolean;
}) {
  const { headingId, isSaving = false, mode, onSave } = props;
  const dailyCapId = useId();
  const [sendsApplications, setSendsApplications] = useState(
    mode === "apply_for_me",
  );
  const [dailyCap, setDailyCap] = useState(
    String(props.maxApplicationsPerLocalDay),
  );
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setSendsApplications(mode === "apply_for_me");
  }, [mode]);
  useEffect(() => {
    setDailyCap(String(props.maxApplicationsPerLocalDay));
  }, [props.maxApplicationsPerLocalDay]);

  const parsedCap = Number.parseInt(dailyCap, 10);
  const capIsValid = Number.isFinite(parsedCap) && parsedCap > 0;
  const nextMode: ApplyMode = sendsApplications ? "apply_for_me" : "fill_only";
  const isDirty =
    nextMode !== mode || parsedCap !== props.maxApplicationsPerLocalDay;

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

      <ToggleField
        checked={sendsApplications}
        description="Job Finder never creates an account, enters a password, or answers a security check. Those always stay yours."
        label="Let Job Finder send applications for me"
        onCheckedChange={(checked) => {
          setSendsApplications(checked);
          setFailure(null);
        }}
      />

      {/* Both halves are always on screen, so the person can read what they
          are switching away from as well as what they are switching to. */}
      <dl
        className="m-0 grid min-w-0 gap-2"
        data-testid="apply-mode-explanations"
      >
        <div className="grid min-w-0 gap-0.5">
          <dt className="text-sm font-semibold text-foreground">
            Off — Fill it in, I send it
          </dt>
          <dd className="m-0 text-sm leading-5 text-foreground-soft">
            Job Finder fills the form and leaves the browser open; you click
            Apply.
          </dd>
        </div>
        <div className="grid min-w-0 gap-0.5">
          <dt className="text-sm font-semibold text-foreground">
            On — Apply for me
          </dt>
          <dd className="m-0 text-sm leading-5 text-foreground-soft">
            Job Finder fills and sends; it stops for anything it cannot answer
            honestly.
          </dd>
        </div>
      </dl>

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
                mode: nextMode,
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
