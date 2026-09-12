import { describe, expect, test } from "vitest";
import { resolveBrowserAddress } from "./desktop-browser";

describe("resolveBrowserAddress", () => {
  test("opens web addresses with or without a scheme", () => {
    expect(resolveBrowserAddress(" https://Example.com/jobs?q=1#top ")).toEqual(
      {
        kind: "url",
        url: "https://example.com/jobs?q=1#top",
      },
    );
    expect(resolveBrowserAddress("example.com")).toEqual({
      kind: "url",
      url: "https://example.com/",
    });
    expect(resolveBrowserAddress("jobs.lever.co/acme?team=eng")).toEqual({
      kind: "url",
      url: "https://jobs.lever.co/acme?team=eng",
    });
    expect(resolveBrowserAddress("about:blank")).toEqual({
      kind: "url",
      url: "about:blank",
    });
  });

  test("uses plain http for local hosts and IPs", () => {
    expect(resolveBrowserAddress("localhost:3000/login")).toEqual({
      kind: "url",
      url: "http://localhost:3000/login",
    });
    expect(resolveBrowserAddress("192.168.1.20")).toEqual({
      kind: "url",
      url: "http://192.168.1.20/",
    });
  });

  test("searches anything that is not a web address", () => {
    const query = "senior frontend jobs berlin";
    expect(resolveBrowserAddress(query)).toEqual({
      kind: "search",
      query,
      url: "https://www.google.com/search?q=senior%20frontend%20jobs%20berlin",
    });
    expect(resolveBrowserAddress("greenhouse")?.kind).toBe("search");
    expect(resolveBrowserAddress("what is 3.5 x 2?")?.kind).toBe("search");
    expect(resolveBrowserAddress("jamie@example.com")?.kind).toBe("search");
    expect(resolveBrowserAddress("   ")).toBeNull();
  });

  test("never opens privileged schemes or credential-bearing addresses", () => {
    for (const text of [
      "javascript:alert(1)",
      "file:///Users/private.txt",
      "data:text/html,hi",
      "chrome://settings",
      "https://user:secret@example.com/",
    ]) {
      expect(resolveBrowserAddress(text)?.kind).toBe("search");
    }
  });
});
