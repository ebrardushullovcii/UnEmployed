import { normalizeText, uniqueStrings } from "./shared";
export type {
  SourceInstructionFinalReviewPhaseContext,
  SourceInstructionQualityAssessment,
  SourceInstructionReviewOverride,
} from "./source-instruction-types";
export {
  parseSourceInstructionReviewOverride,
  readReviewOverrideStringArray,
} from "./source-instruction-types";

export function formatStatusLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function splitCustomDiscoveryInstructions(value: string | null): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeInstructionLine(value: string): string {
  return value
    .replace(
      /^(Reliable control|Filter note|Navigation note|Apply note|Validated behavior|Validated navigation|Verification):\s*/i,
      "",
    )
    .replace(/\s*\(index\s+\d+\)/gi, "")
    .replace(/\s+at index\s+\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function lineMentionsAnyKeyword(
  value: string,
  keywords: readonly string[],
): boolean {
  const normalized = normalizeText(value);
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function isLowSignalSourceInstruction(value: string): boolean {
  const normalized = normalizeText(value);
  const isUrlLiteral =
    normalized.includes("http://") || normalized.includes("https://");
  const isOnlyStartingUrlRestatement =
    (normalized.startsWith("start from ") ||
      normalized.startsWith("started from ")) &&
    (isUrlLiteral || normalized.includes("the starting url"));

  return (
    /^(clicked|filled|selected|link|button|searchbox|textbox|combobox)\b/.test(
      normalized,
    ) ||
    normalized.startsWith("click failed ") ||
    normalized.includes("locator click") ||
    normalized.includes("call log") ||
    normalized.includes("waiting for getbyrole") ||
    normalized.includes("element is not visible") ||
    normalized.includes("retrying click action") ||
    normalized.includes(
      "waiting for element to be visible enabled and stable",
    ) ||
    normalized.includes("dismiss ") ||
    normalized.includes("promoted") ||
    isOnlyStartingUrlRestatement ||
    normalized.startsWith("stay within ") ||
    normalized.startsWith("verify whether the site is reachable") ||
    normalized.startsWith("find search controls or filters") ||
    normalized.startsWith("open multiple job details") ||
    normalized.startsWith("check whether discovered jobs expose") ||
    normalized.startsWith("inspected discovered jobs for apply entry points") ||
    normalized.startsWith("prefer pages that expose stable job titles") ||
    normalized.startsWith("stay within the configured hostname") ||
    normalized.startsWith("replay verification reached ") ||
    normalized.startsWith("determine whether the site can be accessed") ||
    normalized.startsWith("prefer actions that change the result set") ||
    normalized.startsWith(
      "record which search inputs or filters appear reliable",
    ) ||
    normalized.startsWith(
      "focus on whether the source exposes an inline apply button",
    ) ||
    normalized.startsWith("agent discovery stopped after ") ||
    normalized.startsWith("no login or consent wall detected") ||
    normalized.includes("fully accessible without login or consent walls") ||
    normalized.includes("fully accessible without login or consent barriers") ||
    normalized.includes("no authentication required") ||
    normalized.includes("without auth required") ||
    normalized.includes("loads without auth") ||
    normalized.includes("loads without login") ||
    normalized.includes("without login or consent barriers") ||
    normalized.includes("accessible without login barriers") ||
    normalized.includes("no auth or consent blockers detected") ||
    normalized.includes("no auth consent blockers detected") ||
    normalized.includes("no auth consent popups") ||
    normalized.includes("no login auth or consent blockers detected") ||
    normalized.includes("fully accessible without") ||
    normalized.includes("accessible without login") ||
    normalized.includes("accessible without authentication") ||
    normalized.includes("site is fully accessible") ||
    normalized.includes("page is fully accessible") ||
    normalized.includes("no login required") ||
    normalized.includes("no sign-in required") ||
    normalized.includes("no signup required") ||
    normalized.includes("no account required") ||
    normalized.includes("does not require login") ||
    normalized.includes("does not require authentication") ||
    normalized.includes("does not require auth") ||
    normalized.includes("does not require sign-in") ||
    /\bno\s+(login|auth|sign-?in|consent)\b.*\b(wall|gate|blocker|barrier|popup|prompt|required|needed|necessary)\b/.test(
      normalized,
    ) ||
    /\b(wall|gate|blocker|barrier|popup|prompt)\b.*\bnot\s+(detected|found|present|observed)\b/.test(
      normalized,
    ) ||
    normalized.includes("page is scrollable with substantial content") ||
    normalized.includes("job extraction tool confirmed") ||
    normalized.includes("extract jobs tool") ||
    normalized.includes("extract_jobs tool") ||
    normalized.includes("extract_jobs returned") ||
    normalized.includes("job extraction returned empty") ||
    normalized.includes("get interactive elements") ||
    normalized.includes("get_interactive_elements") ||
    normalized.includes("interactive elements detection was unreliable") ||
    normalized.includes("interactive elements were unreliable") ||
    normalized.includes(
      "interactive elements were not detected in the automation environment",
    ) ||
    normalized.includes(
      "interactive elements may be limited for automated navigation",
    ) ||
    normalized.includes(
      "some controls may not be fully accessible via automation",
    ) ||
    normalized.includes("automation detection limited") ||
    normalized.includes(
      "interactive elements not detected by get interactive elements tool",
    ) ||
    normalized.includes("job availability may change frequently") ||
    normalized.includes("rate limiting") ||
    normalized.includes("geographic restrictions") ||
    normalized.includes("previous agent discovery stopped after") ||
    normalized.includes("interaction timed out") ||
    normalized.includes("times out on interaction") ||
    normalized.includes("multiple timeouts observed") ||
    normalized.includes("requires longer timeout") ||
    normalized.includes("may require longer timeout") ||
    normalized.includes("different extraction timing") ||
    normalized.includes("different extraction approach") ||
    normalized.includes("different interaction method") ||
    normalized.includes("manual dom inspection") ||
    normalized.includes("pointer events") ||
    normalized.includes("pointer event interception") ||
    normalized.includes("pointer event intercepting") ||
    normalized.includes("javascript enabled interaction") ||
    normalized.includes("current extraction") ||
    normalized.includes("no jobs matching target roles") ||
    normalized.includes("job extraction consistently returned") ||
    normalized.includes("job extraction returned") ||
    normalized.includes("jobs extracted") ||
    normalized.includes("job extracted") ||
    normalized.includes("despite visible job cards") ||
    normalized.includes("sample size") ||
    normalized.includes("sampled only ") ||
    normalized.includes("only 1 job extracted") ||
    normalized.includes("only 2 jobs found") ||
    normalized.includes("0 or 1 jobs extracted") ||
    /\bonly \d+ jobs? (?:extracted|found|sampled)\b/.test(normalized) ||
    /\b\d+ or \d+ jobs? extracted\b/.test(normalized) ||
    /\b\d+ jobs? (?:extracted|found|sampled)\b/.test(normalized) ||
    normalized.includes("location encoding") ||
    normalized.includes("%2c") ||
    normalized.includes("%20") ||
    normalized.includes("geoid") ||
    normalized.includes("currentjobid") ||
    normalized.includes("domcontentloaded") ||
    normalized.includes("jobs landing url") ||
    normalized.includes("jobs url pattern") ||
    normalized.includes("query parameters") ||
    normalized.includes("bypasses the need to use the search box") ||
    normalized.includes("site is a job board") ||
    normalized.includes("page language is ") ||
    normalized.includes("job listings appear to be in ") ||
    normalized.includes("site title is in albanian") ||
    normalized.includes("means find jobs") ||
    normalized.includes("apply process not yet verified") ||
    normalized.includes("apply mechanism not yet verified") ||
    normalized.includes("job details not extracted") ||
    normalized.includes("job details and apply flow not fully verified") ||
    normalized.includes("agent runtime failed") ||
    normalized.includes("did not complete because the agent runtime failed") ||
    normalized.includes("llm call failed") ||
    normalized.includes("discovery encountered an error") ||
    normalized.includes("unknown error") ||
    normalized.includes("browser runtime does not support agent discovery") ||
    normalized.startsWith("observed canonical job detail url ") ||
    normalized.startsWith("no reliable apply path was confirmed for ") ||
    normalized.includes("credible job result") ||
    normalized.startsWith(
      "apply path validation confirmed reusable apply guidance on ",
    ) ||
    normalized.startsWith(
      "apply path validation did not confirm a reusable apply path",
    ) ||
    (normalized.startsWith("observed ") &&
      normalized.includes(" candidate job result")) ||
    isUrlLiteral ||
    normalized.includes("produced no candidate jobs") ||
    /produced \d+ candidate job result/.test(normalized) ||
    /\bjob cards?\s+(display|show|list|contain|include|present|have)\b/.test(
      normalized,
    ) ||
    /\bjob listings?\s+(display|show|contain|include|present|appear)\b/.test(
      normalized,
    ) ||
    /\beach (job|listing|card)\s+(displays?|shows?|contains?|includes?)\b/.test(
      normalized,
    ) ||
    /\bno\s+[\w\s/]+\s+positions?\s+(found|available|listed|matching)\b/.test(
      normalized,
    ) ||
    /\bno\s+(matching|relevant)\s+(jobs?|positions?|roles?|listings?)\b/.test(
      normalized,
    ) ||
    /\b\d+\s+(matching|relevant)\s+(jobs?|positions?|roles?|listings?)\s+(found|available|listed)\b/.test(
      normalized,
    ) ||
    normalized.startsWith("treat applications as manual until") ||
    normalized.startsWith(
      "treat stable slug-style paths on the same host as the canonical detail route",
    ) ||
    normalized.includes(
      "treat applications as manual until a reliable on-site apply entry is proven",
    ) ||
    normalized.includes(
      "treat stable slug-style paths on the same host as the canonical detail route",
    ) ||
    /^the\s+site\s+(is|appears to be|seems to be|functions as)\s+(a|an)\s+job\s+(board|platform|portal|site|aggregator)\b/.test(
      normalized,
    ) ||
    /^(this|the)\s+(site|platform|page)\s+(is|appears|seems)\s/.test(
      normalized,
    ) ||
    /^results?\s+(page|list|set)\s+(displays?|shows?|contains?|lists?)\b/.test(
      normalized,
    )
  );
}

export function isInternalSourceDebugFailure(
  value: string | null | undefined,
): boolean {
  const normalized = normalizeText(value ?? "");

  return (
    normalized.includes("agent runtime failed") ||
    normalized.includes("llm call failed") ||
    normalized.includes("discovery encountered an error") ||
    normalized.includes("unknown error") ||
    normalized.includes("browser runtime does not support agent discovery") ||
    normalized.includes("ai client does not support tool calling") ||
    normalized.includes("no job extractor configured")
  );
}

export function filterSourceDebugWarnings(
  values: readonly (string | null | undefined)[],
): string[] {
  return uniqueStrings(
    values
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeInstructionLine(value))
      .filter(Boolean)
      .filter((value) => !isLowSignalSourceInstruction(value))
      .filter((value) => !isInternalSourceDebugFailure(value)),
  );
}

export function filterSourceInstructionLines(values: readonly string[]): string[] {
  return uniqueStrings(
    values
      .map(normalizeInstructionLine)
      .filter(Boolean)
      .filter((value) => !isLowSignalSourceInstruction(value)),
  );
}

export function prefixedLines(prefix: string, values: readonly string[]): string[] {
  return values.map((value) => `${prefix}${normalizeInstructionLine(value)}`);
}

