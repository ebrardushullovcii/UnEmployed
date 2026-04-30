import type { ResumeTemplateDefinition, ResumeTemplateId } from "@unemployed/contracts";
import {
  getResumeTemplateAtsConfidence,
  getResumeTemplateDeliveryLane,
  getResumeTemplateVariantLabel,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import {
  getAtsConfidenceLabel,
  getLaneBadgeVariant,
  getLaneLabel,
  type ResumeTemplateFamilyViewModel,
} from "./resume-theme-picker-helpers";

export function ResumeThemePickerCompact(props: {
  disabled: boolean;
  families: readonly ResumeTemplateFamilyViewModel[];
  focusedFamily: ResumeTemplateFamilyViewModel;
  id?: string | undefined;
  leadingRecommendedFamily: ResumeTemplateFamilyViewModel | null;
  onChange: (themeId: ResumeTemplateId) => void;
  recommendationReasons: ReadonlyMap<ResumeTemplateId, string>;
  selectedFamily: ResumeTemplateFamilyViewModel | null;
  selectedThemeId: ResumeTemplateId;
  setFocusedFamilyId: (familyId: string) => void;
}) {
  const {
    disabled,
    families,
    focusedFamily,
    id,
    leadingRecommendedFamily,
    onChange,
    recommendationReasons,
    selectedFamily,
    selectedThemeId,
    setFocusedFamilyId,
  } = props;

  return (
    <div className="grid gap-3" aria-labelledby={id}>
      <section className="surface-panel-shell relative overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
        <div className="grid content-start gap-3 p-3">
          <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label-mono-xs">Choose a family</p>
              {focusedFamily.deliveryLane ? (
                <Badge variant={getLaneBadgeVariant(focusedFamily.deliveryLane)}>
                  {getLaneLabel(focusedFamily.deliveryLane)}
                </Badge>
              ) : null}
            </div>

            {selectedFamily || leadingRecommendedFamily ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] leading-4 text-foreground-soft">
                {selectedFamily ? <span>Current: {selectedFamily.label}</span> : null}
                {leadingRecommendedFamily ? <Badge variant="section">Recommended</Badge> : null}
                {leadingRecommendedFamily ? (
                  <span>{leadingRecommendedFamily.label}</span>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
              {families.map((family) => {
                const isActive = family.id === focusedFamily.id;

                return (
                  <button
                    aria-pressed={isActive}
                    key={family.id}
                    className={cn(
                      "flex min-h-10 items-center rounded-(--radius-field) border px-3 py-2 text-left transition-[border-color,background-color,box-shadow]",
                      isActive
                        ? "border-primary/35 bg-primary/7 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]"
                        : "border-(--surface-panel-border) bg-background/45 hover:border-border/80 hover:bg-background/65",
                    )}
                    disabled={disabled}
                    onClick={() => setFocusedFamilyId(family.id)}
                    type="button"
                  >
                    <span className="text-[0.82rem] font-semibold leading-4 text-foreground">
                      {family.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-2.5">
            <div className="grid gap-1">
              <p className="label-mono-xs">{focusedFamily.label} variants</p>
            </div>

            <div className="grid gap-1.5">
              {focusedFamily.templates.map((theme) => (
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
              {getResumeTemplateVariantLabel(theme)}
            </span>
            {selected ? <Badge variant="default">Selected</Badge> : null}
            <Badge variant={getLaneBadgeVariant(deliveryLane)}>
              {getLaneLabel(deliveryLane)}
            </Badge>
            <Badge variant="outline">{getAtsConfidenceLabel(atsConfidence)}</Badge>
          </div>
          <p className="text-[0.74rem] leading-4.5 text-foreground-soft">
            {compactReason}
          </p>
        </div>
        <Button
          className="xl:min-w-44"
          disabled={disabled}
          onClick={() => onChange(theme.id)}
          size="compact"
          type="button"
          variant={selected ? "primary" : "secondary"}
        >
          {selected ? "Selected variant" : "Use this variant"}
        </Button>
      </div>
    </div>
  );
}
