import { describe, expect, test } from "vitest";
import { parseBrowserCookieExport } from "./browser-session-import";

describe("explicit browser session exports", () => {
  const cookie = {
    name: "synthetic",
    value: "fixture-only",
    domain: ".example.com",
    path: "/",
    secure: true,
    httpOnly: true,
  };
  test("preserves cookie scope, security flags and expiry from a user export", () => {
    expect(
      parseBrowserCookieExport(
        [{ ...cookie, sameSite: "no_restriction", expirationDate: 2000 }],
        1000,
      ),
    ).toEqual([
      {
        url: "https://example.com/",
        name: "synthetic",
        value: "fixture-only",
        domain: ".example.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "no_restriction",
        expirationDate: 2000,
      },
    ]);
  });
  test("accepts a storage-state cookies array without importing other storage", () => {
    const [parsed] = parseBrowserCookieExport({
      cookies: [
        { ...cookie, domain: "example.com", expires: -1, sameSite: "Lax" },
      ],
      origins: [{ origin: "https://example.com", localStorage: [] }],
    });
    expect(parsed).not.toHaveProperty("expirationDate");
    expect(parsed).not.toHaveProperty("domain");
    expect(parsed?.sameSite).toBe("lax");
  });
  test("skips expired cookies and preserves host-only exports", () => {
    expect(
      parseBrowserCookieExport([{ ...cookie, expirationDate: 999 }], 1000),
    ).toEqual([]);
    expect(
      parseBrowserCookieExport([{ ...cookie, hostOnly: true }])[0],
    ).not.toHaveProperty("domain");
  });
  test.each([
    "example.com@evil.com",
    "example.com/path",
    "example.com:443",
    "..example.com",
    "example.com\n",
  ])("rejects ambiguous domain %s", (domain) => {
    expect(() => parseBrowserCookieExport([{ ...cookie, domain }])).toThrow();
  });
  test("rejects partitioned cookies and unrelated browser files before any writes", () => {
    expect(() =>
      parseBrowserCookieExport([
        { ...cookie, partitionKey: { topLevelSite: "https://example.com" } },
      ]),
    ).toThrow();
    expect(() =>
      parseBrowserCookieExport({ profile: { name: "Person 1" } }),
    ).toThrow();
  });
});
