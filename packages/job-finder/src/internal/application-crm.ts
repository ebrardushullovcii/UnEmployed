import type {
  ApplicationCrmCalendarEntry,
  ApplicationCrmData,
  ApplicationCrmDuplicateHint,
  ApplicationCrmExportInput,
  ApplicationCrmExportResult,
  ApplicationCrmMutation,
  ApplicationCrmMutationInput,
  ApplicationCrmRecommendedAction,
  ApplicationCrmSettings,
  ApplicationCrmStage,
  ApplicationRecord,
} from "@unemployed/contracts";
import type { ApplicationRecordBatchCommitResult } from "@unemployed/db";
import {
  ApplicationCrmDataSchema,
  ApplicationCrmBulkStageMutationInputSchema,
  ApplicationCrmExportInputSchema,
  ApplicationCrmMutationInputSchema,
  ApplicationCrmSettingsSchema,
  ApplicationRecordSchema,
} from "@unemployed/contracts";

export interface ApplicationCrmRepository {
  listApplicationRecords(): Promise<readonly ApplicationRecord[]>;
  upsertApplicationRecord(record: ApplicationRecord): Promise<void>;
}

export interface ApplicationCrmBatchRepository extends ApplicationCrmRepository {
  commitApplicationRecordBatch(input: {
    expectedRevisions: readonly {
      applicationRecordId: string;
      expectedRevision: number;
    }[];
    records: readonly ApplicationRecord[];
  }): Promise<ApplicationRecordBatchCommitResult>;
}

export class ApplicationCrmRevisionConflictError extends Error {
  constructor() {
    super(
      "This application changed after you opened it. Refresh and try again.",
    );
    this.name = "ApplicationCrmRevisionConflictError";
  }
}

export class ApplicationCrmBulkStageValidationError extends Error {
  readonly recordIds: readonly string[];

  constructor(message: string, recordIds: readonly string[]) {
    super(message);
    this.name = "ApplicationCrmBulkStageValidationError";
    this.recordIds = [...recordIds];
  }
}

export class ApplicationCrmBulkStageRevisionConflictError extends ApplicationCrmRevisionConflictError {
  readonly recordIds: readonly string[];

  constructor(recordIds: readonly string[]) {
    super();
    this.message =
      recordIds.length === 1
        ? "That application changed before the bulk stage update could be saved. Refresh and try again."
        : `${recordIds.length} applications changed before the bulk stage update could be saved. Refresh and try again.`;
    this.name = "ApplicationCrmBulkStageRevisionConflictError";
    this.recordIds = [...recordIds];
  }
}

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function uniqueTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    const normalized = normalizeTag(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    tags.push(normalized);
  }

  return tags;
}

export function inferApplicationCrmStage(
  record: Pick<ApplicationRecord, "status" | "lastAttemptState">,
): ApplicationCrmStage {
  switch (record.status) {
    case "shortlisted":
      return "shortlisted";
    case "drafting":
      return "preparing";
    case "ready_for_review":
    case "approved":
      return "ready_for_approval";
    case "submitted":
      return "applied";
    case "assessment":
      return "assessment";
    case "interview":
      return "interview";
    case "offer":
      return "offer";
    case "rejected":
      return "rejected";
    case "withdrawn":
      return "withdrawn";
    case "archived":
      return "no_response";
    default:
      return record.lastAttemptState === "in_progress"
        ? "preparing"
        : "discovered";
  }
}

export function getApplicationCrmData(
  record: ApplicationRecord,
): ApplicationCrmData {
  if (record.crm) return ApplicationCrmDataSchema.parse(record.crm);

  return ApplicationCrmDataSchema.parse({
    stage: inferApplicationCrmStage(record),
    stageChangedAt: record.lastUpdatedAt,
    appliedAt: record.status === "submitted" ? record.lastUpdatedAt : null,
  });
}

function replaceById<T extends { id: string }>(
  values: readonly T[],
  value: T,
): T[] {
  const index = values.findIndex((candidate) => candidate.id === value.id);
  if (index < 0) return [...values, value];
  return values.map((candidate, candidateIndex) =>
    candidateIndex === index ? value : candidate,
  );
}

