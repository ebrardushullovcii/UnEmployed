import type { ToolDefinition } from "../types";
import { FinishSchema } from "./shared";

export const finishTool: ToolDefinition = {
  name: "finish",
  description: `Finish the current task and return any discovered jobs plus structured site findings.

Call this when the phase goal has been proven, safely blocked, or you have exhausted the useful evidence on the page. There is no fixed number of steps: an easy site is done in a few, a hard one may take many more. Also call this when you are genuinely stuck, with stuck: true and a reason that says what is blocking you.`,
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description:
          'Why you are finishing (e.g., "Found 20 jobs", "No more results", "Every job link opens a sign-in wall")',
      },
      stuck: {
        type: "boolean",
        description:
          "true when you are stopping because you could not make progress rather than because the goal is met or safely blocked. Then reason must say what blocked you.",
      },
      summary: {
        type: "string",
        description:
          "One concise site-specific summary of what was proven in this phase.",
      },
      reliableControls: {
        type: "array",
        items: { type: "string" },
        description:
          "Reliable controls, entrypoints, or search actions that worked on this site.",
      },
      trickyFilters: {
        type: "array",
        items: { type: "string" },
        description:
          "Tricky, hidden, misleading, or unreliable filters and controls to remember.",
      },
      navigationTips: {
        type: "array",
        items: { type: "string" },
        description:
          "Concrete navigation guidance such as route patterns, job card behavior, or detail-page rules.",
      },
      applyTips: {
        type: "array",
        items: { type: "string" },
        description:
          "Safe apply-entry observations such as inline apply, external apply, or no reliable apply path.",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Site-specific blockers, caveats, or uncertainty that later runs should respect.",
      },
    },
    required: ["reason"],
  },
  execute: (args) => {
    const parseResult = FinishSchema.safeParse(args);
    if (!parseResult.success)
      return Promise.resolve({
        success: false,
        error: `Invalid finish arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
      });
    const {
      reason,
      stuck,
      summary,
      reliableControls,
      trickyFilters,
      navigationTips,
      applyTips,
      warnings,
    } = parseResult.data;
    return Promise.resolve({
      success: true,
      data: {
        finished: true,
        reason,
        stuck: stuck === true,
        debugFindings: {
          summary: summary ?? null,
          reliableControls,
          trickyFilters,
          navigationTips,
          applyTips,
          warnings,
        },
      },
    });
  },
};
