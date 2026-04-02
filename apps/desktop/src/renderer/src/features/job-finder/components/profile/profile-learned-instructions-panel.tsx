import { Button } from '@renderer/components/ui/button'
import { ProfileTextarea } from './profile-form-primitives'
import {
  type LearnedInstructionSection,
  normalizeEditableInstructionInput
} from './profile-source-debug-instruction-utils'

interface ProfileLearnedInstructionsPanelProps {
  busy: boolean
  editingInstruction: { field: LearnedInstructionSection['field']; normalizedKey: string } | null
  editingInstructionValue: string
  instructionArtifactDescription: string
  onBeginEditingInstruction: (
    section: LearnedInstructionSection,
    line: LearnedInstructionSection['lines'][number]
  ) => void
  onCancelEditingInstruction: () => void
  onChangeEditingInstructionValue: (value: string) => void
  onPersistEditedInstruction: () => void
  onRemoveInstructionLine: (
    section: LearnedInstructionSection,
    line: LearnedInstructionSection['lines'][number]
  ) => void
  sections: readonly LearnedInstructionSection[]
  targetId: string
}

export function ProfileLearnedInstructionsPanel({
  busy,
  editingInstruction,
  editingInstructionValue,
  instructionArtifactDescription,
  onBeginEditingInstruction,
  onCancelEditingInstruction,
  onChangeEditingInstructionValue,
  onPersistEditedInstruction,
  onRemoveInstructionLine,
  sections,
  targetId
}: ProfileLearnedInstructionsPanelProps) {
  if (sections.length === 0) {
    return null
  }

  return (
    <div className="grid h-full min-w-0 content-start gap-(--gap-field) rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-3 md:col-span-2">
      <div className="grid gap-1">
        <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
          Learned source instructions
        </p>
        <p className="text-[0.82rem] leading-6 text-foreground-soft">{instructionArtifactDescription}</p>
      </div>
      <div className="grid gap-3">
        {sections.map((section) => (
          <div key={`${targetId}_${section.label}`} className="grid gap-2">
            <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">
              {section.label}
            </p>
            <ul className="grid gap-2 text-[0.88rem] leading-6 text-foreground">
              {section.lines.map((line, lineIndex) => {
                const isEditing =
                  editingInstruction?.field === section.field &&
                  editingInstruction.normalizedKey === line.normalizedKey

                return (
                  <li
                    key={`${targetId}_${section.label}_${lineIndex}`}
                    className="grid gap-3 rounded-(--radius-small) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2"
                  >
                    {isEditing ? (
                      <div className="grid gap-2">
                        <ProfileTextarea
                          aria-label={`Edit ${section.label.toLowerCase()} instruction`}
                          className="min-h-[7rem]"
                          onChange={(event) => onChangeEditingInstructionValue(event.target.value)}
                          rows={4}
                          value={editingInstructionValue}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={busy || normalizeEditableInstructionInput(section.field, editingInstructionValue).length === 0}
                            onClick={onPersistEditedInstruction}
                            type="button"
                            variant="secondary"
                          >
                            Save
                          </Button>
                          <Button disabled={busy} onClick={onCancelEditingInstruction} type="button" variant="ghost">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <span className="min-w-0 flex-1">{line.displayText}</span>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button disabled={busy} onClick={() => onBeginEditingInstruction(section, line)} type="button" variant="ghost">
                            Edit
                          </Button>
                          <Button disabled={busy} onClick={() => onRemoveInstructionLine(section, line)} type="button" variant="ghost">
                            Remove
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
