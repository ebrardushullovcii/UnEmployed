import { describe, expect, it } from "vitest";
import { formatRelativeTimestamp } from "./resume-workspace-time";

const now = new Date(2026, 8, 2, 5, 19, 4);

function shift(ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

describe("formatRelativeTimestamp", () => {
  it("collapses present and future values to just now", () => {
    expect(formatRelativeTimestamp(shift(0), now).label).toBe("just now");
    expect(formatRelativeTimestamp(shift(30_000), now).label).toBe("just now");
    expect(formatRelativeTimestamp(shift(-120_000), now).label).toBe(
      "just now",
    );
  });

  it("uses minutes below one hour", () => {
    expect(formatRelativeTimestamp(shift(45_000), now).label).toBe("1 min ago");
    expect(formatRelativeTimestamp(shift(3 * 60_000), now).label).toBe(
      "3 min ago",
    );
    expect(formatRelativeTimestamp(shift(59 * 60_000), now).label).toBe(
      "59 min ago",
    );
  });

  it("uses whole hours below one day", () => {
    expect(formatRelativeTimestamp(shift(60 * 60_000), now).label).toBe(
      "1 h ago",
    );
    expect(formatRelativeTimestamp(shift(2.9 * 3_600_000), now).label).toBe(
      "2 h ago",
    );
    expect(formatRelativeTimestamp(shift(23.5 * 3_600_000), now).label).toBe(
      "23 h ago",
    );
  });

  it("names yesterday and falls back to a short date beyond that", () => {
    // 26 h before 05:19 lands on the previous calendar day.
    expect(formatRelativeTimestamp(shift(26 * 3_600_000), now).label).toBe(
      "yesterday",
    );
    // 30 h before 05:19 is already two calendar days back, so a date wins.
    expect(formatRelativeTimestamp(shift(30 * 3_600_000), now).label).not.toBe(
      "yesterday",
    );

    const olderThisYear = formatRelativeTimestamp(
      new Date(2026, 7, 12, 9, 0, 0).toISOString(),
      now,
    );
    expect(olderThisYear.label).toBe(
      new Date(2026, 7, 12, 9, 0, 0).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
    );
    expect(olderThisYear.label).not.toContain("2026");

    const previousYear = formatRelativeTimestamp(
      new Date(2025, 11, 24, 9, 0, 0).toISOString(),
      now,
    );
    expect(previousYear.label).toContain("2025");
  });

  it("returns the absolute locale string for titles and handles missing input", () => {
    const value = shift(5 * 60_000);
    expect(formatRelativeTimestamp(value, now).absolute).toBe(
      new Date(value).toLocaleString(),
    );
    expect(formatRelativeTimestamp(null, now)).toEqual({
      absolute: null,
      label: "not set",
    });
    expect(formatRelativeTimestamp("not-a-date", now)).toEqual({
      absolute: null,
      label: "unknown time",
    });
  });
});
