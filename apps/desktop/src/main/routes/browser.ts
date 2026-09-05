import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  DesktopBrowserCommandSchema,
  DesktopBrowserViewportSchema,
} from "@unemployed/contracts";
import { getEmbeddedBrowser } from "../services/browser/embedded-browser";
import { importBrowserSession } from "../services/browser/browser-session-import";

export function registerBrowserRoutes(ipc: IpcMain): void {
  const host = getEmbeddedBrowser();
  const assertOwner = (event: IpcMainInvokeEvent) => {
    if (
      !host.ownsRenderer(event.sender.id) ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error("Browser controls are available only in the app window.");
    }
  };
  ipc.handle("browser:get-state", (event) => {
    assertOwner(event);
    return host.getState();
  });
  ipc.handle("browser:command", (event, input: unknown) => {
    assertOwner(event);
    return host.command(DesktopBrowserCommandSchema.parse(input));
  });
  ipc.handle("browser:set-viewport", (event, input: unknown) => {
    assertOwner(event);
    host.setViewport(DesktopBrowserViewportSchema.parse(input));
  });
  ipc.handle("browser:import-session", async (event) => {
    assertOwner(event);
    return importBrowserSession(host, event.sender);
  });
}
