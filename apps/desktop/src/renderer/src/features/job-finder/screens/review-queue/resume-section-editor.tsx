import { Lock, LockOpen, MoveDown, MoveUp, RefreshCcw } from "lucide-react";
import { useId } from "react";
import type {
  ResumeDraftPatch,
  ResumeDraftSection,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { Field, FieldLabel } from "@renderer/components/ui/field";
import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { SourceRefsList } from "./source-refs-list";

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function ResumeSectionEditor(props: {
  section: ResumeDraftSection;
  disabled: boolean;
  onChange: (nextSection: ResumeDraftSection) => void;
  onRegenerate: () => void;
  onPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void;
}) {
  const textId = useId();
  const controlIdPrefix = useId();
  const hasEntries = props.section.entries.length > 0;

  return (
    <article className="surface-card-tint grid min-w-0 gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-(--text-headline)">
            {props.section.label}
          </h3>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge tone={props.section.included ? "active" : "muted"}>
            {props.section.included ? "Shown" : "Hidden"}
          </StatusBadge>
          <StatusBadge tone={props.section.locked ? "muted" : "active"}>
            {props.section.locked ? "Locked" : "Editable"}
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
            type="button"
            variant="secondary"
          >
            {props.section.included ? "Hide section" : "Show section"}
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
            Rewrite section
          </Button>
        </div>
      </header>

      {(!hasEntries || props.section.kind === "summary") ? (
        <Field>
          <FieldLabel htmlFor={textId}>Section text</FieldLabel>
          <Textarea
            id={textId}
            disabled={props.disabled || props.section.locked}
            rows={props.section.kind === "summary" ? 7 : 4}
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

      {props.section.sourceRefs.length ? (
        <div className="grid gap-2">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Why this is here
          </p>
          <SourceRefsList sourceRefs={props.section.sourceRefs} />
        </div>
      ) : null}

      {hasEntries ? (
        <div className="grid gap-3">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Structured entries
          </p>
          {props.section.entries.map((entry) => (
            <article
              key={entry.id}
              className="surface-card grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-3"
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
                  id={`${controlIdPrefix}_entry_summary_${entry.id}`}
                  disabled={props.disabled || props.section.locked || entry.locked}
                  rows={4}
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
                      id={`${controlIdPrefix}_entry_bullet_${bullet.id}`}
                      disabled={props.disabled || props.section.locked || entry.locked || bullet.locked}
                      rows={4}
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
      <div className="grid gap-3">
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
              {bullet.sourceRefs.length ? (
                <div className="mt-2 grid gap-2">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                    Why this bullet is here
                  </p>
                  <SourceRefsList sourceRefs={bullet.sourceRefs} />
                </div>
              ) : null}
            </Field>
          ))
        )}
      </div>
      ) : null}
    </article>
  );
}
