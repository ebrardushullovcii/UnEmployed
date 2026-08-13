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

  test("allows bounded responsibility inference only when aggressive tailoring explicitly opts in", () => {
    const input = {
      generated: {
        text: "Built reliable customer-facing workflow tools for support operations teams.",
        evidenceRefs: ["experience:role_1:achievement:0"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:achievement:0",
          text: "Built reliable workflow tools for support operations teams.",
          scope: "experience" as const,
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience" as const,
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    };

    expect(selectResumeRewrite(input)).toBeNull();
    expect(
      selectResumeRewrite({ ...input, allowReasonableInference: true }),
    ).toMatchObject({
      kind: "grounded_rewrite",
      text: input.generated.text,
    });
  });

  test("aggressive mode elaborates plain-language domain details around thin evidence", () => {
    const input = {
      generated: {
        text: "Designed table reservation flows, ordering, menu management, and staff scheduling modules for the restaurant platform.",
        evidenceRefs: ["experience:role_1:summary"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:summary",
          text: "Built and maintained a restaurant management SaaS platform.",
          scope: "experience" as const,
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience" as const,
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    };

    expect(selectResumeRewrite(input)).toBeNull();
    expect(
      selectResumeRewrite({ ...input, allowReasonableInference: true }),
    ).toMatchObject({
      kind: "grounded_rewrite",
      text: input.generated.text,
      inferred: false,
    });
  });

  test("aggressive mode accepts profile skill evidence as a supplement for stack-aware bullets", () => {
    const input = {
      generated: {
        text: "Implemented code-splitting and lazy loading in Next.js, cutting dashboard load time by 15%.",
        evidenceRefs: ["experience:role_1:achievement:0", "profile:skills"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:achievement:0",
          text: "Made the customer dashboard 15% faster on load.",
          scope: "experience" as const,
          profileRecordId: "role_1",
        },
        {
          id: "profile:skills",
          text: "JavaScript, TypeScript, Next.js",
          scope: "profile" as const,
          profileRecordId: null,
        },
      ],
      allowedScope: {
        scope: "experience" as const,
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    };

    expect(selectResumeRewrite(input)).toBeNull();
    expect(
      selectResumeRewrite({ ...input, allowReasonableInference: true }),
    ).toMatchObject({
      kind: "grounded_rewrite",
      text: input.generated.text,
    });
  });

  test("aggressive mode still rejects invented named technologies", () => {
    const input = {
      generated: {
        text: "Built React dashboards for support teams.",
        evidenceRefs: ["experience:role_1:achievement:0"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:achievement:0",
          text: "Built workflow tools for support teams.",
          scope: "experience" as const,
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience" as const,
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    };

    expect(
      selectResumeRewrite({ ...input, allowReasonableInference: true }),
    ).toBeNull();
  });

  test("aggressive mode still rejects fabricated metrics", () => {
    const input = {
      generated: {
        text: "Improved production uptime from 99.5% to 100%.",
        evidenceRefs: ["experience:role_1:achievement:0"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:achievement:0",
          text: "Improved production uptime from 99.5% to 99.9%.",
          scope: "experience" as const,
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience" as const,
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    };

    expect(
      selectResumeRewrite({ ...input, allowReasonableInference: true }),
    ).toBeNull();
  });

  test("aggressive mode still rejects leadership claims the evidence never supports", () => {
    const input = {
      generated: {
        text: "Led a team of engineers on workflow tooling and regulatory strategy.",
        evidenceRefs: ["experience:role_1:achievement:0"],
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:achievement:0",
          text: "Built reliable TypeScript workflow tools for operations teams.",
          scope: "experience" as const,
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience" as const,
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    };

    expect(
      selectResumeRewrite({ ...input, allowReasonableInference: true }),
    ).toBeNull();
  });

  test("propagates the model's inferred flag onto accepted rewrites", () => {
    const input = {
      generated: {
        text: "Designed table reservation flows and ordering modules for the restaurant platform.",
        evidenceRefs: ["experience:role_1:summary"],
        inferred: true,
      },
      canonicalCandidates: [],
      evidenceCatalog: [
        {
          id: "experience:role_1:summary",
          text: "Built a restaurant management SaaS platform.",
          scope: "experience" as const,
          profileRecordId: "role_1",
        },
      ],
      allowedScope: {
        scope: "experience" as const,
        profileRecordId: "role_1",
      },
      jobCompany: "ExampleCo",
      jobSkills: ["TypeScript"],
    };

    expect(
      selectResumeRewrite({ ...input, allowReasonableInference: true }),
    ).toMatchObject({
      kind: "grounded_rewrite",
      inferred: true,
    });
  });
});
