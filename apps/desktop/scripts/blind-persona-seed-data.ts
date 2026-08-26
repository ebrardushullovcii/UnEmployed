import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  ApplyJobResultSchema,
  ApplyRunSchema,
  CandidateProfileSchema,
  DiscoveryRunRecordSchema,
  JobFinderRepositoryStateSchema,
  JobSearchCampaignSchema,
  JobSearchPreferencesSchema,
  JobFinderSettingsSchema,
  SavedJobDiscoveryProvenanceSchema,
  SavedJobSchema,
  SourceDebugRunRecordSchema,
  UserActionEventSchema,
  UserActionRequestSchema,
  getDefaultCampaignConfiguration,
  type ApplicationCrmStage,
  type ApplicationStatus,
  type JobDiscoveryTarget,
  type JobFinderRepositoryState,
  type SavedJob,
  type SavedJobDiscoveryProvenance,
} from "@unemployed/contracts";

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface BlindPersonaSession {
  id: string;
  brief: string;
  cohorts: string[];
  context: string;
  goal: string;
  outcome: string;
  workspace: {
    kind: "fresh" | "persisted" | "declarative_overlay";
    profileSetup: {
      status: "not_started" | "materialized";
      currentStep: "import" | "complete";
    };
    starterSources: "disabled";
    jobState: Record<string, JsonValue>;
  };
  resumeInput: {
    path: string;
    presentation: "visible_user_input_artifact";
    importRequired: boolean;
    applicationMode: "tailored_resume_allowed" | "original_resume_unchanged";
  };
  viewport: {
    width: number;
    height: number;
    zoom: "native_100_percent" | "native_125_percent";
    nativeZoomFactor: 1 | 1.25;
  };
  input: {
    mode: "pointer_and_keyboard" | "keyboard_only";
    procedureHintsAllowed: false;
  };
  sessionProtocol: {
    durationMinutes: number | null;
    interruption:
      | "none"
      | "once_during_active_session"
      | "persisted_interrupted_preparation";
    privacy: "standard" | "minimum_disclosure_original_resume_unchanged";
  };
  expectedAuthority: {
    credentials: false;
    captchaOrMfa: false;
    legalConsent: false;
    accountCreation: false;
    finalSubmit: false;
  };
}

export interface BlindPersonaManifest {
  schemaVersion: 1;
  idNamespace: "blind-persona-v1";
  fixedTimestamp: string;
  digestSubject: string;
  digestSha256: string;
  assetRoot: "apps/desktop";
  jobCorpusPath: string;
  sessions: BlindPersonaSession[];
}

interface BlindPersonaJobCorpora {
  schemaVersion: 1;
  fixedTimestamp: string;
  corpora: Record<string, unknown[]>;
}

export interface LoadedBlindPersonaSeedData {
  manifest: BlindPersonaManifest;
  jobsByPersona: Record<string, SavedJob[]>;
  assetPaths: string[];
  digestSha256: string;
}

