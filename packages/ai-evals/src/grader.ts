import { EvalGradeSchema, type EvalAttempt, type EvalCase } from "./contracts";

type JsonRecord = Record<string, unknown>;

const stopWords = new Set([
  "about",
  "after",
  "already",
  "and",
  "are",
  "from",
  "into",
  "only",
  "that",
  "the",
  "their",
  "this",
  "with",
  "without",
]);

function normalize(value: unknown): string {
  return JSON.stringify(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9+./:@-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value
        .map(asRecord)
        .filter((record): record is JsonRecord => record !== null)
    : [];
}

function getPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

function stringsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsFromUnknown);
  const record = asRecord(value);
  return record ? Object.values(record).flatMap(stringsFromUnknown) : [];
}

function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value, "https://jobs.example.com");
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function textEquals(actual: unknown, expected: unknown): boolean {
  return typeof actual === "string" && typeof expected === "string"
    ? normalize(actual) === normalize(expected)
    : actual === expected;
}

function postingsFromOutput(output: unknown): JsonRecord[] {
  if (Array.isArray(output)) return asRecordArray(output);
  const record = asRecord(output);
  if (!record) return [];
  return asRecordArray(record.jobs ?? record.postings);
}

function postingFieldMatches(
  posting: JsonRecord,
  field: string,
  expected: unknown,
): boolean {
  if (field === "skills") {
    const skills = stringsFromUnknown(posting.keySkills ?? posting.skills).map(
      (value) => normalize(value),
    );
    return (
      Array.isArray(expected) &&
      expected.every(
        (item) => typeof item === "string" && skills.includes(normalize(item)),
      )
    );
  }
  if (field === "canonicalUrl") {
    return (
      typeof expected === "string" &&
      typeof posting.canonicalUrl === "string" &&
      canonicalizeUrl(posting.canonicalUrl) === canonicalizeUrl(expected)
    );
  }
  if (field === "canonicalPath") {
    if (
      typeof expected !== "string" ||
      typeof posting.canonicalUrl !== "string"
    )
      return false;
    try {
      return (
        new URL(posting.canonicalUrl, "https://jobs.example.com").pathname ===
        expected
      );
    } catch {
      return false;
    }
  }
  return textEquals(posting[field], expected);
}

function gradeJobExtraction(evalCase: EvalCase, output: unknown) {
  const expected = asRecord(evalCase.expected);
  const expectedPostings = asRecordArray(expected?.postings);
  const postings = postingsFromOutput(output);
  let total = 1;
  let earned = postings.length === expected?.count ? 1 : 0;
  let observed = earned;

  for (const expectedPosting of expectedPostings) {
    const candidate = postings.find((posting) => {
      if (typeof expectedPosting.canonicalUrl === "string") {
        return postingFieldMatches(
          posting,
          "canonicalUrl",
          expectedPosting.canonicalUrl,
        );
      }
      if (typeof expectedPosting.canonicalPath === "string") {
        return postingFieldMatches(
          posting,
          "canonicalPath",
          expectedPosting.canonicalPath,
        );
      }
      return textEquals(posting.title, expectedPosting.title);
    });
    for (const [field, expectedValue] of Object.entries(expectedPosting)) {
      total += 1;
      if (candidate && postingFieldMatches(candidate, field, expectedValue)) {
        earned += 1;
        observed += 1;
      }
    }
  }
  return { earned, observed, total };
}

function profileOperations(output: unknown): JsonRecord[] {
  const record = asRecord(output);
  return asRecordArray(record?.patchGroups).flatMap((group) =>
    asRecordArray(group.operations),
  );
}

