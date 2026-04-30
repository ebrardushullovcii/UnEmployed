import type { ResumeTemplateDefinition, ResumeTemplateId } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { ResumeThemePicker } from '../../components/resume-theme-picker'
import type { ResumeThemePickerRecommendationContext } from '../../components/resume-theme-picker'

interface ResumeWorkspaceTemplatePanelProps {
  disabled: boolean
  recommendationContext: ResumeThemePickerRecommendationContext | null
  selectedTemplateApprovalEligible: boolean
  selectedThemeId: ResumeTemplateId
  themes: readonly ResumeTemplateDefinition[]
  onChange: (templateId: ResumeTemplateId) => void
}

export function ResumeWorkspaceTemplatePanel(
  props: ResumeWorkspaceTemplatePanelProps,
) {
  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <div className="border-b border-(--surface-panel-border) px-3 py-2">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
              Template strategy
            </p>
            <Badge variant={props.selectedTemplateApprovalEligible ? 'default' : 'outline'}>
              {props.selectedTemplateApprovalEligible ? 'Approval eligible' : 'Approval blocked'}
            </Badge>
          </div>
          <h2 className="font-display text-(length:--text-description) font-semibold text-(--text-headline)">
            Choose this draft's layout.
          </h2>
          <p className="text-(length:--text-small) leading-4 text-foreground-soft xl:hidden">
            Template changes reset review state for the next export and approval.
          </p>
        </div>
      </div>

      <div className="p-2 pr-1.5">
        <ResumeThemePicker
          disabled={props.disabled}
          mode="compact"
          onChange={props.onChange}
          recommendationContext={props.recommendationContext}
          selectedThemeId={props.selectedThemeId}
          themes={props.themes}
        />
      </div>
    </section>
  )
}
