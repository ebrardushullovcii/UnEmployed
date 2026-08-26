import { useCallback, useState } from "react";

export type SettingsSectionSaveStatus = "idle" | "saving" | "saved" | "failed";

export type SettingsSectionSaveState = {
  message: string | null;
  status: SettingsSectionSaveStatus;
};

export const idleSettingsSectionSaveState: SettingsSectionSaveState = {
  message: null,
  status: "idle",
};

export function useSettingsSectionSave() {
  const [saveState, setSaveState] = useState<SettingsSectionSaveState>(
    idleSettingsSectionSaveState,
  );

  // Scoped save handlers stay pending until the IPC save settles and resolve
  // `false` instead of throwing when the save did not commit. An explicit
  // `false` is therefore a failed save and must never read as local success.
  const runSectionSave = useCallback(
    async (request: {
      execute: () => boolean | Promise<boolean | void> | void;
      failedMessage: string;
      savedMessage: string;
    }) => {
      setSaveState({ message: null, status: "saving" });
      try {
        const result = await request.execute();
        if (result === false) {
          setSaveState({ message: request.failedMessage, status: "failed" });
          return;
        }
        setSaveState({ message: request.savedMessage, status: "saved" });
      } catch {
        setSaveState({ message: request.failedMessage, status: "failed" });
      }
    },
    [],
  );

  return { runSectionSave, saveState };
}
