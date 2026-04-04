import { ResumeDraftSchema, type ResumeDraft, type ResumeDraftBullet, type ResumeDraftPatch, type ResumeDraftSection } from "@unemployed/contracts";
import { createBullet } from "./resume-workspace-primitives";
import { createUniqueId } from "./shared";

function assertAssistantMayEdit(
  patch: ResumeDraftPatch,
  section: ResumeDraftSection,
  bullet?: ResumeDraftBullet | null,
): void {
  if (patch.origin !== "assistant") {
    return;
  }

  if (section.locked || bullet?.locked) {
    throw new Error("Assistant patches cannot overwrite locked resume content.");
  }
}

function updateSectionMeta(
  section: ResumeDraftSection,
  patch: ResumeDraftPatch,
  updatedAt: string,
): ResumeDraftSection {
  return {
    ...section,
    origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
    updatedAt,
  };
}

function requireTargetBullet(
  section: ResumeDraftSection,
  bulletId: string | null,
): ResumeDraftBullet {
  if (!bulletId) {
    throw new Error("A target bullet id is required for this patch.");
  }

  const targetBullet = section.bullets.find((bullet) => bullet.id === bulletId) ?? null;

  if (!targetBullet) {
    throw new Error(`Unable to find bullet '${bulletId}'.`);
  }

  return targetBullet;
}

function createInsertedBulletId(
  section: ResumeDraftSection,
  requestedId: string | null,
): string {
  if (requestedId && !section.bullets.some((bullet) => bullet.id === requestedId)) {
    return requestedId;
  }

  return createUniqueId(`${section.id}_bullet`);
}

