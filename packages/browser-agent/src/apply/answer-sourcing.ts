import type {
  ApplicationQuestionKind,
  CandidateProfile,
  CandidateReusableAnswer,
} from "@unemployed/contracts";

import { normalizeSignal } from "./control-classification";
import {
  isPhoneCountryControl,
  matchPhoneCountryOption,
  resolveCallingCode,
  resolvePhoneCountryHint,
  stripSelectedCallingCode,
} from "./phone-country";
import type {
  ApplyAnswer,
  ApplyAnswerSources,
  ApplyFormControl,
} from "./types";

/**
 * Where an answer comes from, in the order Job Finder trusts.
 *
 * 1. a fact the person already stated in their profile
 * 2. the resume that goes with this application
 * 3. an answer they saved earlier and reused
 * 4. free text written for this question, grounded in the three above
 *
 * A question none of those can answer is never guessed at: it goes to the
 * Needs you list with the exact wording from the page.
 */

export type ApplyAnswerResolution =
  | { status: "answered"; answer: ApplyAnswer }
  /** Free text the loop may write for this question, grounded in these facts. */
  | { status: "write_free_text"; grounding: string[] }
  /** Nothing here can answer it truthfully. Ask the person. */
  | { status: "needs_you"; reason: string; suggestion: ApplyAnswer | null };

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function yesNo(value: boolean | null | undefined): string | null {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return null;
}

function profileAnswer(
  value: string,
  kind: ApplicationQuestionKind,
  sourceId: string,
  provenanceLabel: string,
): ApplyAnswer {
  return {
    value,
    kind,
    sourceKind: "profile",
    sourceId,
    provenanceLabel,
    groundedIn: [provenanceLabel],
  };
}

function nameFieldAnswer(
  control: ApplyFormControl,
  profile: CandidateProfile,
): ApplyAnswer | null {
  const signal = normalizeSignal(`${control.label} ${control.groupLabel}`);
  const kind: ApplicationQuestionKind = "personal_info";
  if (/\b(first|given)\b/u.test(signal)) {
    const value = trimmedOrNull(profile.firstName);
    return value ? profileAnswer(value, kind, "profile.firstName", "your first name") : null;
  }
  if (/\b(last|family|sur)\b/u.test(signal)) {
    const value = trimmedOrNull(profile.lastName);
    return value ? profileAnswer(value, kind, "profile.lastName", "your last name") : null;
  }
  if (/\bmiddle\b/u.test(signal)) {
    const value = trimmedOrNull(profile.middleName);
    return value ? profileAnswer(value, kind, "profile.middleName", "your middle name") : null;
  }
  if (/\bpreferred\b/u.test(signal)) {
    const value =
      trimmedOrNull(profile.preferredDisplayName) ?? trimmedOrNull(profile.firstName);
    return value
      ? profileAnswer(value, kind, "profile.preferredDisplayName", "the name you go by")
      : null;
  }
  if (/\bname\b/u.test(signal)) {
    const value = trimmedOrNull(profile.fullName);
    return value ? profileAnswer(value, kind, "profile.fullName", "your name") : null;
  }
  return null;
}

function phoneCountryAnswer(
  control: ApplyFormControl,
  profile: CandidateProfile,
): ApplyAnswer | null {
  const phone =
    trimmedOrNull(profile.applicationIdentity.preferredPhone) ??
    trimmedOrNull(profile.phone);
  if (!phone) {
    return null;
  }
  const countryHint = resolvePhoneCountryHint(profile);
  const callingCode = resolveCallingCode({
    phone,
    countryHint,
    optionLabels: control.options,
  });
  if (!callingCode) {
    return null;
  }
  const option = matchPhoneCountryOption({
    options: control.options,
    callingCode,
    countryHint,
  });
  // Several countries share a calling code. Without an option that names both
  // the code and the country, the picker is left for the person.
  if (control.options.length > 0 && !option) {
    return null;
  }
  return profileAnswer(
    option ?? callingCode,
    "personal_info",
    "profile.phoneCountry",
    "the country your phone number belongs to",
  );
}

