import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check } from "lucide-react";
import { cn } from "@renderer/lib/cn";
import {
  formatSectionProgressLabel,
  getSectionProgressState,
  isSectionRequiredComplete,
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

export function ProfileSectionTabs({
  activeSection,
  onSectionChange,
  panelId,
  sections,
}: ProfileSectionTabsProps) {
  const handleSectionKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentIndex = sections.findIndex(
        (section) => section.id === activeSection,
      );

      if (currentIndex < 0) {
        return;
      }

      if (
        event.key !== "ArrowRight" &&
        event.key !== "ArrowLeft" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }

      event.preventDefault();

      let nextIndex = currentIndex;

      if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % sections.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + sections.length) % sections.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = sections.length - 1;
      }

      const nextSection = sections[nextIndex];
      if (!nextSection) {
        return;
      }

      onSectionChange(nextSection.id);
      const tabs =
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      tabs[nextIndex]?.focus();
    },
    [activeSection, onSectionChange, sections],
  );

  return (
    <div className="pb-1">
      <div
        aria-label="Profile sections"
        // Five short section names fit one row from 640px up. The old
        // `sm:grid-cols-2 xl:grid-cols-5` stacked them into three rows for
        // every width below 1280px, costing ~85px of the section pane - the
        // reason a tab click at 1200x640 and 1024x720 left the newly selected
        // section's content entirely below the fold, so the click looked
        // like it had done nothing.
        className="grid grid-cols-2 items-stretch gap-px overflow-hidden border-y border-(--surface-panel-border) bg-(--surface-panel-border) sm:grid-cols-5"
        data-profile-section-tabs
        onKeyDown={handleSectionKeyDown}
        role="tablist"
      >
        {sections.map((section, index) => (
          <button
            aria-controls={panelId}
            aria-selected={activeSection === section.id}
            className={cn(
              "group relative h-full min-h-10 w-full cursor-pointer bg-(--surface-panel) text-left transition-colors duration-150 focus-visible:z-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40",
              index === 4 && "col-span-2 sm:col-span-1",
              activeSection === section.id
                ? // A left accent bar plus the bottom rule so the selected tab
                  // still reads as selected when the strip stacks into a
                  // two-column grid at compact widths.
                  "z-30 bg-accent font-semibold text-(--text-headline) shadow-[inset_3px_0_0_var(--primary),inset_0_-2px_0_var(--primary)]"
                : "text-foreground-soft hover:bg-(--surface-tab-hover) hover:text-foreground",
            )}
            id={`${section.id}-tab`}
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            role="tab"
            tabIndex={activeSection === section.id ? 0 : -1}
            type="button"
          >
            {/* F16: the navigation label wins the width fight. It used to be
                the only `min-w-0 truncate` element beside a `shrink-0` status
                chip, so at 1440px four of five section names rendered as
                "Experi… / Backgr… / Prefer… / Job so…" while "REQUIRED DONE"
                rendered in full — including on the active tab, so the user
                could not read the section they were on. The label never
                ellipsizes now; the chip does.

                The chip is also reduced to its non-default state only. A
                finished section shows a check with its meaning available to
                assistive tech, not the words "REQUIRED DONE" repeated across
                four tabs — which is what was consuming the width. */}
            <span className="pointer-events-none relative flex min-w-0 items-center justify-between gap-2 px-3 py-2.5">
              <span className="shrink-0 text-(length:--text-body) font-semibold tracking-[-0.02em]">
                {section.label}
              </span>
              <span
                className={cn(
                  "inline-flex min-w-0 items-center gap-1 truncate text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-mono)",
                  isSectionRequiredComplete(section.progress)
                    ? "text-(--success-text,var(--foreground-muted))"
                    : "text-foreground-muted",
                )}
                data-profile-section-progress-state={getSectionProgressState(
                  section.progress,
                )}
                title={formatSectionProgressLabel(section.id, section.progress)}
              >
                {isSectionRequiredComplete(section.progress) ? (
                  <>
                    <Check aria-hidden className="size-3.5 shrink-0" />
                    <span className="sr-only">
                      {formatSectionProgressLabel(section.id, section.progress)}
                    </span>
                  </>
                ) : (
                  formatSectionProgressLabel(section.id, section.progress)
                )}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
