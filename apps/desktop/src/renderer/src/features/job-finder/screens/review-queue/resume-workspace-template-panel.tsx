import { useEffect, useState } from "react";
import type {
  ResumeTemplateDefinition,
  ResumeTemplateId,
} from "@unemployed/contracts";
import {
  getResumeTemplateAtsConfidence,
  getResumeTemplateDeliveryLane,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { ResumeThemePicker } from "../../components/resume-theme-picker";
import type { ResumeThemePickerRecommendationContext } from "../../components/resume-theme-picker";
import {
  getAtsConfidenceLabel,
  getLaneBadgeVariant,
  getLaneLabel,
  getTemplateOptionLabel,
} from "../../components/resume-theme-picker-helpers";

interface ResumeWorkspaceTemplatePanelProps {
  disabled: boolean;
  recommendationContext: ResumeThemePickerRecommendationContext | null;
  selectedTemplateApprovalEligible: boolean;
  selectedThemeId: ResumeTemplateId;
  themes: readonly ResumeTemplateDefinition[];
  onChange: (templateId: ResumeTemplateId) => void;
}

export function ResumeWorkspaceTemplatePanel(
  props: ResumeWorkspaceTemplatePanelProps,
) {
  const [chooserOpen, setChooserOpen] = useState(
    !props.selectedTemplateApprovalEligible,
  );

  useEffect(() => {
    if (!props.selectedTemplateApprovalEligible) {
      setChooserOpen(true);
    }
  }, [props.selectedTemplateApprovalEligible]);

  const selectedTheme =
    props.themes.find((theme) => theme.id === props.selectedThemeId) ?? null;
  const chooserId = "resume-template-chooser-options";

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <div className="border-b border-(--surface-panel-border) px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
            Template
          </p>
          <Badge
            variant={
              props.selectedTemplateApprovalEligible ? "default" : "outline"
            }
          >
            {props.selectedTemplateApprovalEligible
              ? "Approval eligible"
              : "Approval blocked"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-2 p-2">
        {selectedTheme && !chooserOpen ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-2">
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">
                  {getTemplateOptionLabel(selectedTheme)}
                </span>
                <Badge
                  variant={getLaneBadgeVariant(
                    getResumeTemplateDeliveryLane(selectedTheme),
                  )}
                >
                  {getLaneLabel(getResumeTemplateDeliveryLane(selectedTheme))}
                </Badge>
                <Badge variant="outline">
                  {getAtsConfidenceLabel(
                    getResumeTemplateAtsConfidence(selectedTheme),
                  )}
                </Badge>
              </div>
              <p className="text-(length:--text-small) leading-4 text-foreground-soft">
                {selectedTheme.fitSummary ?? selectedTheme.description}
              </p>
            </div>
            <Button
              aria-controls={chooserId}
              aria-expanded={false}
              data-resume-template-toggle
              disabled={props.disabled}
              onClick={() => setChooserOpen(true)}
              size="compact"
              type="button"
              variant="secondary"
            >
              Change template
            </Button>
          </div>
        ) : null}

        <div
          className={chooserOpen || !selectedTheme ? "min-w-0" : "hidden"}
          id={chooserId}
        >
          <div className="mb-2 flex justify-end xl:hidden">
            <span className="text-(length:--text-small) leading-4 text-foreground-soft">
              Template changes reset review state for the next export and
              approval.
            </span>
          </div>
          <ResumeThemePicker
            disabled={props.disabled}
            mode="compact"
            onChange={(templateId) => {
              props.onChange(templateId);
              setChooserOpen(false);
            }}
            recommendationContext={props.recommendationContext}
            selectedThemeId={props.selectedThemeId}
            themes={props.themes}
          />
          {selectedTheme ? (
            <div className="mt-2 flex justify-end">
              <Button
                aria-controls={chooserId}
                aria-expanded={true}
                data-resume-template-toggle
                disabled={props.disabled}
                onClick={() => setChooserOpen(false)}
                size="compact"
                type="button"
                variant="ghost"
              >
                Hide choices
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
