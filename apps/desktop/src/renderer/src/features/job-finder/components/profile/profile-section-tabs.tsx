import { Tabs, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import {
  formatSectionProgressLabel,
  getSectionProgressState,
  type ProfileSection,
  type SectionProgress,
} from "../../lib/profile-screen-progress";

export interface ProfileSectionDescriptor {
  description: string;
  id: ProfileSection;
  label: string;
  progress: SectionProgress;
}

interface ProfileSectionTabsProps {
  activeSection: ProfileSection;
  onSectionChange: (section: ProfileSection) => void;
  panelId: string;
  sections: readonly ProfileSectionDescriptor[];
}

function countRequiredRemaining(progress: SectionProgress): number {
  if (getSectionProgressState(progress) !== "remaining") {
    return 0;
  }

  return Math.max(
    0,
    (progress.required?.total ?? 0) - (progress.required?.filled ?? 0),
  );
}

export function ProfileSectionTabs({
  activeSection,
  onSectionChange,
  panelId,
  sections,
}: ProfileSectionTabsProps) {
  return (
    // These tabs used to be a bespoke full-width grid of bordered boxes, each
    // with a check icon and a truncated "REQUIRED DONE" / "OPTIONAL ADDED"
    // chip, and a selected state expressed as a different box border. Nothing
    // else in the app looked like that. They now run on the shared Tabs
    // primitive - the same treatment as Resume Studio's Preview/Tools strip -
    // so the selected state is the shared primary underline, there are no
    // per-tab boxes, and the labels are plain text that never ellipsizes.
    //
    // Activation is Radix's default `automatic`, deliberately: arrowing to a
    // tab opens that section, which is the expected tab-pattern behaviour and
    // matches the rest of the app's tabs. It is safe here because focus only
    // ever reaches a NON-selected trigger by explicit user intent:
    //   - Tab-key entry lands on the strip, which forwards focus to the
    //     already-selected trigger (no activation).
    //   - A mouse click activates on mousedown anyway.
    //   - The one programmatic focus of `#<section>-tab` is the
    //     `focusProfileImportSuggestion` fallback, and its caller
    //     (`handleReviewImportSuggestion`) has already switched to that exact
    //     section, so the trigger it focuses is the selected one. Were that
    //     ever to change, opening the section the suggestion lives in is the
    //     intended outcome regardless.
    // Do not "fix" this to `activationMode="manual"` without a flow that
    // focuses a tab it does not mean to open.
    <Tabs
      className="gap-0 pb-1"
      onValueChange={(value) => onSectionChange(value as ProfileSection)}
      value={activeSection}
    >
      <TabsList
        aria-label="Profile sections"
        // One row from 640px up. Below that the strip stays a single row and
        // scrolls sideways rather than stacking: the old two-column stack cost
        // ~85px of the section pane, which is what pushed a newly selected
        // section's content below the fold at 1200x640 and 1024x720.
        className="w-full max-w-full justify-start overflow-x-auto"
        data-profile-section-tabs
        variant="line"
      >
        {sections.map((section) => {
          const remaining = countRequiredRemaining(section.progress);

          return (
            <TabsTrigger
              // The panel is owned by the Profile screen, so the exact panel
              // and trigger ids are kept instead of Radix's generated pair:
              // the section deep links focus `#<section>-tab`, and the panel
              // is labelled by it.
              aria-controls={panelId}
              data-profile-section-progress-state={getSectionProgressState(
                section.progress,
              )}
              id={`${section.id}-tab`}
              key={section.id}
              // Radix activates a trigger on mousedown; this keeps a plain
              // click (and any programmatic click) changing the section too.
              onClick={() => onSectionChange(section.id)}
              value={section.id}
            >
              {section.label}
              {remaining > 0 ? (
                <>
                  {/* Completion state is out of the label: no chip words and no
                      check on finished sections. What survives is the one
                      actionable fact - how many required fields a section still
                      needs - as a quiet trailing count. */}
                  <span
                    aria-hidden
                    className="inline-flex min-w-4 items-center justify-center rounded-full border border-(--surface-panel-border) px-1 text-(length:--text-tiny) font-medium tabular-nums text-foreground-muted"
                    data-profile-section-remaining-count
                    title={formatSectionProgressLabel(
                      section.id,
                      section.progress,
                    )}
                  >
                    {remaining}
                  </span>
                  <span className="sr-only">
                    {formatSectionProgressLabel(section.id, section.progress)}
                  </span>
                </>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
