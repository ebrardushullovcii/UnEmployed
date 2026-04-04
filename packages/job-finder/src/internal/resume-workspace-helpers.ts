import type { TailoredResumeDraft } from "@unemployed/ai-providers";
import {
  ResumeAssistantMessageSchema,
  ResumeDraftRevisionSchema,
  ResumeDraftSchema,
  ResumeExportArtifactSchema,
  ResumeValidationResultSchema,
  TailoredAssetSchema,
  type CandidateProfile,
  type JobFinderSettings,
  type ResumeAssistantMessage,
  type ResumeDraft,
  type ResumeDraftBullet,
  type ResumeDraftPatch,
  type ResumeDraftRevision,
  type ResumeDraftSection,
  type ResumeExportArtifact,
  type ResumeResearchArtifact,
  type ResumeDraftSourceRef,
  type ResumeValidationIssue,
  type ResumeValidationResult,
  type SavedJob,
  type TailoredAsset,
} from "@unemployed/contracts";
import { createLocalKnowledgeIndex } from "@unemployed/knowledge-base";
import { normalizeText, uniqueStrings } from "./shared";

export interface ResumeWorkspaceEvidence {
  summary: readonly string[];
  candidateSummary: readonly string[];
  experience: readonly string[];
  skills: readonly string[];
  keywords: readonly string[];
}

export interface ResumeWorkspaceResearchContext {
  companyNotes: readonly string[];
  domainVocabulary: readonly string[];
  priorityThemes: readonly string[];
}

function createBullet(
  id: string,
  text: string,
  updatedAt: string,
  origin: ResumeDraftBullet["origin"],
  sourceRefs: readonly ResumeDraftSourceRef[] = [],
): ResumeDraftBullet {
  return {
    id,
    text,
    origin,
    locked: false,
    included: true,
    sourceRefs: [...sourceRefs],
    updatedAt,
  };
}

function toSectionKind(label: string): ResumeDraftSection["kind"] {
  const normalized = normalizeText(label);

  if (normalized.includes("summary")) {
    return "summary";
  }

  if (normalized.includes("skill")) {
    return "skills";
  }

  if (normalized.includes("project")) {
    return "projects";
  }

  if (normalized.includes("education")) {
    return "education";
  }

  if (normalized.includes("certification")) {
    return "certifications";
  }

  if (normalized.includes("keyword")) {
    return "keywords";
  }

  return "experience";
}

function createSection(
  input: {
    id: string;
    kind: ResumeDraftSection["kind"];
    label: string;
    text?: string | null;
    bullets?: readonly string[];
    updatedAt: string;
    origin: ResumeDraftSection["origin"];
    sortOrder: number;
    sourceRefs?: readonly ResumeDraftSourceRef[];
  },
): ResumeDraftSection {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    text: input.text ?? null,
      bullets: (input.bullets ?? []).map((bullet, index) =>
        createBullet(
          `${input.id}_bullet_${index + 1}`,
          bullet,
          input.updatedAt,
          input.origin,
          input.sourceRefs ?? [],
        ),
      ),
    origin: input.origin,
    locked: false,
    included: true,
    sortOrder: input.sortOrder,
    profileRecordId: null,
    sourceRefs: [...(input.sourceRefs ?? [])],
    updatedAt: input.updatedAt,
  };
}

