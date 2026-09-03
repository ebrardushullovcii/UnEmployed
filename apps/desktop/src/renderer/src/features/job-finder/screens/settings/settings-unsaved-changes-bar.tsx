import type { Ref } from "react";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/cn";
import type { SettingsDirtySection } from "./settings-dirty-sections";
import { focusSettingsSection } from "./settings-section-anchor";

/**
 * Persistent save ownership for Settings.
 *
 * Section saves stay where they are — the button that commits a change lives
 * with the fields it commits. This bar is the missing half, and it is the same
 * contract as the Profile save footer: it is always present, it always answers
 * "is anything unsaved?", and while a section is dirty it names exactly what
 * is unsaved and takes the user back to it. Rendering nothing on a clean page
 * was the gap — four quiet section buttons and no page-level statement is
 * indistinguishable from four buttons whose state you simply cannot see.
 *
 * It never commits more than one section. With a single dirty section it
 * offers that section's own save; with two or more it names the count and the
 * sections and only navigates, because one button cannot honestly say what it
 * would write.
 */
export function SettingsUnsavedChangesBar({
  dirtySections,
  ref,
}: {
  dirtySections: readonly SettingsDirtySection[];
  // The screen measures the rendered bar so the scrolled sections above can
  // reserve at least its height of clearance; the bar wraps, so its height is
  // layout-dependent rather than a constant.
  ref?: Ref<HTMLDivElement>;
}) {
  const hasUnsavedChanges = dirtySections.length > 0;
  const soleDirtySection =
    dirtySections.length === 1 ? dirtySections[0] : undefined;

  return (
    <div
      aria-live="polite"
      // Sticky to the bottom of the settings scroll region: the distance
      // between a control and the commit that owns it no longer grows with
      // the section's height. Fully opaque — the page must never be visible
      // scrolling through the bar the way it did through the old subnav.
      className={cn(
        "sticky bottom-0 z-40 -mx-1 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-(--radius-field) border bg-(--background) px-3 py-2 shadow-[0_-6px_16px_rgba(0,0,0,0.16)]",
        hasUnsavedChanges
          ? "border-(--warning-border)"
          : "border-(--surface-panel-border)",
      )}
      data-settings-save-state={hasUnsavedChanges ? "dirty" : "clean"}
      data-settings-unsaved-bar
      data-settings-unsaved-count={dirtySections.length}
      ref={ref}
      role="status"
    >
      <p
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 text-xs leading-5",
          hasUnsavedChanges
            ? "font-medium text-(--warning-text)"
            : "text-foreground-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            hasUnsavedChanges
              ? "bg-(--warning-text)"
              : "bg-(--disabled-foreground)",
          )}
        />
        {!hasUnsavedChanges
          ? "No unsaved changes in Settings."
          : soleDirtySection
            ? `Unsaved changes in ${soleDirtySection.label}.`
            : `Unsaved changes in ${dirtySections.length} sections: ${dirtySections
                .map((section) => section.label)
                .join(", ")}.`}
      </p>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {dirtySections.map((section) => (
          <Button
            key={section.anchorId}
            onClick={() => {
              focusSettingsSection(section.anchorId);
            }}
            size="compact"
            type="button"
            variant="secondary"
          >
            {soleDirtySection ? "Review" : `Go to ${section.label}`}
          </Button>
        ))}
        {soleDirtySection ? (
          <Button
            disabled={soleDirtySection.isSaving}
            onClick={() => soleDirtySection.save()}
            pending={soleDirtySection.isSaving}
            size="compact"
            type="button"
            variant="primary"
          >
            {soleDirtySection.isSaving
              ? `Saving ${soleDirtySection.label}`
              : soleDirtySection.saveLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
