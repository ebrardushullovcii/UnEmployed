export * from "./workspace-service";
export * from "./product-action-tools";
export * from "./resume-import-benchmark";
export * from "./user-action-domain";
export * from "./internal/performance-budget-evaluation";
export * from "./internal/performance-evidence";
export * from "./internal/match-assessment-change-audit";
export * from "./internal/application-crm";
export * from "./internal/workspace-crm-methods";
export {
  areEquivalentEducationRecords,
  areEquivalentExperienceRecords,
  scoreEducationRecordCompleteness,
  scoreExperienceRecordCompleteness,
} from "./internal/resume-record-identity";

export {
  applyResumeTimelineRepairAction,
  deriveResumeTimelineRepairProposals,
  persistResumeTimelineRepairAction,
} from "./internal/resume-timeline-repair";

export {
  applyCompanyIntelligenceMutation,
  projectCompanyApplicationHistory,
  projectCompanyDuplicateJobs,
  projectCompanyOpenings,
  reconcileCompanies,
  reviewCompanyMerge,
  setCompanyPreference,
} from "./internal/company-intelligence-operations";

export {
  applyCompanyApplicationEvidence,
  deriveActiveSafeguardBlockers,
  deriveBatchSampleIds,
  deriveHighestPriorityBlocker,
  deriveLatestListingSignal,
  deriveScopeBlockers,
  dismissContradictoryAnswerDetection,
  dismissSafeguardEntry,
  prepareBatchSampleReview,
  recordAbnormalFailureEvidence,
  recordContradictoryAnswerDetection,
  recordListingSignal,
  recordSimultaneousApplicationConflict,
  resolveContradictoryAnswerDetection,
  resolveSimultaneousApplicationConflict,
  restoreSafeguardEntry,
  updateBatchSampleReview,
} from "./internal/safeguard-operations";
export {
  createDefaultListingHtmlFetcher,
  type ListingHtmlFetcher,
} from "./internal/listing-detail-enrichment";
