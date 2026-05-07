import type { ToolDefinition } from "../types";
import { z } from "zod";

const VisualSnapshotSchema = z.object({
  purpose: z.enum([
    "normal_discovery",
    "source_debug",
    "apply_checkpoint",
    "apply_recovery",
    "debug_benchmark",
  ]).default("source_debug"),
  mode: z.enum(["viewport", "region", "full_page"]).default("viewport"),
  label: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(240),
  region: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.mode === "region" && !value.region) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Region visual snapshots must include a bounded region.",
      path: ["region"],
    });
  }

  if (value.mode !== "region" && value.region) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only region visual snapshots can include a region box.",
      path: ["region"],
    });
  }
});

function buildVisibleTextSample(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2400);
}

export const visualTools: ToolDefinition[] = [
  {
    name: "capture_visual_snapshot",
    description:
      "Capture a bounded screenshot for visual evidence when DOM, ARIA, or text extraction is weak. Returns schema-validated observations only; do not use it for browser actions, selectors, or generated answers.",
    retryable: false,
    parameters: {
      type: "object",
      properties: {
        purpose: {
          type: "string",
          enum: [
            "normal_discovery",
            "source_debug",
            "apply_checkpoint",
            "apply_recovery",
            "debug_benchmark",
          ],
          description:
            "Why the visual snapshot is being captured. Use source_debug for debug phases and normal_discovery only for weak normal discovery recovery.",
        },
        mode: {
          type: "string",
          enum: ["viewport", "region", "full_page"],
          description:
            "Capture viewport by default, region when a bounded area is known, and full_page only when viewport evidence is insufficient.",
        },
        label: {
          type: "string",
          description: "Short evidence label for the visual snapshot.",
        },
        reason: {
          type: "string",
          description:
            "Source-generic weak signal or phase question the visual snapshot should clarify.",
        },
        region: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
          },
          description: "Bounding box when mode is region.",
        },
      },
      required: ["label", "reason"],
    },
    async execute(args, context) {
      if (!context.config.visualAnalysis?.enabled) {
        return {
          success: false,
          error: "Visual snapshot capture is not enabled for this browser run.",
        };
      }

      const parsed = VisualSnapshotSchema.safeParse(args);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid visual snapshot arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
        };
      }

      const taskPacket = context.config.promptContext.taskPacket;
      const purpose = taskPacket ? "source_debug" : parsed.data.purpose;
      const mode = parsed.data.mode;
      const fullPageAllowed = taskPacket || purpose === "debug_benchmark";
      if (mode === "full_page" && !fullPageAllowed) {
        return {
          success: false,
          error:
            "Full-page visual snapshots are only allowed for source-debug or explicit debug/benchmark evidence.",
        };
      }

      const pageUrl = context.page.url() || context.state.currentUrl || null;
      const pageTitle = await context.page.title().catch(() => null);
      const visibleTextSample = await context.page
        .locator("body")
        .innerText({ timeout: 1500 })
        .then(buildVisibleTextSample)
        .catch(() => null);
      const retention =
        purpose === "source_debug" || purpose === "debug_benchmark"
          ? {
              retention: context.config.visualAnalysis.persistScreenshots
                ? "retained" as const
                : "temporary" as const,
              redactionLevel:
                mode === "full_page" ? "sensitive" as const : "standard" as const,
              reason:
                purpose === "source_debug"
                  ? "Source-debug visual evidence explains a weak signal or blocker."
                  : "Debug/benchmark visual evidence was explicitly requested.",
              expiresAt: null,
            }
          : {
              retention: "temporary" as const,
              redactionLevel:
                purpose === "apply_checkpoint" || purpose === "apply_recovery"
                  ? "sensitive" as const
                  : "standard" as const,
              reason:
                "Temporary visual analysis input; normal discovery/apply screenshots are not persisted by default.",
              expiresAt: null,
            };
      const snapshot = await context.config.visualAnalysis.captureSnapshot({
        purpose,
        mode,
        label: parsed.data.label,
        reason: parsed.data.reason,
        region: mode === "region" ? parsed.data.region ?? null : null,
        retention,
      }, context.page);
      const observationSet = await context.config.visualAnalysis.analyzeSnapshot({
        snapshot,
        context: {
          purpose,
          taskGoal: parsed.data.reason,
          pageUrl,
          pageTitle,
          visibleTextSample,
          domSignals: [
            ...context.state.phaseEvidence.visibleControls.slice(0, 6),
            ...context.state.phaseEvidence.routeSignals.slice(0, 6),
            ...context.state.phaseEvidence.warnings.slice(0, 4),
          ],
          sourceDebug: taskPacket
            ? {
                phase:
                  context.config.promptContext.siteLabel.includes("Access")
                    ? "access_auth_probe"
                    : context.config.promptContext.siteLabel.includes("Structure")
                      ? "site_structure_mapping"
                      : context.config.promptContext.siteLabel.includes("Search")
                        ? "search_filter_probe"
                        : context.config.promptContext.siteLabel.includes("Detail")
                          ? "job_detail_validation"
                          : context.config.promptContext.siteLabel.includes("Apply")
                            ? "apply_path_validation"
                            : "replay_verification",
                targetLabel: context.config.promptContext.siteLabel,
                knownFacts: taskPacket.knownFacts,
              }
            : null,
          apply: null,
        },
      });

      context.state.visualSnapshots.push(snapshot);
      context.state.visualObservationSets.push(observationSet);

      return {
        success: true,
        data: {
          snapshotId: snapshot.id,
          observationSetId: observationSet.id,
          mode: snapshot.mode,
          purpose: snapshot.purpose,
          retained: snapshot.retention.retention !== "temporary",
          storagePath: snapshot.storagePath,
          summary: observationSet.summary,
          blockers: observationSet.blockers,
          visibleControls: observationSet.visibleControls,
          jobCardClues: observationSet.jobCardClues,
          applyPathClues: observationSet.applyPathClues,
          fieldControls: observationSet.fieldControls,
          validationErrors: observationSet.validationErrors,
          buttonStates: observationSet.buttonStates,
          recoveryNotes: observationSet.recoveryNotes,
          uncertainty: observationSet.uncertainty,
          rejectedOutputReasons: observationSet.rejectedOutputReasons,
        },
      };
    },
  },
];
