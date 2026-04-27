import { Lock, LockOpen, MoveDown, MoveUp, RefreshCcw } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type {
  ResumeDraftPatch,
  ResumeDraftSection,
} from "@unemployed/contracts";
import {
  getResumeEntryBulletTargetId,
  getResumeEntryFieldTargetId,
  getResumeSectionBulletTargetId,
  getResumeSectionTextTargetId,
} from '@unemployed/contracts'
import { Button } from "@renderer/components/ui/button";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/cn";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }

  return value;
}

export function ResumeSectionEditor(props: {
  section: ResumeDraftSection;
  disabled: boolean;
  isSelected: boolean;
  selectedEntryId: string | null;
  selectedTargetId: string | null;
  onChange: (nextSection: ResumeDraftSection) => void;
  onSelectEntry: (sectionId: string, entryId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onRegenerate: () => void;
  onPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void;
}) {
  const textId = useId();
  const controlIdPrefix = useId();
  const hasEntries = props.section.entries.length > 0;
  const sectionRef = useRef<HTMLElement | null>(null);
  const entryRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const target = props.selectedEntryId
      ? entryRefs.current[props.selectedEntryId] ?? null
      : props.isSelected
        ? sectionRef.current
        : null;

    if (!target) {
      return;
    }

    const firstTextControl = target.querySelector<HTMLElement>(
      "textarea:not([disabled]), input:not([disabled])",
    );
    const targetedControl = props.selectedTargetId
      ? target.querySelector<HTMLElement>(`[data-resume-editor-target="${props.selectedTargetId}"]`)
      : null
    const firstControl =
      targetedControl ??
      firstTextControl ??
      target.querySelector<HTMLElement>("button:not([disabled])");

    const activeElement = document.activeElement
    if (!activeElement || !target.contains(activeElement)) {
      firstControl?.focus({ preventScroll: true });
    }

    const scrollRegion = target.closest<HTMLElement>('[data-resume-editor-scroll-region]')
    if (!scrollRegion) {
      return
    }

    const regionTop = scrollRegion.scrollTop
    const regionBottom = regionTop + scrollRegion.clientHeight
    const targetTop = target.offsetTop
    const targetBottom = targetTop + target.offsetHeight

    if (!props.selectedEntryId) {
      const sectionAnchorTop = Math.max(0, targetTop - 72)
      if (sectionAnchorTop !== regionTop) {
        scrollRegion.scrollTop = sectionAnchorTop
      }
      return
    }

    if (targetTop < regionTop) {
      scrollRegion.scrollTop = targetTop
      return
    }

    if (targetBottom > regionBottom) {
      scrollRegion.scrollTop = targetBottom - scrollRegion.clientHeight
    }
  }, [props.isSelected, props.selectedEntryId, props.selectedTargetId]);

  return (
    <article
      className={cn(
        "surface-card-tint grid min-w-0 gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) p-2.5 transition-colors",
        props.isSelected && "border-primary/35 bg-primary/5",
      )}
      onFocusCapture={() => props.onSelectSection(props.section.id)}
      onMouseDownCapture={() => props.onSelectSection(props.section.id)}
      ref={sectionRef}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-[0.9rem] font-semibold text-(--text-headline)">
            {props.section.label}
          </h3>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge tone={props.section.included ? "active" : "muted"}>
            {props.section.included ? "Shown" : "Hidden"}
          </StatusBadge>
          <StatusBadge tone={props.section.locked ? "muted" : "active"}>
            {props.section.locked ? "Locked" : "Editable"}
          </StatusBadge>
          <Button
            disabled={props.disabled}
            onClick={() =>
              props.onPatch(
                {
                  id: `resume_patch_section_include_${props.section.id}_${Date.now()}`,
                  draftId: "",
                  operation: "toggle_include",
                  targetSectionId: props.section.id,
                  targetEntryId: null,
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
                `${props.section.included ? "Hidden" : "Shown"} section`,
              )
            }
            size="compact"
            type="button"
            variant="secondary"
          >
            {props.section.included ? "Hide section" : "Show section"}
          </Button>
          <Button
            disabled={props.disabled}
            onClick={() =>
              props.onPatch(
                {
                  id: `resume_patch_section_lock_${props.section.id}_${Date.now()}`,
                  draftId: "",
                  operation: "set_lock",
                  targetSectionId: props.section.id,
                  targetEntryId: null,
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
            size="compact"
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
            disabled={props.disabled || props.section.locked}
            onClick={props.onRegenerate}
            size="compact"
            type="button"
            variant="secondary"
          >
            <RefreshCcw className="size-4" />
            Rewrite section
          </Button>
        </div>
      </header>

      {(!hasEntries || props.section.kind === "summary") ? (
        <Field>
          <FieldLabel htmlFor={textId}>Section text</FieldLabel>
          <Textarea
            className={props.section.kind === "summary" ? "min-h-32" : "min-h-40"}
            data-resume-editor-target={getResumeSectionTextTargetId(props.section.id)}
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
          {props.section.entries.map((entry) => (
            <article
              key={entry.id}
              className={cn(
                "surface-card grid gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) p-2.5 transition-colors",
                props.selectedEntryId === entry.id && "border-primary/35 bg-primary/5",
              )}
              onFocusCapture={() => props.onSelectEntry(props.section.id, entry.id)}
              onMouseDownCapture={() => props.onSelectEntry(props.section.id, entry.id)}
              ref={(node) => {
                entryRefs.current[entry.id] = node;
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={entry.included ? "active" : "muted"}>
                  {entry.included ? "Shown" : "Hidden"}
                </StatusBadge>
                <StatusBadge tone={entry.locked ? "muted" : "active"}>
                  {entry.locked ? "Locked" : "Editable"}
                </StatusBadge>
                <Button
                  className="h-8"
                  disabled={props.disabled || props.section.locked}
                  onClick={() =>
                    props.onPatch(
                      {
                        id: `resume_patch_entry_include_${entry.id}_${Date.now()}`,
                        draftId: "",
                        operation: "toggle_include",
                        targetSectionId: props.section.id,
                        targetEntryId: entry.id,
                        targetBulletId: null,
                        anchorBulletId: null,
                        position: null,
                        newText: null,
                        newIncluded: !entry.included,
                        newLocked: null,
                        newBullets: null,
                        appliedAt: new Date().toISOString(),
                        origin: "user",
                        conflictReason: null,
                      },
                      `${entry.included ? "Hidden" : "Shown"} entry`,
                    )
                  }
                  aria-pressed={!entry.included}
                  type="button"
                  variant="secondary"
                >
                  {entry.included ? "Hide entry" : "Show entry"}
                </Button>
                <Button
                  className="h-8"
                  disabled={props.disabled || props.section.locked}
                  onClick={() =>
                    props.onPatch(
                      {
                        id: `resume_patch_entry_lock_${entry.id}_${Date.now()}`,
                        draftId: "",
                        operation: "set_lock",
                        targetSectionId: props.section.id,
                        targetEntryId: entry.id,
                        targetBulletId: null,
                        anchorBulletId: null,
                        position: null,
                        newText: null,
                        newIncluded: null,
                        newLocked: !entry.locked,
                        newBullets: null,
                        appliedAt: new Date().toISOString(),
                        origin: "user",
                        conflictReason: null,
                      },
                      `${entry.locked ? "Unlocked" : "Locked"} entry`,
                    )
                  }
                  aria-pressed={entry.locked}
                  type="button"
                  variant="secondary"
                >
                  {entry.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                  {entry.locked ? "Unlock" : "Lock"}
                </Button>
              </div>

              <Field>
                <FieldLabel htmlFor={`${controlIdPrefix}_entry_title_${entry.id}`}>Title</FieldLabel>
                <Input
                  data-resume-editor-target={getResumeEntryFieldTargetId(props.section.id, entry.id, 'title')}
                  id={`${controlIdPrefix}_entry_title_${entry.id}`}
                  disabled={props.disabled || props.section.locked || entry.locked}
                  value={entry.title ?? ""}
                  onChange={(event) =>
                    props.onChange({
                      ...props.section,
                      entries: props.section.entries.map((currentEntry) =>
                        currentEntry.id === entry.id
                            ? { ...currentEntry, title: normalizeNullableText(event.currentTarget.value) }
                          : currentEntry,
                      ),
                    })
                  }
                />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${controlIdPrefix}_entry_subtitle_${entry.id}`}>Organization or subtitle</FieldLabel>
                  <Input
                    data-resume-editor-target={getResumeEntryFieldTargetId(props.section.id, entry.id, 'subtitle')}
                    id={`${controlIdPrefix}_entry_subtitle_${entry.id}`}
                    disabled={props.disabled || props.section.locked || entry.locked}
                    value={entry.subtitle ?? ""}
                    onChange={(event) =>
                      props.onChange({
                        ...props.section,
                        entries: props.section.entries.map((currentEntry) =>
                          currentEntry.id === entry.id
                            ? { ...currentEntry, subtitle: normalizeNullableText(event.currentTarget.value) }
                            : currentEntry,
                        ),
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${controlIdPrefix}_entry_dates_${entry.id}`}>Date range</FieldLabel>
                  <Input
                    data-resume-editor-target={getResumeEntryFieldTargetId(props.section.id, entry.id, 'dateRange')}
                    id={`${controlIdPrefix}_entry_dates_${entry.id}`}
                    disabled={props.disabled || props.section.locked || entry.locked}
                    value={entry.dateRange ?? ""}
                    onChange={(event) =>
                      props.onChange({
                        ...props.section,
                        entries: props.section.entries.map((currentEntry) =>
                          currentEntry.id === entry.id
                            ? { ...currentEntry, dateRange: normalizeNullableText(event.currentTarget.value) }
                            : currentEntry,
                        ),
                      })
                    }
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`${controlIdPrefix}_entry_location_${entry.id}`}>Location</FieldLabel>
                <Input
                  data-resume-editor-target={getResumeEntryFieldTargetId(props.section.id, entry.id, 'location')}
                  id={`${controlIdPrefix}_entry_location_${entry.id}`}
                  disabled={props.disabled || props.section.locked || entry.locked}
                  value={entry.location ?? ""}
                  onChange={(event) =>
                    props.onChange({
                      ...props.section,
                      entries: props.section.entries.map((currentEntry) =>
                        currentEntry.id === entry.id
                            ? { ...currentEntry, location: normalizeNullableText(event.currentTarget.value) }
                          : currentEntry,
                      ),
                    })
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={`${controlIdPrefix}_entry_summary_${entry.id}`}>Entry summary</FieldLabel>
                <Textarea
                  className="min-h-32"
                  data-resume-editor-target={getResumeEntryFieldTargetId(props.section.id, entry.id, 'summary')}
                  id={`${controlIdPrefix}_entry_summary_${entry.id}`}
                  disabled={props.disabled || props.section.locked || entry.locked}
                  rows={5}
                  value={entry.summary ?? ""}
                  onChange={(event) =>
                    props.onChange({
                      ...props.section,
                      entries: props.section.entries.map((currentEntry) =>
                        currentEntry.id === entry.id
                            ? { ...currentEntry, summary: normalizeNullableText(event.currentTarget.value) }
                          : currentEntry,
                      ),
                    })
                  }
                />
              </Field>

              <div className="grid gap-3">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                  Entry bullets
                </p>
                {entry.bullets.map((bullet, bulletIndex) => (
                  <Field key={bullet.id}>
                    <FieldLabel htmlFor={`${controlIdPrefix}_entry_bullet_${bullet.id}`}>Bullet text</FieldLabel>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Button
                        className="h-8"
                        disabled={props.disabled || props.section.locked || entry.locked}
                        onClick={() =>
                          props.onPatch(
                            {
                              id: `resume_patch_entry_bullet_include_${bullet.id}_${Date.now()}`,
                              draftId: "",
                              operation: "toggle_include",
                              targetSectionId: props.section.id,
                              targetEntryId: entry.id,
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
                            `${bullet.included ? "Hidden" : "Shown"} bullet`,
                          )
                        }
                        aria-pressed={!bullet.included}
                        type="button"
                        variant="secondary"
                      >
                        {bullet.included ? "Hide" : "Show"}
                      </Button>
                      <Button
                        className="h-8"
                        disabled={props.disabled || props.section.locked || entry.locked}
                        onClick={() =>
                          props.onPatch(
                            {
                              id: `resume_patch_entry_bullet_lock_${bullet.id}_${Date.now()}`,
                              draftId: "",
                              operation: "set_lock",
                              targetSectionId: props.section.id,
                              targetEntryId: entry.id,
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
                        aria-pressed={bullet.locked}
                        type="button"
                        variant="secondary"
                      >
                        {bullet.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                        {bullet.locked ? "Unlock" : "Lock"}
                      </Button>
                      <Button
                        aria-label="Move bullet up"
                        className="h-8"
                        disabled={props.disabled || props.section.locked || entry.locked || bulletIndex <= 0}
                        onClick={() => {
                          const anchor = bulletIndex > 0 ? entry.bullets[bulletIndex - 1] : null;
                          if (!anchor) {
                            return;
                          }
                          props.onPatch(
                            {
                              id: `resume_patch_entry_bullet_up_${bullet.id}_${Date.now()}`,
                              draftId: "",
                              operation: "move_bullet",
                              targetSectionId: props.section.id,
                              targetEntryId: entry.id,
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
                          )
                        }}
                        type="button"
                        variant="secondary"
                      >
                        <MoveUp className="size-4" />
                      </Button>
                      <Button
                        aria-label="Move bullet down"
                        className="h-8"
                        disabled={props.disabled || props.section.locked || entry.locked || bulletIndex >= entry.bullets.length - 1}
                        onClick={() => {
                          const anchor = entry.bullets[bulletIndex + 1] ?? null;
                          if (!anchor) {
                            return;
                          }
                          props.onPatch(
                            {
                              id: `resume_patch_entry_bullet_down_${bullet.id}_${Date.now()}`,
                              draftId: "",
                              operation: "move_bullet",
                              targetSectionId: props.section.id,
                              targetEntryId: entry.id,
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
                          )
                        }}
                        type="button"
                        variant="secondary"
                      >
                        <MoveDown className="size-4" />
                      </Button>
                    </div>
                    <Textarea
                      className="min-h-32"
                      data-resume-editor-target={getResumeEntryBulletTargetId(props.section.id, entry.id, bullet.id)}
                      id={`${controlIdPrefix}_entry_bullet_${bullet.id}`}
                      disabled={props.disabled || props.section.locked || entry.locked || bullet.locked}
                      rows={5}
                      value={bullet.text}
                      onChange={(event) =>
                        props.onChange({
                          ...props.section,
                          entries: props.section.entries.map((currentEntry) =>
                            currentEntry.id === entry.id
                              ? {
                                  ...currentEntry,
                                  bullets: currentEntry.bullets.map((currentBullet) =>
                                    currentBullet.id === bullet.id
                                      ? { ...currentBullet, text: event.currentTarget.value }
                                      : currentBullet,
                                  ),
                                }
                              : currentEntry,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </article>
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
          props.section.bullets.map((bullet, bulletIndex) => (
            <Field key={bullet.id}>
              <FieldLabel htmlFor={`${controlIdPrefix}_bullet_${bullet.id}`}>Bullet text</FieldLabel>
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
                        targetEntryId: null,
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
                      `${bullet.included ? "Hidden" : "Shown"} bullet`,
                    )
                  }
                  aria-pressed={!bullet.included}
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
                        targetEntryId: null,
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
                  aria-pressed={bullet.locked}
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
                        targetEntryId: null,
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
                        targetEntryId: null,
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
                className="min-h-36"
                data-resume-editor-target={getResumeSectionBulletTargetId(props.section.id, bullet.id)}
                id={`${controlIdPrefix}_bullet_${bullet.id}`}
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
            </Field>
          ))
        )}
      </div>
      ) : null}
    </article>
  );
}
