import type { ResumeDraftSourceRef } from "@unemployed/contracts";

function formatSourceKindLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function SourceRefsList(props: {
  sourceRefs: readonly ResumeDraftSourceRef[];
  emptyLabel?: string;
}) {
  if (props.sourceRefs.length === 0) {
    return (
      <p className="text-sm text-foreground-soft">
        {props.emptyLabel ?? "No source evidence attached yet."}
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
          {ref.sourceId ? (
            <p className="mb-1 font-mono text-[10px] uppercase tracking-(--tracking-normal) text-muted-foreground">
              {ref.sourceId}
            </p>
          ) : null}
          <p>{ref.snippet ?? "No snippet captured."}</p>
        </li>
      ))}
    </ul>
  );
}
