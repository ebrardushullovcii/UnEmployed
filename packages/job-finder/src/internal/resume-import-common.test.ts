import { describe, expect, test } from "vitest";

import { toStringArray } from "./resume-import-common";

describe("resume import common helpers", () => {
  test("drops trailing comma punctuation when splitting list strings", () => {
    expect(toStringArray("foo,")).toEqual(["foo"]);
    expect(toStringArray(",")).toEqual([]);
  });
});
