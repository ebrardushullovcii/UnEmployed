import type { ProfileCopilotPatchGroup } from "@unemployed/contracts";

import type { ReviseCandidateProfileInput } from "../shared";
import {
  createUniqueId,
  deriveRequestedDetail,
  findPendingRelevantReviewItems,
  getMatchingResolutionStatus,
  normalizeFactText,
  trimNonEmptyString,
} from "./profile-copilot-helpers";

export type PatchApplyMode = ProfileCopilotPatchGroup["applyMode"];
export type PatchOperationName =
  | "replace_identity_fields"
  | "replace_work_eligibility_fields"
  | "replace_professional_summary_fields"
  | "replace_narrative_fields"
  | "replace_answer_bank_fields"
  | "replace_application_identity_fields"
  | "replace_skill_group_fields"
  | "replace_profile_list_fields"
  | "replace_search_preferences_fields";
export type ReviewDomain =
  | "identity"
  | "work_eligibility"
  | "professional_summary"
  | "narrative"
  | "answer_bank"
  | "search_preferences"
  | null;

export interface FieldDescriptor<TValue> {
  aliases: readonly string[];
  applyMode: PatchApplyMode;
  key: string;
  matchesRequest?: (normalizedRequest: string) => boolean;
  operation: PatchOperationName;
  reviewDomain: ReviewDomain;
  title: string;
  parseValue: (detail: string | null, normalizedRequest: string) => TValue | undefined;
  readCurrentValue: (input: ReviseCandidateProfileInput) => TValue;
}

export function uniqueNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalizeFactText(trimmed);

    if (!trimmed || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

export function parseStringList(detail: string): string[] {
  return uniqueNonEmpty(
    detail
      .replace(/\s+and\s+/gi, ",")
      .split(/[\n,;|]/)
      .map((value) => value.trim()),
  );
}

export function requestLooksLikeClear(normalizedRequest: string): boolean {
  return /\b(clear|delete|remove|erase|reset|blank|empty)\b/.test(normalizedRequest);
}

export function parseNullableText(
  detail: string | null,
  normalizedRequest: string,
): string | null | undefined {
  if (requestLooksLikeClear(normalizedRequest)) {
    return null;
  }

  if (!detail) {
    return undefined;
  }

  return trimNonEmptyString(detail) ?? null;
}

export function parseRequiredText(detail: string | null): string | undefined {
  if (!detail) {
    return undefined;
  }

  return trimNonEmptyString(detail) ?? undefined;
}

export function parseNullableList(
  detail: string | null,
  normalizedRequest: string,
): string[] | undefined {
  if (requestLooksLikeClear(normalizedRequest)) {
    return [];
  }

  if (!detail) {
    return undefined;
  }

  return parseStringList(detail);
}

export function parseNullableBoolean(
  detail: string | null,
  normalizedRequest: string,
): boolean | null | undefined {
  if (requestLooksLikeClear(normalizedRequest)) {
    return null;
  }

  const normalized = normalizeFactText(detail ?? normalizedRequest);

  if (!normalized) {
    return undefined;
  }

  if (/\b(yes|true|required|need|needs|willing|available|open|enabled|enable)\b/.test(normalized)) {
    return true;
  }

  if (/\b(no|false|not|dont|don't|disabled|disable|none)\b/.test(normalized)) {
    return false;
  }

  return undefined;
}

export function parseNullableInteger(
  detail: string | null,
  normalizedRequest: string,
): number | null | undefined {
  if (requestLooksLikeClear(normalizedRequest)) {
    return null;
  }

  const source = detail ?? normalizedRequest;
  const match = source.match(/\b(\d{1,6})\b/);
  const value = Number(match?.[1] ?? Number.NaN);

  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function parseSalaryCurrency(
  detail: string | null,
  normalizedRequest: string,
): string | null | undefined {
  const parsed = parseNullableText(detail, normalizedRequest);

  if (parsed === undefined || parsed === null) {
    return parsed;
  }

  return parsed.toUpperCase();
}

export function parseTailoringMode(
  detail: string | null,
  normalizedRequest: string,
): "conservative" | "balanced" | "aggressive" | undefined {
  const normalized = normalizeFactText(detail ?? normalizedRequest);

  if (normalized.includes("conservative")) {
    return "conservative";
  }

  if (normalized.includes("balanced")) {
    return "balanced";
  }

  if (normalized.includes("aggressive")) {
    return "aggressive";
  }

  return undefined;
}

export function parseApprovalMode(
  detail: string | null,
  normalizedRequest: string,
): "draft_only" | "review_before_submit" | "one_click_approve" | "full_auto" | undefined {
  const normalized = normalizeFactText(detail ?? normalizedRequest);

  if (normalized.includes("draft only")) {
    return "draft_only";
  }

  if (normalized.includes("review before submit") || normalized.includes("review before sending")) {
    return "review_before_submit";
  }

  if (normalized.includes("one click approve") || normalized.includes("one-click approve")) {
    return "one_click_approve";
  }

  if (normalized.includes("full auto") || normalized.includes("fully automatic")) {
    return "full_auto";
  }

  return undefined;
}

function normalizeComparableEntry(value: unknown): unknown {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value == null
  ) {
    return normalizeFactText(value);
  }

  return value;
}

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparableEntry(entry));
  }

  if (typeof value === "string") {
    return normalizeFactText(value);
  }

  return value;
}

