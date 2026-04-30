import { Lock, LockOpen, RefreshCcw } from 'lucide-react'
import type { ResumeDraftSection } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '../../components/status-badge'
import { createResumeDraftPatch } from './resume-section-editor-helpers'

interface ResumeSectionHeaderActionsProps {
  disabled: boolean
  section: ResumeDraftSection
  onPatch: (patch: ReturnType<typeof createResumeDraftPatch>, revisionReason?: string | null) => void
  onRegenerate: () => void
}

export function ResumeSectionHeaderActions(props: ResumeSectionHeaderActionsProps) {
  const { disabled, section, onPatch, onRegenerate } = props

  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="font-display text-(length:--text-item) font-semibold text-(--text-headline)">
          {section.label}
        </h3>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusBadge tone={section.included ? 'active' : 'muted'}>
          {section.included ? 'Shown' : 'Hidden'}
        </StatusBadge>
        <StatusBadge tone={section.locked ? 'muted' : 'active'}>
          {section.locked ? 'Locked' : 'Editable'}
        </StatusBadge>
        <Button
          disabled={disabled}
          onClick={() =>
            onPatch(
              createResumeDraftPatch({
                idPrefix: `resume_patch_section_include_${section.id}`,
                newIncluded: !section.included,
                operation: 'toggle_include',
                sectionId: section.id,
              }),
              `${section.included ? 'Hidden' : 'Shown'} section`,
            )
          }
          size="compact"
          type="button"
          variant="secondary"
        >
          {section.included ? 'Hide section' : 'Show section'}
        </Button>
        <Button
          disabled={disabled}
          onClick={() =>
            onPatch(
              createResumeDraftPatch({
                idPrefix: `resume_patch_section_lock_${section.id}`,
                newLocked: !section.locked,
                operation: 'set_lock',
                sectionId: section.id,
              }),
              `${section.locked ? 'Unlocked' : 'Locked'} section`,
            )
          }
          size="compact"
          type="button"
          variant="secondary"
        >
          {section.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {section.locked ? 'Unlock' : 'Lock'}
        </Button>
        <Button
          disabled={disabled || section.locked}
          onClick={onRegenerate}
          size="compact"
          type="button"
          variant="secondary"
        >
          <RefreshCcw className="size-4" />
          Rewrite section
        </Button>
      </div>
    </header>
  )
}
