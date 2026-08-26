import type {
  ApplicationCrmCalendarEntry,
  ApplicationCrmData,
  ApplicationCrmStage,
  ApplicationRecord,
} from "@unemployed/contracts";

export const APPLICATION_CRM_STAGE_ORDER: readonly ApplicationCrmStage[] = [
  "discovered",
  "reviewing",
  "shortlisted",
  "preparing",
  "ready_for_approval",
  "applied",
  "employer_viewed",
  "recruiter_contact",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
];

export const APPLICATION_CRM_STAGE_NAMES: Record<ApplicationCrmStage, string> =
  {
    discovered: "Discovered",
    reviewing: "Reviewing",
    shortlisted: "Shortlisted",
    preparing: "Preparing",
    ready_for_approval: "Ready for approval",
    applied: "Applied",
    employer_viewed: "Employer viewed",
    recruiter_contact: "Recruiter contact",
    assessment: "Assessment",
    interview: "Interview",
    offer: "Offer",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    no_response: "No response",
  };

export const APPLICATION_CRM_STAGE_LABELS: Record<ApplicationCrmStage, string> =
  {
    discovered: "Discovered",
    reviewing: "Reviewing",
    shortlisted: "Shortlisted",
    preparing: "Preparing",
    ready_for_approval: "Ready for approval",
    applied: "Applied (user recorded)",
    employer_viewed: "Employer viewed (user recorded)",
    recruiter_contact: "Recruiter contact (user recorded)",
    assessment: "Assessment (user recorded)",
    interview: "Interview (user recorded)",
    offer: "Offer (user recorded)",
    rejected: "Rejected (user recorded)",
    withdrawn: "Withdrawn (user recorded)",
    no_response: "No response (user recorded)",
  };

export function inferApplicationCrmStageForView(
  record: ApplicationRecord,
): ApplicationCrmStage {
  if (record.crm) return record.crm.stage;
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
    case "interview":
    case "offer":
    case "rejected":
    case "withdrawn":
      return record.status;
    case "archived":
      return "no_response";
    default:
      return record.lastAttemptState === "in_progress"
        ? "preparing"
        : "discovered";
  }
}

export function applicationCrmStageLabelForView(
  record: ApplicationRecord,
): string {
  const stage = inferApplicationCrmStageForView(record);
  return record.crm
    ? APPLICATION_CRM_STAGE_LABELS[stage]
    : `${APPLICATION_CRM_STAGE_NAMES[stage]} (local historical inference)`;
}

export function applicationCrmStageProvenanceForView(
  record: ApplicationRecord,
): string {
  return record.crm ? "User recorded" : "Local historical inference";
}

export function applicationCrmDataForView(
  record: ApplicationRecord,
): ApplicationCrmData {
  return (
    record.crm ?? {
      revision: 0,
      stage: inferApplicationCrmStageForView(record),
      customStageId: null,
      stageChangedAt: record.lastUpdatedAt,
      tags: [],
      events: [],
      contacts: [],
      reminders: [],
      interviews: [],
      notes: [],
      attachments: [],
      compensation: {
        listedMinimum: null,
        listedMaximum: null,
        expectedMinimum: null,
        expectedMaximum: null,
        offerBase: null,
        offerBonus: null,
        offerEquity: null,
        offerBenefits: [],
        offerDeadlineAt: null,
        offerStatus: "none",
        notes: null,
      },
      lastEmployerActivityAt: null,
      appliedAt: record.status === "submitted" ? record.lastUpdatedAt : null,
    }
  );
}

export function groupApplicationRecordsByStage(
  records: readonly ApplicationRecord[],
): Map<ApplicationCrmStage, ApplicationRecord[]> {
  const grouped = new Map<ApplicationCrmStage, ApplicationRecord[]>(
    APPLICATION_CRM_STAGE_ORDER.map((stage) => [stage, []]),
  );
  for (const record of records) {
    grouped.get(inferApplicationCrmStageForView(record))?.push(record);
  }
  return grouped;
}

export function buildApplicationCrmCalendarForView(
  records: readonly ApplicationRecord[],
): ApplicationCrmCalendarEntry[] {
  return records
    .flatMap((record) => {
      const crm = applicationCrmDataForView(record);
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
          id: `offer_${record.id}`,
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
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