export interface BlindPersonaRepositoryStates {
  P13: JobFinderRepositoryState;
  P14: JobFinderRepositoryState;
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const workspaceRoot = path.resolve(desktopRoot, "../..");
const manifestPath = path.join(
  desktopRoot,
  "test-fixtures/job-finder/blind-personas/manifest.json",
);

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function stableBlindPersonaSerialization(value: unknown): string {
  return JSON.stringify(canonicalize(value as JsonValue));
}

export function calculateBlindPersonaStateDigest(
  state: JobFinderRepositoryState,
): string {
  return sha256(stableBlindPersonaSerialization(state));
}

function parseJson<T>(content: string, label: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function resolveAssetPath(
  manifest: BlindPersonaManifest,
  assetPath: string,
): string {
  return path.join(workspaceRoot, manifest.assetRoot, assetPath);
}

export async function calculateBlindPersonaDigest(
  manifest: BlindPersonaManifest,
): Promise<{ assetPaths: string[]; digestSha256: string }> {
  const assetPaths = [
    manifest.jobCorpusPath,
    ...manifest.sessions.map((session) => session.resumeInput.path),
  ]
    .filter((assetPath, index, all) => all.indexOf(assetPath) === index)
    .sort();
  const assets = await Promise.all(
    assetPaths.map(async (assetPath) => ({
      path: assetPath,
      sha256: sha256(
        await readFile(resolveAssetPath(manifest, assetPath), "utf8"),
      ),
    })),
  );
  const manifestWithoutDigest = { ...manifest } as unknown as Record<
    string,
    JsonValue
  >;
  delete manifestWithoutDigest.digestSha256;
  const subject = canonicalize({
    assets,
    manifest: manifestWithoutDigest,
  });
  return {
    assetPaths,
    digestSha256: sha256(JSON.stringify(subject)),
  };
}

export async function loadBlindPersonaSeedData(): Promise<LoadedBlindPersonaSeedData> {
  const manifest = parseJson<BlindPersonaManifest>(
    await readFile(manifestPath, "utf8"),
    "Blind persona manifest",
  );
  const jobCorpora = parseJson<BlindPersonaJobCorpora>(
    await readFile(resolveAssetPath(manifest, manifest.jobCorpusPath), "utf8"),
    "Blind persona job corpora",
  );
  const jobsByPersona = Object.fromEntries(
    Object.entries(jobCorpora.corpora).map(([personaId, jobs]) => [
      personaId,
      jobs.map((job) => SavedJobSchema.parse(job)),
    ]),
  );
  const digest = await calculateBlindPersonaDigest(manifest);
  return { manifest, jobsByPersona, ...digest };
}

const P13_CAMPAIGN_ID = "blind_p13_campaign";
const P14_CAMPAIGN_ID = "blind_p14_campaign";

function timestampAtOffset(fixedTimestamp: string, offsetDays: number): string {
  return new Date(
    Date.parse(fixedTimestamp) + offsetDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
}

function createSourceProvenance(
  sourceTarget: JobDiscoveryTarget,
  discoveredAt: string,
): SavedJobDiscoveryProvenance[] {
  return [
    SavedJobDiscoveryProvenanceSchema.parse({
      targetId: sourceTarget.id,
      adapterKind: sourceTarget.adapterKind,
      resolvedAdapterKind: "target_site",
      startingUrl: sourceTarget.startingUrl,
      discoveredAt,
      collectionMethod: "fallback_search",
    }),
  ];
}

function createReturningProfile(input: {
  personaId: "P13" | "P14";
  fixedTimestamp: string;
  resumePath: string;
}) {
  return CandidateProfileSchema.parse({
    id: `blind_${input.personaId.toLowerCase()}_candidate`,
    firstName: input.personaId === "P13" ? "Dana" : "Morgan",
    lastName: input.personaId === "P13" ? "Kim" : "Price",
    fullName: input.personaId === "P13" ? "Dana Kim" : "Morgan Price",
    headline:
      input.personaId === "P13" ? "Marketing manager" : "Service manager",
    summary:
      input.personaId === "P13"
        ? "Runs digital campaigns, lifecycle programs, and cross-functional launches."
        : "Coordinates field teams, customer escalations, schedules, and service quality.",
    currentLocation:
      input.personaId === "P13"
        ? "Remote - United States"
        : "Madison, Wisconsin",
    yearsExperience: input.personaId === "P13" ? 9 : 8,
    baseResume: {
      id: `blind_${input.personaId.toLowerCase()}_resume`,
      fileName:
        input.personaId === "P13"
          ? "marketing-manager.txt"
          : "service-manager.txt",
      uploadedAt: input.fixedTimestamp,
      storagePath: input.resumePath,
      sha256:
        input.personaId === "P13"
          ? "1313131313131313131313131313131313131313131313131313131313131313"
          : "1414141414141414141414141414141414141414141414141414141414141414",
      textContent:
        input.personaId === "P13"
          ? "Dana Kim\nMarketing manager\nDigital campaigns, lifecycle programs, and cross-functional launches."
          : "Morgan Price\nService manager\nField teams, customer escalations, schedules, and service quality.",
      textUpdatedAt: input.fixedTimestamp,
      extractionStatus: "ready",
      lastAnalyzedAt: input.fixedTimestamp,
    },
    targetRoles:
      input.personaId === "P13"
        ? ["Marketing Manager", "Lifecycle Marketing Manager"]
        : ["Service Manager", "Service Operations Manager"],
    locations:
      input.personaId === "P13"
        ? ["Remote - United States"]
        : ["Madison, Wisconsin"],
    skills:
      input.personaId === "P13"
        ? ["Campaign strategy", "Lifecycle email", "Analytics"]
        : ["Service operations", "Team management", "Scheduling"],
  });
}

function createPreferences(input: {
  personaId: "P13" | "P14";
  sourceTargetId: string;
  sourceUrl: string;
}) {
  return JobSearchPreferencesSchema.parse({
    targetRoles:
      input.personaId === "P13"
        ? ["Marketing Manager", "Lifecycle Marketing Manager"]
        : ["Service Manager", "Service Operations Manager"],
    locations:
      input.personaId === "P13"
        ? ["Remote - United States"]
        : ["Madison, Wisconsin"],
    workModes: input.personaId === "P13" ? ["remote", "hybrid"] : ["hybrid"],
    minimumSalaryUsd: null,
    approvalMode: "review_before_submit",
    tailoringMode: "balanced",
    discovery: {
      historyLimit: 5,
      targets: [
        {
          id: input.sourceTargetId,
          label:
            input.personaId === "P13"
              ? "Saved marketing roles source"
              : "Blocked service management roles source",
          startingUrl: input.sourceUrl,
          enabled: false,
        },
      ],
    },
  });
}

function createSettings() {
  return JobFinderSettingsSchema.parse({
    resumeFormat: "pdf",
    resumeTemplateId: "classic_ats",
    fontPreset: "inter_requisite",
    humanReviewRequired: true,
    allowAutoSubmitOverride: false,
    keepSessionAlive: false,
    discoveryOnly: false,
    resumeApplicationMode: "original_resume",
  });
}

function createCampaign(input: {
  id: string;
  name: string;
  mode: "precision" | "scale";
  fixedTimestamp: string;
  searchPreferences: ReturnType<typeof createPreferences>;
  jobIds: string[];
  applicationsPrepared: number;
  applicationsApplied: number;
  blockedCount: number;
}) {
  return JobSearchCampaignSchema.parse({
    id: input.id,
    name: input.name,
    mode: input.mode,
    status: "active",
    createdAt: timestampAtOffset(input.fixedTimestamp, -60),
    updatedAt: input.fixedTimestamp,
    searchPreferences: input.searchPreferences,
    sourceTargetIds: input.searchPreferences.discovery.targets.map(
      (target) => target.id,
    ),
    jobIds: input.jobIds,
    ...getDefaultCampaignConfiguration(input.mode),
    progress: {
      jobsFound: input.jobIds.length,
      jobsRetained: input.jobIds.length,
      applicationsPrepared: input.applicationsPrepared,
      applicationsApplied: input.applicationsApplied,
      blockedCount: input.blockedCount,
      remainingQueueSize: Math.max(
        0,
        input.jobIds.length - input.applicationsPrepared,
      ),
      lastRunAt: timestampAtOffset(input.fixedTimestamp, -1),
      lastUpdatedAt: input.fixedTimestamp,
    },
    history: [
      {
        id: `${input.id}_created`,
        campaignId: input.id,
        kind: "created",
        occurredAt: timestampAtOffset(input.fixedTimestamp, -60),
        summary: "User created this local search plan.",
      },
    ],
  });
}

const P13_CRM_STAGES: readonly ApplicationCrmStage[] = [
  "reviewing",
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

function applicationStatusForCrmStage(
  stage: ApplicationCrmStage,
): ApplicationStatus {
  switch (stage) {
    case "assessment":
      return "assessment";
    case "interview":
      return "interview";
    case "offer":
      return "offer";
    case "rejected":
    case "no_response":
      return "rejected";
    case "withdrawn":
      return "withdrawn";
    case "ready_for_approval":
      return "ready_for_review";
    default:
      return "drafting";
  }
}

function createP13Jobs(input: {
  baseJob: SavedJob;
  fixedTimestamp: string;
  sourceTarget: JobDiscoveryTarget;
}): SavedJob[] {
  const titles = [
    "Marketing Manager",
    "Lifecycle Marketing Manager",
    "Digital Campaign Manager",
    "Content Marketing Manager",
    "Growth Marketing Manager",
    "Partner Marketing Manager",
    "Demand Generation Manager",
    "Marketing Operations Manager",
  ] as const;
  const locations = [
    "Remote - United States",
    "Austin, Texas",
    "Chicago, Illinois",
    "Denver, Colorado",
    "Raleigh, North Carolina",
  ] as const;

  return Array.from({ length: 1_200 }, (_, index) => {
    const ordinal = String(index + 1).padStart(4, "0");
    const applicationIndex = index - 140;
    const applicationStage =
      applicationIndex >= 0 && applicationIndex < 48
        ? P13_CRM_STAGES[applicationIndex % P13_CRM_STAGES.length]!
        : null;
    const status: ApplicationStatus =
      index < 140
        ? "shortlisted"
        : applicationStage !== null
          ? applicationStatusForCrmStage(applicationStage)
          : index % 3 === 0
            ? "ready_for_review"
            : "discovered";
    const discoveredAt = timestampAtOffset(input.fixedTimestamp, -(index % 30));

    return SavedJobSchema.parse({
      ...input.baseJob,
      id: `blind_p13_job_${ordinal}`,
      sourceJobId: `p13-${ordinal}`,
      discoveryMethod: "browser_agent",
      canonicalUrl: `https://marketing-${index % 12}.jobs.example.test/roles/${ordinal}`,
      applicationUrl: `https://marketing-${index % 12}.jobs.example.test/roles/${ordinal}/apply`,
      employerWebsiteUrl: `https://company-${index % 60}.example.test/`,
      title: titles[index % titles.length],
      company: `P13 Test Company ${String(index % 60).padStart(2, "0")}`,
      location: locations[index % locations.length],
      workMode:
        index % 3 === 0
          ? ["remote"]
          : index % 3 === 1
            ? ["hybrid"]
            : ["onsite"],
      postedAt: timestampAtOffset(input.fixedTimestamp, -(index % 45)),
      discoveredAt,
      salaryText: `$${90 + (index % 45)},000-$${125 + (index % 55)},000`,
      description: `${titles[index % titles.length]} role in campaign group ${index % 20}. The role emphasizes ${index % 2 === 0 ? "lifecycle campaigns" : "content and launch analytics"}.`,
      keySkills:
        index % 2 === 0
          ? ["Campaign strategy", "Lifecycle email", "Analytics"]
          : ["Content marketing", "Launch planning", "Reporting"],
      minimumQualifications: ["Five years of marketing experience"],
      status,
      matchAssessment: {
        ...input.baseJob.matchAssessment,
        score: 55 + (index % 45),
        reasons: [
          index % 2 === 0
            ? "Strong lifecycle campaign evidence overlap"
            : "Relevant marketing launch evidence overlap",
        ],
        gaps: index % 7 === 0 ? ["Industry context needs review"] : [],
      },
      provenance: createSourceProvenance(input.sourceTarget, discoveredAt),
    });
  });
}

function createP13ApplicationRecords(jobs: SavedJob[], fixedTimestamp: string) {
  return Array.from({ length: 48 }, (_, index) => {
    const job = jobs[index + 140]!;
    const stage = P13_CRM_STAGES[index % P13_CRM_STAGES.length]!;
    const changedAt = timestampAtOffset(fixedTimestamp, -(index % 10));
    const reminderKind = index % 4;
    const dueAt = timestampAtOffset(
      fixedTimestamp,
      reminderKind === 0
        ? -3
        : reminderKind === 1
          ? 0
          : reminderKind === 2
            ? 2
            : -5,
    );
    const reminderStatus = reminderKind === 3 ? "completed" : "pending";

    return ApplicationRecordSchema.parse({
      id: `blind_p13_application_${String(index + 1).padStart(3, "0")}`,
      jobId: job.id,
      title: job.title,
      company: job.company,
      status: applicationStatusForCrmStage(stage),
      lastActionLabel: `User recorded ${stage.replaceAll("_", " ")}`,
      nextActionLabel: ["rejected", "withdrawn"].includes(stage)
        ? null
        : "Review the local follow-up reminder",
      lastUpdatedAt: changedAt,
      events: [
        {
          id: `blind_p13_application_event_${index}_created`,
          at: timestampAtOffset(fixedTimestamp, -30),
          title: "Application record created locally",
          detail: "No employer-site submission was recorded.",
          emphasis: "neutral",
        },
        {
          id: `blind_p13_application_event_${index}_stage`,
          at: changedAt,
          title: "User updated tracker stage",
          detail: `Local stage changed to ${stage.replaceAll("_", " ")}.`,
          emphasis: "positive",
        },
      ],
      crm: {
        revision: index + 1,
        stage,
        stageChangedAt: changedAt,
        tags: [
          index % 2 === 0 ? "priority" : "follow-up",
          `group-${index % 6}`,
        ],
        events: [
          {
            id: `blind_p13_crm_event_${index}_created`,
            at: timestampAtOffset(fixedTimestamp, -30),
            kind: "created",
            title: "Tracker record created",
            source: "user",
          },
          {
            id: `blind_p13_crm_event_${index}_stage`,
            at: changedAt,
            kind: "stage_changed",
            title: "Stage updated by user",
            detail: `Recorded ${stage.replaceAll("_", " ")} as a local fact.`,
            fromStage: "shortlisted",
            toStage: stage,
            source: "user",
          },
        ],
        reminders: [
          {
            id: `blind_p13_reminder_${index}`,
            title:
              reminderKind === 0
                ? "Overdue employer follow-up"
                : reminderKind === 1
                  ? "Follow up today"
                  : reminderKind === 2
                    ? "Upcoming follow-up"
                    : "Completed follow-up",
            dueAt,
            status: reminderStatus,
            note: "User-owned reminder; no message is sent automatically.",
            createdAt: timestampAtOffset(fixedTimestamp, -7),
            updatedAt:
              reminderStatus === "completed"
                ? timestampAtOffset(fixedTimestamp, -4)
                : fixedTimestamp,
            completedAt:
              reminderStatus === "completed"
                ? timestampAtOffset(fixedTimestamp, -4)
                : null,
          },
        ],
        notes: [
          {
            id: `blind_p13_note_${index}`,
            body: "Keep the next step local and verify employer activity before changing the stage.",
            createdAt: changedAt,
            updatedAt: changedAt,
          },
        ],
        lastEmployerActivityAt: [
          "employer_viewed",
          "recruiter_contact",
          "assessment",
          "interview",
          "offer",
        ].includes(stage)
          ? changedAt
          : null,
        appliedAt: [
          "applied",
          "employer_viewed",
          "recruiter_contact",
          "assessment",
          "interview",
          "offer",
          "rejected",
          "no_response",
        ].includes(stage)
          ? timestampAtOffset(fixedTimestamp, -14)
          : null,
      },
    });
  });
}

export function buildP13BlindPersonaRepositoryState(input: {
  baseJob: SavedJob;
  fixedTimestamp: string;
  resumePath: string;
}): JobFinderRepositoryState {
  const sourceTargetId = "blind_p13_disabled_source";
  const searchPreferences = createPreferences({
    personaId: "P13",
    sourceTargetId,
    sourceUrl: "https://marketing.jobs.example.test/roles",
  });
  const savedJobs = createP13Jobs({
    baseJob: input.baseJob,
    fixedTimestamp: input.fixedTimestamp,
    sourceTarget: searchPreferences.discovery.targets[0]!,
  });
  const applicationRecords = createP13ApplicationRecords(
    savedJobs,
    input.fixedTimestamp,
  );
  const outcomeNames = [
    "applied",
    "employer_response",
    "assessment",
    "interview",
    "offer",
    "rejected",
  ] as const;
  const outcomeEvents = applicationRecords
    .slice(0, 12)
    .map((record, index) => ({
      id: `blind_p13_outcome_${String(index + 1).padStart(2, "0")}`,
      outcome: outcomeNames[index % outcomeNames.length]!,
      applicationRecordId: record.id,
      jobId: record.jobId,
      campaignId: P13_CAMPAIGN_ID,
      source: "user_recorded_local_fact",
      company: record.company,
      jobTitle: record.title,
      occurredAt: timestampAtOffset(input.fixedTimestamp, -(index % 7)),
      note: "Recorded by the user; this does not claim an external submission.",
      userControlled: true as const,
    }));
  const campaign = createCampaign({
    id: P13_CAMPAIGN_ID,
    name: "P13 high-volume returning search",
    mode: "scale",
    fixedTimestamp: input.fixedTimestamp,
    searchPreferences,
    jobIds: savedJobs.map((job) => job.id),
    applicationsPrepared: applicationRecords.length,
    applicationsApplied: outcomeEvents.filter(
      (event) => event.outcome === "applied",
    ).length,
    blockedCount: 0,
  });

  return JobFinderRepositoryStateSchema.parse({
    profile: createReturningProfile({
      personaId: "P13",
      fixedTimestamp: input.fixedTimestamp,
      resumePath: input.resumePath,
    }),
    searchPreferences,
    savedJobs,
    applicationRecords,
    settings: createSettings(),
    campaigns: [campaign],
    activeCampaignId: campaign.id,
    intelligence: {
      outcomeEvents,
      safeguards: {
        preparedBatchSampleReviews: [
          {
            id: "blind_p13_batch_review",
            batchId: "blind_p13_marketing_batch",
            preparedCount: 48,
            sampleCount: 10,
            sampledItemIds: applicationRecords
              .slice(0, 10)
              .map((record) => record.id),
            reviewedCount: 3,
            requiredSampleRatio: 0.2,
            reviewCompleted: false,
            explanation:
              "High-volume preparation requires a deterministic quality sample before more work.",
            recoveryGuidance:
              "Review the remaining seven sampled records or narrow the queue to one role.",
          },
        ],
        updatedAt: input.fixedTimestamp,
      },
      updatedAt: input.fixedTimestamp,
    },
  });
}

export function buildP14BlindPersonaRepositoryState(input: {
  baseJob: SavedJob;
  fixedTimestamp: string;
  resumePath: string;
}): JobFinderRepositoryState {
  const sourceTargetId = "blind_p14_blocked_source";
  const sourceDebugRunId = "blind_p14_source_debug_run";
  const discoveryRunId = "blind_p14_discovery_run";
  const searchPreferences = createPreferences({
    personaId: "P14",
    sourceTargetId,
    sourceUrl: "https://blocked.jobs.example.test/openings",
  });
  const p14SourceTarget = searchPreferences.discovery.targets[0]!;
  const job = SavedJobSchema.parse({
    ...input.baseJob,
    id: "blind_p14_retained_job",
    sourceJobId: "p14-retained-job",
    // Target-site fallback_search collection maps to the browser_agent
    // discovery method in production; never inherit the catalog_seed default.
    discoveryMethod: "browser_agent",
    canonicalUrl:
      "https://service.jobs.example.test/roles/service-operations-manager",
    applicationUrl:
      "https://service.jobs.example.test/roles/service-operations-manager/apply",
    employerWebsiteUrl: "https://badger-service.example.test/",
    title: "Service Operations Manager",
    company: "Badger Service Network",
    location: "Madison, Wisconsin",
    workMode: ["hybrid"],
    description:
      "Lead service schedules, customer escalation review, team coaching, and operational quality reporting.",
    keySkills: [
      "Service operations",
      "Team management",
      "Scheduling",
      "Customer escalations",
    ],
    minimumQualifications: ["Five years of service management experience"],
    matchAssessment: {
      score: 94,
      reasons: ["Direct service management evidence"],
      gaps: [],
    },
    status: "ready_for_review",
    // The role was discovered through this configured source in an earlier
    // session; the source now requires user-owned sign-in before any retry.
    provenance: createSourceProvenance(p14SourceTarget, input.fixedTimestamp),
  });
  const campaign = createCampaign({
    id: P14_CAMPAIGN_ID,
    name: "P14 interrupted returning search",
    mode: "precision",
    fixedTimestamp: input.fixedTimestamp,
    searchPreferences,
    jobIds: [job.id],
    applicationsPrepared: 1,
    applicationsApplied: 0,
    blockedCount: 1,
  });
  const applicationRecordId = "blind_p14_application";
  const applyRunId = "blind_p14_prepare_run";
  const resultId = "blind_p14_prepare_result";
  const startedAt = timestampAtOffset(input.fixedTimestamp, -1);

  const applyRun = ApplyRunSchema.parse({
    id: applyRunId,
    campaignId: campaign.id,
    // Persisted apply runs use the copilot mode; the retained detail records
    // that browser execution was the non-submitting prepare_only operation.
    mode: "copilot",
    state: "failed",
    jobIds: [job.id],
    currentJobId: job.id,
    createdAt: startedAt,
    updatedAt: input.fixedTimestamp,
    completedAt: input.fixedTimestamp,
    summary: "Automatic apply stopped because the app closed.",
    detail:
      "The app closed before safe application preparation finished. No final submit action was taken, and any preparation saved before the interruption remains available for review.",
    totalJobs: 1,
    pendingJobs: 1,
    submittedJobs: 0,
    skippedJobs: 0,
    blockedJobs: 0,
    failedJobs: 0,
  });
  const applyResult = ApplyJobResultSchema.parse({
    id: resultId,
    runId: applyRun.id,
    jobId: job.id,
    applicationRecordId,
    queuePosition: 0,
    state: "awaiting_review",
    summary: "Prepared fields retained for review.",
    detail: "The retained review data stops before any final employer action.",
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
    privacyReceipt: {
      generatedAt: startedAt,
      lineage: {
        runId: applyRun.id,
        jobId: job.id,
        applicationRecordId,
        resultId,
      },
      destination: {
        origin: "https://service.jobs.example.test",
        safePath: "/roles/service-operations-manager/apply",
      },
      resume: {
        source: "original_upload",
        sourceDocumentId: `blind_p14_resume`,
        exportArtifactId: null,
        fileName: "service-manager.txt",
        sha256:
          "1414141414141414141414141414141414141414141414141414141414141414",
      },
      stayedLocal: ["profile_data", "resume_content", "application_answers"],
      externalWrites: [],
      accountCreationAuthorized: false,
      finalSubmitAuthorized: false,
      finalSubmitOccurred: false,
    },
  });
  const applicationRecord = ApplicationRecordSchema.parse({
    id: applicationRecordId,
    jobId: job.id,
    title: job.title,
    company: job.company,
    status: "ready_for_review",
    lastActionLabel: "Safe preparation interrupted at startup recovery",
    nextActionLabel: "Review retained preparation or restart prepare-only work",
    lastUpdatedAt: input.fixedTimestamp,
    lastAttemptState: "paused",
    events: [
      {
        id: "blind_p14_application_event_retained",
        at: startedAt,
        title: "Review data retained",
        detail: "Prepared local data remains available after interruption.",
        emphasis: "positive",
      },
      {
        id: "blind_p14_application_event_recovered",
        at: input.fixedTimestamp,
        title: "Interrupted run recovered as failed",
        detail: "No final submit action was taken.",
        emphasis: "warning",
      },
    ],
    crm: {
      revision: 2,
      stage: "ready_for_approval",
      stageChangedAt: startedAt,
      tags: ["interrupted", "review-retained"],
      events: [
        {
          id: "blind_p14_crm_event_prepare",
          at: startedAt,
          kind: "application_prepare",
          title: "Preparation retained for review",
          detail: "No employer submission was recorded.",
          source: "application_prepare",
        },
      ],
      notes: [
        {
          id: "blind_p14_note_retained",
          body: "Review the retained preparation before deciding whether to retry.",
          createdAt: startedAt,
          updatedAt: startedAt,
        },
      ],
    },
  });
  const applicationAttempt = ApplicationAttemptSchema.parse({
    id: "blind_p14_attempt",
    jobId: job.id,
    applicationRecordId,
    state: "paused",
    summary: "Prepared application data retained for review.",
    detail:
      "The attempt stopped before final submit and can be restarted safely.",
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
    outcome: "ready_for_review",
    nextActionLabel: "Review retained preparation",
  });
  const sourceDebugRun = SourceDebugRunRecordSchema.parse({
    id: sourceDebugRunId,
    targetId: sourceTargetId,
    state: "paused_manual",
    startedAt,
    updatedAt: input.fixedTimestamp,
    completedAt: input.fixedTimestamp,
    activePhase: "access_auth_probe",
    phases: [
      "access_auth_probe",
      "site_structure_mapping",
      "search_filter_probe",
      "job_detail_validation",
      "apply_path_validation",
      "replay_verification",
    ],
    targetLabel: "Blocked service management roles source",
    targetUrl: "https://blocked.jobs.example.test/openings",
    targetHostname: "blocked.jobs.example.test",
    manualPrerequisiteSummary:
      "Sign in in the browser without sharing credentials with Job Finder.",
    finalSummary: "Source access requires a user-owned browser sign-in.",
    attemptIds: [],
    phaseSummaries: [],
    instructionArtifactId: null,
    timing: null,
  });
  const userActionRequest = UserActionRequestSchema.parse({
    id: "blind_p14_login_action",
    dedupeKey: "p14:discovery-source:login",
    revision: 1,
    kind: "login",
    state: "pending",
    requirement: "required",
    scope: {
      type: "discovery_source",
      targetId: sourceTargetId,
      source: "target_site",
      sourceDebugRunId,
      sourceDebugAttemptId: null,
    },
    verification: {
      type: "source_access",
      targetId: sourceTargetId,
      blockerFingerprint: "p14-site-login-required",
      expectedOrigin: "https://blocked.jobs.example.test/",
    },
    title: "Sign in to check this source",
    summary: "This source requires a user-owned browser session before retry.",
    instructions: [
      "Sign in directly in the browser; do not enter credentials into Job Finder.",
      "Return only when you choose to retry this source.",
    ],
    actionUrl: "https://blocked.jobs.example.test/openings",
    displayOrigin: "https://blocked.jobs.example.test/",
    credentialsPolicy: "browser_only",
    submitAuthorized: false,
    accountCreationAuthorized: false,
    attemptCount: 0,
    maxAttempts: 3,
    createdAt: input.fixedTimestamp,
    updatedAt: input.fixedTimestamp,
  });
  const userActionEvent = UserActionEventSchema.parse({
    id: "blind_p14_login_action_created",
    requestId: userActionRequest.id,
    operation: "created",
    previousRevision: 0,
    resultingRevision: 1,
    previousState: "pending",
    resultingState: "pending",
    occurredAt: input.fixedTimestamp,
    credentialsPolicy: "browser_only",
    submitAuthorized: false,
    accountCreationAuthorized: false,
  });
  const discoveryRun = DiscoveryRunRecordSchema.parse({
    id: discoveryRunId,
    campaignId: campaign.id,
    state: "failed",
    startedAt,
    completedAt: input.fixedTimestamp,
    targetIds: [sourceTargetId],
    targetExecutions: [
      {
        targetId: sourceTargetId,
        adapterKind: "auto",
        resolvedAdapterKind: "target_site",
        collectionMethod: "fallback_search",
        state: "failed",
        startedAt,
        completedAt: input.fixedTimestamp,
        jobsReviewed: 0,
        jobsFound: 0,
        jobsPersisted: 0,
        jobsStaged: 0,
        warning:
          "The source required user-owned sign-in and returned no usable results.",
      },
    ],
    summary: {
      targetsPlanned: 1,
      targetsCompleted: 1,
      validJobsFound: 0,
      jobsPersisted: 0,
      jobsStaged: 0,
      warnings: [
        "The generic test source was blocked before any result was retained.",
      ],
      outcome: "failed",
    },
  });

  return JobFinderRepositoryStateSchema.parse({
    profile: createReturningProfile({
      personaId: "P14",
      fixedTimestamp: input.fixedTimestamp,
      resumePath: input.resumePath,
    }),
    searchPreferences,
    savedJobs: [job],
    applyRuns: [applyRun],
    applyJobResults: [applyResult],
    applicationRecords: [applicationRecord],
    applicationAttempts: [applicationAttempt],
    userActionRequests: [userActionRequest],
    userActionEvents: [userActionEvent],
    sourceDebugRuns: [sourceDebugRun],
    settings: createSettings(),
    discovery: {
      runState: "failed",
      activeRun: null,
      recentRuns: [discoveryRun],
    },
    campaigns: [campaign],
    activeCampaignId: campaign.id,
  });
}

export async function buildBlindPersonaRepositoryStates(): Promise<BlindPersonaRepositoryStates> {
  const loaded = await loadBlindPersonaSeedData();
  const p13Session = loaded.manifest.sessions[12];
  const p14Session = loaded.manifest.sessions[13];
  const p13BaseJob = loaded.jobsByPersona.P05?.[0];
  const p14BaseJob = loaded.jobsByPersona.P05?.[0];
  if (!p13Session || !p14Session || !p13BaseJob || !p14BaseJob) {
    throw new Error("Blind persona P13/P14 base fixture data is incomplete.");
  }

  return {
    P13: buildP13BlindPersonaRepositoryState({
      baseJob: p13BaseJob,
      fixedTimestamp: loaded.manifest.fixedTimestamp,
      resumePath: p13Session.resumeInput.path,
    }),
    P14: buildP14BlindPersonaRepositoryState({
      baseJob: p14BaseJob,
      fixedTimestamp: loaded.manifest.fixedTimestamp,
      resumePath: p14Session.resumeInput.path,
    }),
  };
}
