import type { CampaignNotification } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";

const kindLabels: Record<CampaignNotification["kind"], string> = {
  digest_ready: "Digest ready",
  strong_match: "Strong match",
  blocked_work: "Blocked work",
  schedule_paused: "Schedule paused",
  rule_effect_update: "Rule update",
};

function compareNewestFirst(
  left: CampaignNotification,
  right: CampaignNotification,
): number {
  const leftMs = Date.parse(left.createdAt);
  const rightMs = Date.parse(right.createdAt);
  if (leftMs !== rightMs) {
    if (Number.isNaN(leftMs)) return 1;
    if (Number.isNaN(rightMs)) return -1;
    return rightMs - leftMs;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function formatCreatedAt(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return createdAt;
  return new Date(parsed).toLocaleString();
}

export function CampaignNotificationCenter(props: {
  errorMessage?: string | null;
  loading?: boolean;
  notifications: readonly CampaignNotification[];
  pendingMarkAll: boolean;
  pendingNotificationId: (notificationId: string) => boolean;
  onMarkAllRead: () => void;
  onMarkRead: (notificationId: string) => void;
}) {
  const notifications = [...props.notifications].sort(compareNewestFirst);
  const unreadCount = props.notifications.filter(
    (notification) => notification.unread,
  ).length;
  const hasUnread = unreadCount > 0;
  const hasNotifications = props.notifications.length > 0;

  return (
    <section
      aria-label="Campaign notifications"
      className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
            In-app notifications
          </p>
          <h2 className="mt-1 font-semibold text-(--text-headline)">
            Campaign notifications
          </h2>
          <p className="mt-1 text-xs text-foreground-muted">
            {hasNotifications
              ? `${props.notifications.length} total · ${unreadCount} unread`
              : "Strong matches and blocked work appear here. No external email or push is used."}
          </p>
        </div>
        {hasUnread ? (
          <Button
            disabled={props.pendingMarkAll}
            onClick={props.onMarkAllRead}
            pending={props.pendingMarkAll}
            size="sm"
            type="button"
            variant="outline"
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      {props.loading ? (
        <p
          aria-live="polite"
          className="rounded-(--radius-field) border border-border-subtle p-4 text-sm text-foreground-soft"
        >
          Loading campaign notifications…
        </p>
      ) : props.errorMessage ? (
        <p
          aria-live="assertive"
          className="rounded-(--radius-field) border border-critical/35 p-4 text-sm text-foreground-soft"
          role="alert"
        >
          {props.errorMessage}
        </p>
      ) : !hasNotifications ? (
        <p className="rounded-(--radius-field) border border-border-subtle p-4 text-sm text-foreground-soft">
          No campaign notifications yet. After a run finishes, strong new
          matches and blocked work are listed here.
        </p>
      ) : (
        <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1">
          {notifications.map((notification) => {
            const pending = props.pendingNotificationId(notification.id);
            return (
              <li
                className={`grid gap-1.5 rounded-(--radius-field) border p-3 ${notification.unread ? "border-accent/40 bg-accent/5" : "border-border-subtle"}`}
                key={notification.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-(--text-headline)">
                      {notification.title}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {kindLabels[notification.kind]} ·{" "}
                      {formatCreatedAt(notification.createdAt)}
                      {notification.unread ? (
                        <span className="ml-2 rounded-full border border-accent/45 px-1.5 py-0.5 text-accent">
                          Unread
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {notification.unread ? (
                    <Button
                      disabled={pending}
                      onClick={() => props.onMarkRead(notification.id)}
                      pending={pending}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      Mark read
                    </Button>
                  ) : (
                    <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-foreground-muted">
                      Read
                    </span>
                  )}
                </div>
                {notification.body ? (
                  <p className="text-sm text-foreground-soft">
                    {notification.body}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
