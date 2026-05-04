import { useMemo } from "react";
import type {
  ResumeTemplateDefinition,
  ResumeTemplateId,
} from "@unemployed/contracts";
import { ResumeThemePickerCompact } from "./resume-theme-picker-compact";
import { ResumeThemePickerFull } from "./resume-theme-picker-full";
import {
  buildResumeThemePickerRecommendations,
  sortResumeThemeOptions,
  type ResumeThemePickerRecommendationContext,
} from "./resume-theme-picker-helpers";

export type { ResumeThemePickerRecommendationContext } from "./resume-theme-picker-helpers";
export { buildResumeThemePickerRecommendations } from "./resume-theme-picker-helpers";

interface ResumeThemePickerProps {
  disabled?: boolean;
  id?: string;
  mode?: "full" | "compact";
  recommendationContext?: ResumeThemePickerRecommendationContext | null;
  selectedThemeId: ResumeTemplateId;
  themes: readonly ResumeTemplateDefinition[];
  onChange: (themeId: ResumeTemplateId) => void;
}

export function ResumeThemePicker({
  disabled = false,
  id,
  mode = "full",
  recommendationContext = null,
  selectedThemeId,
  themes,
  onChange,
}: ResumeThemePickerProps) {
  const recommendations = useMemo(
    () =>
      buildResumeThemePickerRecommendations({ recommendationContext, themes }),
    [recommendationContext, themes],
  );
  const recommendationReasons = useMemo(
    () =>
      new Map(
        recommendations.map((recommendation) => [
          recommendation.templateId,
          recommendation.reason,
        ]),
      ),
    [recommendations],
  );
  const recommendedThemeIds = useMemo(
    () => new Set(recommendations.map((recommendation) => recommendation.templateId)),
    [recommendations],
  );
  const sortedThemes = useMemo(() => sortResumeThemeOptions(themes), [themes]);
  const selectedTemplate =
    sortedThemes.find((theme) => theme.id === selectedThemeId) ?? sortedThemes[0] ?? null;
  const heroTemplate = selectedTemplate;
  const heroReason = heroTemplate
    ? (recommendationReasons.get(heroTemplate.id) ?? null)
    : null;
  if (!heroTemplate) {
    return (
      <div className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/55 px-4 py-5 text-sm leading-6 text-foreground-soft">
        No templates are available right now.
      </div>
    );
  }

  return mode === "compact" ? (
    <ResumeThemePickerCompact
      disabled={disabled}
      id={id}
      onChange={onChange}
      recommendationReasons={recommendationReasons}
      selectedThemeId={selectedThemeId}
      themes={sortedThemes}
    />
  ) : (
    <ResumeThemePickerFull
      disabled={disabled}
      heroReason={heroReason}
      heroTemplate={heroTemplate}
      id={id}
      onChange={onChange}
      recommendedThemeIds={recommendedThemeIds}
      selectedThemeId={selectedThemeId}
      themes={sortedThemes}
    />
  );
}