export function valuesMatch(currentValue: unknown, nextValue: unknown): boolean {
  return JSON.stringify(normalizeComparableValue(currentValue)) === JSON.stringify(normalizeComparableValue(nextValue));
}

export function requestMentionsAlias(normalizedRequest: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => normalizedRequest.includes(normalizeFactText(alias)));
}

function buildOperation(
  operation: PatchOperationName,
  key: string,
  value: unknown,
): ProfileCopilotPatchGroup["operations"][number] {
  return {
    operation,
    value: {
      [key]: value,
    },
  } as ProfileCopilotPatchGroup["operations"][number];
}

export function buildFieldPatchGroup<TValue>(
  input: ReviseCandidateProfileInput,
  descriptor: FieldDescriptor<TValue>,
  nextValue: TValue,
): ProfileCopilotPatchGroup | null {
  const currentValue = descriptor.readCurrentValue(input);
  const matchingReviewItems = descriptor.reviewDomain
    ? findPendingRelevantReviewItems(
        input,
        (item) => item.target.domain === descriptor.reviewDomain && item.target.key === descriptor.key,
      )
    : [];
  const operations: ProfileCopilotPatchGroup["operations"] = [];

  if (!valuesMatch(currentValue, nextValue)) {
    operations.push(buildOperation(descriptor.operation, descriptor.key, nextValue));
  }

  if (matchingReviewItems.length > 0) {
    operations.push({
      operation: "resolve_review_items",
      reviewItemIds: matchingReviewItems.map((item) => item.id),
      resolutionStatus:
        typeof nextValue === "string" || typeof nextValue === "number" || typeof nextValue === "boolean"
          ? getMatchingResolutionStatus(matchingReviewItems[0]!, nextValue)
          : "edited",
    });
  }

  if (operations.length === 0) {
    return null;
  }

  return {
    id: createUniqueId("profile_patch_group"),
    summary: !valuesMatch(currentValue, nextValue)
      ? `Update ${descriptor.title}`
      : `Confirm ${descriptor.title}`,
    applyMode: descriptor.applyMode,
    operations,
    createdAt: new Date().toISOString(),
  };
}

export function buildGenericExplicitFieldPatchGroupFromDescriptors(
  input: ReviseCandidateProfileInput,
  descriptors: ReadonlyArray<FieldDescriptor<unknown>>,
): ProfileCopilotPatchGroup | null {
  const normalizedRequest = normalizeFactText(input.request);
  const detail = deriveRequestedDetail(input.request);
  const orderedDescriptors = [...descriptors].sort((left, right) => {
    const leftSpecificity = Math.max(...left.aliases.map((alias) => alias.length));
    const rightSpecificity = Math.max(...right.aliases.map((alias) => alias.length));

    return rightSpecificity - leftSpecificity;
  });

  for (const descriptor of orderedDescriptors) {
    const matchesRequest = descriptor.matchesRequest
      ? descriptor.matchesRequest(normalizedRequest)
      : requestMentionsAlias(normalizedRequest, descriptor.aliases);

    if (!matchesRequest) {
      continue;
    }

    const nextValue = descriptor.parseValue(detail, normalizedRequest);

    if (nextValue === undefined) {
      continue;
    }

    return buildFieldPatchGroup(input, descriptor, nextValue);
  }

  return null;
}
