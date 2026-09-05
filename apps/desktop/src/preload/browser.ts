import { ipcRenderer } from "electron";
import {
  DesktopBrowserCommandSchema,
  DesktopBrowserImportResultSchema,
  DesktopBrowserStateSchema,
  DesktopBrowserViewportSchema,
  type DesktopBrowserBridge,
} from "@unemployed/contracts";

export const browserBridge: DesktopBrowserBridge = {
  getState: async () =>
    DesktopBrowserStateSchema.parse(
      await ipcRenderer.invoke("browser:get-state"),
    ),
  command: async (command) =>
    DesktopBrowserStateSchema.parse(
      await ipcRenderer.invoke(
        "browser:command",
        DesktopBrowserCommandSchema.parse(command),
      ),
    ),
  setViewport: async (viewport) => {
    await ipcRenderer.invoke(
      "browser:set-viewport",
      DesktopBrowserViewportSchema.parse(viewport),
    );
  },
  importSession: async () =>
    DesktopBrowserImportResultSchema.parse(
      await ipcRenderer.invoke("browser:import-session"),
    ),
  onStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => {
      const parsed = DesktopBrowserStateSchema.safeParse(state);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on("browser:state-changed", handler);
    return () => ipcRenderer.off("browser:state-changed", handler);
  },
  onFocusAddress: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("browser:focus-address", handler);
    return () => ipcRenderer.off("browser:focus-address", handler);
  },
};
