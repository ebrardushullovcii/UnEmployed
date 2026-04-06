type TimestampInput = string | number | Date;

export interface TimelineEvent<TKey extends string> {
  timestamp: TimestampInput;
  key: TKey;
}

export interface TimelineSummary<TKey extends string> {
  totalDurationMs: number;
  firstEventMs: number | null;
  longestGapMs: number;
  eventCount: number;
  durationsMsByKey: ReadonlyMap<TKey, number>;
}

function toEpochMs(value: TimestampInput): number {
  if (typeof value === "number") {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return new Date(value).getTime();
}

export function calculateDurationMs(
  startedAt: TimestampInput,
  completedAt: TimestampInput,
): number {
  const startedEpoch = toEpochMs(startedAt);
  const completedEpoch = toEpochMs(completedAt);

  if (!Number.isFinite(startedEpoch) || !Number.isFinite(completedEpoch)) {
    return 0;
  }

  return Math.max(0, completedEpoch - startedEpoch);
}

export function computeTimelineSummary<TKey extends string>(input: {
  startedAt: TimestampInput;
  completedAt: TimestampInput;
  events: readonly TimelineEvent<TKey>[];
}): TimelineSummary<TKey> {
  const startedAtMs = toEpochMs(input.startedAt);
  const completedAtMs = toEpochMs(input.completedAt);
  const hasFiniteWindow =
    Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs);
  const safeCompletedAtMs = hasFiniteWindow ? completedAtMs : startedAtMs;
  const normalizedEvents = input.events
    .map((event) => ({
      atMs: toEpochMs(event.timestamp),
      key: event.key,
    }))
    .filter((event) => hasFiniteWindow && event.atMs >= startedAtMs && event.atMs <= completedAtMs)
    .sort((left, right) => left.atMs - right.atMs);
  const durationsMsByKey = new Map<TKey, number>();
  const totalDurationMs = calculateDurationMs(input.startedAt, input.completedAt);
  const firstEventMs =
    normalizedEvents.length > 0
      ? calculateDurationMs(input.startedAt, normalizedEvents[0]!.atMs)
      : null;
  let longestGapMs = normalizedEvents.length > 0 ? firstEventMs ?? 0 : totalDurationMs;

  for (let index = 0; index < normalizedEvents.length; index += 1) {
    const currentEvent = normalizedEvents[index]!;
    const nextAtMs = normalizedEvents[index + 1]?.atMs ?? safeCompletedAtMs;
    const durationMs = calculateDurationMs(currentEvent.atMs, nextAtMs);

    durationsMsByKey.set(
      currentEvent.key,
      (durationsMsByKey.get(currentEvent.key) ?? 0) + durationMs,
    );
    longestGapMs = Math.max(longestGapMs, durationMs);
  }

  return {
    totalDurationMs,
    firstEventMs,
    longestGapMs,
    eventCount: normalizedEvents.length,
    durationsMsByKey,
  };
}

export function serializeOrderedDurationEntries<TKey extends string, TOutput>(
  durationsMsByKey: ReadonlyMap<TKey, number>,
  order: readonly TKey[],
  createEntry: (key: TKey, durationMs: number) => TOutput,
): TOutput[] {
  const orderedEntries: TOutput[] = [];
  const remaining = new Map(durationsMsByKey);

  for (const key of order) {
    const durationMs = remaining.get(key);

    if (durationMs == null || durationMs <= 0) {
      continue;
    }

    orderedEntries.push(createEntry(key, durationMs));
    remaining.delete(key);
  }

  const leftoverKeys = [...remaining.keys()].sort();

  for (const key of leftoverKeys) {
    const durationMs = remaining.get(key);

    if (durationMs == null || durationMs <= 0) {
      continue;
    }

    orderedEntries.push(createEntry(key, durationMs));
  }

  return orderedEntries;
}
