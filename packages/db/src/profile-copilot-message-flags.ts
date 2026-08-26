import type { ProfileCopilotMessage } from "@unemployed/contracts";
import type { ProfileCopilotMessagePatchFlag } from "./repository-types";

/**
 * Returns the index of the persisted copilot message owning a patch group,
 * preferring an exact message-id match and falling back to a content scan so
 * callers that captured only the group id still resolve transaction-current
 * rows.
 */
export function findProfileCopilotMessageByPatchGroup(
  messages: readonly ProfileCopilotMessage[],
  input: { messageId?: string | null; patchGroupId: string },
): number {
  if (input.messageId) {
    const byMessageId = messages.findIndex(
      (message) =>
        message.id === input.messageId &&
        message.patchGroups.some((group) => group.id === input.patchGroupId),
    );
    if (byMessageId >= 0) {
      return byMessageId;
    }
  }

  return messages.findIndex((message) =>
    message.patchGroups.some((group) => group.id === input.patchGroupId),
  );
}

/**
 * Applies patch-group flag flips onto current message rows and returns only
 * the messages whose content actually changed. Flags whose group no longer
 * exists are dropped: a delta never resurrects deleted history.
 */
export function applyProfileCopilotMessagePatchFlags(
  messages: readonly ProfileCopilotMessage[],
  flags: readonly ProfileCopilotMessagePatchFlag[],
): ProfileCopilotMessage[] {
  const nextMessages = [...messages];

  for (const flag of flags) {
    const messageIndex = findProfileCopilotMessageByPatchGroup(nextMessages, {
      messageId: flag.messageId,
      patchGroupId: flag.patchGroupId,
    });

    if (messageIndex < 0) {
      continue;
    }

    const message = nextMessages[messageIndex];
    if (!message) {
      continue;
    }
    let didChange = false;
    const nextGroups = message.patchGroups.map((group) => {
      if (
        group.id !== flag.patchGroupId ||
        group.applyMode === flag.applyMode
      ) {
        return group;
      }
      didChange = true;
      return { ...group, applyMode: flag.applyMode };
    });

    if (didChange) {
      nextMessages[messageIndex] = { ...message, patchGroups: nextGroups };
    }
  }

  const changedMessages: ProfileCopilotMessage[] = [];
  for (const [index, nextMessage] of nextMessages.entries()) {
    if (nextMessage !== messages[index]) {
      changedMessages.push(nextMessage);
    }
  }
  return changedMessages;
}
