import { ResumeDraftSchema, type ResumeDraft, type ResumeDraftBullet, type ResumeDraftPatch, type ResumeDraftSection } from "@unemployed/contracts";
import { createBullet } from "./resume-workspace-primitives";
import { createUniqueId } from "./shared";

function requireTargetEntry(
  section: ResumeDraftSection,
  entryId: string | null,
) {
  if (!entryId) {
    return null;
  }

  const targetEntry = section.entries.find((entry) => entry.id === entryId) ?? null;

  if (!targetEntry) {
    throw new Error(`Unable to find entry '${entryId}'.`);
  }

  return targetEntry;
}

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
  entryId: string | null,
  bulletId: string | null,
): ResumeDraftBullet {
  if (!bulletId) {
    throw new Error("A target bullet id is required for this patch.");
  }

  const targetBullet = entryId
    ? (requireTargetEntry(section, entryId)?.bullets.find((bullet) => bullet.id === bulletId) ?? null)
    : (section.bullets.find((bullet) => bullet.id === bulletId) ?? null);

  if (!targetBullet) {
    throw new Error(`Unable to find bullet '${bulletId}'.`);
  }

  return targetBullet;
}

function createInsertedBulletId(
  section: ResumeDraftSection,
  entryId: string | null,
  requestedId: string | null,
): string {
  const collection = entryId
    ? (requireTargetEntry(section, entryId)?.bullets ?? [])
    : section.bullets;

  if (requestedId && !collection.some((bullet) => bullet.id === requestedId)) {
    return requestedId;
  }

  return createUniqueId(`${entryId ?? section.id}_bullet`);
}

