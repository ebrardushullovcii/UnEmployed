import { readFile, stat } from "node:fs/promises";
import {
  BrowserWindow,
  dialog,
  type CookiesSetDetails,
  type WebContents,
} from "electron";
import { DesktopBrowserCookieExportSchema } from "@unemployed/contracts";
import type { DesktopBrowserImportResult } from "@unemployed/contracts";
import type { EmbeddedBrowser } from "./embedded-browser";

/** Converts only an explicit user-selected export; never reads another browser profile. */
export function parseBrowserCookieExport(
  value: unknown,
  now = Date.now() / 1000,
): CookiesSetDetails[] {
  const parsed = DesktopBrowserCookieExportSchema.parse(value);
  const cookies = Array.isArray(parsed) ? parsed : parsed.cookies;
  return cookies.flatMap((cookie) => {
    if (cookie.partitionKey !== undefined)
      throw new Error("Partitioned cookies need a fresh sign-in.");
    const hostname = cookie.domain.replace(/^\./, "");
    if (
      !/^[a-zA-Z0-9.-]+$/.test(hostname) ||
      hostname.startsWith(".") ||
      hostname.includes("..") ||
      hostname.endsWith(".")
    )
      throw new Error("Invalid cookie domain.");
    const url = new URL(
      `${cookie.secure ? "https" : "http"}://${hostname}${cookie.path}`,
    );
    if (url.hostname !== hostname.toLowerCase())
      throw new Error("Invalid cookie domain.");
    const expires = cookie.expirationDate ?? cookie.expires;
    if (expires !== undefined && expires > 0 && expires <= now) return [];
    const sameSite = cookie.sameSite?.toLowerCase();
    return [
      {
        url: url.href,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        ...(cookie.hostOnly === true || !cookie.domain.startsWith(".")
          ? {}
          : { domain: cookie.domain }),
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        ...(cookie.session !== true && expires !== undefined && expires > 0
          ? { expirationDate: expires }
          : {}),
        sameSite:
          sameSite === "strict"
            ? "strict"
            : sameSite === "lax"
              ? "lax"
              : sameSite === "none" || sameSite === "no_restriction"
                ? "no_restriction"
                : "unspecified",
      } satisfies CookiesSetDetails,
    ];
  });
}

export async function importBrowserSession(
  host: EmbeddedBrowser,
  sender: WebContents,
): Promise<DesktopBrowserImportResult> {
  const result = (
    status: DesktopBrowserImportResult["status"],
    message: string,
    cookieCount = 0,
    siteCount = 0,
  ): DesktopBrowserImportResult => ({
    status,
    message,
    cookieCount,
    siteCount,
  });
  const window = BrowserWindow.fromWebContents(sender);
  if (!window) return result("failed", "The app window is unavailable.");
  await host.takeControl();
  const selected = await dialog.showOpenDialog(window, {
    title: "Import browser cookies from a JSON export",
    filters: [{ name: "Cookie JSON export", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (selected.canceled || !selected.filePaths[0])
    return result(
      "cancelled",
      "Import cancelled. Browser activity remains paused.",
    );
  let cookies: CookiesSetDetails[];
  try {
    const filePath = selected.filePaths[0];
    if ((await stat(filePath)).size > 5 * 1024 * 1024)
      return result(
        "unsupported",
        "Choose a cookie JSON export smaller than 5 MB.",
      );
    cookies = parseBrowserCookieExport(
      JSON.parse(await readFile(filePath, "utf8")),
    );
  } catch {
    return result(
      "unsupported",
      "This file is not a supported cookie export. Use a cookie JSON array or a file with a cookies array. Browser profile folders, passwords and partitioned cookies are not supported.",
    );
  }
  if (!cookies.length)
    return result(
      "unsupported",
      "This export has no unexpired cookies to import.",
    );
  const sites = [
    ...new Set(cookies.map((cookie) => new URL(cookie.url).hostname)),
  ];
  const confirmation = await dialog.showMessageBox(window, {
    title: "Import saved sessions?",
    type: "question",
    buttons: ["Cancel", "Import sessions"],
    defaultId: 0,
    cancelId: 0,
    message: `Import ${cookies.length} cookies for ${sites.length} sites?`,
    detail: `${sites.slice(0, 15).join("\n")}${sites.length > 15 ? "\n…and more" : ""}\n\nMatching cookies in this app will be replaced. Passwords, bookmarks and browser settings are not imported. Some sites will still require sign-in. Keep the export private; it can contain active sign-ins.`,
  });
  if (confirmation.response !== 1)
    return result(
      "cancelled",
      "Import cancelled. Browser activity remains paused.",
    );
  let imported = 0;
  const importedSites = new Set<string>();
  for (const cookie of cookies) {
    try {
      await host.getSession().cookies.set(cookie);
      imported++;
      importedSites.add(new URL(cookie.url).hostname);
    } catch {
      /* Do not log cookie material, including values embedded in exceptions. */
    }
  }
  await host.getSession().cookies.flushStore();
  return result(
    imported ? "imported" : "failed",
    imported === cookies.length
      ? "Saved cookies imported. Reload the website to check your sign-in. Activity remains paused."
      : `${imported} of ${cookies.length} cookies imported. Some cookies were rejected; those sites may need a fresh sign-in. Activity remains paused.`,
    imported,
    importedSites.size,
  );
}
