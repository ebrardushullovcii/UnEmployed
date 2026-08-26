import { Chip } from "@renderer/components/ui/chip";

interface PreferenceListProps {
  compact?: boolean;
  label: string;
  values: readonly string[];
}

export function PreferenceList({
  compact = false,
  label,
  values,
}: PreferenceListProps) {
  return (
    <div className="grid gap-3">
      <p className="text-(length:--text-field-label) font-medium tracking-(--tracking-label) text-muted-foreground">
        {label}
      </p>
      {values.length > 0 ? (
        <div
          className={
            compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"
          }
        >
          {values.map((value) => (
            <Chip key={value}>{value}</Chip>
          ))}
        </div>
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-(--tracking-normal) text-muted-foreground">
          No values configured.
        </p>
      )}
    </div>
  );
}
