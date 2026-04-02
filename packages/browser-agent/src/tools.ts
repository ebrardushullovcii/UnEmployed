import { extractionTools } from "./tooling/extraction-tools";
import { finishTool } from "./tooling/finish-tool";
import { interactionTools } from "./tooling/interaction-tools";
import { navigationTools } from "./tooling/navigation-tools";
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

export const browserTools = [
  ...navigationTools,
  ...interactionTools,
  ...extractionTools,
  finishTool,
];

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
