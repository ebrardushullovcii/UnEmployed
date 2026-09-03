import { describe, expect, it } from "vitest";
import {
  getDiscoveryListingRecencyKey,
  toSortableListingTime,
} from "./discovery-ordering";

function recency(input: {
  postedAt?: string | null;
  postedAtText?: string | null;
  providerUpdatedAt?: string | null;
}) {
  return getDiscoveryListingRecencyKey({
    postedAt: input.postedAt ?? null,
    postedAtText: input.postedAtText ?? null,
    providerUpdatedAt: input.providerUpdatedAt ?? null,
  });
}

describe("getDiscoveryListingRecencyKey", () => {
  it("prefers a parsed postedAt over every label and fallback", () => {
    expect(
      recency({
        postedAt: "2026-07-01T10:00:00.000Z",
        postedAtText: "2026-08-20",
        providerUpdatedAt: "2026-08-24T09:00:00.000Z",
      }),
    ).toEqual({
      basis: "postedAt",
      timestamp: Date.parse("2026-07-01T10:00:00.000Z"),
    });
    // A structured posting date also outranks a fresher absolute label.
    expect(
      recency({
        postedAt: "2026-07-01T10:00:00.000Z",
        postedAtText: "Aug 20, 2026",
      }),
    ).toEqual({
      basis: "postedAt",
      timestamp: Date.parse("2026-07-01T10:00:00.000Z"),
    });
  });

  it("accepts an absolute postedAtText only when no parsed postedAt exists", () => {
    const key = recency({
      postedAt: null,
      postedAtText: "2026-08-20",
      providerUpdatedAt: "2026-08-24T09:00:00.000Z",
    });

    // The visible "Posted" badge shows the label text, so newest-sort must
    // follow that exact instant instead of the hidden provider date.
    expect(key).toEqual({
      basis: "postedAtText",
      timestamp: Date.parse("2026-08-20"),
    });
  });

  it("accepts absolute human-readable posted labels", () => {
    for (const text of ["Aug 20, 2026", "20 Aug 2026", " 2026-08-20 "]) {
      const key = recency({ postedAtText: text });
      expect(key.basis).toBe("postedAtText");
      expect(key.timestamp).toBe(Date.parse(text.trim()));
    }
  });

  it("treats a posting-date label that names no instant as fully unknown", () => {
    // The exact contradiction scenario: a relative label must not let newest
    // sort borrow the hidden provider-update time behind "Posted 2 days ago".
    const key = recency({
      postedAt: null,
      postedAtText: "2 days ago",
      providerUpdatedAt: "2026-08-24T09:00:00.000Z",
    });

    expect(key).toEqual({ basis: null, timestamp: Number.NEGATIVE_INFINITY });
  });

  it.each(["2 days ago", "today", "yesterday", "just now", "3 hours ago"])(
    "keeps %s unknown instead of fabricating a date",
    (text) => {
      const key = recency({ postedAtText: text });

      // The relative text contributes no instant of its own and blocks the
      // provider fallback, because the badge visibly claims this label.
      expect(key).toEqual({ basis: null, timestamp: Number.NEGATIVE_INFINITY });
    },
  );

  it("rejects year-less date fragments rather than borrowing the current year", () => {
    for (const text of ["Aug 20", "August 20", "Posted this week"]) {
      expect(recency({ postedAtText: text }).basis).toBeNull();
    }
    // Year-less labels also block the provider fallback.
    expect(
      recency({
        postedAtText: "Aug 20",
        providerUpdatedAt: "2026-08-05T10:00:00.000Z",
      }),
    ).toEqual({ basis: null, timestamp: Number.NEGATIVE_INFINITY });
  });

  it("rejects unparseable and impossible calendar dates", () => {
    for (const text of ["not-a-date", "2026-13-45", "9999-99-99"]) {
      expect(recency({ postedAtText: text }).basis).toBeNull();
    }
  });

  it("uses an unparseable-text job's provider date only via an absent-label skip", () => {
    // No postedAtText at all: the provider fallback is the honest answer and
    // matches the badge's own "Updated" wording.
    expect(
      recency({
        postedAt: "invalid",
        providerUpdatedAt: "2026-08-05T10:00:00.000Z",
      }),
    ).toEqual({
      basis: "providerUpdatedAt",
      timestamp: Date.parse("2026-08-05T10:00:00.000Z"),
    });
  });

  it("falls back to providerUpdatedAt only when no posting-date label exists", () => {
    expect(recency({ postedAt: "2026-08-01T10:00:00.000Z" })).toEqual({
      basis: "postedAt",
      timestamp: Date.parse("2026-08-01T10:00:00.000Z"),
    });
    expect(recency({ providerUpdatedAt: "2026-08-05T10:00:00.000Z" })).toEqual({
      basis: "providerUpdatedAt",
      timestamp: Date.parse("2026-08-05T10:00:00.000Z"),
    });
  });

  it("stays unknown without any absolute source instead of using observation times", () => {
    expect(recency({})).toEqual({
      basis: null,
      timestamp: Number.NEGATIVE_INFINITY,
    });
    expect(
      recency({ postedAtText: "2 days ago", providerUpdatedAt: "broken" }),
    ).toEqual({
      basis: null,
      timestamp: Number.NEGATIVE_INFINITY,
    });
  });

  it("is a pure function of its input", () => {
    const input = {
      postedAt: "2026-08-01T10:00:00.000Z",
      postedAtText: "Aug 1, 2026",
      providerUpdatedAt: "2026-08-05T10:00:00.000Z",
    };

    expect(getDiscoveryListingRecencyKey(input)).toEqual(
      getDiscoveryListingRecencyKey(input),
    );
    // The caller's object is not mutated.
    expect(input.postedAtText).toBe("Aug 1, 2026");
  });

  it("keeps toSortableListingTime semantics as the underlying parser", () => {
    expect(toSortableListingTime(null)).toBe(Number.NEGATIVE_INFINITY);
    expect(toSortableListingTime("nope")).toBe(Number.NEGATIVE_INFINITY);
    expect(toSortableListingTime("2026-08-01T10:00:00.000Z")).toBe(
      Date.parse("2026-08-01T10:00:00.000Z"),
    );
  });
});
