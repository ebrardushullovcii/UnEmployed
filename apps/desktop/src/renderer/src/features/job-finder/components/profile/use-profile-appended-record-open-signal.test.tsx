// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useProfileAppendedRecordOpenSignal } from "./use-profile-appended-record-open-signal";

afterEach(cleanup);

describe("useProfileAppendedRecordOpenSignal", () => {
  it("issues a fresh open signal for every appended record and forgets removed ones", () => {
    let harness: ReturnType<typeof useProfileAppendedRecordOpenSignal> | null =
      null;

    function Probe() {
      const signal = useProfileAppendedRecordOpenSignal();
      harness = signal;
      return <div>probe</div>;
    }

    render(<Probe />);
    expect(harness).not.toBeNull();

    act(() => {
      harness!.markAppendedRecord("experience_a");
      harness!.markAppendedRecord("experience_b");
      harness!.markAppendedRecord("experience_a");
    });

    expect(harness!.getAppendedRecordOpenSignal("experience_a")).toBe(
      "experience_a:2",
    );
    expect(harness!.getAppendedRecordOpenSignal("experience_b")).toBe(
      "experience_b:1",
    );
    expect(harness!.getAppendedRecordOpenSignal("experience_missing")).toBe(
      null,
    );

    act(() => {
      harness!.forgetAppendedRecord("experience_a");
    });

    expect(harness!.getAppendedRecordOpenSignal("experience_a")).toBe(null);
    expect(harness!.getAppendedRecordOpenSignal("experience_b")).toBe(
      "experience_b:1",
    );
  });
});
