import type { ResumeTemplateDefinition, ResumeTemplateId } from "@unemployed/contracts";
import {
  getResumeTemplateAtsConfidence,
  getResumeTemplateDeliveryLane,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import {
  getAtsConfidenceLabel,
  getLaneBadgeVariant,
  getLaneLabel,
  getTemplateOptionLabel,
} from "./resume-theme-picker-helpers";

export function ResumeThemePickerCompact(props: {
  disabled: boolean;
  id?: string | undefined;
  onChange: (themeId: ResumeTemplateId) => void;
  recommendationReasons: ReadonlyMap<ResumeTemplateId, string>;
  selectedThemeId: ResumeTemplateId;
  themes: readonly ResumeTemplateDefinition[];
}) {
  const { disabled, id, onChange, recommendationReasons, selectedThemeId, themes } = props;

  return (
    <div className="grid gap-3" aria-labelledby={id}>
      <section className="surface-panel-shell relative overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
        <div className="grid content-start gap-3 p-3">
          <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label-mono-xs">Choose a template</p>
              <Badge variant="section">{themes.length} options</Badge>
            </div>

            <div className="grid gap-1.5">
              {themes.map((theme) => (
                <CompactVariantCard
                  disabled={disabled}
                  key={theme.id}
                  onChange={onChange}
                  recommendationReason={recommendationReasons.get(theme.id)}
                  selected={theme.id === selectedThemeId}
                  theme={theme}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function CompactVariantCard(props: {
  disabled: boolean;
  onChange: (themeId: ResumeTemplateId) => void;
  recommendationReason: string | undefined;
  selected: boolean;
  theme: ResumeTemplateDefinition;
}) {
  const { disabled, onChange, recommendationReason, selected, theme } = props;
  const deliveryLane = getResumeTemplateDeliveryLane(theme);
  const atsConfidence = getResumeTemplateAtsConfidence(theme);
  const compactReason = recommendationReason ?? theme.fitSummary ?? theme.description;

  return (
    <div
      data-resume-template-option={theme.id}
      className={cn(
        "grid gap-2 rounded-(--radius-field) border px-3 py-2.5 transition-[border-color,background-color,box-shadow]",
        selected
          ? "border-primary/38 bg-primary/8 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]"
          : "border-(--surface-panel-border) bg-background/45",
      )}
    >
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {getTemplateOptionLabel(theme)}
            </span>
            {selected ? <Badge variant="default">Selected</Badge> : null}
            <Badge variant={getLaneBadgeVariant(deliveryLane)}>
              {getLaneLabel(deliveryLane)}
            </Badge>
            <Badge variant="outline">{getAtsConfidenceLabel(atsConfidence)}</Badge>
          </div>
          <p className="text-(length:--text-small) leading-5 text-foreground-soft">
            {compactReason}
          </p>
        </div>
        <Button
          className="xl:min-w-44"
          data-resume-template-select={theme.id}
          disabled={disabled}
          onClick={() => onChange(theme.id)}
          size="compact"
          type="button"
          variant={selected ? "primary" : "secondary"}
        >
          {selected ? "Selected template" : "Use this template"}
        </Button>
      </div>
    </div>
  );
}
