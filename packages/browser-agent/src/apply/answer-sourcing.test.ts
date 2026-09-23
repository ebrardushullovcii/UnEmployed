import {
  CandidateProfileSchema,
  type CandidateReusableAnswer,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import {
  matchOption,
  resolveApplyAnswer,
  resolveReusableAnswer,
} from "./answer-sourcing";
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

function savedAnswer(
  question: string,
  answer: string,
): CandidateReusableAnswer {
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
  test("uses the posting for the location being applied to", () => {
    const result = resolveApplyAnswer({
      control: control({
        label: "Which location are you applying for?",
        questionKind: "location",
        options: ["", "Remote, Europe", "Remote, Worldwide"],
      }),
      sources: {
        ...sources([]),
        posting: {
          ...sources([]).posting,
          location: "Remote, Europe",
        },
      },
      salaryDisclosure: "pause_for_user",
    });

    expect(result).toMatchObject({
      status: "answered",
      answer: {
        value: "Remote, Europe",
        sourceKind: "posting",
        sourceId: "posting.location",
      },
    });
  });

  test("uses the profile for a residence-location field", () => {
    const result = resolveApplyAnswer({
      control: control({
        label: "Current location",
        groupLabel: "Application location",
        questionKind: "location",
        options: [],
      }),
      sources: {
        ...sources([]),
        posting: {
          ...sources([]).posting,
          location: "Remote, Europe",
        },
      },
      salaryDisclosure: "pause_for_user",
    });

    expect(result).toMatchObject({
      status: "answered",
      answer: {
        value: "Manchester",
        sourceKind: "profile",
        sourceId: "profile.currentLocation",
      },
    });
  });

  test("does not treat an ambiguous location label as the job location", () => {
    const result = resolveApplyAnswer({
      control: control({
        label: "Location",
        groupLabel: "Application details",
        questionKind: "location",
        options: [],
      }),
      sources: {
        ...sources([]),
        posting: {
          ...sources([]).posting,
          location: "Remote, Europe",
        },
      },
      salaryDisclosure: "pause_for_user",
    });

    expect(result).toMatchObject({
      status: "answered",
      answer: {
        value: "Manchester",
        sourceKind: "profile",
        sourceId: "profile.currentLocation",
      },
    });
  });

  test("does not use a home location when the posting location is missing", () => {
    const result = resolveApplyAnswer({
      control: control({
        label: "Which location are you applying for?",
        questionKind: "location",
        options: ["", "Remote, Europe", "Remote, Worldwide"],
      }),
      sources: {
        ...sources([]),
        posting: {
          ...sources([]).posting,
          location: "",
        },
      },
      salaryDisclosure: "pause_for_user",
    });

    expect(result).toEqual({
      status: "needs_you",
      reason: "Nothing in your profile, resume, or saved answers answers this.",
      suggestion: null,
    });
  });

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
    expect(
      matchOption(["Master's degree", "Master of Science"], "Master"),
    ).toBe(null);
  });

  test("grounded overall experience fits every range and endpoint", () => {
    for (const [years, expected] of [
      [0, "0–1"],
      [1, "0–1"],
      [2, "2–4"],
      [4, "2–4"],
      [5, "5–9"],
      [9, "5–9"],
      [10, "10+"],
      [12, "10+"],
    ] as const) {
      const field = control({
        label: "Years of professional experience",
        options: ["0–1", "2–4", "5–9", "10+"],
        questionKind: "experience",
      });
      const answerSources = sources([]);
      answerSources.profile.yearsExperience = years;
      const resolution = resolveApplyAnswer({
        control: field,
        sources: answerSources,
        salaryDisclosure: "pause_for_user",
      });

      expect(resolution.status).toBe("answered");
      if (resolution.status === "answered") {
        expect(resolution.answer.value).toBe(expected);
        expect(resolution.answer.sourceId).toBe("profile.yearsExperience");
      }
    }
  });

  test("overall experience does not answer years in a specific skill", () => {
    for (const specificField of [
      {
        label: "How many years of Python experience do you have?",
        groupLabel: "",
      },
      {
        label: "How many years of experience with Python do you have?",
        groupLabel: "",
      },
      { label: "Years of experience", groupLabel: "Python" },
    ]) {
      const field = control({
        ...specificField,
        options: ["0–1", "2–4", "5–9", "10+"],
        questionKind: "experience",
      });
      const answerSources = sources([]);
      answerSources.profile.yearsExperience = 12;
      answerSources.resumeText = "12 years of professional experience.";
      const resolution = resolveApplyAnswer({
        control: field,
        sources: answerSources,
        salaryDisclosure: "pause_for_user",
      });

      expect(resolution.status).toBe("needs_you");
    }
  });

  test("ambiguous or incomplete ranges stay unanswered", () => {
    const field = control({
      label: "Years of professional experience",
      options: ["5–12", "10+"],
      questionKind: "experience",
    });
    const answerSources = sources([]);
    answerSources.profile.yearsExperience = 12;
    const resolution = resolveApplyAnswer({
      control: field,
      sources: answerSources,
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution.status).toBe("needs_you");
  });
});