function removeById<T extends { id: string }>(
  values: readonly T[],
  id: string,
): T[] {
  return values.filter((value) => value.id !== id);
}

function applyMutation(input: {
  crm: ApplicationCrmData;
  mutation: ApplicationCrmMutation;
  now: string;
  createId: () => string;
}): ApplicationCrmData {
  const { mutation, now } = input;
  const crm = input.crm;

  switch (mutation.type) {
    case "set_stage": {
      if (
        crm.stage === mutation.stage &&
        crm.customStageId === mutation.customStageId
      ) {
        return crm;
      }
      const event = {
        id: input.createId(),
        at: now,
        kind: "stage_changed" as const,
        title: `Moved to ${mutation.stage.replaceAll("_", " ")}`,
        detail: mutation.note,
        fromStage: crm.stage,
        toStage: mutation.stage,
        source: "user" as const,
      };
      return ApplicationCrmDataSchema.parse({
        ...crm,
        stage: mutation.stage,
        customStageId: mutation.customStageId,
        stageChangedAt: now,
        appliedAt:
          mutation.stage === "applied" ? (crm.appliedAt ?? now) : crm.appliedAt,
        lastEmployerActivityAt: [
          "employer_viewed",
          "recruiter_contact",
          "assessment",
          "interview",
          "offer",
          "rejected",
        ].includes(mutation.stage)
          ? now
          : crm.lastEmployerActivityAt,
        events: [...crm.events, event],
      });
    }
    case "set_tags":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        tags: uniqueTags(mutation.tags),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "tags_changed",
            title: "Updated application tags",
            detail: uniqueTags(mutation.tags).join(", ") || "All tags removed",
            source: "user",
          },
        ],
      });
    case "add_note":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        notes: replaceById(crm.notes, mutation.note),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "note_changed",
            title: "Note added",
            detail: null,
            source: "user",
          },
        ],
      });
    case "remove_note":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        notes: removeById(crm.notes, mutation.noteId),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "note_changed",
            title: "Removed a note",
            detail: null,
            source: "user",
          },
        ],
      });
    case "upsert_contact":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        contacts: replaceById(crm.contacts, mutation.contact),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "contact_changed",
            title: crm.contacts.some(
              (contact) => contact.id === mutation.contact.id,
            )
              ? `Updated contact ${mutation.contact.name}`
              : `Added contact ${mutation.contact.name}`,
            detail: null,
            source: "user",
          },
        ],
      });
    case "remove_contact":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        contacts: removeById(crm.contacts, mutation.contactId),
        interviews: crm.interviews.map((interview) => ({
          ...interview,
          contactIds: interview.contactIds.filter(
            (contactId) => contactId !== mutation.contactId,
          ),
        })),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "contact_changed",
            title: "Removed a contact",
            detail: null,
            source: "user",
          },
        ],
      });
    case "upsert_reminder": {
      const existed = crm.reminders.some(
        (reminder) => reminder.id === mutation.reminder.id,
      );
      return ApplicationCrmDataSchema.parse({
        ...crm,
        reminders: replaceById(crm.reminders, mutation.reminder),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "reminder_changed",
            title: existed
              ? `Updated reminder ${mutation.reminder.title}`
              : `Added reminder ${mutation.reminder.title}`,
            detail: `Due ${mutation.reminder.dueAt}`,
            source: "user",
          },
        ],
      });
    }
    case "remove_reminder":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        reminders: removeById(crm.reminders, mutation.reminderId),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "reminder_changed",
            title: "Removed a reminder",
            detail: null,
            source: "user",
          },
        ],
      });
    case "upsert_interview": {
      const missingContactId = mutation.interview.contactIds.find(
        (contactId) =>
          !crm.contacts.some((contact) => contact.id === contactId),
      );
      if (missingContactId) {
        throw new Error(
          "The selected interview contact is no longer available. Refresh and try again.",
        );
      }
      const existed = crm.interviews.some(
        (interview) => interview.id === mutation.interview.id,
      );
      return ApplicationCrmDataSchema.parse({
        ...crm,
        interviews: replaceById(crm.interviews, mutation.interview),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "interview_changed",
            title: existed
              ? `Updated interview ${mutation.interview.title}`
              : `Scheduled interview ${mutation.interview.title}`,
            detail: `Starts ${mutation.interview.startsAt}`,
            source: "user",
          },
        ],
      });
    }
    case "remove_interview":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        interviews: removeById(crm.interviews, mutation.interviewId),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "interview_changed",
            title: "Removed an interview",
            detail: null,
            source: "user",
          },
        ],
      });
    case "set_compensation":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        compensation: mutation.compensation,
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "compensation_changed",
            title:
              mutation.compensation.offerStatus === "none"
                ? "Updated compensation details"
                : "Updated offer details",
            detail: null,
            source: "user",
          },
        ],
      });
    case "add_attachment":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        attachments: replaceById(crm.attachments, mutation.attachment),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "attachment_changed",
            title: `Linked ${mutation.attachment.label}`,
            detail: null,
            source: "user",
          },
        ],
      });
    case "remove_attachment":
      return ApplicationCrmDataSchema.parse({
        ...crm,
        attachments: removeById(crm.attachments, mutation.attachmentId),
        events: [
          ...crm.events,
          {
            id: input.createId(),
            at: now,
            kind: "attachment_changed",
            title: "Unlinked an attachment",
            detail: null,
            source: "user",
          },
        ],
      });
  }
}

