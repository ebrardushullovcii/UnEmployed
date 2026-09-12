import { describe, expect, test } from "vitest";

import {
  areEquivalentEducationRecords,
  areEquivalentExperienceRecords,
} from "./resume-record-identity";

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

  test("treats zero-padded imported dates as D/M/YYYY when both positions are ambiguous", () => {
    expect(
      areEquivalentExperienceRecords(
        {
          companyName: "Example Co",
          title: "Engineer",
          startDate: "01/07/2023",
          endDate: "30/06/2024",
          isCurrent: false,
        },
        {
          companyName: "Example Co",
          title: "Engineer",
          startDate: "2023-07",
          endDate: "2024-06",
          isCurrent: false,
        },
      ),
    ).toBe(true);
  });
});

describe("areEquivalentEducationRecords stubs", () => {
  test("treats a dateless, fieldless stub of the same degree at the same school as the same record", () => {
    expect(
      areEquivalentEducationRecords(
        {
          schoolName: "University of Texas at Austin",
          degree: "Bachelor of Science",
          fieldOfStudy: "Computer Science",
          startDate: "2012-08",
          endDate: "2016-05",
        },
        {
          schoolName: "University of Texas at Austin",
          degree: "Bachelor of Science",
          fieldOfStudy: null,
          startDate: null,
          endDate: null,
        },
      ),
    ).toBe(true);
  });
});