function assertNeverResumePatchOperation(operation: never): never {
  throw new Error(`Unsupported resume patch operation: ${String(operation)}`)
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

    const requiresExistingBullet = patch.operation !== "insert_bullet";
    const targetEntry = patch.targetEntryId ? requireTargetEntry(section, patch.targetEntryId) : null;
    const bulletCollection = targetEntry ? targetEntry.bullets : section.bullets;
    const entryCollection = section.entries;
    const targetBullet = requiresExistingBullet && patch.targetBulletId
      ? bulletCollection.find((bullet) => bullet.id === patch.targetBulletId) ?? null
      : null;

    assertAssistantMayEdit(patch, section, targetBullet);
    if (patch.origin === "assistant" && targetEntry?.locked) {
      throw new Error("Assistant patches cannot overwrite locked resume content.");
    }
    switch (patch.operation) {
      case "replace_section_text":
        if ((section.text ?? null) === (patch.newText ?? null)) {
          return section;
        }
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

        if (
          !patch.anchorBulletId &&
          !patch.targetBulletId &&
          bulletCollection.some((bullet) => bullet.text === patch.newText)
        ) {
          return section;
        }

        const newBullet = createBullet(
          createInsertedBulletId(section, patch.targetEntryId, patch.targetBulletId),
          patch.newText,
          updatedAt,
          patch.origin === "assistant" ? "assistant_edited" : "user_edited",
        );
        const bullets = [...bulletCollection];

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
        if (targetEntry) {
          return updateSectionMeta(
            {
              ...section,
              entries: section.entries.map((entry) =>
                entry.id === targetEntry.id
                  ? {
                      ...entry,
                      bullets,
                      origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                      updatedAt,
                    }
                  : entry,
              ),
            },
            patch,
            updatedAt,
          );
        }
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

        const currentBullet = requireTargetBullet(section, patch.targetEntryId, patch.targetBulletId);
        if (currentBullet.text === patch.newText) {
          return section;
        }

        sectionsChanged = true;
        if (targetEntry) {
          return updateSectionMeta(
            {
              ...section,
              entries: section.entries.map((entry) =>
                entry.id === targetEntry.id
                  ? {
                      ...entry,
                      bullets: entry.bullets.map((bullet) => {
                        if (bullet.id !== patch.targetBulletId) {
                          return bullet;
                        }
                        return {
                          ...bullet,
                          text: patch.newText ?? bullet.text,
                          origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                          updatedAt,
                        };
                      }),
                      origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                      updatedAt,
                    }
                  : entry,
              ),
            },
            patch,
            updatedAt,
          );
        }
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

        requireTargetBullet(section, patch.targetEntryId, patch.targetBulletId);

        sectionsChanged = true;
        if (targetEntry) {
          return updateSectionMeta(
            {
              ...section,
              entries: section.entries.map((entry) =>
                entry.id === targetEntry.id
                  ? {
                      ...entry,
                      bullets: entry.bullets.filter((bullet) => bullet.id !== patch.targetBulletId),
                      origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                      updatedAt,
                    }
                  : entry,
              ),
            },
            patch,
            updatedAt,
          );
        }
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
        const bullets = [...bulletCollection];
        const movingBullet = requireTargetBullet(section, patch.targetEntryId, patch.targetBulletId);
        const currentIndex = bullets.findIndex((bullet) => bullet.id === movingBullet.id);

        if (!patch.anchorBulletId && currentIndex === bullets.length - 1) {
          return section;
        }

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

          const destinationIndex = patch.position === "before" ? anchorIndex : anchorIndex + 1;
          if (destinationIndex === currentIndex || destinationIndex === currentIndex + 1) {
            return section;
          }

          bullets.splice(patch.position === "before" ? anchorIndex : anchorIndex + 1, 0, {
            ...movingBullet,
            updatedAt,
          });
        }

        sectionsChanged = true;
        if (targetEntry) {
          return updateSectionMeta(
            {
              ...section,
              entries: section.entries.map((entry) =>
                entry.id === targetEntry.id
                  ? {
                      ...entry,
                      bullets,
                      origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                      updatedAt,
                    }
                  : entry,
              ),
            },
            patch,
            updatedAt,
          );
        }
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
          const currentBullet = requireTargetBullet(section, patch.targetEntryId, patch.targetBulletId);
          const nextIncluded = patch.newIncluded ?? !currentBullet.included;
          if (nextIncluded === currentBullet.included) {
            return section;
          }

          sectionsChanged = true;
          if (targetEntry) {
            return updateSectionMeta(
              {
                ...section,
                entries: section.entries.map((entry) =>
                  entry.id === targetEntry.id
                    ? {
                        ...entry,
                        bullets: entry.bullets.map((bullet) =>
                          bullet.id === patch.targetBulletId
                            ? {
                                ...bullet,
                                included: patch.newIncluded ?? !bullet.included,
                                updatedAt,
                              }
                            : bullet,
                        ),
                        origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                        updatedAt,
                      }
                    : entry,
                ),
              },
              patch,
              updatedAt,
            );
          }
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

        if (targetEntry) {
          const nextIncluded = patch.newIncluded ?? !targetEntry.included;
          if (nextIncluded === targetEntry.included) {
            return section;
          }

          sectionsChanged = true;
          return updateSectionMeta(
            {
              ...section,
              entries: entryCollection.map((entry) =>
                entry.id === targetEntry.id
                  ? {
                      ...entry,
                      included: nextIncluded,
                      origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                      updatedAt,
                    }
                  : entry,
              ),
            },
            patch,
            updatedAt,
          );
        }

        const nextIncluded = patch.newIncluded ?? !section.included;
        if (nextIncluded === section.included) {
          return section;
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
          const currentBullet = requireTargetBullet(section, patch.targetEntryId, patch.targetBulletId);
          const nextLocked = patch.newLocked ?? !currentBullet.locked;
          if (nextLocked === currentBullet.locked) {
            return section;
          }

          sectionsChanged = true;
          if (targetEntry) {
            return updateSectionMeta(
              {
                ...section,
                entries: section.entries.map((entry) =>
                  entry.id === targetEntry.id
                    ? {
                        ...entry,
                        bullets: entry.bullets.map((bullet) =>
                          bullet.id === patch.targetBulletId
                            ? {
                                ...bullet,
                                locked: patch.newLocked ?? !bullet.locked,
                                updatedAt,
                              }
                            : bullet,
                        ),
                        origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                        updatedAt,
                      }
                    : entry,
                ),
              },
              patch,
              updatedAt,
            );
          }
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

        if (targetEntry) {
          const nextLocked = patch.newLocked ?? !targetEntry.locked;
          if (nextLocked === targetEntry.locked) {
            return section;
          }

          sectionsChanged = true;
          return updateSectionMeta(
            {
              ...section,
              entries: entryCollection.map((entry) =>
                entry.id === targetEntry.id
                  ? {
                      ...entry,
                      locked: nextLocked,
                      origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                      updatedAt,
                    }
                  : entry,
              ),
            },
            patch,
            updatedAt,
          );
        }

        const nextLocked = patch.newLocked ?? !section.locked;
        if (nextLocked === section.locked) {
          return section;
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
        if (!Array.isArray(patch.newBullets)) {
          throw new Error("replace_section_bullets requires newBullets.");
        }

        const replacementBullets = patch.newBullets;

        if (patch.targetEntryId) {
          if (patch.origin === "assistant" && targetEntry?.bullets.some((bullet) => bullet.locked)) {
            throw new Error(
              "Assistant patches cannot replace entry bullets while any bullet is locked.",
            );
          }

          if (
            targetEntry &&
            replacementBullets.length === targetEntry.bullets.length &&
            replacementBullets.every(
              (bullet, index) =>
                targetEntry.bullets[index]?.text === bullet.text &&
                targetEntry.bullets[index]?.included === bullet.included &&
                targetEntry.bullets[index]?.locked === bullet.locked,
            )
          ) {
            return section;
          }

          sectionsChanged = true;
          return updateSectionMeta(
            {
              ...section,
              entries: section.entries.map((entry) =>
                entry.id === targetEntry?.id
                  ? {
                      ...entry,
                      bullets: replacementBullets.map((bullet) => ({
                        ...bullet,
                        updatedAt,
                      })),
                      origin: patch.origin === "assistant" ? "assistant_edited" : "user_edited",
                      updatedAt,
                    }
                  : entry,
              ),
            },
            patch,
            updatedAt,
          );
        }

        if (
          replacementBullets.length === section.bullets.length &&
          replacementBullets.every(
            (bullet, index) =>
              section.bullets[index]?.text === bullet.text &&
              section.bullets[index]?.included === bullet.included &&
              section.bullets[index]?.locked === bullet.locked,
          )
        ) {
          return section;
        }

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
              bullets: replacementBullets.map((bullet) => ({
                ...bullet,
                updatedAt,
              })),
            },
          patch,
          updatedAt,
        );
      default: {
        return assertNeverResumePatchOperation(patch.operation)
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
