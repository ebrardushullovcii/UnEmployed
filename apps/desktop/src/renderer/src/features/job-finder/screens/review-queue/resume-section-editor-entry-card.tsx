import { Lock, LockOpen } from 'lucide-react'
import type { ResumeDraftEntry, ResumeDraftSection } from '@unemployed/contracts'
import { getResumeEntryFieldTargetId } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/cn'
import { StatusBadge } from '../../components/status-badge'
import {
  createResumeDraftPatch,
  normalizeNullableText,
  updateEntryField,
} from './resume-section-editor-helpers'
import { ResumeBulletListEditor } from './resume-section-editor-bullet-list'

interface ResumeEntryEditorCardProps {
  controlIdPrefix: string
  disabled: boolean
  entry: ResumeDraftEntry
  isSelected: boolean
  section: ResumeDraftSection
  onChange: (nextSection: ResumeDraftSection) => void
  onPatch: (patch: ReturnType<typeof createResumeDraftPatch>, revisionReason?: string | null) => void
  onSelectEntry: (sectionId: string, entryId: string) => void
  registerEntryRef: (entryId: string, node: HTMLElement | null) => void
}

export function ResumeEntryEditorCard(props: ResumeEntryEditorCardProps) {
  const {
    controlIdPrefix,
    disabled,
    entry,
    isSelected,
    section,
    onChange,
    onPatch,
    onSelectEntry,
    registerEntryRef,
  } = props
  const fieldDisabled = disabled || section.locked || entry.locked
  const handleEntryFocusCapture = () => {
    onSelectEntry(section.id, entry.id)
  }

  return (
    <article
      className={cn(
        'surface-card grid gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) p-2.5 transition-colors',
        isSelected && 'border-primary/35 bg-primary/5',
      )}
      onFocusCapture={handleEntryFocusCapture}
      onMouseDownCapture={() => onSelectEntry(section.id, entry.id)}
      ref={(node) => {
        registerEntryRef(entry.id, node)
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={entry.included ? 'active' : 'muted'}>
          {entry.included ? 'Shown' : 'Hidden'}
        </StatusBadge>
        <StatusBadge tone={entry.locked ? 'muted' : 'active'}>
          {entry.locked ? 'Locked' : 'Editable'}
        </StatusBadge>
        <Button
          className="h-8"
          disabled={disabled || section.locked || entry.locked}
          onClick={() => {
            if (entry.locked) {
              return
            }

            onPatch(
              createResumeDraftPatch({
                entryId: entry.id,
                idPrefix: `resume_patch_entry_include_${entry.id}`,
                newIncluded: !entry.included,
                operation: 'toggle_include',
                sectionId: section.id,
              }),
              `${entry.included ? 'Hidden' : 'Shown'} entry`,
            )
          }}
          aria-pressed={entry.included}
          type="button"
          variant="secondary"
        >
          {entry.included ? 'Hide entry' : 'Show entry'}
        </Button>
        <Button
          className="h-8"
          disabled={disabled || section.locked}
          onClick={() =>
            onPatch(
              createResumeDraftPatch({
                entryId: entry.id,
                idPrefix: `resume_patch_entry_lock_${entry.id}`,
                newLocked: !entry.locked,
                operation: 'set_lock',
                sectionId: section.id,
              }),
              `${entry.locked ? 'Unlocked' : 'Locked'} entry`,
            )
          }
          aria-pressed={entry.locked}
          type="button"
          variant="secondary"
        >
          {entry.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {entry.locked ? 'Unlock' : 'Lock'}
        </Button>
      </div>

      <Field>
        <FieldLabel htmlFor={`${controlIdPrefix}_entry_title_${entry.id}`}>Title</FieldLabel>
        <Input
          data-resume-editor-target={getResumeEntryFieldTargetId(section.id, entry.id, 'title')}
          id={`${controlIdPrefix}_entry_title_${entry.id}`}
          disabled={fieldDisabled}
          value={entry.title ?? ''}
          onChange={(event) =>
            onChange(
              updateEntryField(
                section,
                entry.id,
                'title',
                normalizeNullableText(event.currentTarget.value),
              ),
            )
          }
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${controlIdPrefix}_entry_subtitle_${entry.id}`}>
            Organization or subtitle
          </FieldLabel>
          <Input
            data-resume-editor-target={getResumeEntryFieldTargetId(section.id, entry.id, 'subtitle')}
            id={`${controlIdPrefix}_entry_subtitle_${entry.id}`}
            disabled={fieldDisabled}
            value={entry.subtitle ?? ''}
            onChange={(event) =>
              onChange(
                updateEntryField(
                  section,
                  entry.id,
                  'subtitle',
                  normalizeNullableText(event.currentTarget.value),
                ),
              )
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${controlIdPrefix}_entry_dates_${entry.id}`}>Date range</FieldLabel>
          <Input
            data-resume-editor-target={getResumeEntryFieldTargetId(section.id, entry.id, 'dateRange')}
            id={`${controlIdPrefix}_entry_dates_${entry.id}`}
            disabled={fieldDisabled}
            value={entry.dateRange ?? ''}
            onChange={(event) =>
              onChange(
                updateEntryField(
                  section,
                  entry.id,
                  'dateRange',
                  normalizeNullableText(event.currentTarget.value),
                ),
              )
            }
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`${controlIdPrefix}_entry_location_${entry.id}`}>Location</FieldLabel>
        <Input
          data-resume-editor-target={getResumeEntryFieldTargetId(section.id, entry.id, 'location')}
          id={`${controlIdPrefix}_entry_location_${entry.id}`}
          disabled={fieldDisabled}
          value={entry.location ?? ''}
          onChange={(event) =>
            onChange(
              updateEntryField(
                section,
                entry.id,
                'location',
                normalizeNullableText(event.currentTarget.value),
              ),
            )
          }
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${controlIdPrefix}_entry_summary_${entry.id}`}>Entry summary</FieldLabel>
        <Textarea
          className="min-h-(--textarea-compact)"
          data-resume-editor-target={getResumeEntryFieldTargetId(section.id, entry.id, 'summary')}
          id={`${controlIdPrefix}_entry_summary_${entry.id}`}
          disabled={fieldDisabled}
          rows={5}
          value={entry.summary ?? ''}
          onChange={(event) =>
            onChange(
              updateEntryField(
                section,
                entry.id,
                'summary',
                normalizeNullableText(event.currentTarget.value),
              ),
            )
          }
        />
      </Field>

      <div className="grid gap-3">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
          Entry bullets
        </p>
        <ResumeBulletListEditor
          bulletRows={entry.bullets}
          controlIdPrefix={controlIdPrefix}
          disabled={disabled || section.locked || entry.locked}
          entryId={entry.id}
          section={section}
          textareaClassName="min-h-(--textarea-compact)"
          textareaRows={5}
          onChange={onChange}
          onPatch={onPatch}
        />
      </div>
    </article>
  )
}