describe("technical skills answers", () => {
  test("uses only the skills saved in the profile", () => {
    const answerSources = sources([]);
    answerSources.profile.skills = ["React", "TypeScript", "Design Systems"];
    answerSources.profile.skillGroups = {
      coreSkills: ["React", "TypeScript"],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: ["Design Systems"],
    };

    const resolution = resolveApplyAnswer({
      control: control({
        kind: "long_text",
        label: "Which technical skills would you bring?",
        options: [],
        questionKind: "other",
        answerControlType: "text",
      }),
      sources: answerSources,
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution.status).toBe("answered");
    if (resolution.status === "answered") {
      expect(resolution.answer.value).toBe("React, TypeScript, Design Systems");
      expect(resolution.answer.groundedIn).toEqual([
        "the technical skills saved in your profile",
      ]);
    }
  });

  test.each([
    "How many years have you used these technologies?",
    "Which technologies have you never used?",
  ])("does not turn saved skills into an answer for %s", (label) => {
    const answerSources = sources([]);
    answerSources.profile.skills = ["React", "TypeScript"];

    const resolution = resolveApplyAnswer({
      control: control({
        kind: "long_text",
        label,
        options: [],
        questionKind: label.startsWith("How many") ? "experience" : "other",
        answerControlType: "text",
      }),
      sources: answerSources,
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution.status).not.toBe("answered");
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

  test("does not reuse a source answer for a one-word company field", () => {
    const resolved = resolveReusableAnswer(
      control({
        label: "Company",
        groupLabel: "Work experience 1",
        kind: "text",
        options: [],
        answerControlType: "text",
      }),
      [
        savedAnswer(
          "How did you hear about this job? Job board Company website Referral",
          "Job board",
        ),
      ],
    );

    expect(resolved).toBeNull();
  });

  test("uses the saved job source instead of a portfolio URL mentioned by an option", () => {
    const sourceQuestion =
      "How did you hear about this job? Select an option Job board Company website Referral Other";
    const answerSources = sources([savedAnswer(sourceQuestion, "Job board")]);
    answerSources.profile = CandidateProfileSchema.parse({
      ...answerSources.profile,
      portfolioUrl: "https://portfolio.example.test",
    });
    const resolution = resolveApplyAnswer({
      control: control({
        label: sourceQuestion,
        options: ["Job board", "Company website", "Referral", "Other"],
      }),
      sources: answerSources,
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution.status).toBe("answered");
    if (resolution.status === "answered") {
      expect(resolution.answer.value).toBe("Job board");
      expect(resolution.answer.sourceId).toBe("answerLibrary.answer_1");
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

describe("repeatable work-history fields", () => {
  function workHistorySources(): ApplyAnswerSources {
    const answerSources = sources([
      savedAnswer(
        "How did you hear about this job? Job board Company website Referral",
        "Job board",
      ),
    ]);
    answerSources.profile = CandidateProfileSchema.parse({
      ...answerSources.profile,
      experiences: [
        {
          id: "experience_signal",
          companyName: "Signal Systems",
          title: "Staff Frontend Engineer",
          startDate: "2014-01",
          isCurrent: true,
          summary: "Led design system modernization.",
        },
        {
          id: "experience_orbit",
          companyName: "Orbit Labs",
          title: "Frontend Engineer",
          startDate: "2011-01",
          endDate: "2013-12",
          summary: "Built accessible product interfaces.",
        },
      ],
    });
    return answerSources;
  }

  test.each([
    ["Work experience 1", "Job title", "Staff Frontend Engineer"],
    ["Work experience 1", "Company", "Signal Systems"],
    ["Work experience 1", "From", "2014-01"],
    ["Work experience 1", "Description", "Led design system modernization."],
    ["Work experience 2", "Job title", "Frontend Engineer"],
    ["Work experience 2", "Company", "Orbit Labs"],
    ["Work experience 2", "To (optional)", "2013-12"],
  ])(
    "uses %s — %s from the matching saved role",
    (groupLabel, label, expected) => {
      const resolution = resolveApplyAnswer({
        control: control({
          groupLabel,
          label,
          kind: "text",
          options: [],
          answerControlType: "text",
        }),
        sources: workHistorySources(),
        salaryDisclosure: "pause_for_user",
      });

      expect(resolution.status).toBe("answered");
      if (resolution.status === "answered") {
        expect(resolution.answer.value).toBe(expected);
        expect(resolution.answer.provenanceLabel).toBe(
          "your saved work history",
        );
      }
    },
  );

  test("does not fill a missing repeatable role from the target job or a source answer", () => {
    const resolution = resolveApplyAnswer({
      control: control({
        groupLabel: "Work experience 3",
        label: "Company",
        kind: "text",
        options: [],
        answerControlType: "text",
      }),
      sources: workHistorySources(),
      salaryDisclosure: "pause_for_user",
    });

    expect(resolution).toMatchObject({
      status: "needs_you",
      suggestion: null,
    });
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
    {
      label: "Have you previously worked at or consulted for GitLab?*",
      given: "No",
    },
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
