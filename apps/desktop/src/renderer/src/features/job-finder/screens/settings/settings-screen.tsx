import type {
  AppearanceTheme,
  ApplicationCrmSettings,
  BrowserSessionState,
  JobFinderSettings,
  ResumeTemplateDefinition,
  UpdateApplicationDefaultsInput,
  UpdateWorkspaceBehaviorInput,
} from "@unemployed/contracts";
import { ApplicationCrmSettingsSchema } from "@unemployed/contracts";
import type { CSSProperties, MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@renderer/components/ui/button";
import { JOB_FINDER_ROUTE_PATHS } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";
import { PageHeader } from "../../components/page-header";
import { ApplicationsCrmSettingsEditor } from "../applications/applications-crm-settings";
import { SettingsAppDeviceSection } from "./settings-app-device-section";
import { SettingsApplicationDefaultsSection } from "./settings-application-defaults-section";
import { SettingsRuntimeSummary } from "./settings-runtime-summary";
import { SettingsSupportControls } from "./settings-support-controls";
import { SettingsWorkspaceBehaviorSection } from "./settings-workspace-behavior-section";
import { SettingsWorkspaceControls } from "./settings-workspace-controls";

const settingsSections = [
  {
    headingId: "settings-app-device-heading",
    href: "#settings-app-device",
    id: "settings-app-device",
    label: "App & device",
  },
  {
    headingId: "settings-application-defaults-heading",
    href: "#settings-application-defaults",
    id: "settings-application-defaults",
    label: "Application defaults",
  },
  {
    headingId: "settings-workspace-behavior-heading",
    href: "#settings-workspace-behavior",
    id: "settings-workspace-behavior",
    label: "Workspace behavior",
  },
  {
    headingId: "settings-tracker-heading",
    href: "#settings-tracker",
    id: "settings-tracker",
    label: "Tracker",
  },
  {
    headingId: "settings-diagnostics-heading",
    href: "#settings-diagnostics",
    id: "settings-diagnostics",
    label: "Diagnostics",
  },
  {
    headingId: "settings-danger-zone-heading",
    href: "#settings-danger-zone",
    id: "settings-danger-zone",
    label: "Danger zone",
  },
] as const;

// The sticky section subnav sits over the page scroller. Its wrapped height is
// layout-dependent (it wraps at native zoom levels and narrow windows), so its
// scroll clearance is derived from the rendered nav height plus a breathing
// gap, with a raised fallback that covers the widest realistic wrap before the
// first measurement lands (and where ResizeObserver is unavailable).
export const SETTINGS_SUBNAV_BOTTOM_GAP_PX = 12;
export const SETTINGS_SUBNAV_WRAPPED_ROW_HEIGHT_PX = 40;
export const SETTINGS_SUBNAV_WRAPPED_ROW_GAP_PX = 4;
export const SETTINGS_SUBNAV_VERTICAL_PADDING_PX = 8;
export const SETTINGS_SUBNAV_SCROLL_OFFSET_FALLBACK_PX =
  SETTINGS_SUBNAV_WRAPPED_ROW_HEIGHT_PX * 2 +
  SETTINGS_SUBNAV_WRAPPED_ROW_GAP_PX +
  SETTINGS_SUBNAV_VERTICAL_PADDING_PX +
  SETTINGS_SUBNAV_BOTTOM_GAP_PX;
export const SETTINGS_SUBNAV_OFFSET_VARIABLE = "--settings-subnav-offset";

export function SettingsScreen(props: {
  availableResumeTemplates: readonly ResumeTemplateDefinition[];
  browserSession: BrowserSessionState;
  isWorkspaceResetPending: boolean;
  onResetWorkspace: () => void;
  // Reports staged settings edits upward so a shell save retry captured
  // before the edit can never resubmit stale values.
  onSettingsDraftEdited: () => void;
  // Scoped saves resolve false when the save did not commit; sections treat
  // that as a failure instead of showing a local saved message.
  onUpdateAppearanceTheme: (
    theme: AppearanceTheme,
  ) => Promise<boolean | void> | void;
  onUpdateApplicationDefaults: (
    input: UpdateApplicationDefaultsInput,
  ) => Promise<boolean | void> | void;
  onUpdateTrackerCrm: (
    settings: ApplicationCrmSettings,
  ) => Promise<boolean | void> | void;
  onUpdateWorkspaceBehavior: (
    input: UpdateWorkspaceBehaviorInput,
  ) => Promise<boolean | void> | void;
  settings: JobFinderSettings;
}) {
  const {
    availableResumeTemplates,
    browserSession,
    isWorkspaceResetPending,
    onResetWorkspace,
    onSettingsDraftEdited,
    onUpdateAppearanceTheme,
    onUpdateApplicationDefaults,
    onUpdateTrackerCrm,
    onUpdateWorkspaceBehavior,
    settings,
  } = props;

  const subnavRef = useRef<HTMLElement | null>(null);
  const [sectionScrollOffsetPx, setSectionScrollOffsetPx] = useState(
    SETTINGS_SUBNAV_SCROLL_OFFSET_FALLBACK_PX,
  );

  useLayoutEffect(() => {
    const subnav = subnavRef.current;
    if (!subnav) {
      return;
    }

    const measureSubnavOffset = () => {
      const height = subnav.getBoundingClientRect().height;
      // Unmeasured layouts (jsdom, pre-first-paint) report 0px; keep the
      // raised wrap-aware floor so a wrapped subnav can never cover the
      // headings it scrolls to.
      if (height <= 0) {
        return;
      }
      setSectionScrollOffsetPx(
        Math.ceil(height) + SETTINGS_SUBNAV_BOTTOM_GAP_PX,
      );
    };

    measureSubnavOffset();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measureSubnavOffset);
    observer.observe(subnav);
    return () => observer.disconnect();
  }, []);

  const handleSectionAnchorClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const isUnmodifiedPrimaryActivation =
      event.button === 0 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey;

    if (!isUnmodifiedPrimaryActivation) {
      return;
    }

    event.preventDefault();

    const sectionId = event.currentTarget.getAttribute("href")?.slice(1);
    if (!sectionId) {
      return;
    }

    const target = document.getElementById(sectionId);
    if (!target) {
      return;
    }

    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  };

  return (
    <section
      className="grid min-w-0 gap-3 pb-8"
      style={
        {
          [SETTINGS_SUBNAV_OFFSET_VARIABLE]: `${sectionScrollOffsetPx}px`,
        } as CSSProperties
      }
    >
      <PageHeader
        description="Set reusable defaults for search, resumes, and applications."
        title="Settings"
      />

      <div className="surface-card-tint flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3">
        <p className="min-w-0 flex-1 text-sm leading-5 text-foreground-soft">
          Imported resumes, portfolios, and supporting documents live in
          Documents, outside of Settings.
        </p>
        <Button asChild size="compact" type="button" variant="secondary">
          <Link to={JOB_FINDER_ROUTE_PATHS.documents}>Open Documents</Link>
        </Button>
      </div>

      <nav
        aria-label="Settings sections"
        className="sticky top-0 z-30 -mx-1 flex flex-wrap items-center gap-1 bg-(--background)/95 px-1 py-1 backdrop-blur-sm"
        ref={subnavRef}
      >
        {settingsSections.map((section) => (
          <a
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-(--radius-button) px-3 text-xs font-medium whitespace-nowrap text-foreground-soft transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
            href={section.href}
            key={section.id}
            onClick={handleSectionAnchorClick}
          >
            {section.label}
          </a>
        ))}
      </nav>

      <section
        aria-labelledby="settings-app-device-heading"
        className="scroll-mt-(--settings-subnav-offset) min-w-0"
        id="settings-app-device"
        tabIndex={-1}
      >
        <h2 className="sr-only" id="settings-app-device-heading">
          App & device
        </h2>
        <SettingsAppDeviceSection
          onSettingsDraftEdited={onSettingsDraftEdited}
          onUpdateAppearanceTheme={onUpdateAppearanceTheme}
          settings={settings}
        />
      </section>

      <section
        aria-labelledby="settings-application-defaults-heading"
        className="scroll-mt-(--settings-subnav-offset) min-w-0"
        id="settings-application-defaults"
        tabIndex={-1}
      >
        <h2 className="sr-only" id="settings-application-defaults-heading">
          Application defaults
        </h2>
        <SettingsApplicationDefaultsSection
          availableResumeTemplates={availableResumeTemplates}
          onSettingsDraftEdited={onSettingsDraftEdited}
          onUpdateApplicationDefaults={onUpdateApplicationDefaults}
          settings={settings}
        />
      </section>

      <section
        aria-labelledby="settings-workspace-behavior-heading"
        className="scroll-mt-(--settings-subnav-offset) min-w-0"
        id="settings-workspace-behavior"
        tabIndex={-1}
      >
        <h2 className="sr-only" id="settings-workspace-behavior-heading">
          Workspace behavior
        </h2>
        <SettingsWorkspaceBehaviorSection
          onSettingsDraftEdited={onSettingsDraftEdited}
          onUpdateWorkspaceBehavior={onUpdateWorkspaceBehavior}
          settings={settings}
        />
      </section>

      <section
        aria-labelledby="settings-tracker-heading"
        className="scroll-mt-(--settings-subnav-offset) min-w-0"
        id="settings-tracker"
        tabIndex={-1}
      >
        <h2 className="sr-only" id="settings-tracker-heading">
          Tracker
        </h2>
        <ApplicationsCrmSettingsEditor
          onDraftEdited={onSettingsDraftEdited}
          onSave={async (crmSettings) => {
            const saved = await onUpdateTrackerCrm(crmSettings);
            // Scoped saves resolve false instead of rejecting when the save
            // did not commit. Throwing here enters the editor's existing
            // failure path so its staged values are kept for a retry.
            if (saved === false) {
              throw new Error(
                "The application tracker settings could not be saved.",
              );
            }
          }}
          settings={
            settings.applicationCrm ?? ApplicationCrmSettingsSchema.parse({})
          }
        />
      </section>

      <section
        aria-labelledby="settings-diagnostics-heading"
        className="scroll-mt-(--settings-subnav-offset) min-w-0"
        id="settings-diagnostics"
        tabIndex={-1}
      >
        <h2 className="sr-only" id="settings-diagnostics-heading">
          Diagnostics
        </h2>
        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.32fr)_minmax(0,0.92fr)] xl:items-start">
          <SettingsRuntimeSummary
            browserSession={browserSession}
            settings={settings}
          />
          <div className="grid min-w-0 gap-3">
            <SettingsSupportControls />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="settings-danger-zone-heading"
        className="scroll-mt-(--settings-subnav-offset) min-w-0"
        id="settings-danger-zone"
        tabIndex={-1}
      >
        <h2 className="sr-only" id="settings-danger-zone-heading">
          Danger zone
        </h2>
        <SettingsWorkspaceControls
          isWorkspaceResetPending={isWorkspaceResetPending}
          onResetWorkspace={onResetWorkspace}
        />
      </section>
    </section>
  );
}