export async function mutateApplicationCrm(input: {
  repository: ApplicationCrmRepository;
  command: ApplicationCrmMutationInput;
  now?: () => string;
  createId?: () => string;
  validateCandidateAsset?: (candidateAssetId: string) => Promise<{
    id: string;
    originalName: string;
    consentScope: string;
    deletedAt: string | null;
  } | null>;
}): Promise<ApplicationRecord> {
  const command = ApplicationCrmMutationInputSchema.parse(input.command);
  const records = await input.repository.listApplicationRecords();
  const record = records.find(
    (candidate) => candidate.id === command.applicationRecordId,
  );
  if (!record) throw new Error("Application record not found.");

  const crm = getApplicationCrmData(record);
  if (crm.revision !== command.expectedRevision) {
    throw new ApplicationCrmRevisionConflictError();
  }

  if (command.mutation.type === "add_attachment") {
    if (!input.validateCandidateAsset) {
      throw new Error(
        "The selected Candidate Asset could not be verified. Refresh and try again.",
      );
    }
    const asset = await input.validateCandidateAsset(
      command.mutation.attachment.candidateAssetId,
    );
    if (
      !asset ||
      asset.id !== command.mutation.attachment.candidateAssetId ||
      asset.deletedAt !== null ||
      asset.consentScope !== "job_application_attachment"
    ) {
      throw new Error(
        "The selected Candidate Asset is unavailable or is not approved for application attachment.",
      );
    }
  }

  const now = input.now?.() ?? new Date().toISOString();
  const createId =
    input.createId ??
    (() => `crm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const mutated = applyMutation({
    crm,
    mutation: command.mutation,
    now,
    createId,
  });
  if (mutated === crm) {
    return record;
  }
  const nextCrm = ApplicationCrmDataSchema.parse({
    ...mutated,
    revision: crm.revision + 1,
  });
  const nextRecord = ApplicationRecordSchema.parse({
    ...record,
    status: record.status,
    lastActionLabel:
      command.mutation.type === "set_stage"
        ? `Stage changed to ${nextCrm.stage.replaceAll("_", " ")}`
        : record.lastActionLabel,
    lastUpdatedAt: now,
    crm: nextCrm,
  });

  await input.repository.upsertApplicationRecord(nextRecord);
  return nextRecord;
}

export function prepareApplicationCrmBulkStageMutation(input: {
  records: readonly ApplicationRecord[];
  command: unknown;
  now?: () => string;
  createId?: () => string;
}): {
  nextRecords: readonly ApplicationRecord[];
  changedRecordIds: readonly string[];
} {
  const command = ApplicationCrmBulkStageMutationInputSchema.parse(
    input.command,
  );
  const recordsById = new Map(
    input.records.map((record) => [record.id, record]),
  );
  const missingRecordIds = command.items
    .map((item) => item.applicationRecordId)
    .filter((recordId) => !recordsById.has(recordId));
  if (missingRecordIds.length > 0) {
    throw new ApplicationCrmBulkStageValidationError(
      missingRecordIds.length === 1
        ? "The selected application no longer exists. Refresh and try again."
        : `${missingRecordIds.length} selected applications no longer exist. Refresh and try again.`,
      missingRecordIds,
    );
  }

  const staleRecordIds = command.items
    .filter(
      ({ applicationRecordId, expectedRevision }) =>
        getApplicationCrmData(recordsById.get(applicationRecordId)!)
          .revision !== expectedRevision,
    )
    .map(({ applicationRecordId }) => applicationRecordId);
  if (staleRecordIds.length > 0) {
    throw new ApplicationCrmBulkStageRevisionConflictError(staleRecordIds);
  }

  const now = input.now?.() ?? new Date().toISOString();
  const createId =
    input.createId ??
    (() => `crm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const changedRecordIds: string[] = [];
  const nextRecords = command.items.map(({ applicationRecordId }) => {
    const record = recordsById.get(applicationRecordId)!;
    const crm = getApplicationCrmData(record);
    const mutated = applyMutation({
      crm,
      mutation: {
        type: "set_stage",
        stage: command.stage,
        customStageId: command.customStageId,
        note: command.note,
      },
      now,
      createId,
    });
    if (mutated === crm) return record;

    changedRecordIds.push(record.id);
    const nextCrm = ApplicationCrmDataSchema.parse({
      ...mutated,
      revision: crm.revision + 1,
    });
    return ApplicationRecordSchema.parse({
      ...record,
      status: record.status,
      lastActionLabel: `Stage changed to ${nextCrm.stage.replaceAll("_", " ")}`,
      lastUpdatedAt: now,
      crm: nextCrm,
    });
  });

  return { nextRecords, changedRecordIds };
}

export async function mutateApplicationCrmBulkStage(input: {
  repository: ApplicationCrmBatchRepository;
  command: unknown;
  now?: () => string;
  createId?: () => string;
}): Promise<readonly ApplicationRecord[]> {
  const command = ApplicationCrmBulkStageMutationInputSchema.parse(
    input.command,
  );
  const records = await input.repository.listApplicationRecords();
  const prepared = prepareApplicationCrmBulkStageMutation({
    records,
    command,
    ...(input.now ? { now: input.now } : {}),
    ...(input.createId ? { createId: input.createId } : {}),
  });
  if (prepared.changedRecordIds.length === 0) {
    return prepared.nextRecords;
  }

  const result = await input.repository.commitApplicationRecordBatch({
    expectedRevisions: command.items,
    records: prepared.nextRecords,
  });
  if (result.status === "missing") {
    throw new ApplicationCrmBulkStageValidationError(
      "One or more selected applications no longer exist. Refresh and try again.",
      result.recordIds,
    );
  }
  if (result.status === "stale") {
    throw new ApplicationCrmBulkStageRevisionConflictError(result.recordIds);
  }
  return prepared.nextRecords;
}

export async function runApplicationNoResponseAutomation(input: {
  repository: ApplicationCrmRepository;
  settings?: ApplicationCrmSettings;
  now?: () => string;
  createId?: () => string;
}): Promise<readonly ApplicationRecord[]> {
  const settings = ApplicationCrmSettingsSchema.parse(input.settings ?? {});
  if (!settings.noResponseAutomation.enabled) return [];

  const now = input.now?.() ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const thresholdMs = settings.noResponseAutomation.afterDays * 86_400_000;
  const records = await input.repository.listApplicationRecords();
  const updated: ApplicationRecord[] = [];

  for (const record of records) {
    const crm = getApplicationCrmData(record);
    if (crm.stage !== "applied" || !crm.appliedAt) continue;
    const appliedAtMs = Date.parse(crm.appliedAt);
    if (!Number.isFinite(appliedAtMs) || nowMs - appliedAtMs < thresholdMs) {
      continue;
    }

    const nextCrm = ApplicationCrmDataSchema.parse({
      ...crm,
      revision: crm.revision + 1,
      stage: "no_response",
      stageChangedAt: now,
      events: [
        ...crm.events,
        {
          id: input.createId?.() ?? `crm_automation_${record.id}_${Date.now()}`,
          at: now,
          kind: "automation",
          title: `No response after ${settings.noResponseAutomation.afterDays} days`,
          detail:
            "The application was marked for follow-up. No external action was taken.",
          fromStage: "applied",
          toStage: "no_response",
          source: "automation",
        },
      ],
    });
    const nextRecord = ApplicationRecordSchema.parse({
      ...record,
      status: record.status,
      lastActionLabel: `No response after ${settings.noResponseAutomation.afterDays} days`,
      nextActionLabel: "Follow up with the employer",
      lastUpdatedAt: now,
      crm: nextCrm,
    });
    await input.repository.upsertApplicationRecord(nextRecord);
    updated.push(nextRecord);
  }

  return updated;
}

function normalizeEmployer(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /\b(?:incorporated|inc|limited|ltd|llc|gmbh|corp|corporation)\b/gu,
      "",
    )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function findApplicationCrmDuplicateHints(
  records: readonly ApplicationRecord[],
): ApplicationCrmDuplicateHint[] {
  const hints: ApplicationCrmDuplicateHint[] = [];

  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex];
    if (!left) continue;
    const leftCrm = getApplicationCrmData(left);
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < records.length;
      rightIndex += 1
    ) {
      const right = records[rightIndex];
      if (!right) continue;
      if (
        normalizeEmployer(left.company) &&
        normalizeEmployer(left.company) === normalizeEmployer(right.company)
      ) {
        hints.push({
          applicationRecordId: left.id,
          duplicateApplicationRecordId: right.id,
          kind: "employer",
          reason: `Both applications use the employer name ${left.company}.`,
        });
      }

      const rightEmails = new Set(
        getApplicationCrmData(right)
          .contacts.map((contact) => contact.email?.toLowerCase() ?? "")
          .filter(Boolean),
      );
      const sharedEmail = leftCrm.contacts.find(
        (contact) =>
          contact.email && rightEmails.has(contact.email.toLowerCase()),
      )?.email;
      if (sharedEmail) {
        hints.push({
          applicationRecordId: left.id,
          duplicateApplicationRecordId: right.id,
          kind: "contact",
          reason: `Both applications reference ${sharedEmail}.`,
        });
      }
    }
  }

  return hints;
}

