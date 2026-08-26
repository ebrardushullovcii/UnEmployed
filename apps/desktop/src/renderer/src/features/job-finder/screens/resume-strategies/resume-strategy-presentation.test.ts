import { describe, expect, it } from "vitest";
import { formatPersistedStrategyReason } from "./resume-strategy-presentation";

describe("formatPersistedStrategyReason", () => {
  it("rewords legacy persisted strategy wording to approach terminology", () => {
    expect(
      formatPersistedStrategyReason(
        'User chose strategy "Backend engineering" for this job.',
      ),
    ).toBe('User chose approach "Backend engineering" for this job.');
    expect(formatPersistedStrategyReason("accepted the recommended strategy")).toBe(
      "accepted the recommended approach",
    );
  });

  it("handles plural and capitalized legacy wording", () => {
    expect(formatPersistedStrategyReason("Compared all strategies.")).toBe(
      "Compared all approaches.",
    );
    expect(
      formatPersistedStrategyReason("Strategies are advisory; nothing ran."),
    ).toBe("Approaches are advisory; nothing ran.");
  });

  it("leaves reasons without strategy wording unchanged", () => {
    const reason =
      "No enabled approach matched this job's role family and no search plan default is set.";
    expect(formatPersistedStrategyReason(reason)).toBe(reason);
  });

  it("keeps quoted approach names intact", () => {
    expect(
      formatPersistedStrategyReason(
        "User chose approach “Signal-first tailoring”.",
      ),
    ).toBe("User chose approach “Signal-first tailoring”.");
  });
});