function gradeProfileCopilot(evalCase: EvalCase, output: unknown) {
  const expected = asRecord(evalCase.expected);
  const expectedMode = expected?.mode;
  const expectedValue = expected?.value;
  const operations = profileOperations(output);
  const text = normalize(output);
  const operationNames = operations
    .map((operation) => operation.operation)
    .filter((value): value is string => typeof value === "string");
  let correctMode = false;
  switch (expectedMode) {
    case "headline":
      correctMode = operationNames.includes("replace_identity_fields");
      break;
    case "summary":
      correctMode = operationNames.includes(
        "replace_professional_summary_fields",
      );
      break;
    case "project_link":
      correctMode = operationNames.includes("upsert_link_record");
      break;
    case "target_roles":
    case "preferences":
      correctMode = operationNames.includes(
        "replace_search_preferences_fields",
      );
      break;
    case "compensation":
      correctMode = operationNames.includes(
        "replace_compensation_preferences_fields",
      );
      break;
    case "guidance_only":
    case "clarification":
    case "abstain":
      correctMode = operations.length === 0;
      break;
    case "needs_review":
      correctMode =
        operations.length >= 2 &&
        asRecordArray(asRecord(output)?.patchGroups).every(
          (group) => group.applyMode === "needs_review",
        );
      break;
  }
  const valueTokens =
    typeof expectedValue === "string" ? salientTokens(expectedValue) : [];
  const valueCoverage =
    valueTokens.length === 0
      ? 0
      : valueTokens.filter((token) => text.includes(token)).length /
        valueTokens.length;
  return {
    earned: (correctMode ? 1 : 0) + valueCoverage,
    observed: (correctMode ? 1 : 0) + (valueCoverage >= 0.6 ? 1 : 0),
    total: 2,
  };
}

function gradeSourceDebug(evalCase: EvalCase, output: unknown) {
  const expectedOutcome = getPath(evalCase.expected, ["outcome"]);
  const record = asRecord(output);
  const instruction = asRecord(record?.finalizedInstruction) ?? record;
  const text = normalize(instruction);
  const steps = asRecordArray(instruction?.steps);
  const manual =
    instruction?.requiresLogin === true ||
    (instruction?.manualPrerequisite !== null &&
      instruction?.manualPrerequisite !== undefined) ||
    text.includes("sign in required") ||
    text.includes("authentication");
  let outcomeMatched = false;
  switch (expectedOutcome) {
    case "direct_jobs_route":
      outcomeMatched = text.includes("jobs") && !manual;
      break;
    case "navigate_once":
      outcomeMatched = steps.length > 0 && text.includes("open roles");
      break;
    case "search_controls":
      outcomeMatched = text.includes("search") && text.includes("results");
      break;
    case "avoid_false_instruction":
      outcomeMatched =
        text.includes("unchanged") ||
        text.includes("did not") ||
        steps.length === 0;
      break;
    case "guest_ok":
      outcomeMatched = text.includes("guest") && !manual;
      break;
    case "dismiss_overlay":
      outcomeMatched = text.includes("cookie") && text.includes("reject");
      break;
    case "canonical_route":
      outcomeMatched = !text.includes("utm_source") && text.includes("jobs");
      break;
    case "unusable":
      outcomeMatched =
        text.includes("unavailable") || text.includes("download");
      break;
    case "manual_prerequisite":
      outcomeMatched = manual;
      break;
  }
  const hasEvidence =
    stringsFromUnknown(instruction?.evidence ?? instruction?.observedEvidence)
      .length > 0 || stringsFromUnknown(record?.worker).length > 0;
  return {
    earned: (outcomeMatched ? 1 : 0) + (hasEvidence ? 1 : 0),
    observed: (outcomeMatched ? 1 : 0) + (hasEvidence ? 1 : 0),
    total: 2,
  };
}

