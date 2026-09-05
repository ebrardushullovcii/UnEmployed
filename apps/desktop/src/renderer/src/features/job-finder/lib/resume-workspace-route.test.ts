import { describe, expect, it } from "vitest";

import {
  buildResumeWorkspaceRoute,
  decodeResumeWorkspaceJobId,
  encodeResumeWorkspaceJobId,
  getResumeWorkspaceJobIdFromPathname,
} from "./resume-workspace-route";

describe("resume workspace route encoding", () => {
  const encodedJobId =
    "job_target_site_software%20engineer%2C%20robotics%20%26%20integration";
  const decodedJobId =
    "job_target_site_software engineer, robotics & integration";

  it("round-trips special characters through the route builder", () => {
    expect(buildResumeWorkspaceRoute(decodedJobId)).toBe(
      `/job-finder/review-queue/${encodedJobId}/resume`,
    );
  });

  it("decodes job ids extracted from the pathname", () => {
    expect(
      getResumeWorkspaceJobIdFromPathname(
        `/job-finder/review-queue/${encodedJobId}/resume`,
      ),
    ).toBe(decodedJobId);
  });

  it("leaves plain ids unchanged", () => {
    expect(
      getResumeWorkspaceJobIdFromPathname(
        "/job-finder/review-queue/job_ready/resume",
      ),
    ).toBe("job_ready");
    expect(encodeResumeWorkspaceJobId("job_ready")).toBe("job_ready");
    expect(decodeResumeWorkspaceJobId("job_ready")).toBe("job_ready");
  });
});
