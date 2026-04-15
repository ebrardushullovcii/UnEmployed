import type { Page } from "playwright";
import { interactionTools } from "./interaction-tools";

type InteractionToolName = "click" | "fill" | "select_option";

export function getInteractionTool(name: InteractionToolName) {
  const tool = interactionTools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`${name} tool is not registered`);
  }
  return tool;
}

export function buildInteractionContext(page: Page, stateOverrides: Record<string, unknown> = {}) {
  const state = stateOverrides as {
    currentUrl?: string;
    visitedUrls?: Set<string>;
  };
  state.currentUrl ??= "https://example.com/jobs";
  state.visitedUrls ??= new Set<string>();

  return {
    page,
    state: state as never,
    config: {
      navigationPolicy: {
        allowedHostnames: ["example.com"],
      },
    } as never,
  };
}