function gradeStructuredCapability(evalCase: EvalCase, output: unknown) {
  switch (evalCase.capability) {
    case "job_page_extraction":
      return gradeJobExtraction(evalCase, output);
    case "profile_copilot":
      return gradeProfileCopilot(evalCase, output);
    case "source_debug":
      return gradeSourceDebug(evalCase, output);
    case "agentic_job_discovery": {
      const expectedCount = getPath(evalCase.expected, ["usefulDistinctJobs"]);
      const postings = postingsFromOutput(output);
      const canonicalUrls = postings
        .map((posting) => posting.canonicalUrl)
        .filter((url): url is string => typeof url === "string")
        .map(canonicalizeUrl);
      const correctCount =
        typeof expectedCount === "number" && postings.length === expectedCount;
      const distinct = new Set(canonicalUrls).size === postings.length;
      return {
        earned: (correctCount ? 1 : 0) + (distinct ? 1 : 0),
        observed: (correctCount ? 1 : 0) + (distinct ? 1 : 0),
        total: 2,
      };
    }
    case "guided_resume_edits": {
      const record = asRecord(output);
      const patches = asRecordArray(record?.patches);
      const validPatches = patches.filter(
        (patch) =>
          typeof patch.operation === "string" &&
          typeof patch.targetSectionId === "string" &&
          typeof patch.id === "string",
      );
      return {
        earned:
          patches.length > 0 && validPatches.length === patches.length ? 1 : 0,
        observed: validPatches.length,
        total: 1,
      };
    }
    case "resume_vision": {
      const candidates = asRecordArray(asRecord(output)?.candidates);
      const valid = candidates.filter(
        (candidate) =>
          typeof candidate.targetField === "string" &&
          typeof candidate.value === "string" &&
          stringsFromUnknown(candidate.evidence).length > 0,
      );
      return {
        earned: valid.length > 0 ? 1 : 0,
        observed: valid.length,
        total: 1,
      };
    }
    case "browser_visual_analysis": {
      const record = asRecord(output);
      const observations = asRecordArray(record?.observations);
      const valid = observations.filter(
        (observation) =>
          typeof observation.id === "string" &&
          typeof observation.kind === "string" &&
          ["info", "warning", "critical"].includes(
            String(observation.severity),
          ),
      );
      return {
        earned: valid.length > 0 ? 1 : 0,
        observed: valid.length,
        total: 1,
      };
    }
    case "interview_cue": {
      const record = asRecord(output);
      const valid =
        typeof record?.title === "string" &&
        Array.isArray(record.answerOutline) &&
        record.answerOutline.length > 0 &&
        Array.isArray(record.supportingPoints);
      return { earned: valid ? 1 : 0, observed: valid ? 1 : 0, total: 1 };
    }
    case "interview_screenshot_vision": {
      const record = asRecord(output);
      const valid =
        typeof record?.summary === "string" ||
        asRecordArray(record?.observations).length > 0;
      return { earned: valid ? 1 : 0, observed: valid ? 1 : 0, total: 1 };
    }
    default:
      return null;
  }
}

function relevantOutput(evalCase: EvalCase, output: unknown): unknown {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }
  const record = output as Record<string, unknown>;
  if (evalCase.capability === "agentic_job_discovery")
    return record.jobs ?? output;
  if (evalCase.capability === "source_debug") {
    if (record.finalizedInstruction) return record.finalizedInstruction;
    const worker =
      record.worker !== null && typeof record.worker === "object"
        ? (record.worker as Record<string, unknown>)
        : record;
    return {
      steps: worker.steps,
      phaseEvidence: worker.phaseEvidence,
      debugFindings: worker.debugFindings,
      error: worker.error,
    };
  }
  return output;
}

function collectExpectedLeaves(value: unknown): Array<string | number> {
  if (typeof value === "string" || typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(collectExpectedLeaves);
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectExpectedLeaves);
}

function salientTokens(value: string): string[] {
  return Array.from(
    new Set(
      normalize(value)
        .split(" ")
        .filter((token) => token.length >= 3 && !stopWords.has(token)),
    ),
  );
}