export function applyPatchToResumeDraft(input: {
  draft: ResumeDraft;
  patch: ResumeDraftPatch;
  updatedAt: string;
}): ResumeDraft {
  const { draft, patch, updatedAt } = input;
  let sectionsChanged = false;
  const targetSection = draft.sections.find(
    (section) => section.id === patch.targetSectionId,
  );

  if (!targetSection) {
    throw new Error(`Unable to find resume section '${patch.targetSectionId}'.`);
  }

  const nextSections = draft.sections.map((section) => {
    if (section.id !== patch.targetSectionId) {
      return section;
    }

    const targetBullet = patch.targetBulletId
      ? section.bullets.find((bullet) => bullet.id === patch.targetBulletId) ?? null
      : null;

    assertAssistantMayEdit(patch, section, targetBullet);

    switch (patch.operation) {
      case "replace_section_text":
        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            text: patch.newText,
          },
          patch,
          updatedAt,
        );
      case "insert_bullet": {
        if (!patch.newText) {
          throw new Error("A new bullet text value is required for insert_bullet.");
        }

        const newBullet = createBullet(
          createInsertedBulletId(section, patch.targetBulletId),
          patch.newText,
          updatedAt,
          patch.origin === "assistant" ? "assistant_edited" : "user_edited",
        );
        const bullets = [...section.bullets];

        if (!patch.anchorBulletId) {
          bullets.push(newBullet);
        } else {
          const anchorIndex = bullets.findIndex(
            (bullet) => bullet.id === patch.anchorBulletId,
          );

          if (anchorIndex < 0) {
            throw new Error(`Unable to find anchor bullet '${patch.anchorBulletId}'.`);
          }

          const insertIndex =
            patch.position === "before" ? anchorIndex : anchorIndex + 1;
          bullets.splice(insertIndex, 0, newBullet);
        }

        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            bullets,
          },
          patch,
          updatedAt,
        );
      }
      case "update_bullet": {
        if (!patch.targetBulletId || !patch.newText) {
          throw new Error("update_bullet requires a bullet id and replacement text.");
        }

        requireTargetBullet(section, patch.targetBulletId);

        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            bullets: section.bullets.map((bullet) => {
              if (bullet.id !== patch.targetBulletId) {
                return bullet;
              }
              return {
                ...bullet,
                text: patch.newText ?? bullet.text,
                origin:
                  patch.origin === "assistant"
                    ? "assistant_edited"
                    : "user_edited",
                updatedAt,
              };
            }),
          },
          patch,
          updatedAt,
        );
      }
      case "remove_bullet": {
        if (!patch.targetBulletId) {
          throw new Error("remove_bullet requires a bullet id.");
        }

        requireTargetBullet(section, patch.targetBulletId);

        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            bullets: section.bullets.filter(
              (bullet) => bullet.id !== patch.targetBulletId,
            ),
          },
          patch,
          updatedAt,
        );
      }
      case "move_bullet": {
        const bullets = [...section.bullets];
        const movingBullet = requireTargetBullet(section, patch.targetBulletId);
        const currentIndex = bullets.findIndex((bullet) => bullet.id === movingBullet.id);

        bullets.splice(currentIndex, 1);

        if (!patch.anchorBulletId) {
          bullets.push({
            ...movingBullet,
            updatedAt,
          });
        } else {
          const anchorIndex = bullets.findIndex(
            (bullet) => bullet.id === patch.anchorBulletId,
          );

          if (anchorIndex < 0) {
            throw new Error(`Unable to find anchor bullet '${patch.anchorBulletId}'.`);
          }

          bullets.splice(patch.position === "before" ? anchorIndex : anchorIndex + 1, 0, {
            ...movingBullet,
            updatedAt,
          });
        }

        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            bullets,
          },
          patch,
          updatedAt,
        );
      }
      case "toggle_include": {
        if (patch.targetBulletId) {
          requireTargetBullet(section, patch.targetBulletId);

          sectionsChanged = true;
          return updateSectionMeta(
            {
              ...section,
              bullets: section.bullets.map((bullet) =>
                bullet.id === patch.targetBulletId
                  ? {
                      ...bullet,
                      included: patch.newIncluded ?? !bullet.included,
                      updatedAt,
                    }
                  : bullet,
              ),
            },
            patch,
            updatedAt,
          );
        }

        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            included: patch.newIncluded ?? !section.included,
          },
          patch,
          updatedAt,
        );
      }
      case "set_lock": {
        if (patch.targetBulletId) {
          requireTargetBullet(section, patch.targetBulletId);

          sectionsChanged = true;
          return updateSectionMeta(
            {
              ...section,
              bullets: section.bullets.map((bullet) =>
                bullet.id === patch.targetBulletId
                  ? {
                      ...bullet,
                      locked: patch.newLocked ?? !bullet.locked,
                      updatedAt,
                    }
                  : bullet,
              ),
            },
            patch,
            updatedAt,
          );
        }

        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            locked: patch.newLocked ?? !section.locked,
          },
          patch,
          updatedAt,
        );
      }
      case "replace_section_bullets":
        if (
          patch.origin === "assistant" &&
          section.bullets.some((bullet) => bullet.locked)
        ) {
          throw new Error(
            "Assistant patches cannot replace section bullets while any bullet is locked.",
          );
        }

        sectionsChanged = true;
        return updateSectionMeta(
          {
            ...section,
            bullets: patch.newBullets?.map((bullet) => ({
              ...bullet,
              updatedAt,
            })) ?? [],
          },
          patch,
          updatedAt,
        );
      default: {
        const unsupportedOperation: never = patch.operation;
        throw new Error(`Unsupported resume patch operation '${unsupportedOperation}'.`);
      }
    }
  });

  if (!sectionsChanged) {
    return draft;
  }

  const approvalWasSet = Boolean(draft.approvedAt || draft.approvedExportId);

  return ResumeDraftSchema.parse({
    ...draft,
    sections: nextSections,
    status: approvalWasSet ? "stale" : "needs_review",
    approvedAt: null,
    approvedExportId: null,
    staleReason: approvalWasSet
      ? "Draft changed after approval and needs a fresh review."
      : null,
    updatedAt,
  });
}
