import { describe, expect, test } from "vitest";

import { areEquivalentExperienceRecords } from "./resume-record-identity";

describe("resume record identity", () => {
  test("treats M/D/YYYY slash dates as month-first when the first capture is a valid month", () => {
    expect(
      areEquivalentExperienceRecords(
        {
          companyName: "Example Co",
          title: "Engineer",
          startDate: "5/10/2020",
          endDate: "6/15/2021",
          isCurrent: false,
        },
        {
          companyName: "Example Co",
          title: "Engineer",
          startDate: "2020-05",
          endDate: "2021-06",
          isCurrent: false,
        },
      ),
    ).toBe(true);
  });
});
