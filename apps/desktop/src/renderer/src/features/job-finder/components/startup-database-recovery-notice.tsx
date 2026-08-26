import { useEffect, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import {
  JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_DETAIL,
  JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_MESSAGE,
  isJobFinderStartupDatabaseRecoveryFact,
  type JobFinderStartupDatabaseRecoveryRestoredFact,
} from "../../../../../shared/job-finder-startup-db-recovery";

export function StartupDatabaseRecoveryNotice() {
  const [restoredFact, setRestoredFact] =
    useState<JobFinderStartupDatabaseRecoveryRestoredFact | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    try {
      const recoveryBridge =
        window.unemployed?.jobFinder?.getStartupDatabaseRecovery;
      recoveryBridge?.()
        .then((recoveryFact) => {
          if (
            !cancelled &&
            isJobFinderStartupDatabaseRecoveryFact(recoveryFact) &&
            recoveryFact.status === "restored" &&
            recoveryFact.dismissedAtIso === null
          ) {
            setRestoredFact(recoveryFact);
          }
        })
        .catch(() => {
          // Stay hidden when the desktop bridge is unavailable.
        });
    } catch {
      // Stay hidden when the desktop bridge is unavailable.
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (!restoredFact || isDismissed) {
    return null;
  }

  function dismissNotice() {
    setIsDismissed(true);
    try {
      const dismissBridge =
        window.unemployed?.jobFinder?.dismissStartupDatabaseRecoveryNotice;
      void dismissBridge?.().catch(() => undefined);
    } catch {
      // Keep the in-memory dismissal when the desktop bridge is unavailable.
    }
  }

  return (
    <div
      aria-live="polite"
      className="surface-card-tint fixed bottom-4 right-4 z-40 grid max-w-sm gap-2 rounded-(--radius-panel) border border-border/30 px-5 py-4 shadow-(--modal-shadow)"
      data-startup-database-recovery-notice
      role="status"
    >
      <p className="text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground">
        Workspace recovery
      </p>
      <p className="text-sm font-medium text-foreground">
        {JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_MESSAGE}
      </p>
      <p className="text-sm text-foreground-soft">
        {JOB_FINDER_STARTUP_DATABASE_RECOVERY_RESTORED_DETAIL}
      </p>
      <div className="flex items-center justify-end">
        <Button
          aria-label="Dismiss workspace recovery message"
          className="text-xs font-medium normal-case tracking-normal"
          onClick={dismissNotice}
          size="sm"
          type="button"
          variant="ghost"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
