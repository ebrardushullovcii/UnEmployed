import { describe, expect, it } from "vitest";
import {
  diffProposalWording,
  shouldRenderProposalDiff,
} from "./resume-assistant-proposal-diff";

describe("diffProposalWording", () => {
  it("keeps every original character across the kept and removed parts", () => {
    const before = "Delivered microservices and CI/CD automation for teams.";
    const after =
      "Delivered microservices, observability, and CI/CD pipelines.";

    const parts = diffProposalWording(before, after);

    expect(
      parts
        .filter((part) => part.kind !== "added")
        .map((part) => part.text)
        .join(""),
    ).toBe(before);
    expect(
      parts
        .filter((part) => part.kind !== "removed")
        .map((part) => part.text)
        .join(""),
    ).toBe(after);
  });

  it("marks only the words that actually changed", () => {
    const parts = diffProposalWording(
      "Built internal tools quickly",
      "Built internal tools carefully",
    );

    expect(parts.filter((part) => part.kind === "removed")).toEqual([
      { kind: "removed", text: "quickly" },
    ]);
    expect(parts.filter((part) => part.kind === "added")).toEqual([
      { kind: "added", text: "carefully" },
    ]);
    expect(parts.find((part) => part.kind === "unchanged")?.text).toBe(
      "Built internal tools ",
    );
  });

  it("reports a pure insertion without inventing removals", () => {
    const parts = diffProposalWording("Shipped the API", "Shipped the API v2");

    expect(parts.some((part) => part.kind === "removed")).toBe(false);
    expect(parts.filter((part) => part.kind === "added")).toEqual([
      { kind: "added", text: "v2" },
    ]);
  });

  it("handles an empty original as a whole insertion", () => {
    const parts = diffProposalWording("", "New bullet text");

    expect(parts).toEqual([{ kind: "added", text: "New bullet text" }]);
  });
});

describe("shouldRenderProposalDiff", () => {
  it("renders a diff for two real sentences", () => {
    expect(
      shouldRenderProposalDiff("Built internal tools", "Built better tools"),
    ).toBe(true);
  });

  it("declines structural before/after values and no-op rewrites", () => {
    expect(shouldRenderProposalDiff("Included", "Excluded")).toBe(false);
    expect(shouldRenderProposalDiff("Current order", "")).toBe(false);
    expect(shouldRenderProposalDiff("Same text", "Same text")).toBe(false);
  });
});