function personalInfoAnswer(
  control: ApplyFormControl,
  profile: CandidateProfile,
): ApplyAnswer | null {
  const signal = normalizeSignal(`${control.label} ${control.groupLabel} ${control.placeholder}`);
  if (isPhoneCountryControl(control)) {
    return phoneCountryAnswer(control, profile);
  }
  if (/\bemail\b/u.test(signal)) {
    const value =
      trimmedOrNull(profile.applicationIdentity.preferredEmail) ??
      trimmedOrNull(profile.email);
    return value
      ? profileAnswer(value, "personal_info", "profile.email", "your email address")
      : null;
  }
  if (/\b(phone|mobile|telephone|cell)\b/u.test(signal)) {
    const value =
      trimmedOrNull(profile.applicationIdentity.preferredPhone) ??
      trimmedOrNull(profile.phone);
    if (!value) {
      return null;
    }
    // When a picker beside this field already carries the country code, the
    // number must not repeat it, or it goes out dialled twice.
    const withoutCode = stripSelectedCallingCode(
      value,
      control.selectedCallingCode ?? null,
    );
    return profileAnswer(
      withoutCode || value,
      "personal_info",
      "profile.phone",
      "your phone number",
    );
  }
  return nameFieldAnswer(control, profile);
}

function locationAnswer(
  control: ApplyFormControl,
  profile: CandidateProfile,
): ApplyAnswer | null {
  const signal = normalizeSignal(`${control.label} ${control.groupLabel} ${control.placeholder}`);
  const kind: ApplicationQuestionKind = "location";
  if (/\bcountry\b/u.test(signal)) {
    const value = trimmedOrNull(profile.currentCountry);
    return value ? profileAnswer(value, kind, "profile.currentCountry", "the country you live in") : null;
  }
  if (/\b(city|town)\b/u.test(signal)) {
    const value = trimmedOrNull(profile.currentCity);
    return value ? profileAnswer(value, kind, "profile.currentCity", "the city you live in") : null;
  }
  if (/\b(state|province|region)\b/u.test(signal)) {
    const value = trimmedOrNull(profile.currentRegion);
    return value ? profileAnswer(value, kind, "profile.currentRegion", "the region you live in") : null;
  }
  if (/\b(location|address|based)\b/u.test(signal)) {
    const value = trimmedOrNull(profile.currentLocation);
    return value ? profileAnswer(value, kind, "profile.currentLocation", "where you live") : null;
  }
  return null;
}

function linkAnswer(
  control: ApplyFormControl,
  profile: CandidateProfile,
): ApplyAnswer | null {
  const signal = normalizeSignal(`${control.label} ${control.groupLabel} ${control.placeholder}`);
  const kind: ApplicationQuestionKind = "portfolio";
  const namedLink = profile.links.find((link) => {
    const label = normalizeSignal(link.label ?? "");
    return label.length > 0 && signal.includes(label);
  });
  if (namedLink?.url) {
    return profileAnswer(namedLink.url, kind, `profile.links.${namedLink.id}`, "a link on your profile");
  }
  if (/\b(portfolio|personal site|website|home page)\b/u.test(signal)) {
    const value =
      trimmedOrNull(profile.portfolioUrl) ?? trimmedOrNull(profile.personalWebsiteUrl);
    return value ? profileAnswer(value, kind, "profile.portfolioUrl", "your portfolio link") : null;
  }
  if (/\b(repository|repositories|code|source)\b/u.test(signal)) {
    const value = trimmedOrNull(profile.githubUrl);
    return value ? profileAnswer(value, kind, "profile.codeProfileUrl", "your code profile link") : null;
  }
  if (/\b(profile|professional network)\b/u.test(signal)) {
    const value = trimmedOrNull(profile.linkedinUrl);
    return value
      ? profileAnswer(value, kind, "profile.professionalProfileUrl", "your professional profile link")
      : null;
  }
  return null;
}

