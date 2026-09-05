import { describe, expect, test } from "vitest";

import { fnv1a32 } from "./index";

describe("fnv1a32", () => {
  test("hashes ASCII vectors", () => {
    expect(fnv1a32("")).toBe("fnv1a32:811c9dc5");
    expect(fnv1a32("a")).toBe("fnv1a32:e40c292c");
    expect(fnv1a32("hello")).toBe("fnv1a32:4f9f2cab");
    expect(fnv1a32("foobar")).toBe("fnv1a32:bf9cf968");
    expect(fnv1a32("Resume Draft v1")).toBe("fnv1a32:65a923e6");
  });

  test("hashes non-BMP code points as single units", () => {
    expect(fnv1a32("\u{1F680}")).toBe("fnv1a32:864fdd9f");
    expect(fnv1a32("\u{1D11E}")).toBe("fnv1a32:1c1ffcc1");
    expect(fnv1a32("h\u00E9llo \u{1F30D}")).toBe("fnv1a32:e894ffa0");
  });

  test("is deterministic and collision-free for distinct inputs", () => {
    const samples = [
      "",
      "a",
      "hello",
      "\u{1F680}",
      "\u{1D11E}",
      "h\u00E9llo \u{1F30D}",
      "resume_draft_job_1",
      "claim_section_text:s1::",
    ];

    const digests = samples.map((sample) => fnv1a32(sample));
    expect(digests).toEqual(samples.map((sample) => fnv1a32(sample)));
    expect(new Set(digests).size).toBe(samples.length);
  });

  test("emits unsigned lowercase eight-digit hex with the fnv1a32 prefix", () => {
    for (const digest of ["", "a", "\u{10FFFF}".repeat(3)].map(fnv1a32)) {
      expect(digest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    }
  });
});