export function buildApplicationCrmCalendar(
  records: readonly ApplicationRecord[],
): ApplicationCrmCalendarEntry[] {
  return records
    .flatMap((record) => {
      const crm = getApplicationCrmData(record);
      const entries: ApplicationCrmCalendarEntry[] = [
        ...crm.reminders
          .filter((reminder) => reminder.status === "pending")
          .map((reminder) => ({
            id: `reminder_${reminder.id}`,
            applicationRecordId: record.id,
            kind: "reminder" as const,
            title: `${reminder.title} · ${record.company}`,
            startsAt: reminder.dueAt,
            endsAt: null,
            status: reminder.status,
          })),
        ...crm.interviews
          .filter((interview) => interview.status === "scheduled")
          .map((interview) => ({
            id: `interview_${interview.id}`,
            applicationRecordId: record.id,
            kind: "interview" as const,
            title: `${interview.title} · ${record.company}`,
            startsAt: interview.startsAt,
            endsAt: interview.endsAt,
            status: interview.status,
          })),
      ];
      if (crm.compensation.offerDeadlineAt) {
        entries.push({
          id: `offer_deadline_${record.id}`,
          applicationRecordId: record.id,
          kind: "offer_deadline",
          title: `Offer deadline · ${record.company}`,
          startsAt: crm.compensation.offerDeadlineAt,
          endsAt: null,
          status: crm.compensation.offerStatus,
        });
      }
      return entries;
    })
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
}

