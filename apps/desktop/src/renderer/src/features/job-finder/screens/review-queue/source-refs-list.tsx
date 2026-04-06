import type { ResumeDraftSourceRef } from "@unemployed/contracts";

function formatSourceKindLabel(value: string): string {
  switch (value) {
    case 'resume':
      return 'Imported resume'
    case 'profile':
      return 'Profile'
    case 'job':
      return 'Job details'
    case 'research':
      return 'Saved research'
    case 'user':
      return 'Your edit'
    default:
      return value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (match) => match.toUpperCase())
  }
}

export function SourceRefsList(props: {
  sourceRefs: readonly ResumeDraftSourceRef[];
  emptyLabel?: string;
}) {
  if (props.sourceRefs.length === 0) {
    return (
      <p className="text-sm text-foreground-soft">
        {props.emptyLabel ?? "No supporting evidence linked yet."}
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {props.sourceRefs.map((ref) => (
        <li
          key={ref.id}
          className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-3 text-sm text-foreground-soft"
        >
          <p className="mb-1 text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            {formatSourceKindLabel(ref.sourceKind)}
          </p>
          <p>{ref.snippet ?? "No excerpt saved."}</p>
        </li>
      ))}
    </ul>
  );
}
