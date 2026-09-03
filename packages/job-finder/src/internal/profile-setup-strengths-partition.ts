/**
 * Strengths and Skills are two chip lists of similar-looking tokens, and the
 * profile explains the difference: strengths are short phrases about how you
 * work, while named technologies belong in Skills. Resume extraction did not
 * respect that split, so an imported profile could teach the rule and break it
 * in the same panel ("C# · ASP.NET · MongoDB · React" under a helper saying
 * named technologies belong in Skills).
 *
 * This module keeps the two lists honest at import time: entries that read as
 * named technologies are relocated into the skills list instead of being
 * dropped, and nothing is invented.
 */

function normalizeToken(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Deterministic, vocabulary-free test for "this reads as a named technology".
 *
 * A value counts as a technology when any of the following holds:
 * - it already appears in the profile's skills vocabulary (the strongest
 *   signal: the same resume listed it as a skill);
 * - it carries technology punctuation (`C#`, `C++`, `ASP.NET`, `Node.js`);
 * - it is a single word with an internal capital (`MongoDB`, `TypeScript`).
 *
 * A multi-word phrase with ordinary casing ("systems thinking", "mentoring
 * engineers") is left alone, so genuine strengths survive.
 */
export function isNamedTechnologyStrength(
  value: string,
  skillsVocabulary: ReadonlySet<string>,
): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return false;
  }

  if (skillsVocabulary.has(normalizeToken(trimmed))) {
    return true;
  }

  if (/[#+]/.test(trimmed) || /(^|\w)\.\w/.test(trimmed)) {
    return true;
  }

  const words = trimmed.split(/\s+/);
  return words.length === 1 && /[a-z][A-Z0-9]/.test(trimmed);
}

export interface StrengthsSkillsPartition {
  skills: string[];
  strengths: string[];
}

function dedupePreservingOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const key = normalizeToken(trimmed);
    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [trimmed];
  });
}

/**
 * Moves named technologies out of `strengths` and into `skills`, preserving
 * order and dropping nothing. `skillGroupValues` widens the vocabulary used to
 * recognise a technology without becoming part of the main skills list.
 */
export function partitionStrengthsAndSkills(input: {
  skillGroupValues?: readonly string[];
  skills: readonly string[];
  strengths: readonly string[];
}): StrengthsSkillsPartition {
  const skills = dedupePreservingOrder(input.skills);
  const vocabulary = new Set(
    [...skills, ...(input.skillGroupValues ?? [])].map((value) =>
      normalizeToken(value),
    ),
  );
  const strengths = dedupePreservingOrder(input.strengths);
  const relocated = strengths.filter((value) =>
    isNamedTechnologyStrength(value, vocabulary),
  );

  if (relocated.length === 0) {
    return { skills, strengths };
  }

  return {
    skills: dedupePreservingOrder([...skills, ...relocated]),
    strengths: strengths.filter(
      (value) => !isNamedTechnologyStrength(value, vocabulary),
    ),
  };
}
