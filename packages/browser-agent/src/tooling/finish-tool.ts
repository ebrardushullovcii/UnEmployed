import type { ToolDefinition } from "../types";
import { FinishSchema } from "./shared";

export const finishTool: ToolDefinition = {
  name: "finish",
  description: `Finish the current task and return any discovered jobs plus structured site findings.

Call this when the phase goal has been proven, safely blocked, or you have exhausted the useful evidence on the page.`,
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: 'Why you are finishing (e.g., "Found 20 jobs", "No more results", "Reached max steps")' },
      summary: { type: "string", description: "One concise site-specific summary of what was proven in this phase." },
      reliableControls: { type: "array", items: { type: "string" }, description: "Reliable controls, entrypoints, or search actions that worked on this site." },
      trickyFilters: { type: "array", items: { type: "string" }, description: "Tricky, hidden, misleading, or unreliable filters and controls to remember." },
      navigationTips: { type: "array", items: { type: "string" }, description: "Concrete navigation guidance such as route patterns, job card behavior, or detail-page rules." },
      applyTips: { type: "array", items: { type: "string" }, description: "Safe apply-entry observations such as inline apply, external apply, or no reliable apply path." },
      warnings: { type: "array", items: { type: "string" }, description: "Site-specific blockers, caveats, or uncertainty that later runs should respect." },
    },
    required: ["reason"],
  },
  execute: async (args) => {
    const parseResult = FinishSchema.safeParse(args);
    if (!parseResult.success) return { success: false, error: `Invalid finish arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
    const { reason, summary, reliableControls, trickyFilters, navigationTips, applyTips, warnings } = parseResult.data;
    return { success: true, data: { finished: true, reason, debugFindings: { summary: summary ?? null, reliableControls, trickyFilters, navigationTips, applyTips, warnings } } };
  },
};
