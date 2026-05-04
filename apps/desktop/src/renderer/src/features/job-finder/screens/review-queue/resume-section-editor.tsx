import { useId, type FocusEvent } from "react";
import type {
  ResumeDraftPatch,
  ResumeDraftSection,
  WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import { getResumeSectionTextTargetId } from "@unemployed/contracts";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/cn";
import { EmptyState } from "../../components/empty-state";
import { ResumeBulletListEditor } from "./resume-section-editor-bullet-list";
import { ResumeEntryEditorCard } from "./resume-section-editor-entry-card";
import { ResumeSectionHeaderActions } from "./resume-section-editor-header";
import { normalizeNullableText } from "./resume-section-editor-helpers";
import { useResumeEditorSelectionFocus } from "./use-resume-editor-selection-focus";

export function ResumeSectionEditor(props: {
  section: ResumeDraftSection;
  disabled: boolean;
  isSelected: boolean;
  selectionScrollKey?: number;
  selectedEntryId: string | null;
  selectedTargetId: string | null;
  onChange: (nextSection: ResumeDraftSection) => void;
  onSelectEntry: (sectionId: string, entryId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onRegenerate: () => void;
  onPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void;
  workHistoryReviewSuggestions: readonly WorkHistoryReviewSuggestion[];
}) {
  const textId = useId();
  const controlIdPrefix = useId();
  const hasEntries = props.section.entries.length > 0;
  const { entryRefs, sectionRef } = useResumeEditorSelectionFocus(
    props.selectionScrollKey === undefined
      ? {
          isSelected: props.isSelected,
          selectedEntryId: props.selectedEntryId,
          selectedTargetId: props.selectedTargetId,
        }
      : {
          isSelected: props.isSelected,
          selectionScrollKey: props.selectionScrollKey,
          selectedEntryId: props.selectedEntryId,
          selectedTargetId: props.selectedTargetId,
        },
  );
  const handleSectionFocusCapture = (event: FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.dataset.resumeEditorTarget === props.selectedTargetId) {
      return
    }

    props.onSelectSection(props.section.id)
  }

  return (
    <article
      className={cn(
        "surface-card-tint grid min-w-0 gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) p-2.5 transition-colors",
        props.isSelected && "border-primary/35 bg-primary/5",
      )}
      onFocusCapture={handleSectionFocusCapture}
      onMouseDownCapture={() => props.onSelectSection(props.section.id)}
      ref={sectionRef}
    >
      <ResumeSectionHeaderActions
        disabled={props.disabled}
        section={props.section}
        onPatch={props.onPatch}
        onRegenerate={props.onRegenerate}
      />

      {!hasEntries || props.section.kind === "summary" ? (
        <Field>
          <FieldLabel htmlFor={textId}>Section text</FieldLabel>
          <Textarea
            className={
              props.section.kind === "summary"
                ? "min-h-(--textarea-compact)"
                : "min-h-(--textarea-tall)"
            }
            data-resume-editor-target={getResumeSectionTextTargetId(
              props.section.id,
            )}
            id={textId}
            disabled={props.disabled || props.section.locked}
            rows={props.section.kind === "summary" ? 5 : 7}
            value={props.section.text ?? ""}
            onChange={(event) =>
              props.onChange({
                ...props.section,
                text: normalizeNullableText(event.currentTarget.value),
              })
            }
          />
        </Field>
      ) : null}

      {hasEntries ? (
        <div className="grid gap-2.5">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Structured entries
          </p>
          {props.section.entries.map((entry, entryIndex) => (
            <ResumeEntryEditorCard
              key={entry.id}
              controlIdPrefix={controlIdPrefix}
              disabled={props.disabled}
              entry={entry}
              entryIndex={entryIndex}
              isSelected={props.selectedEntryId === entry.id}
              section={props.section}
              workHistoryReviewSuggestions={props.workHistoryReviewSuggestions.filter(
                (suggestion) => suggestion.entryId === entry.id,
              )}
              onChange={props.onChange}
              onPatch={props.onPatch}
              onSelectEntry={props.onSelectEntry}
              registerEntryRef={(entryId, node) => {
                entryRefs.current[entryId] = node;
              }}
            />
          ))}
        </div>
      ) : null}

      {!hasEntries || props.section.bullets.length > 0 ? (
        <div className="grid gap-2.5">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Bullet points
          </p>
          {props.section.bullets.length === 0 ? (
            <EmptyState
              title="No bullets yet"
              description="Rewrite this section or add the main detail in the field above."
            />
          ) : (
            <ResumeBulletListEditor
              bulletRows={props.section.bullets}
              controlIdPrefix={controlIdPrefix}
              disabled={props.disabled}
              section={props.section}
              textareaClassName="min-h-(--textarea-default)"
              textareaRows={6}
              onChange={props.onChange}
              onPatch={props.onPatch}
            />
          )}
        </div>
      ) : null}
    </article>
  );
}
