import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { cn } from '@renderer/lib/cn'
import {
  formatSectionProgressLabel,
  type ProfileSection,
  type SectionProgress
} from '../../lib/profile-screen-progress'

export interface ProfileSectionDescriptor {
  description: string
  id: ProfileSection
  label: string
  progress: SectionProgress
}

interface ProfileSectionTabsProps {
  activeSection: ProfileSection
  onSectionChange: (section: ProfileSection) => void
  panelId: string
  sections: readonly ProfileSectionDescriptor[]
}

export function ProfileSectionTabs({
  activeSection,
  onSectionChange,
  panelId,
  sections
}: ProfileSectionTabsProps) {
  const handleSectionKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = sections.findIndex((section) => section.id === activeSection)

    if (currentIndex < 0) {
      return
    }

    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') {
      return
    }

    event.preventDefault()

    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % sections.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + sections.length) % sections.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = sections.length - 1
    }

    const nextSection = sections[nextIndex]
    if (!nextSection) {
      return
    }

    onSectionChange(nextSection.id)
    const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs[nextIndex]?.focus()
  }, [activeSection, onSectionChange, sections])

  return (
    <div className="px-3 pb-2 sm:px-4 sm:pb-2">
      <div aria-label="Profile sections" className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-4" onKeyDown={handleSectionKeyDown} role="tablist">
        {sections.map((section) => (
          <div key={section.id} className={cn(activeSection === section.id ? 'relative z-30 w-full' : 'relative w-full')}>
            <button
              aria-controls={panelId}
              aria-selected={activeSection === section.id}
              className={cn(
                'group relative w-full border text-left transition-all duration-200',
                activeSection === section.id
                  ? 'translate-y-1 overflow-hidden rounded-(--radius-button) border-(--surface-panel-border-active) bg-transparent text-(--text-headline)'
                  : 'overflow-hidden rounded-(--radius-button) border-(--surface-panel-border-warm) bg-(--surface-fill-subtle) text-foreground-soft hover:border-(--surface-panel-border-warm-hover) hover:bg-(--surface-tab-hover) hover:text-foreground'
              )}
              id={`${section.id}-tab`}
              onClick={() => onSectionChange(section.id)}
              role="tab"
              tabIndex={activeSection === section.id ? 0 : -1}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 rounded-[inherit]',
                  activeSection === section.id
                    ? 'bg-transparent'
                    : 'bg-[linear-gradient(135deg,var(--surface-panel-border-warm),var(--surface-overlay-subtle)_42%,var(--surface-overlay-soft))]'
                )}
              />
              <span
                className={cn(
                  'absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--border),transparent)]',
                  activeSection === section.id ? 'opacity-0' : 'opacity-80'
                )}
              />
              <span className="relative grid gap-(--gap-field) px-4 pt-3 pb-2.5">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-(length:--text-body) font-semibold tracking-[-0.02em]">{section.label}</span>
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
                      className={cn(
                        'block h-full transition-[width] duration-300',
                        activeSection === section.id
                          ? 'bg-[linear-gradient(90deg,var(--progress-active-start),var(--progress-active-end))]'
                          : 'bg-[linear-gradient(90deg,var(--progress-warm-start),var(--progress-warm-end))]'
                      )}
                      style={{ width: `${section.progress.percent}%` }}
                    />
                  </span>
                </span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
