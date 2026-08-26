// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import tabsSource from "./tabs.tsx?raw";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function extractLine(name: string): string {
  const line = tabsSource
    .split("\n")
    .find((candidate) => candidate.includes(name));

  if (!line) {
    throw new Error(`Missing ${name} in tabs.tsx`);
  }

  return line;
}

describe("Tabs line variant chrome", () => {
  it("owns exactly one shared divider on the line list", () => {
    const lineVariant = extractLine('line: "gap-0');

    expect((lineVariant.match(/border-b/g) ?? []).length).toBe(1);
    expect(lineVariant).toContain("border-(--surface-panel-border)");
  });

  it("keeps one active indicator: the underline, with no second border indicator for line tabs", () => {
    const indicatorRule = extractLine("after:opacity-100");
    const borderRule = extractLine("border-b-2");

    expect(indicatorRule).toContain(
      "group-data-[variant=line]/tabs-list:data-[state=active]:after:bg-primary",
    );
    expect(indicatorRule).toContain("after:h-px");
    expect(borderRule).not.toMatch(
      /"group-data-\[orientation=horizontal\]\/tabs:data-\[state=active\]:border-b-2/u,
    );
    expect(borderRule).toMatch(
      /group-data-\[variant=default\]\/tabs-list:[^\s"]*border-b-2/u,
    );
    expect(extractLine("tabs-list:bg-transparent")).not.toContain(
      "data-[state=active]:bg-secondary",
    );
  });

  it("preserves the default variant pill indicator", () => {
    expect(tabsSource).toContain('default: "bg-muted"');
    expect(extractLine("border-b-2")).toContain(
      "data-[state=active]:border-primary",
    );
  });

  it("renders line tabs with working radix semantics end to end", () => {
    render(
      <Tabs defaultValue="preview">
        <TabsList variant="line">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="editor">Tools</TabsTrigger>
        </TabsList>
        <TabsContent value="preview">Preview pane</TabsContent>
        <TabsContent value="editor">Editor pane</TabsContent>
      </Tabs>,
    );

    const list = screen.getByRole("tablist");
    expect(list.className).toContain("border-(--surface-panel-border)");
    expect(screen.getByRole("tab", { name: "Preview" }).className).toContain(
      "after:h-px",
    );
    expect(screen.getByText("Preview pane")).toBeTruthy();
  });
});
