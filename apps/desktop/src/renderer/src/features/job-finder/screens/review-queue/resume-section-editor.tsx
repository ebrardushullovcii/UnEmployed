import { Lock, LockOpen, MoveDown, MoveUp, RefreshCcw } from "lucide-react";
import { useId } from "react";
import type {
  ResumeDraftPatch,
  ResumeDraftSection,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Textarea } from "@renderer/components/ui/textarea";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { SourceRefsList } from "./source-refs-list";

export function ResumeSectionEditor(props: {
  section: ResumeDraftSection;
  disabled: boolean;
  onChange: (nextSection: ResumeDraftSection) => void;
  onRegenerate: () => void;
  onPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void;
}) {
  const textId = useId();

  return (
    <article className="surface-card-tint grid min-w-0 gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-(--text-headline)">
            {props.section.label}
          </h3>
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            {props.section.kind} • {props.section.locked ? "Locked" : "Editable"}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge tone={props.section.included ? "active" : "muted"}>
            {props.section.included ? "Included" : "Excluded"}
          </StatusBadge>
          <Button
            className="h-9"
            disabled={props.disabled}
            onClick={() =>
              props.onPatch(
                {
                  id: `resume_patch_section_include_${props.section.id}_${Date.now()}`,
                  draftId: "",
                  operation: "toggle_include",
                  targetSectionId: props.section.id,
                  targetBulletId: null,
                  anchorBulletId: null,
                  position: null,
                  newText: null,
                  newIncluded: !props.section.included,
                  newLocked: null,
                  newBullets: null,
                  appliedAt: new Date().toISOString(),
                  origin: "user",
                  conflictReason: null,
                },
                `${props.section.included ? "Excluded" : "Included"} section`,
              )
            }
            type="button"
            variant="secondary"
          >
            {props.section.included ? "Exclude" : "Include"}
          </Button>
          <Button
            className="h-9"
            disabled={props.disabled}
            onClick={() =>
              props.onPatch(
                {
                  id: `resume_patch_section_lock_${props.section.id}_${Date.now()}`,
                  draftId: "",
                  operation: "set_lock",
                  targetSectionId: props.section.id,
                  targetBulletId: null,
                  anchorBulletId: null,
                  position: null,
                  newText: null,
                  newIncluded: null,
                  newLocked: !props.section.locked,
                  newBullets: null,
                  appliedAt: new Date().toISOString(),
                  origin: "user",
                  conflictReason: null,
                },
                `${props.section.locked ? "Unlocked" : "Locked"} section`,
              )
            }
            type="button"
            variant="secondary"
          >
            {props.section.locked ? (
              <LockOpen className="size-4" />
            ) : (
              <Lock className="size-4" />
            )}
            {props.section.locked ? "Unlock" : "Lock"}
          </Button>
          <Button
            className="h-9"
            disabled={props.disabled || props.section.locked}
            onClick={props.onRegenerate}
            type="button"
            variant="secondary"
          >
            <RefreshCcw className="size-4" />
            Regenerate
          </Button>
        </div>
      </header>

      <Field>
        <FieldLabel htmlFor={textId}>Section Text</FieldLabel>
        <Textarea
          id={textId}
          disabled={props.disabled || props.section.locked}
          rows={7}
          value={props.section.text ?? ""}
          onChange={(event) =>
            props.onChange({
              ...props.section,
              text: event.currentTarget.value.trim()
                ? event.currentTarget.value
                : null,
            })
          }
        />
      </Field>

      <div className="grid gap-3">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
          Bullets
        </p>
        {props.section.bullets.length === 0 ? (
          <EmptyState
            title="No bullets yet"
            description="Regenerate this section or add manual detail in the text area above."
          />
        ) : (
          props.section.bullets.map((bullet, bulletIndex) => (
            <Field key={bullet.id}>
              <FieldLabel htmlFor={`bullet_${bullet.id}`}>
                {bullet.origin.replaceAll("_", " ")}
              </FieldLabel>
              <div className="mb-2 flex flex-wrap gap-2">
                <Button
                  className="h-8"
                  disabled={props.disabled || props.section.locked}
                  onClick={() =>
                    props.onPatch(
                      {
                        id: `resume_patch_bullet_include_${bullet.id}_${Date.now()}`,
                        draftId: "",
                        operation: "toggle_include",
                        targetSectionId: props.section.id,
                        targetBulletId: bullet.id,
                        anchorBulletId: null,
                        position: null,
                        newText: null,
                        newIncluded: !bullet.included,
                        newLocked: null,
                        newBullets: null,
                        appliedAt: new Date().toISOString(),
                        origin: "user",
                        conflictReason: null,
                      },
                      `${bullet.included ? "Excluded" : "Included"} bullet`,
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  {bullet.included ? "Hide" : "Show"}
                </Button>
                <Button
                  className="h-8"
                  disabled={props.disabled || props.section.locked}
                  onClick={() =>
                    props.onPatch(
                      {
                        id: `resume_patch_bullet_lock_${bullet.id}_${Date.now()}`,
                        draftId: "",
                        operation: "set_lock",
                        targetSectionId: props.section.id,
                        targetBulletId: bullet.id,
                        anchorBulletId: null,
                        position: null,
                        newText: null,
                        newIncluded: null,
                        newLocked: !bullet.locked,
                        newBullets: null,
                        appliedAt: new Date().toISOString(),
                        origin: "user",
                        conflictReason: null,
                      },
                      `${bullet.locked ? "Unlocked" : "Locked"} bullet`,
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  {bullet.locked ? (
                    <LockOpen className="size-4" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  {bullet.locked ? "Unlock" : "Lock"}
                </Button>
                <Button
                  aria-label="Move bullet up"
                  className="h-8"
                  disabled={
                      props.disabled ||
                      props.section.locked ||
                      bulletIndex <= 0
                  }
                  onClick={() => {
                    const anchor = bulletIndex > 0 ? props.section.bullets[bulletIndex - 1] : null;

                    if (!anchor) {
                      return;
                    }

                    props.onPatch(
                      {
                        id: `resume_patch_bullet_up_${bullet.id}_${Date.now()}`,
                        draftId: "",
                        operation: "move_bullet",
                        targetSectionId: props.section.id,
                        targetBulletId: bullet.id,
                        anchorBulletId: anchor.id,
                        position: "before",
                        newText: null,
                        newIncluded: null,
                        newLocked: null,
                        newBullets: null,
                        appliedAt: new Date().toISOString(),
                        origin: "user",
                        conflictReason: null,
                      },
                      "Moved bullet up",
                    );
                  }}
                  type="button"
                  variant="secondary"
                >
                  <MoveUp className="size-4" />
                </Button>
                <Button
                  aria-label="Move bullet down"
                  className="h-8"
                  disabled={
                      props.disabled ||
                      props.section.locked ||
                      bulletIndex >= props.section.bullets.length - 1
                  }
                  onClick={() => {
                    const anchor = props.section.bullets[bulletIndex + 1] ?? null;

                    if (!anchor) {
                      return;
                    }

                    props.onPatch(
                      {
                        id: `resume_patch_bullet_down_${bullet.id}_${Date.now()}`,
                        draftId: "",
                        operation: "move_bullet",
                        targetSectionId: props.section.id,
                        targetBulletId: bullet.id,
                        anchorBulletId: anchor.id,
                        position: "after",
                        newText: null,
                        newIncluded: null,
                        newLocked: null,
                        newBullets: null,
                        appliedAt: new Date().toISOString(),
                        origin: "user",
                        conflictReason: null,
                      },
                      "Moved bullet down",
                    );
                  }}
                  type="button"
                  variant="secondary"
                >
                  <MoveDown className="size-4" />
                </Button>
              </div>
              <Textarea
                id={`bullet_${bullet.id}`}
                disabled={props.disabled || props.section.locked || bullet.locked}
                rows={6}
                value={bullet.text}
                onChange={(event) =>
                  props.onChange({
                    ...props.section,
                    bullets: props.section.bullets.map((entry) =>
                      entry.id === bullet.id
                        ? { ...entry, text: event.currentTarget.value }
                        : entry,
                    ),
                  })
                }
              />
              <details className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Why this bullet exists
                </summary>
                <div className="mt-3">
                  <SourceRefsList
                    emptyLabel="This bullet does not have source refs yet."
                    sourceRefs={bullet.sourceRefs}
                  />
                </div>
              </details>
            </Field>
          ))
        )}
      </div>
      <details className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Section evidence
        </summary>
        <div className="mt-3">
          <SourceRefsList
            emptyLabel="This section does not have source refs yet."
            sourceRefs={props.section.sourceRefs}
          />
        </div>
      </details>
    </article>
  );
}
