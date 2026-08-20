import { useEffect, useMemo, useState } from "react";
import type {
  ApplicationCrmExportFormat,
  ApplicationCrmMutationInput,
  ApplicationCrmSettings,
  ApplicationCrmStage,
  ApplicationRecord,
  CandidateAsset,
  RecordOutcomeInput,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";

import {
  APPLICATION_CRM_STAGE_LABELS,
  APPLICATION_CRM_STAGE_ORDER,
  applicationCrmDataForView,
} from "./applications-crm-model";
import { ApplicationsOutcomeRecorder } from "./applications-outcome-recorder";

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toIso(localValue: string): string | null {
  if (!localValue) return null;
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const fieldClassName =
  "h-10 w-full rounded-(--radius-field) border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40";
const areaClassName =
  "min-h-20 w-full resize-y rounded-(--radius-field) border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function ApplicationsCrmDetail(props: {
  record: ApplicationRecord;
  settings: ApplicationCrmSettings;
  onMutate: (command: ApplicationCrmMutationInput) => Promise<void>;
  onExport: (
    format: ApplicationCrmExportFormat,
    recordId: string,
  ) => Promise<void>;
  onRecordOutcome?: (input: RecordOutcomeInput) => Promise<void>;
  isRecordOutcomePending?: boolean;
  outcomeCampaignId?: string | null;
  outcomeResumeStrategyId?: string | null;
}) {
  const crm = applicationCrmDataForView(props.record);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState(crm.tags.join(", "));
  const [note, setNote] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [interviewTitle, setInterviewTitle] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [offerAmount, setOfferAmount] = useState(
    crm.compensation.offerBase?.amount.toString() ?? "",
  );
  const [offerCurrency, setOfferCurrency] = useState(
    crm.compensation.offerBase?.currency ?? "EUR",
  );
  const [offerPeriod, setOfferPeriod] = useState<"hour" | "month" | "year">(
    crm.compensation.offerBase?.period ?? "year",
  );
  const [offerDeadline, setOfferDeadline] = useState("");
  const [candidateAssets, setCandidateAssets] = useState<
    readonly CandidateAsset[]
  >([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");

  useEffect(() => {
    setTags(crm.tags.join(", "));
    setOfferAmount(crm.compensation.offerBase?.amount.toString() ?? "");
    setOfferCurrency(crm.compensation.offerBase?.currency ?? "EUR");
    setOfferPeriod(crm.compensation.offerBase?.period ?? "year");
    setError(null);
  }, [props.record.id, crm.revision]);

  useEffect(() => {
    let active = true;
    void window.unemployed.jobFinder
      .listCandidateAssets({ includeDeleted: false })
      .then((result) => {
        if (!active) return;
        setCandidateAssets(
          result.assets.filter(
            (asset) =>
              asset.deletedAt === null &&
              asset.consentScope === "job_application_attachment",
          ),
        );
      })
      .catch(() => {
        if (active) setCandidateAssets([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const customStagesById = useMemo(
    () =>
      new Map(props.settings.customStages.map((stage) => [stage.id, stage])),
    [props.settings.customStages],
  );

  async function mutate(mutation: ApplicationCrmMutationInput["mutation"]) {
    setPending(true);
    setError(null);
    try {
      await props.onMutate({
        applicationRecordId: props.record.id,
        expectedRevision: crm.revision,
        mutation,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The application update could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-4"
      aria-labelledby="application-crm-details-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-mono-xs">Application tracker</p>
          <h3
            className="mt-1 font-semibold text-foreground"
            id="application-crm-details-heading"
          >
            Track what happens next
          </h3>
          <p className="mt-1 text-sm leading-6 text-foreground-soft">
            These are local notes and manual stages. Nothing here contacts the
            employer or submits an application.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={pending}
            onClick={() => void props.onExport("csv", props.record.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Export CSV
          </Button>
          <Button
            disabled={pending}
            onClick={() => void props.onExport("json", props.record.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Export JSON
          </Button>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-(--radius-field) border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          Stage
          <select
            className={fieldClassName}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value;
              const customId = value.startsWith("custom:")
                ? value.slice(7)
                : null;
              const custom = customId ? customStagesById.get(customId) : null;
              void mutate({
                type: "set_stage",
                stage: custom?.baseStage ?? (value as ApplicationCrmStage),
                customStageId: custom?.id ?? null,
                note: null,
              });
            }}
            value={
              crm.customStageId ? `custom:${crm.customStageId}` : crm.stage
            }
          >
            {APPLICATION_CRM_STAGE_ORDER.map((stage) => (
              <option key={stage} value={stage}>
                {APPLICATION_CRM_STAGE_LABELS[stage]}
              </option>
            ))}
            {props.settings.customStages.length > 0 ? (
              <optgroup label="Custom stages">
                {props.settings.customStages.map((stage) => (
                  <option key={stage.id} value={`custom:${stage.id}`}>
                    {stage.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate({
              type: "set_tags",
              tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            });
          }}
        >
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="application-crm-tags"
          >
            Tags
          </label>
          <div className="flex gap-2">
            <input
              className={fieldClassName}
              disabled={pending}
              id="application-crm-tags"
              onChange={(event) => setTags(event.target.value)}
              placeholder="priority, remote, referral"
              value={tags}
            />
            <Button
              disabled={pending}
              size="sm"
              type="submit"
              variant="secondary"
            >
              Save
            </Button>
          </div>
        </form>
      </div>

      <details
        className="group rounded-(--radius-field) border border-(--surface-panel-border) p-3"
        open
      >
        <summary className="cursor-pointer font-semibold text-foreground">
          Notes and follow-ups
        </summary>
        <div className="mt-3 grid gap-4">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const body = note.trim();
              if (!body) return;
              void mutate({
                type: "add_note",
                note: {
                  id: createId("note"),
                  body,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              }).then(() => setNote(""));
            }}
          >
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="application-crm-note"
            >
              Add a note
            </label>
            <textarea
              className={areaClassName}
              disabled={pending}
              id="application-crm-note"
              maxLength={4_000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record recruiter feedback or what you want to remember."
              value={note}
            />
            <Button
              className="justify-self-start"
              disabled={pending || !note.trim()}
              size="sm"
              type="submit"
              variant="secondary"
            >
              Add note
            </Button>
          </form>
          {crm.notes.length > 0 ? (
            <ul className="grid gap-2" aria-label="Application notes">
              {[...crm.notes].reverse().map((entry) => (
                <li
                  className="flex items-start justify-between gap-3 rounded-(--radius-field) bg-background/45 p-3 text-sm"
                  key={entry.id}
                >
                  <div>
                    <p className="whitespace-pre-wrap text-foreground">
                      {entry.body}
                    </p>
                    <time
                      className="mt-1 block text-xs text-muted-foreground"
                      dateTime={entry.updatedAt}
                    >
                      {new Date(entry.updatedAt).toLocaleString()}
                    </time>
                  </div>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      void mutate({ type: "remove_note", noteId: entry.id })
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.75fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const dueAt = toIso(reminderAt);
              if (!reminderTitle.trim() || !dueAt) return;
              const now = new Date().toISOString();
              void mutate({
                type: "upsert_reminder",
                reminder: {
                  id: createId("reminder"),
                  title: reminderTitle.trim(),
                  dueAt,
                  status: "pending",
                  note: null,
                  createdAt: now,
                  updatedAt: now,
                  completedAt: null,
                },
              }).then(() => {
                setReminderTitle("");
                setReminderAt("");
              });
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Reminder
              <input
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setReminderTitle(event.target.value)}
                placeholder="Follow up"
                value={reminderTitle}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Due
              <input
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setReminderAt(event.target.value)}
                type="datetime-local"
                value={reminderAt}
              />
            </label>
            <Button
              disabled={pending || !reminderTitle.trim() || !reminderAt}
              size="sm"
              type="submit"
              variant="secondary"
            >
              Add
            </Button>
          </form>
        </div>
      </details>

      <details className="rounded-(--radius-field) border border-(--surface-panel-border) p-3">
        <summary className="cursor-pointer font-semibold text-foreground">
          Interviews and contacts
        </summary>
        <div className="mt-3 grid gap-4">
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.75fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const startsAt = toIso(interviewAt);
              if (!interviewTitle.trim() || !startsAt) return;
              const now = new Date().toISOString();
              void mutate({
                type: "upsert_interview",
                interview: {
                  id: createId("interview"),
                  title: interviewTitle.trim(),
                  startsAt,
                  endsAt: null,
                  timeZone:
                    Intl.DateTimeFormat().resolvedOptions().timeZone || null,
                  location: null,
                  meetingUrl: null,
                  contactIds: [],
                  status: "scheduled",
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                },
              }).then(() => {
                setInterviewTitle("");
                setInterviewAt("");
              });
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Interview
              <input
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setInterviewTitle(event.target.value)}
                placeholder="Technical interview"
                value={interviewTitle}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Starts
              <input
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setInterviewAt(event.target.value)}
                type="datetime-local"
                value={interviewAt}
              />
            </label>
            <Button
              disabled={pending || !interviewTitle.trim() || !interviewAt}
              size="sm"
              type="submit"
              variant="secondary"
            >
              Add
            </Button>
          </form>
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!contactName.trim()) return;
              const now = new Date().toISOString();
              void mutate({
                type: "upsert_contact",
                contact: {
                  id: createId("contact"),
                  name: contactName.trim(),
                  role: null,
                  email: contactEmail.trim() || null,
                  phone: null,
                  profileUrl: null,
                  notes: null,
                  createdAt: now,
                  updatedAt: now,
                },
              }).then(() => {
                setContactName("");
                setContactEmail("");
              });
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Contact name
              <input
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setContactName(event.target.value)}
                value={contactName}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Email
              <input
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setContactEmail(event.target.value)}
                type="email"
                value={contactEmail}
              />
            </label>
            <Button
              disabled={pending || !contactName.trim()}
              size="sm"
              type="submit"
              variant="secondary"
            >
              Add
            </Button>
          </form>
        </div>
      </details>

      <details className="rounded-(--radius-field) border border-(--surface-panel-border) p-3">
        <summary className="cursor-pointer font-semibold text-foreground">
          Offer and attachments
        </summary>
        <div className="mt-3 grid gap-4">
          <form
            className="grid gap-2 sm:grid-cols-4 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const amount = Number(offerAmount);
              if (!Number.isFinite(amount) || amount < 0) return;
              void mutate({
                type: "set_compensation",
                compensation: {
                  ...crm.compensation,
                  offerBase: {
                    amount,
                    currency: offerCurrency.trim().toUpperCase(),
                    period: offerPeriod,
                  },
                  offerDeadlineAt: toIso(offerDeadline),
                  offerStatus: "active",
                },
              });
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Offer amount
              <input
                className={fieldClassName}
                disabled={pending}
                min="0"
                onChange={(event) => setOfferAmount(event.target.value)}
                type="number"
                value={offerAmount}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Currency
              <input
                className={fieldClassName}
                disabled={pending}
                maxLength={3}
                onChange={(event) => setOfferCurrency(event.target.value)}
                value={offerCurrency}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Period
              <select
                className={fieldClassName}
                disabled={pending}
                onChange={(event) =>
                  setOfferPeriod(event.target.value as typeof offerPeriod)
                }
                value={offerPeriod}
              >
                <option value="hour">Hourly</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Deadline
              <input
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setOfferDeadline(event.target.value)}
                type="datetime-local"
                value={offerDeadline}
              />
            </label>
            <Button
              className="sm:col-span-4 sm:justify-self-start"
              disabled={pending || !offerAmount}
              size="sm"
              type="submit"
              variant="secondary"
            >
              Save offer
            </Button>
          </form>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Approved local asset
              <select
                className={fieldClassName}
                disabled={pending}
                onChange={(event) => setSelectedAssetId(event.target.value)}
                value={selectedAssetId}
              >
                <option value="">Choose an asset</option>
                {candidateAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.originalName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={pending || !selectedAssetId}
              onClick={() => {
                const asset = candidateAssets.find(
                  (candidate) => candidate.id === selectedAssetId,
                );
                if (!asset) return;
                void mutate({
                  type: "add_attachment",
                  attachment: {
                    id: createId("attachment"),
                    candidateAssetId: asset.id,
                    label: asset.originalName,
                    kind: [
                      "resume",
                      "cover_letter",
                      "portfolio",
                      "work_sample",
                    ].includes(asset.kind)
                      ? (asset.kind as
                          | "resume"
                          | "cover_letter"
                          | "portfolio"
                          | "work_sample")
                      : "other",
                    addedAt: new Date().toISOString(),
                  },
                }).then(() => setSelectedAssetId(""));
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Link asset
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Only metadata is linked here. Candidate Asset consent, retention,
            integrity checks, and stored bytes remain owned by Documents &amp;
            assets.
          </p>
        </div>
      </details>

      <details className="rounded-(--radius-field) border border-(--surface-panel-border) p-3">
        <summary className="cursor-pointer font-semibold text-foreground">
          Timeline ({crm.events.length})
        </summary>
        {crm.events.length > 0 ? (
          <ol className="mt-3 grid gap-2">
            {[...crm.events].reverse().map((event) => (
              <li
                className="border-l-2 border-(--surface-panel-border) pl-3"
                key={event.id}
              >
                <strong className="text-sm text-foreground">
                  {event.title}
                </strong>
                {event.detail ? (
                  <p className="mt-1 text-sm text-foreground-soft">
                    {event.detail}
                  </p>
                ) : null}
                <time
                  className="mt-1 block text-xs text-muted-foreground"
                  dateTime={event.at}
                >
                  {new Date(event.at).toLocaleString()} ·{" "}
                  {event.source.replaceAll("_", " ")}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No tracker activity has been recorded yet. Existing safe-apply history
            remains available below.
          </p>
        )}
      </details>

      {props.onRecordOutcome ? (
        <ApplicationsOutcomeRecorder
          isPending={props.isRecordOutcomePending ?? false}
          jobId={props.record.jobId}
          campaignId={props.outcomeCampaignId ?? null}
          applicationRecordId={props.record.id}
          onRecordOutcome={props.onRecordOutcome}
          resumeStrategyId={props.outcomeResumeStrategyId ?? null}
        />
      ) : null}
    </section>
  );
}
