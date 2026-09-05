export type ResumeProposalDiffKind = "unchanged" | "added" | "removed";

export interface ResumeProposalDiffPart {
  kind: ResumeProposalDiffKind;
  text: string;
}

/**
 * Splits on whitespace while keeping the whitespace attached to the token that
 * precedes it, so rejoining the parts reproduces the original string exactly.
 */
function tokenizeWithTrailingSpace(value: string): string[] {
  return value.match(/\S+\s*/g) ?? [];
}

/**
 * Word-level diff of a proposed rewrite against the wording currently in the
 * draft. A proposal card that printed "Before" and "After" as two opaque
 * paragraphs made the user re-read a whole bullet to find the four words the
 * assistant actually changed; the same change rendered as struck-out removals
 * and highlighted additions is readable at a glance.
 *
 * Presentation only: the grounding verdict for a proposed change stays with
 * the export gate's approval blockers, and nothing here decides whether a
 * change may be accepted.
 */
export function diffProposalWording(
  before: string,
  after: string,
): readonly ResumeProposalDiffPart[] {
  const beforeTokens = tokenizeWithTrailingSpace(before);
  const afterTokens = tokenizeWithTrailingSpace(after);

  // Longest common subsequence over whole words. Proposal texts are one
  // bullet or one summary, so the quadratic table is small and exact.
  const lengths: number[][] = Array.from(
    { length: beforeTokens.length + 1 },
    () => new Array<number>(afterTokens.length + 1).fill(0),
  );

  for (let left = beforeTokens.length - 1; left >= 0; left -= 1) {
    for (let right = afterTokens.length - 1; right >= 0; right -= 1) {
      lengths[left]![right] =
        beforeTokens[left]!.trim() === afterTokens[right]!.trim()
          ? lengths[left + 1]![right + 1]! + 1
          : Math.max(lengths[left + 1]![right]!, lengths[left]![right + 1]!);
    }
  }

  const parts: ResumeProposalDiffPart[] = [];
  const push = (kind: ResumeProposalDiffKind, text: string) => {
    const previous = parts[parts.length - 1];
    if (previous && previous.kind === kind) {
      previous.text += text;
      return;
    }

    parts.push({ kind, text });
  };

  let left = 0;
  let right = 0;
  while (left < beforeTokens.length && right < afterTokens.length) {
    if (beforeTokens[left]!.trim() === afterTokens[right]!.trim()) {
      push("unchanged", afterTokens[right]!);
      left += 1;
      right += 1;
      continue;
    }

    if (lengths[left + 1]![right]! >= lengths[left]![right + 1]!) {
      push("removed", beforeTokens[left]!);
      left += 1;
      continue;
    }

    push("added", afterTokens[right]!);
    right += 1;
  }

  while (left < beforeTokens.length) {
    push("removed", beforeTokens[left]!);
    left += 1;
  }

  while (right < afterTokens.length) {
    push("added", afterTokens[right]!);
    right += 1;
  }

  return parts;
}

/**
 * A diff is only useful when both sides are real prose. Structural operations
 * ("Included" -> "Excluded", "Current order" -> "Move after") keep their plain
 * before/after wording.
 */
export function shouldRenderProposalDiff(
  before: string,
  after: string,
): boolean {
  if (!before.trim() || !after.trim()) {
    return false;
  }

  if (before.trim() === after.trim()) {
    return false;
  }

  return before.trim().includes(" ") && after.trim().includes(" ");
}
