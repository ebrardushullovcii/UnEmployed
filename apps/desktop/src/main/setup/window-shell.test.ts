import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  MAIN_WINDOW_CONTENT_SECURITY_POLICY,
  bindMainWindowNavigationGuards,
  isAllowedRendererNavigation,
  resolveRendererLoadTarget,
  resolveTrustedRendererDevUrl,
} from "./window-shell";

describe("main renderer security policy", () => {
  test.each([
    "http://localhost:5173",
    "https://localhost:5173/app",
    "http://127.0.0.1:4173",
    "http://127.0.0.42:4173",
    "http://[::1]:5173",
  ])("accepts loopback dev URL %s", (value) => {
    expect(resolveTrustedRendererDevUrl(value)?.toString()).toBe(
      new URL(value).toString(),
    );
  });

  test.each([
    undefined,
    "",
    "javascript:alert(document.domain)",
    "file:///tmp/renderer/index.html",
    "https://renderer.example.test",
    "http://localhost.evil.test:5173",
    "http://user:password@127.0.0.1:5173",
    "not a URL",
  ])("rejects an untrusted dev URL %s", (value) => {
    expect(resolveTrustedRendererDevUrl(value)).toBeNull();
  });

  test("uses the packaged file entry even when a dev URL is present", () => {
    expect(
      resolveRendererLoadTarget(
        "D:/app/out/main",
        "http://127.0.0.1:5173",
        true,
      ),
    ).toMatchObject({
      kind: "file",
      filePath: path.join("D:/app/out/main", "../renderer/index.html"),
    });
  });

  test("uses a trusted loopback URL during local development", () => {
    expect(
      resolveRendererLoadTarget(
        "D:/app/out/main",
        "http://127.0.0.1:5173",
        false,
      ),
    ).toEqual({
      kind: "dev",
      url: "http://127.0.0.1:5173/",
      origin: "http://127.0.0.1:5173",
    });
  });

  test("allows only the trusted dev origin and the packaged file entry", () => {
    const devTarget = resolveRendererLoadTarget(
      "D:/app/out/main",
      "http://127.0.0.1:5173",
      false,
    );
    expect(
      isAllowedRendererNavigation(
        "http://127.0.0.1:5173/#/job-finder/profile",
        devTarget,
      ),
    ).toBe(true);
    expect(
      isAllowedRendererNavigation("https://example.test/phishing", devTarget),
    ).toBe(false);
    expect(
      isAllowedRendererNavigation(
        'javascript:window.location="https://example.test"',
        devTarget,
      ),
    ).toBe(false);

    const fileTarget = resolveRendererLoadTarget(
      "D:/app/out/main",
      undefined,
      true,
    );
    expect(
      isAllowedRendererNavigation(
        `${fileTarget.url}#/job-finder/profile`,
        fileTarget,
      ),
    ).toBe(true);
    expect(
      isAllowedRendererNavigation("file:///D:/other/index.html", fileTarget),
    ).toBe(false);
  });

  test("prevents external redirects and all new windows", () => {
    const listeners = new Map<
      string,
      (event: { url: string; preventDefault: () => void }) => void
    >();
    const setWindowOpenHandler = vi.fn();
    const webContents = {
      on: vi.fn(
        (
          eventName: string,
          listener: (event: {
            url: string;
            preventDefault: () => void;
          }) => void,
        ) => {
          listeners.set(eventName, listener);
        },
      ),
      setWindowOpenHandler,
    };
    const target = resolveRendererLoadTarget(
      "D:/app/out/main",
      "http://127.0.0.1:5173",
      false,
    );

    bindMainWindowNavigationGuards({ webContents } as never, target);

    expect(webContents.on).toHaveBeenCalledWith(
      "will-navigate",
      expect.any(Function),
    );
    expect(webContents.on).toHaveBeenCalledWith(
      "will-redirect",
      expect.any(Function),
    );
    expect(setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));

    const preventDefault = vi.fn();
    listeners.get("will-navigate")?.({
      url: "https://example.test/phishing",
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);

    const allowPreventDefault = vi.fn();
    listeners.get("will-redirect")?.({
      url: "http://127.0.0.1:5173/#/job-finder/profile",
      preventDefault: allowPreventDefault,
    });
    expect(allowPreventDefault).not.toHaveBeenCalled();

    const openHandler = setWindowOpenHandler.mock.calls[0]?.[0] as () => {
      action: string;
    };
    expect(openHandler()).toEqual({ action: "deny" });
  });

  test("keeps script execution same-origin while allowing the current font and dev HMR hosts", () => {
    expect(MAIN_WINDOW_CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(MAIN_WINDOW_CONTENT_SECURITY_POLICY).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(MAIN_WINDOW_CONTENT_SECURITY_POLICY).toContain(
      "https://fonts.googleapis.com",
    );
    expect(MAIN_WINDOW_CONTENT_SECURITY_POLICY).toContain(
      "https://fonts.gstatic.com",
    );
    expect(MAIN_WINDOW_CONTENT_SECURITY_POLICY).toContain("ws://localhost:*");
  });

  test("declares the CSP in the renderer entry document", () => {
    const rendererHtml = readFileSync(
      new URL("../../renderer/index.html", import.meta.url),
      "utf8",
    );

    expect(rendererHtml).toMatch(
      /<meta\s+http-equiv="Content-Security-Policy"/,
    );
    expect(rendererHtml).toContain("script-src 'self'");
    expect(rendererHtml).toContain("object-src 'none'");
  });
});