function createSourceRef(
  sourceKind: ResumeDraftSourceRef["sourceKind"],
  sourceId: string | null,
  snippet: string | null,
): ResumeDraftSourceRef {
  return {
    id: `resume_source_${sourceKind}_${sourceId ?? Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceKind,
    sourceId,
    snippet,
  };
}

function safeSnippet(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 220);
}

function buildJobContextText(job: SavedJob): string {
  return [
    job.title,
    job.company,
    job.location,
    job.summary,
    job.description,
    ...job.keySkills,
    ...job.responsibilities,
    ...job.minimumQualifications,
    ...job.preferredQualifications,
    job.seniority,
    job.employmentType,
    job.department,
    job.team,
    job.salaryText,
    ...job.benefits,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildPriorityJobTerms(job: SavedJob): string[] {
  return uniqueStrings([
    ...job.keySkills,
    ...job.responsibilities,
    ...job.minimumQualifications,
    ...job.preferredQualifications,
    ...job.benefits,
    ...(job.seniority ? [job.seniority] : []),
    ...(job.employmentType ? [job.employmentType] : []),
    ...(job.department ? [job.department] : []),
    ...(job.team ? [job.team] : []),
  ]);
}

export function buildPreviewSectionsFromResumeDraft(
  draft: ResumeDraft,
): Array<{ heading: string; lines: string[] }> {
  return [...draft.sections]
    .filter((section) => section.included)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => {
      const lines = [
        ...(section.text ? [section.text] : []),
        ...section.bullets.filter((bullet) => bullet.included).map((bullet) => bullet.text),
      ];

      return {
        heading: section.label,
        lines,
      };
    })
    .filter((section) => section.lines.length > 0);
}

export function buildTailoredResumeTextFromResumeDraft(
  profile: CandidateProfile,
  job: SavedJob,
  draft: ResumeDraft,
): string {
  const sections = buildPreviewSectionsFromResumeDraft(draft)
    .map((section) => `${section.heading}\n${section.lines.join("\n")}`)
    .join("\n\n");

  return `${profile.fullName}\n${profile.headline}\n${profile.currentLocation}\n\nTarget Role: ${job.title} at ${job.company}\n\n${sections}\n`;
}

export function buildResumeDraftFromTailoredDraft(input: {
  job: SavedJob;
  settings: JobFinderSettings;
  draft: TailoredResumeDraft;
  createdAt: string;
  existingDraftId?: string | null;
  generationMethod: ResumeDraft["generationMethod"];
  profile?: CandidateProfile;
  research?: readonly ResumeResearchArtifact[];
}): ResumeDraft {
  const { createdAt, draft, existingDraftId, generationMethod, job, settings } = input;
  const jobRef = createSourceRef("job", job.id, safeSnippet(job.description || job.summary || buildJobContextText(job)));
  const resumeRef = input.profile?.baseResume.textContent
    ? createSourceRef("resume", input.profile.baseResume.id, safeSnippet(input.profile.baseResume.textContent))
    : null;
  const researchRef = input.research?.find((artifact) => artifact.fetchStatus === "success")
    ? createSourceRef(
        "research",
        input.research.find((artifact) => artifact.fetchStatus === "success")?.id ?? null,
        safeSnippet(input.research.find((artifact) => artifact.fetchStatus === "success")?.companyNotes ?? null),
      )
    : null;
  const sharedRefs = [jobRef, resumeRef, researchRef].filter(
    (value): value is ResumeDraftSourceRef => value !== null,
  );

  return ResumeDraftSchema.parse({
    id: existingDraftId ?? `resume_draft_${job.id}`,
    jobId: job.id,
    status: "needs_review",
    templateId: settings.resumeTemplateId,
    sections: [
      createSection({
        id: "section_summary",
        kind: "summary",
        label: "Summary",
        text: draft.summary,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 0,
        sourceRefs: sharedRefs,
      }),
      createSection({
        id: "section_experience",
        kind: "experience",
        label: "Experience Highlights",
        bullets: draft.experienceHighlights,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 1,
        sourceRefs: sharedRefs,
      }),
      createSection({
        id: "section_skills",
        kind: "skills",
        label: "Core Skills",
        bullets: draft.coreSkills,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 2,
        sourceRefs: sharedRefs,
      }),
      createSection({
        id: "section_keywords",
        kind: "keywords",
        label: "Targeted Keywords",
        bullets: draft.targetedKeywords,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 3,
        sourceRefs: sharedRefs,
      }),
    ].filter((section) => section.text || section.bullets.length > 0),
    targetPageCount: 2,
    generationMethod,
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function seedResumeDraft(input: {
  profile: CandidateProfile;
  job: SavedJob;
  settings: JobFinderSettings;
  tailoredAsset?: TailoredAsset | null;
}): ResumeDraft {
  const now = input.tailoredAsset?.updatedAt ?? new Date().toISOString();
  const tailoredAsset = input.tailoredAsset;

  if (tailoredAsset) {
    const seededSections = tailoredAsset.previewSections
      .map((section, index) => {
        const kind = toSectionKind(section.heading);
        const text = kind === "summary" && section.lines[0] ? section.lines[0] : null;
        const bullets = kind === "summary" ? section.lines.slice(1) : section.lines;

        return createSection({
          id: `section_${normalizeText(section.heading).replaceAll(" ", "_") || index + 1}`,
          kind,
          label: section.heading,
          text,
          bullets,
          updatedAt: now,
          origin:
            tailoredAsset.generationMethod === "ai_assisted"
              ? "ai_generated"
              : "deterministic_fallback",
          sortOrder: index,
        });
      })
      .filter((section) => section.text || section.bullets.length > 0);

    if (seededSections.length > 0) {
      return ResumeDraftSchema.parse({
        id: `resume_draft_${input.job.id}`,
        jobId: input.job.id,
        status: "draft",
        templateId: input.settings.resumeTemplateId,
        sections: seededSections,
        targetPageCount: 2,
        generationMethod:
          tailoredAsset.generationMethod === "ai_assisted"
            ? "ai"
            : "deterministic",
        approvedAt: null,
        approvedExportId: null,
        staleReason: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const summaryText =
    input.profile.professionalSummary.fullSummary ??
    input.profile.summary ??
    `${input.profile.headline} targeting ${input.job.title} opportunities.`;
  const matchingSkills = uniqueStrings([
    ...input.job.keySkills.filter((skill) =>
      input.profile.skills.some(
        (profileSkill) => normalizeText(profileSkill) === normalizeText(skill),
      ),
    ),
    ...input.profile.skills,
  ]).slice(0, 8);
  const experienceBullets = input.profile.experiences
    .flatMap((experience) => experience.achievements)
    .slice(0, 6);

  return ResumeDraftSchema.parse({
    id: `resume_draft_${input.job.id}`,
    jobId: input.job.id,
    status: "draft",
    templateId: input.settings.resumeTemplateId,
    sections: [
      createSection({
        id: "section_summary",
        kind: "summary",
        label: "Summary",
        text: summaryText,
        updatedAt: now,
        origin: "imported",
        sortOrder: 0,
      }),
      createSection({
        id: "section_experience",
        kind: "experience",
        label: "Experience Highlights",
        bullets: experienceBullets,
        updatedAt: now,
        origin: "imported",
        sortOrder: 1,
      }),
      createSection({
        id: "section_skills",
        kind: "skills",
        label: "Core Skills",
        bullets: matchingSkills,
        updatedAt: now,
        origin: "imported",
        sortOrder: 2,
      }),
    ].filter((section) => section.text || section.bullets.length > 0),
    targetPageCount: 2,
    generationMethod: "manual",
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function validateResumeDraft(input: {
  draft: ResumeDraft;
  job: SavedJob;
  pageCount?: number | null;
  validatedAt?: string;
}): ResumeValidationResult {
  const validatedAt = input.validatedAt ?? new Date().toISOString();
  const issues: ResumeValidationIssue[] = [];
  const seenBullets = new Map<string, { sectionId: string; bulletId: string }>();
  const includedSections = input.draft.sections.filter((section) => section.included);

  for (const section of includedSections) {
    const includedBullets = section.bullets.filter((bullet) => bullet.included);

    if (!section.text && includedBullets.length === 0) {
      issues.push({
        id: `issue_empty_${section.id}`,
        severity: "warning",
        category: "empty_section",
        sectionId: section.id,
        bulletId: null,
        message: `${section.label} is included but has no content yet.`,
      });
    }

    for (const bullet of includedBullets) {
      const normalizedBullet = normalizeText(bullet.text);
      const existing = seenBullets.get(normalizedBullet);

      if (existing) {
        issues.push({
          id: `issue_duplicate_${bullet.id}`,
          severity: "warning",
          category: "duplicate_bullet",
          sectionId: section.id,
          bulletId: bullet.id,
          message: "This bullet duplicates another included bullet.",
        });
      } else {
        seenBullets.set(normalizedBullet, {
          sectionId: section.id,
          bulletId: bullet.id,
        });
      }
    }
  }

  const visibleText = normalizeText(
    buildPreviewSectionsFromResumeDraft(input.draft)
      .flatMap((section) => section.lines)
      .join(" "),
  );
  const keywordTargets = buildPriorityJobTerms(input.job);
  const matchingKeywords = keywordTargets.filter((skill) =>
    visibleText.includes(normalizeText(skill)),
  );

  if (keywordTargets.length > 0 && matchingKeywords.length === 0) {
    issues.push({
      id: `issue_keywords_${input.draft.id}`,
      severity: "info",
      category: "poor_keyword_coverage",
      sectionId: null,
      bulletId: null,
      message: "The current draft does not yet echo the saved job keywords.",
    });
  }

  if (input.pageCount && input.pageCount > input.draft.targetPageCount) {
    issues.push({
      id: `issue_page_overflow_${input.draft.id}`,
      severity: input.pageCount >= 3 ? "error" : "warning",
      category: "page_overflow",
      sectionId: null,
      bulletId: null,
      message:
        input.pageCount >= 3
          ? "The exported resume reached 3 or more pages and needs manual review."
          : "The exported resume exceeded the 2-page target.",
    });
  }

  if (input.draft.status === "stale" || input.draft.staleReason) {
    issues.push({
      id: `issue_stale_${input.draft.id}`,
      severity: "warning",
      category: "stale_approval",
      sectionId: null,
      bulletId: null,
      message: input.draft.staleReason ?? "This approved resume is stale and should be re-reviewed.",
    });
  }

  return ResumeValidationResultSchema.parse({
    id: `resume_validation_${input.draft.id}`,
    draftId: input.draft.id,
    issues,
    pageCount: input.pageCount ?? null,
    validatedAt,
  });
}

function assertAssistantMayEdit(
  patch: ResumeDraftPatch,
  section: ResumeDraftSection,
  bullet?: ResumeDraftBullet | null,
): void {
  if (patch.origin !== "assistant") {
    return;
  }

  if (section.locked || bullet?.locked) {
    throw new Error("Assistant patches cannot overwrite locked resume content.");
  }
}

function updateSectionMeta(
  section: ResumeDraftSection,
  patch: ResumeDraftPatch,
  updatedAt: string,
): ResumeDraftSection {
  return {
    ...section,
    origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
    updatedAt,
  };
}

export function applyPatchToResumeDraft(input: {
  draft: ResumeDraft;
  patch: ResumeDraftPatch;
  updatedAt: string;
}): ResumeDraft {
  const { draft, patch, updatedAt } = input;
  const targetSection = draft.sections.find(
    (section) => section.id === patch.targetSectionId,
  );

  if (!targetSection) {
    throw new Error(`Unable to find resume section '${patch.targetSectionId}'.`);
  }

  const nextSections = draft.sections.map((section) => {
    if (section.id !== patch.targetSectionId) {
      return section;
    }

    const targetBullet = patch.targetBulletId
      ? section.bullets.find((bullet) => bullet.id === patch.targetBulletId) ?? null
      : null;

    assertAssistantMayEdit(patch, section, targetBullet);

    switch (patch.operation) {
      case "replace_section_text":
        return updateSectionMeta(
          {
            ...section,
            text: patch.newText,
          },
          patch,
          updatedAt,
        );
      case "insert_bullet": {
        if (!patch.newText) {
          throw new Error("A new bullet text value is required for insert_bullet.");
        }

        const newBullet = createBullet(
          patch.targetBulletId ?? `${section.id}_bullet_${Date.now()}`,
          patch.newText,
          updatedAt,
          patch.origin === "assistant" ? "assistant_edited" : "user_edited",
        );
        const bullets = [...section.bullets];

        if (!patch.anchorBulletId) {
          bullets.push(newBullet);
        } else {
          const anchorIndex = bullets.findIndex(
            (bullet) => bullet.id === patch.anchorBulletId,
          );

          if (anchorIndex < 0) {
            throw new Error(`Unable to find anchor bullet '${patch.anchorBulletId}'.`);
          }

          const insertIndex =
            patch.position === "before" ? anchorIndex : anchorIndex + 1;
          bullets.splice(insertIndex, 0, newBullet);
        }

        return updateSectionMeta(
          {
            ...section,
            bullets,
          },
          patch,
          updatedAt,
        );
      }
      case "update_bullet": {
        if (!patch.targetBulletId || !patch.newText) {
          throw new Error("update_bullet requires a bullet id and replacement text.");
        }

        return updateSectionMeta(
          {
            ...section,
            bullets: section.bullets.map((bullet) => {
              if (bullet.id !== patch.targetBulletId) {
                return bullet;
              }

              assertAssistantMayEdit(patch, section, bullet);
              return {
                ...bullet,
                text: patch.newText ?? bullet.text,
                origin:
                  patch.origin === "assistant"
                    ? "assistant_edited"
                    : "user_edited",
                updatedAt,
              };
            }),
          },
          patch,
          updatedAt,
        );
      }
      case "remove_bullet": {
        if (!patch.targetBulletId) {
          throw new Error("remove_bullet requires a bullet id.");
        }

        return updateSectionMeta(
          {
            ...section,
            bullets: section.bullets.filter(
              (bullet) => bullet.id !== patch.targetBulletId,
            ),
          },
          patch,
          updatedAt,
        );
      }
      case "move_bullet": {
        if (!patch.targetBulletId) {
          throw new Error("move_bullet requires a bullet id.");
        }

        const bullets = [...section.bullets];
        const currentIndex = bullets.findIndex(
          (bullet) => bullet.id === patch.targetBulletId,
        );

        if (currentIndex < 0) {
          throw new Error(`Unable to find bullet '${patch.targetBulletId}'.`);
        }

        const [movingBullet] = bullets.splice(currentIndex, 1);

        if (!movingBullet) {
          throw new Error(`Unable to move bullet '${patch.targetBulletId}'.`);
        }

        if (!patch.anchorBulletId) {
          bullets.push(movingBullet);
        } else {
          const anchorIndex = bullets.findIndex(
            (bullet) => bullet.id === patch.anchorBulletId,
          );

          if (anchorIndex < 0) {
            throw new Error(`Unable to find anchor bullet '${patch.anchorBulletId}'.`);
          }

          bullets.splice(patch.position === "before" ? anchorIndex : anchorIndex + 1, 0, {
            ...movingBullet,
            updatedAt,
          });
        }

        return updateSectionMeta(
          {
            ...section,
            bullets,
          },
          patch,
          updatedAt,
        );
      }
      case "toggle_include": {
        if (patch.targetBulletId) {
          return updateSectionMeta(
            {
              ...section,
              bullets: section.bullets.map((bullet) =>
                bullet.id === patch.targetBulletId
                  ? {
                      ...bullet,
                      included: patch.newIncluded ?? !bullet.included,
                      updatedAt,
                    }
                  : bullet,
              ),
            },
            patch,
            updatedAt,
          );
        }

        return updateSectionMeta(
          {
            ...section,
            included: patch.newIncluded ?? !section.included,
          },
          patch,
          updatedAt,
        );
      }
      case "set_lock": {
        if (patch.targetBulletId) {
          return updateSectionMeta(
            {
              ...section,
              bullets: section.bullets.map((bullet) =>
                bullet.id === patch.targetBulletId
                  ? {
                      ...bullet,
                      locked: patch.newLocked ?? !bullet.locked,
                      updatedAt,
                    }
                  : bullet,
              ),
            },
            patch,
            updatedAt,
          );
        }

        return updateSectionMeta(
          {
            ...section,
            locked: patch.newLocked ?? !section.locked,
          },
          patch,
          updatedAt,
        );
      }
      case "replace_section_bullets":
        return updateSectionMeta(
          {
            ...section,
            bullets: patch.newBullets?.map((bullet) => ({
              ...bullet,
              updatedAt,
            })) ?? [],
          },
          patch,
          updatedAt,
        );
      default:
        return section;
    }
  });

  const sectionsChanged = JSON.stringify(nextSections) !== JSON.stringify(draft.sections);
  if (!sectionsChanged) {
    return draft;
  }

  const approvalWasSet = Boolean(draft.approvedAt || draft.approvedExportId);

  return ResumeDraftSchema.parse({
    ...draft,
    sections: nextSections,
    status: approvalWasSet ? "stale" : "needs_review",
    approvedAt: null,
    approvedExportId: null,
    staleReason: approvalWasSet
      ? "Draft changed after approval and needs a fresh review."
      : null,
    updatedAt,
  });
}

export function buildResumeDraftRevision(input: {
  draft: ResumeDraft;
  createdAt: string;
  reason?: string | null;
}): ResumeDraftRevision {
  return ResumeDraftRevisionSchema.parse({
    id: `resume_revision_${input.draft.id}_${Date.now()}`,
    draftId: input.draft.id,
    snapshotSections: input.draft.sections,
    createdAt: input.createdAt,
    reason: input.reason ?? null,
  });
}

export function buildResumeExportArtifact(input: {
  draft: ResumeDraft;
  job: SavedJob;
  filePath: string;
  exportedAt: string;
  pageCount?: number | null;
  isApproved?: boolean;
}): ResumeExportArtifact {
  return ResumeExportArtifactSchema.parse({
    id: `resume_export_${input.job.id}_${Date.now()}`,
    draftId: input.draft.id,
    jobId: input.job.id,
    format: "pdf",
    filePath: input.filePath,
    pageCount: input.pageCount ?? null,
    templateId: input.draft.templateId,
    exportedAt: input.exportedAt,
    isApproved: input.isApproved ?? false,
  });
}

export function buildTailoredAssetBridge(input: {
  draft: ResumeDraft;
  job: SavedJob;
  profile: CandidateProfile;
  existingAsset?: TailoredAsset | null;
  storagePath?: string | null;
  clearStoragePath?: boolean;
  pageCount?: number | null;
  notes?: readonly string[];
  compatibilityScore?: number | null;
}): TailoredAsset {
  const updatedAt = input.draft.updatedAt;
  const shouldClearStoragePath = input.clearStoragePath ?? false;
  const resolvedStoragePath = shouldClearStoragePath
    ? null
    : input.storagePath ?? input.existingAsset?.storagePath ?? null;
  const isApprovalStale = input.draft.status === "stale" || !resolvedStoragePath;
  const fallbackStatus = isApprovalStale
    ? "failed"
    : input.existingAsset?.status ?? "queued";
  const fallbackProgressPercent = isApprovalStale
    ? 0
    : input.existingAsset?.progressPercent ?? 0;

  return TailoredAssetSchema.parse({
    id: input.existingAsset?.id ?? `resume_${input.job.id}`,
    jobId: input.job.id,
    kind: "resume",
    status: resolvedStoragePath ? "ready" : fallbackStatus,
    label: input.existingAsset?.label ?? "Tailored Resume",
    version: input.existingAsset?.version ?? "v1",
    templateName: input.existingAsset?.templateName ?? input.draft.templateId,
    compatibilityScore:
      input.compatibilityScore ?? input.existingAsset?.compatibilityScore ?? input.job.matchAssessment.score,
    progressPercent: resolvedStoragePath ? 100 : fallbackProgressPercent,
    updatedAt,
    storagePath: resolvedStoragePath,
    contentText: buildTailoredResumeTextFromResumeDraft(
      input.profile,
      input.job,
      input.draft,
    ),
    previewSections: buildPreviewSectionsFromResumeDraft(input.draft),
    generationMethod:
      input.draft.generationMethod === "ai" ? "ai_assisted" : "deterministic",
    notes: uniqueStrings([
      ...(input.existingAsset?.notes ?? []),
      ...(input.notes ?? []),
      ...(input.pageCount ? [`Generated PDF page count: ${input.pageCount}.`] : []),
    ]),
  });
}

export function buildUnavailableAssistantReply(jobId: string): ResumeAssistantMessage {
  return ResumeAssistantMessageSchema.parse({
    id: `resume_message_assistant_${jobId}_${Date.now()}`,
    jobId,
    role: "assistant",
    content:
      "Resume assistant editing is not available in this workspace yet. Save manual edits or regenerate the draft instead.",
    patches: [],
    createdAt: new Date().toISOString(),
  });
}

export function buildAssistantReplyMessage(input: {
  jobId: string;
  content: string;
  patches: readonly ResumeDraftPatch[];
}): ResumeAssistantMessage {
  return ResumeAssistantMessageSchema.parse({
    id: `resume_message_assistant_${input.jobId}_${Date.now()}`,
    jobId: input.jobId,
    role: "assistant",
    content: input.content,
    patches: [...input.patches],
    createdAt: new Date().toISOString(),
  });
}

export function collectResumeWorkspaceEvidence(input: {
  profile: CandidateProfile;
  job: SavedJob;
  research: readonly ResumeResearchArtifact[];
}): ResumeWorkspaceEvidence {
  const index = createLocalKnowledgeIndex();
  const candidateSummaryEvidence = uniqueStrings([
    input.profile.professionalSummary.shortValueProposition ?? "",
    input.profile.professionalSummary.fullSummary ?? "",
    input.profile.summary ?? "",
    ...input.profile.experiences
      .map((experience) => experience.summary ?? "")
      .filter(Boolean),
  ]).slice(0, 4);

  if (input.profile.baseResume.textContent) {
    index.addDocument(input.profile.baseResume.id, input.profile.baseResume.textContent, {
      tags: ["resume"],
      title: "Base Resume",
      section: "resume",
      sourceId: input.profile.baseResume.id,
    });
  }

  input.profile.experiences.forEach((experience) => {
    const text = [
      experience.title,
      experience.companyName,
      experience.summary,
      ...experience.achievements,
      ...experience.skills,
    ]
      .filter(Boolean)
      .join(" ");
    if (text.trim()) {
      index.addDocument(experience.id, text, {
        tags: ["profile"],
        title: experience.title,
        section: "experience",
        sourceId: experience.id,
      });
    }
  });

  const skillText = uniqueStrings([
    ...input.profile.skills,
    ...input.profile.skillGroups.coreSkills,
    ...input.profile.skillGroups.tools,
    ...input.profile.skillGroups.languagesAndFrameworks,
  ]).join(" ");
  if (skillText.trim()) {
    index.addDocument("profile_skills", skillText, {
      tags: ["profile"],
      title: "Profile Skills",
      section: "skills",
      sourceId: "profile_skills",
    });
  }

  index.addDocument(input.job.id, buildJobContextText(input.job), {
    tags: ["job"],
    title: input.job.title,
    section: "job",
    sourceId: input.job.id,
  });

  input.research.forEach((artifact) => {
    const text = [
      artifact.pageTitle,
      artifact.companyNotes,
      artifact.extractedText,
      ...artifact.domainVocabulary,
      ...artifact.priorityThemes,
    ]
      .filter(Boolean)
      .join(" ");
    if (text.trim()) {
      index.addDocument(artifact.id, text, {
        tags: ["research"],
        title: artifact.pageTitle,
        section: "research",
        sourceId: artifact.id,
      });
    }
  });

  return {
    summary: index.search(`${input.job.title} ${input.job.company} summary`, { limit: 3 }).map((entry: { text: string }) => entry.text),
    candidateSummary: candidateSummaryEvidence,
    experience: index.search(`${input.job.title} ${buildPriorityJobTerms(input.job).join(" ")} achievements`, { limit: 4, tags: ["profile", "resume"] }).map((entry: { text: string }) => entry.text),
    skills: index.search(`${buildPriorityJobTerms(input.job).join(" ")} ${input.job.title} skills`, { limit: 6, tags: ["profile", "job"] }).map((entry: { text: string }) => entry.text),
    keywords: uniqueStrings([
      ...buildPriorityJobTerms(input.job),
      ...input.research.flatMap((artifact) => artifact.domainVocabulary),
    ]).slice(0, 8),
  };
}

export function collectResearchContext(
  research: readonly ResumeResearchArtifact[],
): ResumeWorkspaceResearchContext {
  return {
    companyNotes: research
      .map((artifact) => artifact.companyNotes)
      .filter((value): value is string => Boolean(value))
      .slice(0, 3),
    domainVocabulary: uniqueStrings(research.flatMap((artifact) => artifact.domainVocabulary)).slice(0, 8),
    priorityThemes: uniqueStrings(research.flatMap((artifact) => artifact.priorityThemes)).slice(0, 6),
  };
}
