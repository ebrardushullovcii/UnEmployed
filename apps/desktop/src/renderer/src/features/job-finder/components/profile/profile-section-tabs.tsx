import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@renderer/lib/cn";
import {
  formatSectionProgressLabel,
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
        className="grid items-stretch gap-px overflow-hidden border-y border-(--surface-panel-border) bg-(--surface-panel-border) sm:grid-cols-2 xl:grid-cols-5"
        data-profile-section-tabs
        onKeyDown={handleSectionKeyDown}
        role="tablist"
      >
        {sections.map((section) => (
          <button
            aria-controls={panelId}
            aria-selected={activeSection === section.id}
            className={cn(
              "group relative h-full min-h-16 w-full cursor-pointer bg-(--surface-panel) text-left transition-colors duration-150 focus-visible:z-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40",
              activeSection === section.id
                ? "z-30 bg-accent text-(--text-headline) shadow-[inset_0_-2px_0_var(--primary)]"
                : "text-foreground-soft hover:bg-(--surface-tab-hover) hover:text-foreground",
            )}
            id={`${section.id}-tab`}
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            role="tab"
            tabIndex={activeSection === section.id ? 0 : -1}
            type="button"
          >
            <span className="pointer-events-none relative grid gap-1.5 px-3 py-2.5">
              <span className="flex items-center justify-between gap-3">
                <span className="text-(length:--text-body) font-semibold tracking-[-0.02em]">
                  {section.label}
                </span>
                <span className="text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                  {formatSectionProgressLabel(section.id, section.progress)}
                </span>
              </span>

              <span className="flex items-center gap-2">
                <span className="text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                  {section.progress.percent}%
                </span>
                <span className="h-1 flex-1 overflow-hidden rounded-(--radius-small) bg-(--surface-overlay-track)">
                  <span
                    className="block h-full bg-[linear-gradient(90deg,var(--progress-active-start),var(--progress-active-end))] transition-[width] duration-300"
                    style={{ width: `${section.progress.percent}%` }}
                  />
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
