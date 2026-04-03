import { extractionTools } from "./tooling/extraction-tools";
import { finishTool } from "./tooling/finish-tool";
import { interactionTools } from "./tooling/interaction-tools";
import { navigationTools } from "./tooling/navigation-tools";
import type { ToolDefinition } from "./types";
import {
  MAX_NAVIGATION_TIMEOUT,
  parseInteractiveElementsFromAriaSnapshot,
  prioritizeInteractiveElements,
  type InteractiveElementCandidate,
} from "./tooling/shared";

export {
  MAX_NAVIGATION_TIMEOUT,
  parseInteractiveElementsFromAriaSnapshot,
  prioritizeInteractiveElements,
};
export type { InteractiveElementCandidate };

function buildBrowserTools(): ToolDefinition[] {
  const registry = new Map<string, ToolDefinition>()

  for (const tool of [
    ...navigationTools,
    ...interactionTools,
    ...extractionTools,
    finishTool,
  ]) {
    if (registry.has(tool.name)) {
      throw new Error(`Duplicate browser tool definition: ${tool.name}`)
    }

    registry.set(tool.name, tool)
  }

  return [...registry.values()]
}

export const browserTools = buildBrowserTools();

export function getToolDefinitions() {
  return browserTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function getToolExecutor(name: string) {
  return browserTools.find((tool) => tool.name === name);
}
