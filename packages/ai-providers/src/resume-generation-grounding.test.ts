import { describe, expect, test } from "vitest";

import { selectResumeRewrite } from "./resume-generation-grounding";

describe("resume generation grounding", () => {
  test("rejects a new leadership claim even when most words overlap role evidence", () => {
    const selection = selectResumeRewrite({
      generated: {
        text: "Led reliable TypeScript workflow tools for operations teams and regulatory strategy.",
        evidenceRefs: ["experience:role_1:achievement:0"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:achievement:0",
          text: "Built reliable TypeScript workflow tools for operations teams.",
          scope: "experience",
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience",
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    });

    expect(selection).toBeNull();
  });

  test("rejects a novel clause even when every preceding phrase is grounded", () => {
    const selection = selectResumeRewrite({
      generated: {
        text: "Built reliable TypeScript workflow tools for operations teams and regulatory strategy.",
        evidenceRefs: ["experience:role_1:achievement:0"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:achievement:0",
          text: "Built reliable TypeScript workflow tools for operations teams.",
          scope: "experience",
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience",
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    });

    expect(selection).toBeNull();
  });
});
