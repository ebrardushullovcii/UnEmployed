import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeWorkspaceContextDisclosure } from "./resume-workspace-context-disclosure";

describe("ResumeWorkspaceContextDisclosure", () => {
  it("keeps supporting context collapsed so Resume Studio stays primary on entry", () => {
    const markup = renderToStaticMarkup(
      <ResumeWorkspaceContextDisclosure
        claimCount={19}
        statusLabel="Needs review"
      >
        <div>Candidate evidence details</div>
      </ResumeWorkspaceContextDisclosure>,
    );

    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
    expect(markup).toContain("Résumé proof details (optional)");
    expect(markup).toContain("not another approval step");
    expect(markup).toContain("max-h-[30rem]");
    expect(markup).toContain("19 claims checked");
    expect(markup).toContain("Candidate evidence details");
  });
});
