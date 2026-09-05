import { describe, expect, test } from "vitest";
import {
  compactNarrativeToSentences,
  dropTruncatedVariants,
  isTruncatedVariantOf,
  orderSkillsByJobRelevance,
  splitInlineBulletSummary,
  splitSentences,
  stripLeadingBulletGlyphs,
  summaryDuplicatesBullets,
} from "./resume-narrative-presentation";

const API_SUMMARY =
  "Built full-stack features for a customer portal, connecting modern UIs to secure APIs that handle payments and identity. Partnered with product on release planning.";
const LEARNING_SUMMARY =
  "Shipped internal tooling for the support team while learning testing, Git, and continuous delivery practices in a fast-moving squad.";

describe("compactNarrativeToSentences", () => {
  test("never cuts a sentence mid-clause when the first sentence exceeds the budget", () => {
    const compacted = compactNarrativeToSentences(API_SUMMARY, 150);

    expect(compacted).toBe(
      "Built full-stack features for a customer portal, connecting modern UIs to secure APIs that handle payments and identity.",
    );
    expect(compacted).not.toMatch(/APIs that\.$/);
  });

  test("keeps a single long sentence whole instead of clipping it after a comma", () => {
    const compacted = compactNarrativeToSentences(LEARNING_SUMMARY, 100);

    expect(compacted).toBe(LEARNING_SUMMARY);
    expect(compacted).not.toMatch(/Git\.$/);
  });

  test("keeps as many whole sentences as fit under the budget", () => {
    expect(
      compactNarrativeToSentences(
        "Led the platform team. Shipped the billing rewrite. Mentored four engineers across two squads.",
        60,
      ),
    ).toBe("Led the platform team. Shipped the billing rewrite.");
  });

  test("adds terminal punctuation and ignores empty input", () => {
    expect(compactNarrativeToSentences("Owns release tooling", 150)).toBe(
      "Owns release tooling.",
    );
    expect(compactNarrativeToSentences("   ", 150)).toBeNull();
    expect(compactNarrativeToSentences(null, 150)).toBeNull();
  });
});

describe("splitSentences", () => {
  test("splits on sentence boundaries without breaking abbreviations mid-word", () => {
    expect(
      splitSentences("Grew revenue 3.5% in Q1. Hired 2 engineers! Ready?"),
    ).toEqual(["Grew revenue 3.5% in Q1.", "Hired 2 engineers!", "Ready?"]);
  });
});

describe("splitInlineBulletSummary", () => {
  test("turns an inline glyph list into a lead sentence plus bullets", () => {
    const split = splitInlineBulletSummary(
      "Owned the checkout platform. ● Cut p95 latency by 40% ● Introduced contract tests ● Mentored two juniors",
      0,
    );

    expect(split).toEqual({
      summary: "Owned the checkout platform.",
      bullets: [
        "Cut p95 latency by 40%.",
        "Introduced contract tests.",
        "Mentored two juniors.",
      ],
    });
    for (const bullet of split?.bullets ?? []) {
      expect(bullet).not.toMatch(/[●•▪◦‣]/);
    }
  });

  test("uses every segment as a bullet when the text starts with a glyph", () => {
    expect(
      splitInlineBulletSummary("• Built dashboards • Automated reporting", 0),
    ).toEqual({
      summary: null,
      bullets: ["Built dashboards.", "Automated reporting."],
    });
  });

  test("splits a three-sentence paragraph only when the entry has fewer than two bullets", () => {
    const paragraph =
      "Led the data platform. Migrated 40 pipelines to Airflow. Reduced on-call pages by half.";

    expect(splitInlineBulletSummary(paragraph, 0)).toEqual({
      summary: "Led the data platform.",
      bullets: [
        "Migrated 40 pipelines to Airflow.",
        "Reduced on-call pages by half.",
      ],
    });
    expect(splitInlineBulletSummary(paragraph, 2)).toBeNull();
  });

  test("keeps short prose and single glyphs untouched", () => {
    expect(
      splitInlineBulletSummary("Owns the billing platform.", 0),
    ).toBeNull();
    expect(
      splitInlineBulletSummary("Owns the billing platform • Remote", 0),
    ).toBeNull();
  });
});

describe("truncated variant handling", () => {
  test("detects a clipped prefix of a fuller line", () => {
    expect(
      isTruncatedVariantOf(
        "Connecting modern UIs to secure APIs that.",
        "Connecting modern UIs to secure APIs that handle payments.",
      ),
    ).toBe(true);
    expect(isTruncatedVariantOf("Lead", "Leadership programs")).toBe(false);
  });

  test("drops the truncated twin and keeps the full bullet", () => {
    expect(
      dropTruncatedVariants([
        "Shipped tooling while learning testing, Git.",
        "Shipped tooling while learning testing, Git, and continuous delivery.",
        "Mentored juniors.",
      ]),
    ).toEqual([
      "Shipped tooling while learning testing, Git, and continuous delivery.",
      "Mentored juniors.",
    ]);
  });

  test("flags a compacted summary that repeats a kept bullet", () => {
    expect(
      summaryDuplicatesBullets("Cut p95 latency by 40%.", [
        "Cut p95 latency by 40% across checkout.",
      ]),
    ).toBe(true);
    expect(
      summaryDuplicatesBullets("Owns the checkout platform.", [
        "Cut p95 latency by 40% across checkout.",
      ]),
    ).toBe(false);
  });

  test("strips leading glyphs and dashes from bullets", () => {
    expect(stripLeadingBulletGlyphs("● Built dashboards")).toBe(
      "Built dashboards",
    );
    expect(stripLeadingBulletGlyphs("- Built dashboards")).toBe(
      "Built dashboards",
    );
  });
});

describe("orderSkillsByJobRelevance", () => {
  test("moves job-named skills ahead of the rest without dropping any", () => {
    expect(
      orderSkillsByJobRelevance(
        ["Figma", "AWS", "Docker", "C#", "Kubernetes", "xUnit", "Azure"],
        {
          title: ".NET Engineer",
          keySkills: ["C#", "Docker"],
          responsibilities: ["Deploy services to Kubernetes on Azure."],
          minimumQualifications: ["Experience with xUnit or NUnit."],
        },
      ),
    ).toEqual(["Docker", "C#", "Kubernetes", "xUnit", "Azure", "Figma", "AWS"]);
  });
});
