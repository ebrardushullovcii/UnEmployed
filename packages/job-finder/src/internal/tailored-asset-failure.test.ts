import { describe, expect, test } from "vitest";

import {
  sanitizeTailoredAssetFailureMessage,
  TAILORED_ASSET_FAILURE_MESSAGE_MAX_LENGTH,
} from "./tailored-asset-failure";

describe("tailored asset failure detail", () => {
  test("redacts credential-shaped values", () => {
    const message = sanitizeTailoredAssetFailureMessage(
      new Error(
        "Provider failed with api_key=sk-abc123XYZdef456 and Authorization: Bearer tokenvalue123",
      ),
    );

    expect(message).toContain("Provider failed");
    expect(message).not.toContain("sk-abc123XYZdef456");
    expect(message).not.toContain("tokenvalue123");
  });

  test("collapses and bounds provider payloads", () => {
    const payload = Array.from(
      { length: TAILORED_ASSET_FAILURE_MESSAGE_MAX_LENGTH },
      (_, index) => `line ${index}: payload`,
    ).join("\n");
    const message = sanitizeTailoredAssetFailureMessage(new Error(payload));

    expect(message).not.toContain("\n");
    expect(message).toHaveLength(TAILORED_ASSET_FAILURE_MESSAGE_MAX_LENGTH);
    expect(message?.endsWith("…")).toBe(true);
  });

  test("drops blank messages", () => {
    expect(sanitizeTailoredAssetFailureMessage("   \n\t  ")).toBeNull();
  });
});
