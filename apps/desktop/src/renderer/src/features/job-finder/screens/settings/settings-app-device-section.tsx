import { useEffect, useId, useState } from "react";
import type { AppearanceTheme, JobFinderSettings } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { useSettingsSectionSave } from "./settings-section-save";

const appearanceThemeOptions: ReadonlyArray<{
  label: string;
  value: AppearanceTheme;
}> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

interface SettingsAppDeviceSectionProps {
  /** Reports staged theme edits so a stale shell save retry is retired. */
  onSettingsDraftEdited?: () => void;
  onUpdateAppearanceTheme: (
    theme: AppearanceTheme,
  ) => Promise<boolean | void> | void;
  settings: JobFinderSettings;
}

export function SettingsAppDeviceSection({
  onSettingsDraftEdited,
  onUpdateAppearanceTheme,
  settings,
}: SettingsAppDeviceSectionProps) {
  const appearanceHeadingId = useId();
  const [selectedTheme, setSelectedTheme] = useState<AppearanceTheme>(
    settings.appearanceTheme,
  );
  const { runSectionSave, saveState } = useSettingsSectionSave();

  useEffect(() => {
    setSelectedTheme(settings.appearanceTheme);
  }, [settings.appearanceTheme]);

  const isSavePending = saveState.status === "saving";
  const hasUnsavedChanges = selectedTheme !== settings.appearanceTheme;
  const saveButtonLabel =
    saveState.status === "saving"
      ? "Saving appearance"
      : saveState.status === "failed"
        ? "Retry appearance"
        : saveState.status === "saved" && !hasUnsavedChanges
          ? "Appearance saved"
          : "Save appearance";
  const updateSelectedTheme = (theme: AppearanceTheme) => {
    if (isSavePending) {
      return;
    }
    setSelectedTheme(theme);
    onSettingsDraftEdited?.();
  };
  const saveAppearanceTheme = () => {
    if (!hasUnsavedChanges || isSavePending) {
      return;
    }
    void runSectionSave({
      execute: () => onUpdateAppearanceTheme(selectedTheme),
      failedMessage:
        "Appearance was not saved. Retry before leaving this page.",
      savedMessage: "Appearance saved. Job Finder now uses this theme.",
    });
  };

  return (
    <section className="surface-panel-shell grid min-w-0 content-start gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 max-w-[72ch] flex-1 gap-1">
          <h3
            className="min-w-0 text-[1.02rem] font-semibold text-(--text-headline)"
            id={appearanceHeadingId}
          >
            Appearance
          </h3>
          <p className="text-(length:--text-description) leading-5 text-foreground-soft">
            Use system if you want Job Finder to follow the OS, or pin a theme
            when you want a stable visual working environment.
          </p>
        </div>
        <div className="grid min-w-0 max-w-full justify-items-end gap-1.5">
          <Button
            disabled={!hasUnsavedChanges || isSavePending}
            onClick={saveAppearanceTheme}
            pending={isSavePending}
            type="button"
            variant="primary"
          >
            {saveButtonLabel}
          </Button>
          {saveState.status === "idle" ? null : (
            <p
              className={
                saveState.status === "failed"
                  ? "min-w-0 max-w-80 break-words text-right text-xs leading-4 text-destructive"
                  : "min-w-0 max-w-80 break-words text-right text-xs leading-4 text-foreground-soft"
              }
              data-settings-save-state={saveState.status}
              role="status"
            >
              {saveState.message}
            </p>
          )}
        </div>
      </div>

      <div
        aria-labelledby={appearanceHeadingId}
        className="flex min-w-0 flex-wrap gap-2"
        role="radiogroup"
      >
        {appearanceThemeOptions.map((option) => {
          const isSelected = selectedTheme === option.value;
          return (
            <button
              aria-checked={isSelected}
              className={`inline-flex min-h-10 items-center justify-center rounded-(--radius-field) border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 ${isSelected ? "border-primary/70 bg-primary/8 text-foreground" : "border-(--surface-panel-border) bg-background/45 text-foreground-soft hover:border-primary/35 hover:text-foreground"}`}
              disabled={isSavePending}
              key={option.value}
              onClick={() => updateSelectedTheme(option.value)}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