export function recommendApplicationCrmAction(input: {
  records: readonly ApplicationRecord[];
  now?: string;
}): ApplicationCrmRecommendedAction | null {
  const now = Date.parse(input.now ?? new Date().toISOString());
  const calendar = buildApplicationCrmCalendar(input.records);
  const overdueReminder = calendar.find(
    (entry) => entry.kind === "reminder" && Date.parse(entry.startsAt) <= now,
  );
  if (overdueReminder) {
    return {
      applicationRecordId: overdueReminder.applicationRecordId,
      kind: "overdue_reminder",
      title: overdueReminder.title,
      reason: "This follow-up reminder is due now.",
      dueAt: overdueReminder.startsAt,
    };
  }

  const upcomingInterview = calendar.find(
    (entry) => entry.kind === "interview" && Date.parse(entry.startsAt) > now,
  );
  if (upcomingInterview) {
    return {
      applicationRecordId: upcomingInterview.applicationRecordId,
      kind: "upcoming_interview",
      title: upcomingInterview.title,
      reason: "This is the next scheduled interview.",
      dueAt: upcomingInterview.startsAt,
    };
  }

  const ready = input.records.find(
    (record) => getApplicationCrmData(record).stage === "ready_for_approval",
  );
  if (ready) {
    return {
      applicationRecordId: ready.id,
      kind: "ready_for_approval",
      title: `Review ${ready.title} at ${ready.company}`,
      reason: "The application is prepared and waiting for your approval.",
      dueAt: null,
    };
  }

  const followUp = input.records.find(
    (record) => getApplicationCrmData(record).stage === "no_response",
  );
  if (followUp) {
    return {
      applicationRecordId: followUp.id,
      kind: "follow_up",
      title: `Follow up with ${followUp.company}`,
      reason: "This application has reached its no-response follow-up point.",
      dueAt: null,
    };
  }

  const review = [...input.records]
    .filter((record) =>
      ["discovered", "reviewing", "shortlisted"].includes(
        getApplicationCrmData(record).stage,
      ),
    )
    .sort((left, right) =>
      left.lastUpdatedAt.localeCompare(right.lastUpdatedAt),
    )[0];
  return review
    ? {
        applicationRecordId: review.id,
        kind: "review_application",
        title: `Review ${review.title} at ${review.company}`,
        reason: "This is the oldest application still waiting for a decision.",
        dueAt: null,
      }
    : null;
}

