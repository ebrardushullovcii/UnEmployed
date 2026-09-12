import { describe, expect, test } from "vitest";
import {
  browserDisplayUrl,
  browserUserAgent,
  isBrowserNavigationAllowed,
  normalizeBrowserNavigation,
} from "./browser-navigation";

describe("embedded browser navigation boundary", () => {
  test.each([
    "file:///C:/Users/private.txt",
    "javascript:alert(1)",
    "data:text/html,hello",
    "devtools://devtools",
    "chrome://settings",
    "https://user:secret@example.com/",
  ])("rejects privileged or credential-bearing navigation: %s", (url) => {
    expect(isBrowserNavigationAllowed(url)).toBe(false);
  });
  test("accepts website addresses without a scheme and preserves navigation parameters", () => {
    expect(
      normalizeBrowserNavigation(" example.com/jobs?query=engineer#results "),
    ).toBe("https://example.com/jobs?query=engineer#results");
    expect(normalizeBrowserNavigation("about:blank")).toBe("about:blank");
  });
  test("redacts transient OAuth parameters from renderer display state", () => {
    expect(
      browserDisplayUrl(
        "https://accounts.example.com/callback?code=secret&state=private#token",
      ),
    ).toBe("https://accounts.example.com/callback");
    expect(browserDisplayUrl("about:blank")).toBe("about:blank");
  });
  test("removes packaging tokens without inventing a different browser or platform", () => {
    expect(
      browserUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) UnEmployed/0.1.0 Chrome/152.0.7977.76 Electron/44.2.0 Safari/537.36",
        "UnEmployed",
      ),
    ).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0.7977.76 Safari/537.36",
    );
  });
});
