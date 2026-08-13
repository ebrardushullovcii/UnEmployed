import { describe, expect, test } from "vitest";
import {
  evaluateCompensationFit,
  parseNormalizedCompensation,
  parseSalaryFloor,
} from "./matching-compensation";

describe("compensation normalization and fit truth", () => {
  test("normalizes explicit USD hourly and yearly ranges", () => {
    expect(parseNormalizedCompensation("USD $50-$60/hr")).toMatchObject({
      currency: "USD",
      interval: "hour",
      minAmount: 50,
      maxAmount: 60,
      minAnnualUsd: 104_000,
      maxAnnualUsd: 124_800,
    });
    expect(parseNormalizedCompensation("$120k-$140k/year")).toMatchObject({
      currency: "USD",
      interval: "year",
      minAnnualUsd: 120_000,
      maxAnnualUsd: 140_000,
    });
  });

  test("does not label foreign-currency values as annual USD", () => {
    expect(parseNormalizedCompensation("EUR 90k-110k/year")).toMatchObject({
      currency: "EUR",
      minAmount: 90_000,
      maxAmount: 110_000,
      minAnnualUsd: null,
      maxAnnualUsd: null,
    });
    expect(parseNormalizedCompensation("GBP 8k/month")).toMatchObject({
      currency: "GBP",
      interval: "month",
      minAnnualUsd: null,
      maxAnnualUsd: null,
    });
  });

  test("compares monthly and yearly amounts when explicit currencies match", () => {
    const eurMonthlyPreference = {
      minimum: 2_000,
      maximum: 4_000,
      interval: "month" as const,
      currency: "EUR",
      currencyStatus: "explicit" as const,
    };

    expect(
      evaluateCompensationFit("EUR 30k/year", eurMonthlyPreference),
    ).toMatchObject({
      state: "meets_minimum",
      listingCurrency: "EUR",
      minimumSalaryUsd: null,
      listingMinimumAnnualUsd: null,
    });
    expect(
      evaluateCompensationFit("EUR 18k/year", eurMonthlyPreference),
    ).toMatchObject({ state: "below_minimum", listingCurrency: "EUR" });
    expect(
      evaluateCompensationFit("€2,500 per month", eurMonthlyPreference),
    ).toMatchObject({ state: "meets_minimum", listingCurrency: "EUR" });
    expect(
      evaluateCompensationFit("€1,500 monthly", eurMonthlyPreference),
    ).toMatchObject({ state: "below_minimum", listingCurrency: "EUR" });
  });

  test("keeps cross-currency evidence neutral without guessing an exchange rate", () => {
    expect(
      evaluateCompensationFit("USD $100k/year", {
        minimum: 2_000,
        maximum: null,
        interval: "month",
        currency: "EUR",
        currencyStatus: "explicit",
      }),
    ).toMatchObject({
      state: "currency_incomparable",
      listingCurrency: "USD",
    });
  });

  test("keeps missing, malformed, and secondary compensation neutral", () => {
    expect(evaluateCompensationFit(null, 120_000).state).toBe("unknown");
    expect(evaluateCompensationFit("Competitive", 120_000).state).toBe(
      "unknown",
    );
    expect(parseSalaryFloor("10% bonus plus equity")).toBeNull();
  });

  test("classifies only comparable USD evidence against the saved minimum", () => {
    expect(evaluateCompensationFit("$130k/year", 120_000)).toMatchObject({
      state: "meets_minimum",
      confidence: "high",
      listingMinimumAnnualUsd: 130_000,
    });
    expect(evaluateCompensationFit("$95k/year", 120_000)).toMatchObject({
      state: "below_minimum",
      confidence: "high",
      listingMinimumAnnualUsd: 95_000,
    });
    expect(evaluateCompensationFit("EUR 130k/year", 120_000)).toMatchObject({
      state: "currency_incomparable",
      confidence: "high",
      listingMinimumAnnualUsd: null,
      listingCurrency: "EUR",
    });
    expect(evaluateCompensationFit("130k/year", 120_000)).toMatchObject({
      state: "currency_incomparable",
      listingCurrency: null,
    });
  });

  test("does not create a compensation preference when no minimum is saved", () => {
    expect(evaluateCompensationFit("$95k/year", null)).toMatchObject({
      state: "not_requested",
      minimumSalaryUsd: null,
    });
  });
});