function outputCountForCapability(
  evalCase: EvalCase,
  output: unknown,
): number | null {
  if (Array.isArray(output)) {
    if (evalCase.capability === "job_page_extraction") return output.length;
    const nestedCounts = output
      .map((entry) => outputCountForCapability(evalCase, entry))
      .filter((count): count is number => count !== null);
    return nestedCounts.length > 0 ? Math.max(...nestedCounts) : null;
  }
  if (output === null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (evalCase.capability === "job_page_extraction") {
    if (Array.isArray(record.jobs)) return record.jobs.length;
    if (Array.isArray(record.postings)) return record.postings.length;
  }
  if (evalCase.capability === "agentic_job_discovery") {
    if (Array.isArray(record.jobs)) return record.jobs.length;
    if (typeof record.usefulDistinctJobs === "number") {
      return record.usefulDistinctJobs;
    }
  }
  return null;
}

function gradeOutput(evalCase: EvalCase, output: unknown) {
  const outputText = normalize(relevantOutput(evalCase, output));
  const expectedLeaves = collectExpectedLeaves(evalCase.expected);
  const expectedCount =
    evalCase.expected !== null &&
    typeof evalCase.expected === "object" &&
    !Array.isArray(evalCase.expected)
      ? (evalCase.expected.count ?? evalCase.expected.usefulDistinctJobs)
      : undefined;

  let observedExpectedItems = 0;
  let totalExpectedItems = 0;
  let earned = 0;

  const structured = gradeStructuredCapability(evalCase, output);
  if (structured) {
    observedExpectedItems += structured.observed;
    totalExpectedItems += structured.total;
    earned += structured.earned;
  }

  for (const expected of structured ? [] : expectedLeaves) {
    if (typeof expected === "number") continue;
    const tokens = salientTokens(expected);
    if (tokens.length === 0) continue;
    totalExpectedItems += 1;
    const tokenMatches = tokens.filter((token) => outputText.includes(token));
    const ratio = tokenMatches.length / tokens.length;
    earned += ratio;
    if (ratio >= 0.6) observedExpectedItems += 1;
  }

  if (!structured && typeof expectedCount === "number") {
    totalExpectedItems += 1;
    const actualCount = outputCountForCapability(evalCase, output);
    if (actualCount === expectedCount) {
      earned += 1;
      observedExpectedItems += 1;
    } else if (actualCount !== null && expectedCount > 0) {
      earned += Math.max(
        0,
        1 - Math.abs(actualCount - expectedCount) / expectedCount,
      );
    }
  }

  const forbiddenClaimCount = evalCase.forbiddenClaims.filter((claim) => {
    const claimTokens = salientTokens(claim);
    return (
      claimTokens.length > 0 &&
      claimTokens.every((token) => outputText.includes(token))
    );
  }).length;
  const expectedEvidenceScore =
    totalExpectedItems === 0
      ? 0
      : Math.round((earned / totalExpectedItems) * 1000) / 10;

  return {
    expectedEvidenceScore,
    forbiddenClaimCount,
    observedExpectedItems,
    totalExpectedItems,
  };
}

function statusScore(attempt: EvalAttempt): number {
  switch (attempt.status) {
    case "succeeded":
      return 100;
    case "fallback_succeeded":
      return 45;
    case "unsupported":
      return 0;
    case "timed_out":
      return 10;
    case "failed":
      return 0;
  }
}

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

export function gradeEvalAttempt(evalCase: EvalCase, attempt: EvalAttempt) {
  if (attempt.caseId !== evalCase.id) {
    throw new Error(
      `Attempt case ${attempt.caseId} does not match ${evalCase.id}.`,
    );
  }
  const modelContribution = gradeOutput(evalCase, attempt.modelOutput);
  const guardedProduct = gradeOutput(evalCase, attempt.productOutput);
  const fallbackPenalty = attempt.fallbackDetected ? 35 : 0;
  const guardedRejectionPenalty = attempt.guardedRejectionDetected ? 15 : 0;
  const currentStatusScore = statusScore(attempt);
  const objectiveModelScore = clampScore(
    modelContribution.expectedEvidenceScore * 0.75 +
      currentStatusScore * 0.25 -
      fallbackPenalty -
      guardedRejectionPenalty -
      modelContribution.forbiddenClaimCount * 25,
  );
  const objectiveProductScore = clampScore(
    guardedProduct.expectedEvidenceScore * 0.8 +
      currentStatusScore * 0.2 -
      guardedProduct.forbiddenClaimCount * 25,
  );
  const notes: string[] = [];
  if (attempt.fallbackDetected) notes.push("Product fallback was used.");
  if (attempt.guardedRejectionDetected) {
    notes.push(
      "The product rejected or dropped part of the model contribution.",
    );
  }
  if (attempt.status !== "succeeded")
    notes.push(`Attempt status: ${attempt.status}.`);
  if (modelContribution.forbiddenClaimCount > 0) {
    notes.push("Model output matched a forbidden-claim marker.");
  }

  return EvalGradeSchema.parse({
    caseId: evalCase.id,
    laneId: attempt.laneId,
    statusScore: currentStatusScore,
    modelContribution,
    guardedProduct,
    fallbackPenalty,
    guardedRejectionPenalty,
    objectiveModelScore,
    objectiveProductScore,
    requiresQualitativeReview:
      evalCase.rubric.some((dimension) => dimension.kind === "qualitative") ||
      attempt.fallbackDetected ||
      attempt.guardedRejectionDetected,
    notes,
  });
}
