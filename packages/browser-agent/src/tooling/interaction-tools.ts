import type { ToolDefinition } from "../types";
import { clickTool } from "./click-tool";
import { fillTool } from "./fill-tool";
import { getInteractiveElementsTool } from "./get-interactive-elements-tool";
import { selectOptionTool } from "./select-option-tool";

export const interactionTools: ToolDefinition[] = [
  getInteractiveElementsTool,
  clickTool,
  fillTool,
  selectOptionTool,
];
