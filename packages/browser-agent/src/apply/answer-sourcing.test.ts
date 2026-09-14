import {
  CandidateProfileSchema,
  type CandidateReusableAnswer,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import { matchOption, resolveApplyAnswer, resolveReusableAnswer } from "./answer-sourcing";
import type { ApplyAnswerSources, ApplyFormControl } from "./types";

/**
 * An answer the person already gave has to be recognised the next time.
 *
 * Answering "No" to the same yes/no question four times, and being asked a
 * fifth, is the failure these cover: the saved answer has to find the field,
 * and the field's choices have to recognise the words.
 */

function control(overrides: Partial<ApplyFormControl> = {}): ApplyFormControl {
  return {
    ref: "c0",
    kind: "select",
    label: "Have you previously worked at or consulted for us?",
    groupLabel: "",
    placeholder: "",
    required: true,
    disabled: false,
    readOnly: false,
    visible: true,
    value: "",
    checked: false,
    options: ["Yes", "No"],
    selectedOptionLabel: "",
    invalid: false,
    validationMessage: "",
    questionKind: "other",
    answerControlType: "single_choice",
    attestationKind: null,
    answered: false,
    ...overrides,
  };
}

function savedAnswer(question: string, answer: string): CandidateReusableAnswer {
  return {
    id: "answer_1",
    label: question,
    question,
    answer,
    kind: "other",
    roleFamilies: [],
    proofEntryIds: [],
  };
}

function sources(
  reusableAnswers: readonly CandidateReusableAnswer[],
): ApplyAnswerSources {
  return {
    profile: CandidateProfileSchema.parse({
      id: "candidate_test",
      firstName: "Robin",
      lastName: "Ashford",
      fullName: "Robin Ashford",
      headline: "Platform engineer",
      summary: "Builds dependable internal tools.",
      currentLocation: "Manchester",
      yearsExperience: 8,
      baseResume: {
        id: "resume_test",
        fileName: "resume.txt",
        uploadedAt: "2026-09-01T09:00:00.000Z",
        textContent: "8 years of platform engineering.",
        textUpdatedAt: "2026-09-01T09:00:00.000Z",
        extractionStatus: "ready",
      },
    }),
    resumeText: null,
    posting: {
      title: "Platform Engineer",
      company: "Northwind Tools",
      location: "Manchester",
      description: "Own the internal platform.",
    },
    reusableAnswers,
    documents: [],
  };
}

describe("fitting an answer to the choices a form offers", () => {
  test("the words for no all find the No choice", () => {
    for (const written of ["no", "No", "NO", "none", "n", "Not applicable"]) {
      expect(matchOption(["Yes", "No"], written)).toBe("No");
    }
  });

  test("the words for yes all find the Yes choice", () => {
    for (const written of ["yes", "Yes", "y", "true", "I have"]) {
      expect(matchOption(["Yes", "No"], written)).toBe("Yes");
    }
  });

  test("one choice the answer begins is that choice", () => {
    expect(
      matchOption(["Bachelor's degree", "Master's degree"], "Bachelor"),
    ).toBe("Bachelor's degree");
  });

  test("an answer that fits two choices is still the person's to settle", () => {
    expect(matchOption(["Master's degree", "Master of Science"], "Master")).toBe(
      null,
    );
  });
});

describe("an answer the person saved earlier", () => {
  test("is found again by the question's own label", () => {
    const field = control();
    const resolved = resolveReusableAnswer(field, [
      savedAnswer(field.label, "No"),
    ]);

    expect(resolved?.value).toBe("No");
  });

  test("is found when the pause said label and group together", () => {
    const field = control({ groupLabel: "Phone", label: "Phone" });
    // "Phone — Phone" is what the pause used to carry for this field.
    const resolved = resolveReusableAnswer(field, [
      savedAnswer("Phone — Phone", "+44 7700 900000"),
    ]);

    expect(resolved?.value).toBe("+44 7700 900000");
  });

  test("answers the yes/no question rather than asking it again", () => {
    const field = control();
    const resolution = resolveApplyAnswer({
      control: field,
      sources: sources([savedAnswer(field.label, "no")]),
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution.status).toBe("answered");
    if (resolution.status === "answered") {
      expect(resolution.answer.value).toBe("No");
    }
  });

  test("an answer none of the choices carry says so, with the choices", () => {
    const field = control({ options: ["Yes", "No"] });
    const resolution = resolveApplyAnswer({
      control: field,
      sources: sources([savedAnswer(field.label, "Only as a contractor")]),
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution.status).toBe("needs_you");
    if (resolution.status === "needs_you") {
      expect(resolution.reason).toBe(
        'Your answer "Only as a contractor" did not match one of the choices: Yes, No',
      );
    }
  });
});

/**
 * The retry after the person answers.
 *
 * Three questions answered in Needs you, a page read fresh with its controls
 * renumbered, and every one of those answers has to land — otherwise the
 * person answers the same questions again and the list grows.
 */
describe("a retry finds every answer the person gave", () => {
  const asked = [
    {
      label:
        "Are you subject to any employment agreements and/or post-employment restrictions with your current employer or a past employer?*",
      given: "No",
    },
    { label: "Have you previously worked at or consulted for GitLab?*", given: "No" },
    { label: "Are you located in Bangalore, India?", given: "No" },
  ];

  test("every saved answer is applied to its own select", () => {
    const saved = asked.map((entry, index) => ({
      ...savedAnswer(entry.label, entry.given),
      id: `answer_${index}`,
    }));

    for (const entry of asked) {
      const field = control({ label: entry.label, options: ["Yes", "No"] });
      const resolution = resolveApplyAnswer({
        control: field,
        sources: sources(saved),
        salaryDisclosure: "pause_for_user",
      });

      expect(resolution.status).toBe("answered");
      if (resolution.status === "answered") {
        expect(resolution.answer.value).toBe("No");
      }
    }
  });

  test("an answer saved as the option's own words still matches", () => {
    const field = control({
      label: "Are you located in Bangalore, India?",
      options: ["Yes", "No"],
    });
    const resolution = resolveApplyAnswer({
      control: field,
      sources: sources([savedAnswer(field.label, "no ")]),
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution.status).toBe("answered");
  });
});
