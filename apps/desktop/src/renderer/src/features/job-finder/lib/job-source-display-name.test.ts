import { describe, expect, test } from "vitest";

import {
  UNNAMED_JOB_SOURCE_NAME,
  jobSourceLabel,
  recordedJobSourceName,
} from "./job-source-display-name";

const targets = [
  { id: "target_tzhl5nit", label: "RemoteOK" },
  { id: "target_blank", label: "  " },
];

describe("jobSourceLabel", () => {
  test("uses the label the user saved for the source", () => {
    expect(jobSourceLabel("target_tzhl5nit", targets)).toBe("RemoteOK");
  });

  test("never shows an internal id when the source is gone", () => {
    expect(jobSourceLabel("target_deleted", targets)).toBe(
      UNNAMED_JOB_SOURCE_NAME,
    );
    expect(jobSourceLabel("target_blank", targets)).toBe(
      UNNAMED_JOB_SOURCE_NAME,
    );
    expect(jobSourceLabel("   ", targets)).toBe(UNNAMED_JOB_SOURCE_NAME);
    expect(jobSourceLabel("linkedin-primary", targets)).toBe(
      UNNAMED_JOB_SOURCE_NAME,
    );
  });
});

describe("recordedJobSourceName", () => {
  test("names the recorded source kind in plain language", () => {
    expect(recordedJobSourceName("target_site")).toBe("Job sites you added");
  });

  test("never shows an unrecognised internal identifier", () => {
    expect(recordedJobSourceName("target_9f2")).toBe(UNNAMED_JOB_SOURCE_NAME);
    expect(recordedJobSourceName("legacy-source-17")).toBe(
      UNNAMED_JOB_SOURCE_NAME,
    );
    expect(recordedJobSourceName("")).toBe(UNNAMED_JOB_SOURCE_NAME);
  });
});
