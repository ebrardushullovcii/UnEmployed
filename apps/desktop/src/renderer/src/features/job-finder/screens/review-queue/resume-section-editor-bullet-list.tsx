import { Lock, LockOpen, MoveDown, MoveUp } from "lucide-react";
import type {
  ResumeDraftBullet,
  ResumeDraftSection,
} from "@unemployed/contracts";
import {
  getResumeEntryBulletTargetId,
  getResumeSectionBulletTargetId,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/cn";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import {
  createResumeDraftPatch,
  updateEntryBulletText,
  updateSectionBulletText,
} from "./resume-section-editor-helpers";
import { isGeneratedResumeOrigin } from "./resume-workspace-utils";

interface ResumeBulletListEditorProps {
  bulletRows: readonly ResumeDraftBullet[];
  controlIdPrefix: string;
  disabled: boolean;
  emptyState?: { description: string; title: string };
  entryId?: string | null;
  section: ResumeDraftSection;
  showGeneratedMarkers: boolean;
  onChange: (nextSection: ResumeDraftSection) => void;
  onPatch: (
    patch: ReturnType<typeof createResumeDraftPatch>,
    revisionReason?: string | null,
  ) => void;
}

const bulletTextareaClassName = "min-h-[3.9rem] [field-sizing:content]";

export function ResumeBulletListEditor(props: ResumeBulletListEditorProps) {
  const {
    bulletRows,
    controlIdPrefix,
    disabled,
    emptyState,
    entryId = null,
    section,
    showGeneratedMarkers,
    onChange,
    onPatch,
  } = props;
  const sectionLocked = section.locked;

  if (bulletRows.length === 0 && emptyState) {
    return (
      <EmptyState
        description={emptyState.description}
        title={emptyState.title}
      />
    );
  }

  return (
    <>
      {bulletRows.map((bullet, bulletIndex) => {
        const isEntryBullet = entryId !== null;
        const bulletNumber = bulletIndex + 1;
        const bulletId = isEntryBullet
          ? `${controlIdPrefix}_entry_bullet_${bullet.id}`
          : `${controlIdPrefix}_bullet_${bullet.id}`;
        const targetId = isEntryBullet
          ? getResumeEntryBulletTargetId(section.id, entryId, bullet.id)
          : getResumeSectionBulletTargetId(section.id, bullet.id);
        const rowLocked = disabled || sectionLocked;
        const moveUpDisabled = rowLocked || bulletIndex <= 0;
        const moveDownDisabled =
          rowLocked || bulletIndex >= bulletRows.length - 1;
        const textDisabled = rowLocked || bullet.locked;

        return (
          <div className="grid min-w-0 gap-1" key={bullet.id}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                className="h-8"
                disabled={rowLocked}
                onClick={() =>
                  onPatch(
                    createResumeDraftPatch({
                      bulletId: bullet.id,
                      entryId,
                      idPrefix: isEntryBullet
                        ? `resume_patch_entry_bullet_include_${bullet.id}`
                        : `resume_patch_bullet_include_${bullet.id}`,
                      newIncluded: !bullet.included,
                      operation: "toggle_include",
                      sectionId: section.id,
                    }),
                    `${bullet.included ? "Hidden" : "Shown"} bullet`,
                  )
                }
                aria-label={
                  bullet.included
                    ? `Hide ${isEntryBullet ? "entry " : ""}bullet ${bulletNumber}`
                    : `Show ${isEntryBullet ? "entry " : ""}bullet ${bulletNumber}`
                }
                type="button"
                variant="secondary"
              >
                {bullet.included ? "Hide" : "Show"}
              </Button>
              <Button
                className="h-8"
                disabled={rowLocked}
                onClick={() =>
                  onPatch(
                    createResumeDraftPatch({
                      bulletId: bullet.id,
                      entryId,
                      idPrefix: isEntryBullet
                        ? `resume_patch_entry_bullet_lock_${bullet.id}`
                        : `resume_patch_bullet_lock_${bullet.id}`,
                      newLocked: !bullet.locked,
                      operation: "set_lock",
                      sectionId: section.id,
                    }),
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
                aria-label={`Move ${isEntryBullet ? "entry " : ""}bullet ${bulletNumber} up`}
                className="h-8"
                disabled={moveUpDisabled}
                onClick={() => {
                  const anchor =
                    bulletIndex > 0 ? bulletRows[bulletIndex - 1] : null;
                  if (!anchor) {
                    return;
                  }

                  onPatch(
                    createResumeDraftPatch({
                      anchorBulletId: anchor.id,
                      bulletId: bullet.id,
                      entryId,
                      idPrefix: isEntryBullet
                        ? `resume_patch_entry_bullet_up_${bullet.id}`
                        : `resume_patch_bullet_up_${bullet.id}`,
                      operation: "move_bullet",
                      position: "before",
                      sectionId: section.id,
                    }),
                    "Moved bullet up",
                  );
                }}
                type="button"
                variant="secondary"
              >
                <MoveUp className="size-4" />
              </Button>
              <Button
                aria-label={`Move ${isEntryBullet ? "entry " : ""}bullet ${bulletNumber} down`}
                className="h-8"
                disabled={moveDownDisabled}
                onClick={() => {
                  const anchor = bulletRows[bulletIndex + 1] ?? null;
                  if (!anchor) {
                    return;
                  }

                  onPatch(
                    createResumeDraftPatch({
                      anchorBulletId: anchor.id,
                      bulletId: bullet.id,
                      entryId,
                      idPrefix: isEntryBullet
                        ? `resume_patch_entry_bullet_down_${bullet.id}`
                        : `resume_patch_bullet_down_${bullet.id}`,
                      operation: "move_bullet",
                      position: "after",
                      sectionId: section.id,
                    }),
                    "Moved bullet down",
                  );
                }}
                type="button"
                variant="secondary"
              >
                <MoveDown className="size-4" />
              </Button>
              {showGeneratedMarkers &&
              isGeneratedResumeOrigin(bullet.origin) ? (
                <StatusBadge tone="muted">AI-generated</StatusBadge>
              ) : null}
            </div>
            <Textarea
              className={cn(bulletTextareaClassName)}
              aria-label={`${isEntryBullet ? "Entry" : "Section"} bullet ${bulletNumber}${bullet.included ? "" : " (hidden)"}`}
              data-resume-editor-target={targetId}
              id={bulletId}
              disabled={textDisabled}
              rows={2}
              value={bullet.text}
              onChange={(event) =>
                onChange(
                  entryId
                    ? updateEntryBulletText(
                        section,
                        entryId,
                        bullet.id,
                        event.currentTarget.value,
                      )
                    : updateSectionBulletText(
                        section,
                        bullet.id,
                        event.currentTarget.value,
                      ),
                )
              }
            />
          </div>
        );
      })}
    </>
  );
}
