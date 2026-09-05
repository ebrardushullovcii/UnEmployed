import { describe, expect, test } from "vitest";

import { assessJobPostingDetailQuality } from "./job-posting-detail-quality";

const basePosting = {
  title: "Software Engineer",
  company: "Acme",
  description: "Software Engineer role at Acme",
  keySkills: [] as string[],
  responsibilities: [] as string[],
  minimumQualifications: [] as string[],
  preferredQualifications: [] as string[],
  benefits: [] as string[],
};

describe("job posting detail quality", () => {
  test("keeps synthetic card descriptions out of the enriched state", () => {
    expect(assessJobPostingDetailQuality(basePosting)).toBe("card_only");
  });

  test("marks a useful card snippet as partial rather than fully enriched", () => {
    expect(
      assessJobPostingDetailQuality({
        ...basePosting,
        description:
          "Join the platform team to build reliable web products with React and TypeScript while collaborating with design, product, and backend engineers.",
      }),
    ).toBe("partial_detail");
  });

  test("marks a substantive description with structured evidence as detail enriched", () => {
    expect(
      assessJobPostingDetailQuality({
        ...basePosting,
        description:
          "You will own customer-facing platform capabilities from technical design through production delivery. The role partners with product and design, reviews implementation plans, improves observability, and supports other engineers through thoughtful feedback, careful documentation, incident follow-up, and measured improvements to delivery quality.",
        keySkills: ["React", "TypeScript"],
        responsibilities: [
          "Design and deliver maintainable product capabilities across the web platform.",
          "Partner with product and design to turn customer needs into scoped technical work.",
        ],
      }),
    ).toBe("detail_enriched");
  });
});
