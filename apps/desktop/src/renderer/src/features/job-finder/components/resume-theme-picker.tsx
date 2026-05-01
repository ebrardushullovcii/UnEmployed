import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ResumeTemplateDefinition,
  ResumeTemplateId,
} from "@unemployed/contracts";
import {
  getResumeTemplateAtsConfidence,
  getResumeTemplateDeliveryLane,
  getResumeTemplateFamilyId,
  getResumeTemplateVisualTags,
} from "@unemployed/contracts";
import { ResumeThemePickerCompact } from "./resume-theme-picker-compact";
import { ResumeThemePickerFull } from "./resume-theme-picker-full";
import {
  buildFamilyViewModels,
  buildResumeThemePickerRecommendations,
  type ResumeTemplateFamilyViewModel,
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
  const families = useMemo(() => buildFamilyViewModels(themes), [themes]);
  const selectedTemplate =
    themes.find((theme) => theme.id === selectedThemeId) ?? themes[0] ?? null;
  const selectedFamilyId = selectedTemplate
    ? getResumeTemplateFamilyId(selectedTemplate)
    : (families[0]?.id ?? null);
  const selectedFamily =
    families.find((family) => family.id === selectedFamilyId) ?? null;
  const [focusedFamilyId, setFocusedFamilyId] = useState<string | null>(
    selectedFamilyId ?? families[0]?.id ?? null,
  );
  const familySectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (selectedFamilyId) {
      setFocusedFamilyId(selectedFamilyId);
    }
  }, [selectedFamilyId]);

  useEffect(() => {
    if (!selectedFamilyId) {
      return;
    }

    const selectedFamilySection = familySectionRefs.current[selectedFamilyId];
    selectedFamilySection?.scrollIntoView?.({ block: "nearest" });
  }, [selectedFamilyId, selectedThemeId]);

  const focusedFamily =
    families.find((family) => family.id === focusedFamilyId) ?? families[0] ?? null;
  const focusedFamilyRecommended =
    focusedFamily?.templates.find((template) => recommendedThemeIds.has(template.id)) ??
    null;
  const leadingRecommendedFamily = recommendations[0]
    ? (families.find((family) =>
        family.templates.some(
          (template) => template.id === recommendations[0]?.templateId,
        ),
      ) ?? null)
    : null;
  const heroTemplate = selectedTemplate ?? focusedFamily?.templates[0] ?? null;
  const heroReason = heroTemplate
    ? (recommendationReasons.get(heroTemplate.id) ?? null)
    : null;
  const heroVisualTags = heroTemplate
    ? getResumeTemplateVisualTags(heroTemplate).slice(0, 2)
    : [];

  if (!heroTemplate || !focusedFamily) {
    return (
      <div className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/55 px-4 py-5 text-sm leading-6 text-foreground-soft">
        No templates are available right now.
      </div>
    );
  }

  const sharedProps = {
    disabled,
    families,
    focusedFamily,
    leadingRecommendedFamily,
    onChange,
    recommendationReasons,
    selectedFamily,
    selectedThemeId,
    setFocusedFamilyId,
  } satisfies {
    disabled: boolean;
    families: readonly ResumeTemplateFamilyViewModel[];
    focusedFamily: ResumeTemplateFamilyViewModel;
    leadingRecommendedFamily: ResumeTemplateFamilyViewModel | null;
    onChange: (themeId: ResumeTemplateId) => void;
    recommendationReasons: ReadonlyMap<ResumeTemplateId, string>;
    selectedFamily: ResumeTemplateFamilyViewModel | null;
    selectedThemeId: ResumeTemplateId;
    setFocusedFamilyId: (familyId: string) => void;
  };

  return mode === "compact" ? (
    <ResumeThemePickerCompact {...sharedProps} id={id} />
  ) : (
    <ResumeThemePickerFull
      disabled={disabled}
      families={families}
      familySectionRefs={familySectionRefs}
      heroAtsConfidence={getResumeTemplateAtsConfidence(heroTemplate)}
      heroDeliveryLane={getResumeTemplateDeliveryLane(heroTemplate)}
      focusedFamily={focusedFamily}
      focusedFamilyId={focusedFamilyId}
      focusedFamilyRecommendedId={focusedFamilyRecommended?.id ?? null}
      heroReason={heroReason}
      heroTemplateDescription={heroTemplate.description}
      heroTemplateId={heroTemplate.id}
      heroTemplateLabel={heroTemplate.label}
      heroVisualTags={heroVisualTags}
      id={id}
      onChange={onChange}
      recommendedThemeIds={recommendedThemeIds}
      selectedFamily={selectedFamily}
      selectedThemeId={selectedThemeId}
      setFocusedFamilyId={setFocusedFamilyId}
    />
  );
}
