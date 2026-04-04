import type {
  ResumeDraftBullet,
  ResumeDraftSection,
  ResumeDraftSourceRef,
  SavedJob,
} from "@unemployed/contracts";
import { createUniqueId, normalizeText, uniqueStrings } from "./shared";

export function createBullet(
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

export function toSectionKind(label: string): ResumeDraftSection["kind"] {
  const normalized = normalizeText(label);

  if (/\bskill(s)?\b/.test(normalized)) {
    return "skills";
  }

  if (/\bproject(s)?\b/.test(normalized)) {
    return "projects";
  }

  if (normalized.includes("keyword")) {
    return "keywords";
  }

  if (normalized.includes("certification")) {
    return "certifications";
  }

  if (normalized.includes("education")) {
    return "education";
  }

  if (normalized.includes("summary")) {
    return "summary";
  }

  return "experience";
}

export function createSection(
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

export function createSourceRef(
  sourceKind: ResumeDraftSourceRef["sourceKind"],
  sourceId: string | null,
  snippet: string | null,
): ResumeDraftSourceRef {
  return {
    id: createUniqueId(
      `resume_source_${sourceKind}${sourceId ? `_${sourceId}` : ""}`,
    ),
    sourceKind,
    sourceId,
    snippet,
  };
}

export function safeSnippet(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 220);
}

export function buildJobContextText(job: SavedJob): string {
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

export function buildPriorityJobTerms(job: SavedJob): string[] {
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
