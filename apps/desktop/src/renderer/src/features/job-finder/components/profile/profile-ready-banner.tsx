import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@renderer/components/ui/button";
import { JOB_FINDER_ROUTE_PATHS } from "../../lib/job-finder-route-hrefs";

const PROFILE_READY_BANNER_DISMISSED_KEY =
  "unemployed.profile-ready-banner-dismissed-v1";

function getReadyBannerDismissedKey(completionIdentity: string): string {
  return `${PROFILE_READY_BANNER_DISMISSED_KEY}:${encodeURIComponent(completionIdentity)}`;
}

function readReadyBannerDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function ProfileReadyBanner(props: { completionIdentity: string }) {
  const dismissedKey = getReadyBannerDismissedKey(props.completionIdentity);
  const [dismissedIdentity, setDismissedIdentity] = useState<string | null>(
    () =>
      readReadyBannerDismissed(dismissedKey) ? props.completionIdentity : null,
  );

  if (dismissedIdentity === props.completionIdentity) return null;

  function dismissBanner() {
    setDismissedIdentity(props.completionIdentity);
    try {
      localStorage.setItem(dismissedKey, "1");
    } catch {
      // Keep the in-memory dismissal when persistent storage is unavailable.
    }
  }

  return (
    <div className="surface-card-tint flex flex-col gap-3 rounded-(--radius-panel) border border-border/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-1">
        <p className="text-(length:--text-tiny) uppercase tracking-[0.18em] text-muted-foreground">
          Profile ready
        </p>
        <p className="text-sm text-foreground-soft">
          Your saved profile is ready. Continue to Find jobs to run your
          configured sources.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          aria-label="Dismiss profile ready message"
          className="text-xs font-medium normal-case tracking-normal"
          onClick={dismissBanner}
          size="sm"
          type="button"
          variant="ghost"
        >
          Dismiss
        </Button>
        <Button asChild>
          <Link to={JOB_FINDER_ROUTE_PATHS.discovery}>
            Continue to Find jobs
          </Link>
        </Button>
      </div>
    </div>
  );
}
