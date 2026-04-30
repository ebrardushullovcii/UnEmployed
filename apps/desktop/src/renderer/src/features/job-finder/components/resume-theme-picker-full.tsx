import { useEffect, useRef, type MutableRefObject } from "react";
import type { ResumeTemplateId } from "@unemployed/contracts";
import {
  getResumeTemplateVariantLabel,
  getResumeTemplateVisualTags,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { renderResumeTemplateCatalogPreviewHtml } from "../../../../../shared/job-finder-resume-renderer";
import {
  getAtsConfidenceLabel,
  getLaneLabel,
  type ResumeTemplateFamilyViewModel,
} from "./resume-theme-picker-helpers";

export function ResumeThemePickerFull(props: {
  disabled: boolean;
  families: readonly ResumeTemplateFamilyViewModel[];
  heroAtsConfidence: "high" | "medium" | "low";
  focusedFamily: ResumeTemplateFamilyViewModel;
  focusedFamilyRecommendedId: ResumeTemplateId | null;
  focusedFamilyId: string | null;
  heroDeliveryLane: "apply_safe" | "share_ready";
  heroReason: string | null;
  heroTemplateId: ResumeTemplateId;
  heroTemplateLabel: string;
  heroTemplateDescription: string;
  heroVisualTags: readonly string[];
  id?: string | undefined;
  onChange: (themeId: ResumeTemplateId) => void;
  recommendedThemeIds: ReadonlySet<ResumeTemplateId>;
  selectedFamily: ResumeTemplateFamilyViewModel | null;
  selectedThemeId: ResumeTemplateId;
  setFocusedFamilyId: (familyId: string) => void;
  familySectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
}) {
  const {
    disabled,
    families,
    heroAtsConfidence,
    focusedFamily,
    focusedFamilyId,
    focusedFamilyRecommendedId,
    heroDeliveryLane,
    heroReason,
    heroTemplateDescription,
    heroTemplateId,
    heroTemplateLabel,
    heroVisualTags,
    id,
    onChange,
    recommendedThemeIds,
    selectedFamily,
    selectedThemeId,
    setFocusedFamilyId,
    familySectionRefs,
  } = props;
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = previewFrameRef.current;

    if (!iframe) {
      return;
    }

    const measureHeight = () => {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) {
        return;
      }

      const page = frameDocument.querySelector<HTMLElement>(".page");
      const body = frameDocument.body;
      const nextHeight = Math.ceil(
        (page?.getBoundingClientRect().height ?? body?.scrollHeight ?? 0) + 8,
      );

      if (nextHeight > 0) {
        iframe.style.height = `${nextHeight}px`;
      }
    };

    const handleLoad = () => {
      measureHeight();
    };

    handleLoad();
    iframe.addEventListener("load", handleLoad);
    window.addEventListener("resize", handleLoad);

    return () => {
      iframe.removeEventListener("load", handleLoad);
      window.removeEventListener("resize", handleLoad);
    };
  }, [heroTemplateId]);

  return (
    <div className="grid gap-4" aria-labelledby={id}>
      <section className="surface-panel-shell relative overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
        <div className="grid gap-3 p-3.5 xl:gap-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="grid gap-1.5">
              <p className="label-mono-xs">Current selection</p>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-[clamp(1.18rem,1.45vw,1.5rem)] font-semibold tracking-[-0.04em] text-(--text-headline)">
                  {heroTemplateLabel}
                </h3>
                {heroVisualTags.map((tag) => (
                  <Badge key={tag} variant="section">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="max-w-[64ch] text-[0.82rem] leading-4.5 text-foreground-soft">
                {heroTemplateDescription}
              </p>
              {heroReason ? (
                <p className="text-[0.72rem] leading-4.5 text-primary/85">
                  {heroReason}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="default">Sample renderer preview</Badge>
              <Badge variant="section">{getLaneLabel(heroDeliveryLane)}</Badge>
              <Badge variant="section">{getAtsConfidenceLabel(heroAtsConfidence)}</Badge>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.72fr)_minmax(18rem,19.5rem)] xl:items-start">
            <div className="overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--resume-preview-frame) p-1.5 shadow-[var(--resume-preview-shell-shadow)] xl:p-2">
              <iframe
                aria-hidden="true"
                className="block w-full rounded-2xl border-0 bg-transparent"
                ref={previewFrameRef}
                sandbox="allow-same-origin"
                srcDoc={renderResumeTemplateCatalogPreviewHtml(heroTemplateId, {
                  layout: "panel",
                })}
                style={{ height: "34rem" }}
                title={`${heroTemplateLabel} preview`}
              />
            </div>

            <div className="sr-only">
              This preview uses sample resume content rendered through the shared
              production template engine.
            </div>

            <div className="min-w-0 grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="label-mono-xs">Choose a family</p>
                <Badge variant="section">{families.length} families</Badge>
              </div>

              <div className="grid gap-1.5">
                {families.map((family) => (
                  <FamilySelectorCard
                    disabled={disabled}
                    family={family}
                    familySectionRefs={familySectionRefs}
                    focusedFamilyId={focusedFamilyId}
                    focusedFamilyRecommendedId={focusedFamilyRecommendedId}
                    key={family.id}
                    onChange={onChange}
                    recommendedThemeIds={recommendedThemeIds}
                    selectedFamily={selectedFamily}
                    selectedThemeId={selectedThemeId}
                    setFocusedFamilyId={setFocusedFamilyId}
                  />
                ))}
              </div>

              <div className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/35 px-2.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="label-mono-xs">Focused family</p>
                  <Badge variant="section">{focusedFamily.label}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.72rem] leading-4 text-foreground-soft">
                  {selectedFamily ? (
                    <span>Current default: {selectedFamily.label}</span>
                  ) : null}
                  <span>Variants open directly under the active family.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FamilySelectorCard(props: {
  disabled: boolean;
  family: ResumeTemplateFamilyViewModel;
  familySectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  focusedFamilyId: string | null;
  focusedFamilyRecommendedId: ResumeTemplateId | null;
  onChange: (themeId: ResumeTemplateId) => void;
  recommendedThemeIds: ReadonlySet<ResumeTemplateId>;
  selectedFamily: ResumeTemplateFamilyViewModel | null;
  selectedThemeId: ResumeTemplateId;
  setFocusedFamilyId: (familyId: string) => void;
}) {
  const {
    disabled,
    family,
    familySectionRefs,
    focusedFamilyId,
    focusedFamilyRecommendedId,
    onChange,
    recommendedThemeIds,
    selectedFamily,
    selectedThemeId,
    setFocusedFamilyId,
  } = props;
  const isActive = family.id === focusedFamilyId;
  const isSelectedFamily = family.id === selectedFamily?.id;
  const familyRecommendationCount = family.templates.filter((template) =>
    recommendedThemeIds.has(template.id),
  ).length;
  const triggerId = `resume-theme-family-trigger-${family.id}`;
  const panelId = `resume-theme-family-panel-${family.id}`;

  return (
    <div
      ref={(element) => {
        familySectionRefs.current[family.id] = element;
      }}
      className={cn(
        "min-w-0 grid gap-1 rounded-(--radius-field) border px-2.5 py-2 transition-[border-color,background-color,box-shadow]",
        isActive
          ? "border-primary/35 bg-primary/7 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]"
          : "border-(--surface-panel-border) bg-background/45",
      )}
    >
      <button
        aria-controls={panelId}
        aria-expanded={isActive}
        className="flex min-h-9 min-w-0 items-center justify-between gap-2 text-left"
        disabled={disabled}
        id={triggerId}
        onClick={() => setFocusedFamilyId(family.id)}
        type="button"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-[0.82rem] font-semibold leading-4 text-foreground">
            {family.label}
          </span>
          {isSelectedFamily ? <Badge variant="default">Selected</Badge> : null}
          {familyRecommendationCount > 0 ? (
            <Badge variant="section">Recommended</Badge>
          ) : null}
        </div>
        <span className="text-[0.68rem] leading-4 text-foreground-soft">
          {family.templates.length} variant{family.templates.length === 1 ? "" : "s"}
        </span>
      </button>

      {isActive ? (
        <div
          aria-labelledby={triggerId}
          className="grid gap-1 border-t border-border/10 pt-1.5"
          id={panelId}
          role="region"
        >
          {family.templates.map((theme) => (
            <FamilyVariantCard
              disabled={disabled}
              key={theme.id}
              onChange={onChange}
              recommended={theme.id === focusedFamilyRecommendedId}
              selected={theme.id === selectedThemeId}
              theme={theme}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FamilyVariantCard(props: {
  disabled: boolean;
  onChange: (themeId: ResumeTemplateId) => void;
  recommended: boolean;
  selected: boolean;
  theme: ResumeTemplateFamilyViewModel["templates"][number];
}) {
  const { disabled, onChange, recommended, selected, theme } = props;
  const visualTags = getResumeTemplateVisualTags(theme).slice(0, 2);

  return (
    <div
      className={cn(
        "min-w-0 grid gap-1 rounded-(--radius-field) border px-2.5 py-2 transition-[border-color,background-color,box-shadow]",
        selected
          ? "border-primary/38 bg-primary/8 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]"
          : "border-(--surface-panel-border) bg-background/55",
      )}
    >
      <div className="grid gap-2">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[0.8rem] font-semibold leading-4 text-foreground">
              {getResumeTemplateVariantLabel(theme)}
            </span>
            {selected ? <Badge variant="default">Selected</Badge> : null}
            {recommended ? <Badge variant="section">Best match</Badge> : null}
          </div>
          {visualTags.length > 0 ? (
            <p className="text-[0.68rem] leading-4 text-foreground-soft">
              {visualTags.join(" · ")}
            </p>
          ) : null}
        </div>

        <Button
          className="w-full"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }

            onChange(theme.id);
          }}
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
