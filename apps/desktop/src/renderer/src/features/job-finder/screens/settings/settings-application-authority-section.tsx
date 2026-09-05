import { CreateApplicationAuthorityEnvelopeInputSchema } from "@unemployed/contracts";
import type {
  ApplicationAuthorityReadiness,
  ApplicationAuthorityEnvelope,
  ApplicationAuthorityEnvelopeMutationResult,
  CreateApplicationAuthorityEnvelopeInput,
  UpdateApplicationAuthorityEnvelopeInput,
} from "@unemployed/contracts";
import { useEffect, useId, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";
import { ToggleField } from "@renderer/features/job-finder/components/toggle-field";
import { getJobFinderDateInputLocale } from "../../lib/job-finder-date-input-locale";

const jobFinderDateInputLocale = getJobFinderDateInputLocale();

type AuthorityApi = Window["unemployed"]["jobFinder"];

type AuthorityDraft = {
  allowedOrigins: string;
  allowedResumeSha256: string;
  campaignId: string;
  expiresAt: string;
  jobIds: string;
  maxApplicationsPerLocalDay: string;
  maxApplicationsPerRun: string;
  intermediateMutationsAuthorized: boolean;
};

const emptyDraft: AuthorityDraft = {
  allowedOrigins: "",
  allowedResumeSha256: "",
  campaignId: "",
  expiresAt: "",
  jobIds: "",
  maxApplicationsPerLocalDay: "",
  maxApplicationsPerRun: "",
  intermediateMutationsAuthorized: false,
};

type LoadState =
  | { message: string | null; status: "idle" | "loading" | "ready" }
  | { message: string; status: "failed" };

const initialLoadState: LoadState = { message: null, status: "idle" };

function splitLines(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toDraft(envelope: ApplicationAuthorityEnvelope): AuthorityDraft {
  return {
    allowedOrigins: envelope.allowedOrigins.join("\n"),
    allowedResumeSha256: envelope.allowedResumeSha256.join("\n"),
    campaignId: envelope.scope.campaignId ?? "",
    expiresAt: envelope.expiresAt
      ? applicationAuthorityIsoToLocalDateTimeInput(envelope.expiresAt)
      : "",
    jobIds: envelope.scope.jobIds.join("\n"),
    maxApplicationsPerLocalDay: String(envelope.maxApplicationsPerLocalDay),
    maxApplicationsPerRun: String(envelope.maxApplicationsPerRun),
    intermediateMutationsAuthorized: envelope.intermediateMutationsAuthorized,
  };
}

export function applicationAuthorityIsoToLocalDateTimeInput(
  value: string,
): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : value.trim();
}

function buildPolicyInput(
  draft: AuthorityDraft,
): CreateApplicationAuthorityEnvelopeInput {
  return {
    allowedOrigins: splitLines(draft.allowedOrigins),
    allowedResumeSha256: splitLines(draft.allowedResumeSha256),
    expiresAt: toIsoDateTime(draft.expiresAt),
    intermediateMutationsAuthorized: draft.intermediateMutationsAuthorized,
    maxApplicationsPerLocalDay: Number(draft.maxApplicationsPerLocalDay),
    maxApplicationsPerRun: Number(draft.maxApplicationsPerRun),
    mode: "prepare_only",
    scope: {
      campaignId: draft.campaignId.trim() || null,
      jobIds: splitLines(draft.jobIds),
    },
  };
}

function mutationMessage(
  result: ApplicationAuthorityEnvelopeMutationResult,
  action: "saved" | "revoked",
): string {
  if (result.status === "applied") {
    return action === "revoked"
      ? "Prepare-only authority revoked. No application can be submitted from this envelope."
      : result.envelope.intermediateMutationsAuthorized
        ? "Prepare-only authority saved with bounded ATS autosave. Final submission remains blocked."
        : "Prepare-only authority saved. Bounded ATS autosave and final submission remain blocked.";
  }
  if (result.status === "stale") {
    return "This envelope changed elsewhere. The current revision was reloaded; review it before trying again.";
  }
  return "This authority envelope no longer exists. The list was refreshed.";
}

function isPrepareOnlyEnvelope(
  envelope: ApplicationAuthorityEnvelope | null,
): envelope is ApplicationAuthorityEnvelope {
  return envelope?.mode === "prepare_only";
}

/**
 * Human labels for the stored answer identifiers. A job seeker reading
 * Settings must never be shown `self_intro`.
 */
const reusableAnswerKindLabels: Record<string, string> = {
  work_authorization: "Work authorization",
  visa_sponsorship: "Visa sponsorship",
  relocation: "Relocation",
  travel: "Travel",
  notice_period: "Notice period",
  availability: "Availability",
  salary_expectation: "Salary expectations",
  self_intro: "Short self-introduction",
  career_transition: "Career change",
  other: "Other questions",
};

export function formatReusableAnswerKind(kind: string): string {
  return (
    reusableAnswerKindLabels[kind] ??
    kind
      .replaceAll("_", " ")
      .replace(/^./u, (character) => character.toUpperCase())
  );
}

export function SettingsApplicationAuthoritySection({
  headingId: providedHeadingId,
}: {
  /**
   * Lets the Settings screen name this region by the heading the user can
   * actually see. Every other section's region name differs from its visible
   * heading ("App & device" vs "Appearance"), but this one repeated itself
   * word for word as a hidden h2 above an identical visible h3.
   */
  headingId?: string;
} = {}) {
  const generatedHeadingId = useId();
  const headingId = providedHeadingId ?? generatedHeadingId;
  const originsId = useId();
  const resumeDigestsId = useId();
  const campaignId = useId();
  const jobIdsId = useId();
  const maxRunId = useId();
  const maxDayId = useId();
  const expiresAtId = useId();
  const [envelopes, setEnvelopes] = useState<ApplicationAuthorityEnvelope[]>(
    [],
  );
  const [selectedEnvelope, setSelectedEnvelope] =
    useState<ApplicationAuthorityEnvelope | null>(null);
  const [draft, setDraft] = useState<AuthorityDraft>(emptyDraft);
  const [loadState, setLoadState] = useState<LoadState>(initialLoadState);
  const [actionState, setActionState] = useState<LoadState>(initialLoadState);
  const [revocationPending, setRevocationPending] = useState(false);
  const [readiness, setReadiness] =
    useState<ApplicationAuthorityReadiness | null>(null);
  const [approvalConfirming, setApprovalConfirming] = useState(false);

  const authorityApi = (): AuthorityApi | null => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.unemployed?.jobFinder ?? null;
  };

  const applyEnvelope = (envelope: ApplicationAuthorityEnvelope | null) => {
    setSelectedEnvelope(envelope);
    setDraft(envelope ? toDraft(envelope) : emptyDraft);
    setRevocationPending(false);
  };

  const loadEnvelopes = async () => {
    const api = authorityApi();
    if (!api) {
      setLoadState({
        message: "Authority management is unavailable in this app session.",
        status: "failed",
      });
      return;
    }
    setLoadState({ message: null, status: "loading" });
    try {
      const result = await api.listApplicationAuthorityEnvelopes();
      const nextReadiness = await api.getApplicationAuthorityReadiness();
      setEnvelopes(result);
      setReadiness(nextReadiness);
      const active = result.find((item) => item.status === "active") ?? null;
      if (!active) {
        applyEnvelope(null);
      } else {
        const current = await api.getApplicationAuthorityEnvelope({
          id: active.id,
        });
        applyEnvelope(current);
      }
      setLoadState({ message: null, status: "ready" });
    } catch {
      setLoadState({
        message: "Could not load application authority. Try again.",
        status: "failed",
      });
    }
  };

  const approveCurrentAnswers = async () => {
    const api = authorityApi();
    if (!api || !readiness || readiness.currentAnswers.entryCount === 0) {
      return;
    }
    setApprovalConfirming(false);
    setActionState({ message: null, status: "loading" });
    try {
      const result = await api.approveCurrentApplicationAnswers({
        expectedProfileRevision: readiness.currentAnswers.sourceProfileRevision,
        confirmedCurrentAnswers: true,
      });
      setReadiness(result.readiness);
      setActionState({
        message:
          result.status === "stale"
            ? "The profile changed while approval was in progress. Reload readiness and review the current answers."
            : result.status === "blocked"
              ? "The current reusable answers are not eligible for approval. Review them in Profile."
              : result.status === "duplicate"
                ? "These reusable answers already match the approved snapshot. Final submission remains unavailable."
                : "Current reusable answers approved as a new immutable snapshot. Final submission remains unavailable.",
        status:
          result.status === "stale" || result.status === "blocked"
            ? "failed"
            : "ready",
      });
    } catch {
      setActionState({
        message:
          "Could not approve the current answers. Reload readiness and try again.",
        status: "failed",
      });
    }
  };

  useEffect(() => {
    void loadEnvelopes();
  }, []);

  const selectEnvelope = async (id: string) => {
    const api = authorityApi();
    if (!api) {
      return;
    }
    try {
      const envelope = await api.getApplicationAuthorityEnvelope({ id });
      applyEnvelope(envelope);
      setActionState({ message: null, status: "idle" });
    } catch {
      setActionState({
        message: "Could not inspect that authority revision. Try again.",
        status: "failed",
      });
    }
  };

  const setDraftValue = <Key extends keyof AuthorityDraft>(
    key: Key,
    value: AuthorityDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setActionState({ message: null, status: "idle" });
  };

  const saveEnvelope = async () => {
    const api = authorityApi();
    if (!api) {
      return;
    }
    const parsed = CreateApplicationAuthorityEnvelopeInputSchema.safeParse(
      buildPolicyInput(draft),
    );
    if (!parsed.success) {
      setActionState({
        message:
          parsed.error.issues[0]?.message ?? "Review the authority fields.",
        status: "failed",
      });
      return;
    }
    setActionState({ message: null, status: "loading" });
    try {
      const result =
        selectedEnvelope?.status === "active"
          ? await api.updateApplicationAuthorityEnvelope({
              ...parsed.data,
              expectedRevision: selectedEnvelope.revision,
              id: selectedEnvelope.id,
            } satisfies UpdateApplicationAuthorityEnvelopeInput)
          : await api.createApplicationAuthorityEnvelope(
              parsed.data satisfies CreateApplicationAuthorityEnvelopeInput,
            );
      setActionState({
        message: mutationMessage(result, "saved"),
        status: result.status === "applied" ? "ready" : "failed",
      });
      if (result.status === "applied") {
        setEnvelopes((current) => {
          const withoutOld = current.filter(
            (item) => item.id !== result.envelope.id,
          );
          return [result.envelope, ...withoutOld];
        });
        applyEnvelope(result.envelope);
      } else if (result.status === "stale") {
        applyEnvelope(result.current);
        await loadEnvelopes();
      } else {
        applyEnvelope(null);
        await loadEnvelopes();
      }
    } catch {
      setActionState({
        message:
          "The authority change was not saved. Review the fields and retry.",
        status: "failed",
      });
    }
  };

  const revokeEnvelope = async () => {
    if (!selectedEnvelope || selectedEnvelope.status !== "active") {
      return;
    }
    const api = authorityApi();
    if (!api) {
      return;
    }
    setActionState({ message: null, status: "loading" });
    try {
      const result = await api.revokeApplicationAuthorityEnvelope({
        expectedRevision: selectedEnvelope.revision,
        id: selectedEnvelope.id,
      });
      setActionState({
        message: mutationMessage(result, "revoked"),
        status: result.status === "applied" ? "ready" : "failed",
      });
      await loadEnvelopes();
    } catch {
      setActionState({
        message: "The authority envelope was not revoked. Try again.",
        status: "failed",
      });
    }
  };

  const activePrepareOnly =
    isPrepareOnlyEnvelope(selectedEnvelope) &&
    selectedEnvelope.status === "active";
  const activeSelected = selectedEnvelope?.status === "active";
  const selectedNonPrepare =
    selectedEnvelope !== null && !isPrepareOnlyEnvelope(selectedEnvelope);
  const canSave =
    draft.allowedOrigins.trim().length > 0 &&
    draft.maxApplicationsPerRun.trim().length > 0 &&
    draft.maxApplicationsPerLocalDay.trim().length > 0 &&
    (!draft.intermediateMutationsAuthorized ||
      (readiness?.answerApprovalStatus === "current" &&
        splitLines(draft.allowedOrigins).length === 1 &&
        splitLines(draft.allowedResumeSha256).length === 1 &&
        draft.campaignId.trim().length === 0 &&
        splitLines(draft.jobIds).length === 1 &&
        draft.expiresAt.trim().length > 0));

  return (
    <section className="surface-panel-shell grid min-w-0 content-start gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[72ch] flex-1 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3
              className="min-w-0 font-semibold text-(--text-headline)"
              id={headingId}
            >
              What Job Finder may do on application sites
            </h3>
          </div>
          <p className="text-(length:--text-description) leading-5 text-foreground-soft">
            Decide how much of an application Job Finder may fill in for you.
            Today it can open an application and fill supported fields for your
            review. It never sends an application, creates an account, enters a
            password, or answers a security check.
          </p>
        </div>
        <Button
          disabled={loadState.status === "loading"}
          onClick={() => void loadEnvelopes()}
          type="button"
          variant="secondary"
        >
          {loadState.status === "loading" ? "Refreshing" : "Refresh"}
        </Button>
      </div>

      {/* One mode is available, so it is stated rather than offered as a
          choice; two permanently disabled cards took two thirds of the row to
          advertise things nobody can pick. */}
      <div
        className="grid min-w-0 gap-2"
        aria-label="Application automation modes"
      >
        <article
          aria-label="Prepare only mode"
          className="grid gap-2 rounded-(--radius-field) border border-primary/70 bg-primary/8 p-3.5"
        >
          <span className="font-semibold text-foreground">
            Job Finder fills applications for your review
          </span>
          <span className="text-sm leading-5 text-foreground-soft">
            It opens the application, fills what it can, and stops. You read it
            and send it yourself.
          </span>
        </article>
        <p className="text-sm leading-5 text-foreground-muted">
          Sending applications for you — with or without a confirmation step —
          is not available in this version.
        </p>
      </div>

      <article
        aria-label="Answers Job Finder can reuse"
        className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-3.5"
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="grid min-w-0 gap-1">
            <h4 className="font-semibold text-(--text-headline)">
              Answers Job Finder can reuse
            </h4>
            <p className="text-sm leading-5 text-foreground-soft">
              These are the answers you saved in Profile — work authorization,
              notice period, and similar. Review them in Profile, then approve
              them here so Job Finder reuses exactly what you checked.
            </p>
            <a
              className="w-fit text-sm font-semibold text-primary underline-offset-4 hover:underline"
              href="/job-finder/profile"
            >
              Review answers in Profile
            </a>
          </div>
          {readiness ? (
            <span className="label-mono-xs">
              {readiness.answerApprovalStatus === "current"
                ? "Current"
                : readiness.answerApprovalStatus === "stale"
                  ? "Needs review"
                  : "Not approved"}
            </span>
          ) : null}
        </div>
        {readiness ? (
          <>
            <dl className="m-0 grid min-w-0 gap-3 sm:grid-cols-3">
              <div className="grid min-w-0 gap-1">
                <dt className="label-mono-xs">Reusable answers</dt>
                <dd className="m-0 text-sm text-foreground">
                  {/* "kind" is a schema word, and the two counts said almost
                      the same thing. One count, in English. */}
                  {readiness.currentAnswers.entryCount === 1
                    ? "1 answer saved"
                    : `${readiness.currentAnswers.entryCount} answers saved`}
                </dd>
              </div>
              <div className="grid min-w-0 gap-1">
                <dt className="label-mono-xs">Questions covered</dt>
                <dd className="m-0 break-words text-sm text-foreground">
                  {/* Never the stored identifier: a job seeker cannot act on
                      "self_intro". */}
                  {readiness.currentAnswers.kinds.length > 0
                    ? readiness.currentAnswers.kinds
                        .map((kind) => formatReusableAnswerKind(kind))
                        .join(", ")
                    : "None yet"}
                </dd>
              </div>
              <div className="grid min-w-0 gap-1">
                <dt className="label-mono-xs">Approved for reuse</dt>
                <dd className="m-0 break-words text-sm text-foreground">
                  {readiness.approvedSnapshot
                    ? `Approved (version ${readiness.approvedSnapshot.revision})`
                    : "Not approved yet"}
                </dd>
              </div>
            </dl>
            {readiness.blockers.length > 0 ? (
              <ul className="m-0 grid gap-1 pl-5 text-sm leading-5 text-foreground-soft">
                {readiness.blockers.map((blocker) => (
                  <li key={blocker.code}>
                    {blocker.code === "no_reusable_answers"
                      ? "Add reusable answers in Profile."
                      : blocker.code === "required_answer_missing"
                        ? `Answer these in Profile first: ${readiness.currentAnswers.missingRequiredKinds
                            .map((kind) => formatReusableAnswerKind(kind))
                            .join(", ")}.`
                        : blocker.code === "no_approved_answer_snapshot"
                          ? "Read your reusable answers in Profile, then approve them here."
                          : blocker.code === "approved_answer_snapshot_stale"
                            ? "The profile changed since approval; review and approve again."
                            : "Sending applications automatically is not available in this version."}
                  </li>
                ))}
              </ul>
            ) : null}
            {readiness.currentAnswers.entryCount > 0 &&
            readiness.answerApprovalStatus !== "current" ? (
              approvalConfirming ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm text-foreground-soft">
                    Confirm that you reviewed the current reusable answers in
                    Profile and want to save them as an immutable snapshot.
                  </span>
                  <Button
                    disabled={actionState.status === "loading"}
                    onClick={() => void approveCurrentAnswers()}
                    type="button"
                  >
                    Confirm and approve
                  </Button>
                  <Button
                    onClick={() => setApprovalConfirming(false)}
                    type="button"
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  // A 1060px bar is not a button.
                  className="w-fit max-w-full"
                  onClick={() => setApprovalConfirming(true)}
                  type="button"
                  variant="secondary"
                >
                  Approve current answers
                </Button>
              )
            ) : null}
          </>
        ) : (
          <p className="text-sm text-foreground-soft">Loading readiness…</p>
        )}
      </article>

      {loadState.status === "failed" ? (
        <p className="text-sm leading-5 text-destructive" role="alert">
          {loadState.message}
        </p>
      ) : null}
      {envelopes.length > 0 ? (
        <div
          className="grid min-w-0 gap-2"
          aria-label="Saved authority envelopes"
          role="list"
        >
          {envelopes.map((envelope) => (
            <button
              className={`flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-(--radius-field) border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 ${selectedEnvelope?.id === envelope.id ? "border-primary/70 bg-primary/8" : "border-(--surface-panel-border) hover:border-primary/35"}`}
              key={envelope.id}
              onClick={() => void selectEnvelope(envelope.id)}
              type="button"
            >
              <span className="min-w-0 truncate">
                {envelope.mode.replaceAll("_", " ")}
              </span>
              <span className="shrink-0 text-xs text-foreground-soft">
                {envelope.status} · revision {envelope.revision}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) px-3.5 py-3 text-sm leading-5 text-foreground-soft">
          Nothing saved yet. Job Finder still only prepares applications for
          your review; saving a permission below records what you allowed and
          does not let it send anything.
        </p>
      )}

      {selectedNonPrepare ? (
        <p
          className="rounded-(--radius-field) border border-warning/40 bg-warning/8 px-3.5 py-3 text-sm leading-5 text-foreground-soft"
          role="status"
        >
          This saved permission asks for something this version cannot do. You
          can read it here, but it cannot be edited or switched on.
        </p>
      ) : null}

      <div className="grid min-w-0 gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) p-3.5">
        <div className="grid gap-1">
          <h4 className="font-semibold text-foreground">
            Let Job Finder fill applications on one site
          </h4>
          <p className="text-sm leading-5 text-foreground-soft">
            Job Finder assumes nothing: the site, the resume file, the job, and
            the limits below are all entered by you. It still never sends the
            application.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={originsId}>
              Allowed origins (required)
            </FieldLabel>
            <Textarea
              aria-describedby={`${originsId}-hint`}
              id={originsId}
              onChange={(event) =>
                setDraftValue("allowedOrigins", event.target.value)
              }
              placeholder="https://jobs.example.com"
              value={draft.allowedOrigins}
            />
            <p
              className="text-xs leading-4 text-foreground-soft"
              id={`${originsId}-hint`}
            >
              One HTTP(S) origin per line. Bounded autosave requires exactly
              one. Paths, credentials, and query strings are rejected.
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor={resumeDigestsId}>
              Allowed resume SHA-256 digests
            </FieldLabel>
            <Textarea
              aria-describedby={`${resumeDigestsId}-hint`}
              id={resumeDigestsId}
              onChange={(event) =>
                setDraftValue("allowedResumeSha256", event.target.value)
              }
              placeholder="One lowercase 64-character digest per line"
              value={draft.allowedResumeSha256}
            />
            <p
              className="text-xs leading-4 text-foreground-soft"
              id={`${resumeDigestsId}-hint`}
            >
              Bounded autosave requires exactly one approved export digest,
              matched again at execution time.
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor={campaignId}>
              Campaign scope (autosave requires blank)
            </FieldLabel>
            <Input
              id={campaignId}
              onChange={(event) =>
                setDraftValue("campaignId", event.target.value)
              }
              value={draft.campaignId}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={jobIdsId}>
              Job IDs (autosave requires exactly one)
            </FieldLabel>
            <Textarea
              id={jobIdsId}
              onChange={(event) => setDraftValue("jobIds", event.target.value)}
              placeholder="One job ID per line"
              value={draft.jobIds}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={maxRunId}>
              Maximum applications per run
            </FieldLabel>
            <Input
              id={maxRunId}
              min="1"
              onChange={(event) =>
                setDraftValue("maxApplicationsPerRun", event.target.value)
              }
              type="number"
              value={draft.maxApplicationsPerRun}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={maxDayId}>
              Maximum applications per local day
            </FieldLabel>
            <Input
              id={maxDayId}
              min="1"
              onChange={(event) =>
                setDraftValue("maxApplicationsPerLocalDay", event.target.value)
              }
              type="number"
              value={draft.maxApplicationsPerLocalDay}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={expiresAtId}>Expires at</FieldLabel>
            <Input
              id={expiresAtId}
              onChange={(event) =>
                setDraftValue("expiresAt", event.target.value)
              }
              lang={jobFinderDateInputLocale}
              type="datetime-local"
              value={draft.expiresAt}
            />
          </Field>
        </div>
        <ToggleField
          checked={draft.intermediateMutationsAuthorized}
          description="Authorize only bounded, same-origin ATS draft/autosave requests immediately caused by filling an approved field. Final submit requests, account creation, credentials, CAPTCHA, MFA, beacons, WebSockets, and ambiguous writes stay blocked."
          disabled={readiness?.answerApprovalStatus !== "current"}
          hint={
            readiness?.answerApprovalStatus === "current"
              ? "Saving is the second explicit action. Job Finder will still require exactly one job, resume digest, and origin plus the approved-answer snapshot and future expiry at execution time."
              : "Approve the current reusable answers above before this capability can be selected."
          }
          label="Allow bounded ATS autosave during preparation"
          onCheckedChange={(checked) =>
            setDraftValue("intermediateMutationsAuthorized", checked)
          }
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            disabled={
              !canSave ||
              loadState.status === "loading" ||
              actionState.status === "loading" ||
              selectedNonPrepare
            }
            onClick={() => void saveEnvelope()}
            pending={actionState.status === "loading"}
            type="button"
            variant="primary"
          >
            {selectedNonPrepare
              ? "Editing unavailable"
              : activePrepareOnly
                ? "Save authority revision"
                : "Create prepare-only authority"}
          </Button>
          {activeSelected ? (
            <Button
              disabled={actionState.status === "loading"}
              onClick={() => setRevocationPending(true)}
              type="button"
              variant="secondary"
            >
              Revoke authority
            </Button>
          ) : null}
          {actionState.status !== "idle" && actionState.message ? (
            <p
              className={
                actionState.status === "failed"
                  ? "text-sm leading-5 text-destructive"
                  : "text-sm leading-5 text-foreground-soft"
              }
              role="status"
            >
              {actionState.message}
            </p>
          ) : null}
        </div>
        {activeSelected && revocationPending ? (
          <div
            className="grid gap-2 rounded-(--radius-field) border border-warning/45 bg-warning/8 px-3 py-3"
            role="alert"
          >
            <p className="text-sm leading-5 text-foreground">
              Revoke {selectedEnvelope.mode.replaceAll("_", " ")} revision{" "}
              {selectedEnvelope.revision}? This immediately prevents this
              envelope from authorizing future work and cannot be undone.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={actionState.status === "loading"}
                onClick={() => void revokeEnvelope()}
                type="button"
                variant="secondary"
              >
                Confirm revoke authority
              </Button>
              <Button
                disabled={actionState.status === "loading"}
                onClick={() => setRevocationPending(false)}
                type="button"
                variant="ghost"
              >
                Keep authority
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
