import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildSyntheticSceneBody,
  renderSyntheticSceneDataUrl,
} from "./synthetic-image";

const sceneGroups = {
  resume: [
    "resume_clean_page",
    "resume_two_columns",
    "resume_image_only",
    "resume_low_resolution",
    "resume_repeated_headers",
    "resume_table_skills",
    "resume_icon_contacts",
    "resume_mixed_text_raster",
    "resume_unusual_heading",
    "resume_footer_noise",
  ],
  browser: [
    "browser_cookie",
    "browser_cards",
    "browser_apply_entry",
    "browser_login_wall",
    "browser_captcha",
    "browser_dead_page",
    "browser_download",
    "browser_modal",
    "browser_loading",
    "browser_final_submit",
  ],
  interview: [
    "interview_compiler",
    "interview_diagram",
    "interview_sql",
    "interview_product_ui",
    "interview_metrics",
    "interview_job_excerpt",
    "interview_blank",
    "interview_sensitive",
    "interview_cropped",
    "interview_conflicting",
  ],
} as const;

describe("synthetic visual fixtures", () => {
  it.each(Object.entries(sceneGroups))(
    "builds ten structurally distinct %s scenes",
    (_group, sceneKinds) => {
      const bodies = sceneKinds.map((sceneKind) =>
        buildSyntheticSceneBody({
          title: "Fixture title",
          lines: ["Fact one", "Fact two", "Fact three"],
          sceneKind,
        }),
      );

      expect(new Set(bodies).size).toBe(10);
      expect(
        bodies.every((body) => !body.includes("Synthetic evaluation scene")),
      ).toBe(true);
    },
  );

  it("renders different pixels for representative resume, browser, and interview scenes", async () => {
    const rendered = await Promise.all(
      ["resume_two_columns", "browser_cookie", "interview_diagram"].map(
        (sceneKind) =>
          renderSyntheticSceneDataUrl({
            title: "Fixture title",
            lines: ["Fact one", "Fact two", "Fact three"],
            sceneKind,
          }),
      ),
    );
    const hashes = rendered.map((dataUrl) =>
      createHash("sha256").update(dataUrl).digest("hex"),
    );

    expect(new Set(hashes).size).toBe(3);
    expect(
      rendered.every((dataUrl) => dataUrl.startsWith("data:image/png;base64,")),
    ).toBe(true);
  }, 30_000);

  it("represents multi-page and conflicting batches as separate scene bodies", () => {
    const resumePages = [
      "resume_repeated_header_page_1",
      "resume_repeated_header_page_2",
    ].map((sceneKind) =>
      buildSyntheticSceneBody({
        title: "Resume",
        lines: ["Lea Kim", "Mobile Engineer", "Kotlin"],
        sceneKind,
      }),
    );
    const deployments = [
      "interview_deployment_success",
      "interview_deployment_failure",
    ].map((sceneKind) =>
      buildSyntheticSceneBody({
        title: "Deployment",
        lines: [],
        sceneKind,
      }),
    );

    expect(resumePages[0]).toContain("Page 1");
    expect(resumePages[1]).toContain("Page 2");
    expect(deployments[0]).toContain("Deployment succeeded");
    expect(deployments[1]).toContain("Deployment failed");
  });
});
