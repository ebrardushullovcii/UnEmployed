import { useCallback, useState } from "react";

// Profile record cards keep their open state mount-only, so a freshly appended
// row would otherwise stay collapsed. Append handlers mark the new record id
// here and the card receives a matching forceOpenSignal that opens it exactly
// once. Signals are removed when the row is deleted so the map cannot grow on
// long editing sessions.
export function useProfileAppendedRecordOpenSignal() {
  const [versionsById, setVersionsById] = useState<Record<string, number>>({});

  const markAppendedRecord = useCallback((recordId: string) => {
    setVersionsById((current) => ({
      ...current,
      [recordId]: (current[recordId] ?? 0) + 1,
    }));
  }, []);

  const forgetAppendedRecord = useCallback((recordId: string) => {
    setVersionsById((current) => {
      if (!(recordId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[recordId];
      return next;
    });
  }, []);

  const getAppendedRecordOpenSignal = useCallback(
    (recordId: string) =>
      recordId in versionsById ? `${recordId}:${versionsById[recordId]}` : null,
    [versionsById],
  );

  return {
    forgetAppendedRecord,
    getAppendedRecordOpenSignal,
    markAppendedRecord,
  };
}