function eligibilityAnswer(
  control: ApplyFormControl,
  profile: CandidateProfile,
): ApplyAnswer | null {
  const eligibility = profile.workEligibility;
  const bank = profile.answerBank;
  switch (control.questionKind) {
    case "work_authorization": {
      const saved = trimmedOrNull(bank.workAuthorization);
      if (saved) {
        return profileAnswer(saved, control.questionKind, "profile.answerBank.workAuthorization", "your saved work-eligibility answer");
      }
      if (eligibility.authorizedWorkCountries.length > 0) {
        return profileAnswer(
          `Yes — authorised to work in ${eligibility.authorizedWorkCountries.join(", ")}`,
          control.questionKind,
          "profile.workEligibility.authorizedWorkCountries",
          "the countries you can work in",
        );
      }
      return null;
    }
    case "visa_sponsorship": {
      const saved = trimmedOrNull(bank.visaSponsorship);
      if (saved) {
        return profileAnswer(saved, control.questionKind, "profile.answerBank.visaSponsorship", "your saved sponsorship answer");
      }
      const value = yesNo(eligibility.requiresVisaSponsorship);
      return value
        ? profileAnswer(value, control.questionKind, "profile.workEligibility.requiresVisaSponsorship", "whether you need sponsorship")
        : null;
    }
    case "relocation": {
      const saved = trimmedOrNull(bank.relocation);
      if (saved) {
        return profileAnswer(saved, control.questionKind, "profile.answerBank.relocation", "your saved relocation answer");
      }
      const value = yesNo(eligibility.willingToRelocate);
      return value
        ? profileAnswer(value, control.questionKind, "profile.workEligibility.willingToRelocate", "whether you would relocate")
        : null;
    }
    case "travel": {
      const saved = trimmedOrNull(bank.travel);
      if (saved) {
        return profileAnswer(saved, control.questionKind, "profile.answerBank.travel", "your saved travel answer");
      }
      const value = yesNo(eligibility.willingToTravel);
      return value
        ? profileAnswer(value, control.questionKind, "profile.workEligibility.willingToTravel", "whether you would travel")
        : null;
    }
    case "notice_period": {
      const saved = trimmedOrNull(bank.noticePeriod);
      if (saved) {
        return profileAnswer(saved, control.questionKind, "profile.answerBank.noticePeriod", "your saved notice period");
      }
      if (eligibility.noticePeriodDays !== null) {
        return profileAnswer(
          `${eligibility.noticePeriodDays} days`,
          control.questionKind,
          "profile.workEligibility.noticePeriodDays",
          "your notice period",
        );
      }
      return null;
    }
    case "availability": {
      const saved =
        trimmedOrNull(bank.availability) ?? trimmedOrNull(eligibility.availableStartDate);
      return saved
        ? profileAnswer(saved, control.questionKind, "profile.workEligibility.availableStartDate", "when you can start")
        : null;
    }
    case "clearance": {
      const value = trimmedOrNull(eligibility.securityClearance);
      return value
        ? profileAnswer(value, control.questionKind, "profile.workEligibility.securityClearance", "your clearance")
        : null;
    }
    case "experience": {
      if (/\b(years|how many)\b/u.test(normalizeSignal(control.label))) {
        return profileAnswer(
          String(profile.yearsExperience),
          control.questionKind,
          "profile.yearsExperience",
          "your years of experience",
        );
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * A fact the person has already stated. Never inferred, never averaged.
 */
export function resolveExactProfileAnswer(
  control: ApplyFormControl,
  profile: CandidateProfile,
): ApplyAnswer | null {
  return (
    personalInfoAnswer(control, profile) ??
    locationAnswer(control, profile) ??
    linkAnswer(control, profile) ??
    eligibilityAnswer(control, profile)
  );
}

/**
 * A line the resume for this job already carries.
 *
 * Only used for short factual controls where the resume states the answer
 * outright; it never becomes a paraphrase of the resume.
 */
export function resolveResumeAnswer(
  control: ApplyFormControl,
  resumeText: string | null,
): ApplyAnswer | null {
  if (!resumeText) {
    return null;
  }
  if (control.questionKind !== "experience") {
    return null;
  }
  const match = /(\d{1,2})\+?\s*years?\b/iu.exec(resumeText);
  if (!match?.[1]) {
    return null;
  }
  if (!/\b(years|how many)\b/u.test(normalizeSignal(control.label))) {
    return null;
  }
  return {
    value: match[1],
    kind: control.questionKind,
    sourceKind: "resume",
    sourceId: "application.resume",
    provenanceLabel: "the resume sent with this application",
    groundedIn: ["the resume sent with this application"],
  };
}

function answerLibraryScore(
  control: ApplyFormControl,
  saved: CandidateReusableAnswer,
): number {
  const question = normalizeSignal(saved.question);
  const label = normalizeSignal(`${control.groupLabel} ${control.label}`);
  if (!question || !label) {
    return 0;
  }
  if (question === label) {
    return 1;
  }
  if (label.includes(question) || question.includes(label)) {
    return 0.9;
  }
  const questionWords = new Set(question.split(" ").filter((word) => word.length > 3));
  const labelWords = new Set(label.split(" ").filter((word) => word.length > 3));
  if (questionWords.size === 0 || labelWords.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const word of questionWords) {
    if (labelWords.has(word)) {
      shared += 1;
    }
  }
  return shared / Math.max(questionWords.size, labelWords.size);
}

/** An answer the person saved earlier, matched on the question they saved it for. */
export function resolveReusableAnswer(
  control: ApplyFormControl,
  reusableAnswers: readonly CandidateReusableAnswer[],
): ApplyAnswer | null {
  let best: { answer: CandidateReusableAnswer; score: number } | null = null;
  for (const saved of reusableAnswers) {
    const score = answerLibraryScore(control, saved);
    if (score >= 0.8 && (best === null || score > best.score)) {
      best = { answer: saved, score };
    }
  }
  if (!best) {
    return null;
  }
  return {
    value: best.answer.answer,
    kind: control.questionKind,
    sourceKind: "answer_library",
    sourceId: `answerLibrary.${best.answer.id}`,
    provenanceLabel: "an answer you saved earlier",
    groundedIn: ["an answer you saved earlier"],
  };
}

const FREE_TEXT_KINDS: ReadonlySet<string> = new Set(["text", "long_text"]);

/** True when Job Finder may write prose here rather than pick a stored value. */
export function acceptsWrittenAnswer(control: ApplyFormControl): boolean {
  return FREE_TEXT_KINDS.has(control.kind) && control.options.length === 0;
}

/**
 * Fit an answer to the options a control actually offers.
 *
 * Returns the option label to choose, or null when nothing on the list says
 * the same thing. A near-miss is not a match: an answer that is not offered
 * goes to the person rather than being rounded to the closest option.
 */
export function matchOption(
  options: readonly string[],
  desiredValue: string,
): string | null {
  const desired = normalizeSignal(desiredValue);
  if (!desired) {
    return null;
  }
  const exact = options.find((option) => normalizeSignal(option) === desired);
  if (exact) {
    return exact;
  }
  const yesish = desired === "yes" || desired.startsWith("yes ");
  const noish = desired === "no" || desired.startsWith("no ");
  if (yesish || noish) {
    const wanted = yesish ? "yes" : "no";
    const affirmative = options.find((option) => {
      const normalized = normalizeSignal(option);
      return normalized === wanted || normalized.startsWith(`${wanted} `);
    });
    if (affirmative) {
      return affirmative;
    }
  }
  const contained = options.filter((option) => {
    const normalized = normalizeSignal(option);
    return normalized.length > 0 && (normalized === desired || normalized.includes(desired));
  });
  return contained.length === 1 ? (contained[0] ?? null) : null;
}

/**
 * The full sourcing order for one control.
 *
 * `salaryDisclosure` is passed in because pay is the one answer the person can
 * decide to keep out of an automated run entirely.
 */
export function resolveApplyAnswer(input: {
  control: ApplyFormControl;
  sources: ApplyAnswerSources;
  salaryDisclosure: "pause_for_user" | "answer_from_profile";
}): ApplyAnswerResolution {
  const { control, sources } = input;

  if (control.questionKind === "salary_expectation") {
    const saved = trimmedOrNull(sources.profile.answerBank.salaryExpectations);
    if (input.salaryDisclosure !== "answer_from_profile") {
      return {
        status: "needs_you",
        reason: "This asks what pay you expect, and you asked Job Finder to leave that to you.",
        suggestion: saved
          ? profileAnswer(saved, "salary_expectation", "profile.answerBank.salaryExpectations", "your saved pay answer")
          : null,
      };
    }
    if (saved) {
      return {
        status: "answered",
        answer: profileAnswer(
          saved,
          "salary_expectation",
          "profile.answerBank.salaryExpectations",
          "your saved pay answer",
        ),
      };
    }
    return {
      status: "needs_you",
      reason: "This asks what pay you expect and your profile does not say.",
      suggestion: null,
    };
  }

  const direct =
    resolveExactProfileAnswer(control, sources.profile) ??
    resolveResumeAnswer(control, sources.resumeText) ??
    resolveReusableAnswer(control, sources.reusableAnswers);

  if (direct) {
    if (control.options.length > 0) {
      const option = matchOption(control.options, direct.value);
      if (!option) {
        return {
          status: "needs_you",
          reason: `None of the choices on this page match "${direct.value}".`,
          suggestion: direct,
        };
      }
      return { status: "answered", answer: { ...direct, value: option } };
    }
    return { status: "answered", answer: direct };
  }

  if (acceptsWrittenAnswer(control)) {
    const grounding = [
      sources.resumeText ? "the resume sent with this application" : null,
      "your profile",
      `the posting for ${sources.posting.title} at ${sources.posting.company}`,
    ].filter((value): value is string => value !== null);
    return { status: "write_free_text", grounding };
  }

  return {
    status: "needs_you",
    reason: "Nothing in your profile, resume, or saved answers answers this.",
    suggestion: null,
  };
}
