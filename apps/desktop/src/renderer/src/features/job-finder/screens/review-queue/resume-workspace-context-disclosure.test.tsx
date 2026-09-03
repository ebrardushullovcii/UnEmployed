import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeWorkspaceContextDisclosure } from "./resume-workspace-context-disclosure";

describe("ResumeWorkspaceContextDisclosure", () => {
  it("keeps supporting context collapsed so Resume Studio stays primary on entry", () => {
    const markup = renderToStaticMarkup(
      <ResumeWorkspaceContextDisclosure>
        <div>Candidate evidence details</div>
      </ResumeWorkspaceContextDisclosure>,
    );

    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
    expect(markup).toContain("About this tailored resume");
    expect(markup).toContain("You do not need this to approve");
    expect(markup).toContain("max-h-[30rem]");
    expect(markup).toContain("Candidate evidence details");
  });

  it("does not repeat draft status as a chip inside the collapsed context row", () => {
    const markup = renderToStaticMarkup(
      <ResumeWorkspaceContextDisclosure>
        <div>Candidate evidence details</div>
      </ResumeWorkspaceContextDisclosure>,
    );

    expect(markup).not.toContain("Needs review");
    expect(markup).not.toContain('data-slot="badge"');
  });
});