export interface ApplicationCrmDashboardProjection {
  appliedToday: number;
  appliedThisWeek: number;
  responseRate: number | null;
  interviewRate: number | null;
  rateDenominator: number;
  upcomingInterviews: readonly ApplicationCrmCalendarEntry[];
  pendingFollowUps: readonly ApplicationCrmCalendarEntry[];
  recommendedAction: ApplicationCrmRecommendedAction | null;
}

export function projectApplicationCrmDashboard(input: {
  records: readonly ApplicationRecord[];
  now?: string;
  minimumRateSample?: number;
}): ApplicationCrmDashboardProjection {
  const nowIso = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const nowDate = new Date(nowMs);
  const startOfToday = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
  );
  const startOfWeek = startOfToday - 6 * 86_400_000;
  const appliedRecords = input.records.filter((record) => {
    const appliedAt = getApplicationCrmData(record).appliedAt;
    return Boolean(appliedAt && Number.isFinite(Date.parse(appliedAt)));
  });
  const appliedToday = appliedRecords.filter((record) => {
    const appliedAt = Date.parse(getApplicationCrmData(record).appliedAt ?? "");
    return appliedAt >= startOfToday && appliedAt <= nowMs;
  }).length;
  const appliedThisWeek = appliedRecords.filter((record) => {
    const appliedAt = Date.parse(getApplicationCrmData(record).appliedAt ?? "");
    return appliedAt >= startOfWeek && appliedAt <= nowMs;
  }).length;
  const responseStages = new Set<ApplicationCrmStage>([
    "employer_viewed",
    "recruiter_contact",
    "assessment",
    "interview",
    "offer",
    "rejected",
  ]);
  const interviewStages = new Set<ApplicationCrmStage>(["interview", "offer"]);
  const responseCount = appliedRecords.filter((record) =>
    responseStages.has(getApplicationCrmData(record).stage),
  ).length;
  const interviewCount = appliedRecords.filter((record) =>
    interviewStages.has(getApplicationCrmData(record).stage),
  ).length;
  const minimumRateSample = input.minimumRateSample ?? 5;
  const hasEnoughRateData = appliedRecords.length >= minimumRateSample;
  const calendar = buildApplicationCrmCalendar(input.records);

  return {
    appliedToday,
    appliedThisWeek,
    responseRate: hasEnoughRateData
      ? Math.round((responseCount / appliedRecords.length) * 100)
      : null,
    interviewRate: hasEnoughRateData
      ? Math.round((interviewCount / appliedRecords.length) * 100)
      : null,
    rateDenominator: appliedRecords.length,
    upcomingInterviews: calendar.filter(
      (entry) =>
        entry.kind === "interview" && Date.parse(entry.startsAt) >= nowMs,
    ),
    pendingFollowUps: calendar.filter((entry) => entry.kind === "reminder"),
    recommendedAction: recommendApplicationCrmAction({
      records: input.records,
      now: nowIso,
    }),
  };
}

