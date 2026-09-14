import { useCallback, useEffect, useState } from "react";
import { CreateApplicationAuthorityEnvelopeInputSchema } from "@unemployed/contracts";
import type {
  ApplicationAuthorityEnvelope,
  CreateApplicationAuthorityEnvelopeInput,
} from "@unemployed/contracts";

import type { ApplyMode } from "../../lib/apply-mode-contracts-stub";
import { SettingsApplyModeSection } from "./settings-apply-mode-section";

/**
 * The one switch (ADR 0022) on top of the ADR 0012 envelope. Off means the
 * active envelope, if any, is prepare-only; on means one autonomous-submit
 * envelope scoped to every shortlisted job with the product's own limits.
 * Nobody edits the envelope by hand any more; this component owns it.
 */
const ENVELOPE_LIFETIME_DAYS = 30;
const DEFAULT_DAILY_CAP = 20;
const DEFAULT_RUN_CAP = 10;

function modeOf(envelope: ApplicationAuthorityEnvelope | null): ApplyMode {
  return envelope?.status === "active" && envelope.mode === "autonomous_submit"
    ? "apply_for_me"
    : "fill_only";
}

function envelopeInputFor(
  mode: ApplyMode,
  dailyCap: number,
): CreateApplicationAuthorityEnvelopeInput {
  const expires = new Date();
  expires.setDate(expires.getDate() + ENVELOPE_LIFETIME_DAYS);
  return {
    allowedOrigins: [],
    allowedResumeSha256: [],
    expiresAt: expires.toISOString(),
    intermediateMutationsAuthorized: mode === "apply_for_me",
    maxApplicationsPerLocalDay: dailyCap,
    maxApplicationsPerRun: DEFAULT_RUN_CAP,
    mode: mode === "apply_for_me" ? "autonomous_submit" : "prepare_only",
    preApprovedAttestationKinds: [],
    salaryDisclosure: "pause_for_user",
    scope: { campaignId: null, jobIds: [] },
  };
}

export function SettingsApplyModeWired(props: { headingId: string }) {
  const [envelope, setEnvelope] = useState<ApplicationAuthorityEnvelope | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const api = () =>
    typeof window === "undefined" ? null : (window.unemployed?.jobFinder ?? null);

  const load = useCallback(async () => {
    const jobFinder = api();
    if (!jobFinder) return;
    try {
      const list = await jobFinder.listApplicationAuthorityEnvelopes();
      const active = list.find((item) => item.status === "active") ?? null;
      setEnvelope(
        active
          ? await jobFinder.getApplicationAuthorityEnvelope({ id: active.id })
          : null,
      );
    } catch {
      setEnvelope(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (input: { mode: ApplyMode; maxApplicationsPerLocalDay: number }) => {
    const jobFinder = api();
    if (!jobFinder) return;
    const parsed = CreateApplicationAuthorityEnvelopeInputSchema.safeParse(
      envelopeInputFor(input.mode, input.maxApplicationsPerLocalDay || DEFAULT_DAILY_CAP),
    );
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "This setting could not be saved.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result =
        envelope?.status === "active"
          ? await jobFinder.updateApplicationAuthorityEnvelope({
              ...parsed.data,
              expectedRevision: envelope.revision,
              id: envelope.id,
            })
          : await jobFinder.createApplicationAuthorityEnvelope(parsed.data);
      if (result.status === "applied") {
        setEnvelope(result.envelope);
        setMessage(
          input.mode === "apply_for_me"
            ? "Saved. Job Finder will fill in and send applications for you."
            : "Saved. Job Finder will fill applications in and leave them for you to send.",
        );
      } else {
        setMessage("This setting changed elsewhere; it was reloaded. Try again.");
        await load();
      }
    } catch {
      setMessage("This setting could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-2">
      <SettingsApplyModeSection
        headingId={props.headingId}
        isSaving={saving}
        maxApplicationsPerLocalDay={envelope?.maxApplicationsPerLocalDay ?? DEFAULT_DAILY_CAP}
        mode={modeOf(envelope)}
        onSave={(input) => void save(input)}
      />
      {message ? (
        <p className="text-(length:--text-small) leading-6 text-foreground-soft" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
