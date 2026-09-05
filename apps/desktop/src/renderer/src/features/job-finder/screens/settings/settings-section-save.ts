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

/**
 * One definition of "this section still owes the user a save", shared by the
 * section save control, the section save button's disabled state, and the
 * sticky unsaved-changes bar, so those three can never disagree.
 *
 * A committed save counts as settled even before the persisted settings prop
 * comes back, because the section did commit; every section retires its own
 * `saved` state on the next edit, which makes it outstanding again.
 */
export function hasOutstandingSectionChanges(
  hasUnsavedChanges: boolean,
  saveState: SettingsSectionSaveState,
): boolean {
  return hasUnsavedChanges && saveState.status !== "saved";
}

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

  // An edit after a committed save makes the section dirty again, so the
  // caller can retire the previous outcome instead of reporting it beside
  // fields the user has since changed.
  const resetSectionSave = useCallback(() => {
    setSaveState((current) =>
      current.status === "idle" ? current : idleSettingsSectionSaveState,
    );
  }, []);

  return { resetSectionSave, runSectionSave, saveState };
}