function csvCell(value: string | number | null): string {
  const raw = value == null ? "" : String(value);
  const text = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportApplicationCrm(input: {
  records: readonly ApplicationRecord[];
  request: ApplicationCrmExportInput;
  exportedAt?: string;
}): ApplicationCrmExportResult {
  const request = ApplicationCrmExportInputSchema.parse(input.request);
  const selectedIds = new Set(request.applicationRecordIds);
  const records = input.records.filter(
    (record) => selectedIds.size === 0 || selectedIds.has(record.id),
  );
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const dateLabel = exportedAt.slice(0, 10);

  if (request.format === "json") {
    return {
      format: "json",
      fileName: `applications-${dateLabel}.json`,
      mimeType: "application/json",
      content: JSON.stringify(
        {
          exportedAt,
          applications: records.map((record) => ({
            id: record.id,
            jobId: record.jobId,
            title: record.title,
            company: record.company,
            lastUpdatedAt: record.lastUpdatedAt,
            crm: getApplicationCrmData(record),
          })),
        },
        null,
        2,
      ),
      exportedCount: records.length,
    };
  }

  const header = [
    "Application ID",
    "Job ID",
    "Title",
    "Company",
    "Stage",
    "Tags",
    "Applied at",
    "Next reminder",
    "Next interview",
    "Last updated",
  ];
  const rows = records.map((record) => {
    const crm = getApplicationCrmData(record);
    const nextReminder = crm.reminders
      .filter((reminder) => reminder.status === "pending")
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0];
    const nextInterview = crm.interviews
      .filter((interview) => interview.status === "scheduled")
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0];
    return [
      record.id,
      record.jobId,
      record.title,
      record.company,
      crm.stage,
      crm.tags.join("; "),
      crm.appliedAt,
      nextReminder?.dueAt ?? null,
      nextInterview?.startsAt ?? null,
      record.lastUpdatedAt,
    ];
  });
  return {
    format: "csv",
    fileName: `applications-${dateLabel}.csv`,
    mimeType: "text/csv;charset=utf-8",
    content: [header, ...rows]
      .map((row) => row.map((value) => csvCell(value)).join(","))
      .join("\r\n"),
    exportedCount: records.length,
  };
}
