// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ResumeDraftBullet,
  ResumeDraftSection,
} from "@unemployed/contracts";
import type { createResumeDraftPatch } from "./resume-section-editor-helpers";
import { ResumeBulletListEditor } from "./resume-section-editor-bullet-list";

function buildSection(
  bullets: readonly ResumeDraftBullet[],
): ResumeDraftSection {
  return {
    id: "section_summary",
    kind: "summary",
    label: "Summary",
    text: null,
    bullets: [...bullets],
    entries: [],
    origin: "ai_generated",
    locked: false,
    included: true,
    sortOrder: 0,
    entryOrderMode: "chronology",
    profileRecordId: null,
    sourceRefs: [],
    updatedAt: "2026-04-26T12:00:00.000Z",
  };
}

function bullet(
  index: number,
  overrides?: Partial<ResumeDraftBullet>,
): ResumeDraftBullet {
  return {
    id: `bullet_${index}`,
    text: `Bullet ${index} line`,
    origin: "user_edited",
    locked: false,
    included: true,
    sourceRefs: [],
    lastGeneratedContentHash: null,
    updatedAt: "2026-04-26T12:00:00.000Z",
    ...overrides,
  };
}

function renderList(input?: {
  bullets?: readonly ResumeDraftBullet[];
  onPatch?: (
    patch: ReturnType<typeof createResumeDraftPatch>,
    reason?: string | null,
  ) => void;
  showGeneratedMarkers?: boolean;
}) {
  const onPatch = input?.onPatch ?? vi.fn();
  const bullets = input?.bullets ?? [bullet(1), bullet(2), bullet(3)];
  return render(
    <ResumeBulletListEditor
      bulletRows={bullets}
      controlIdPrefix="ctrl"
      disabled={false}
      section={buildSection(bullets)}
      showGeneratedMarkers={input?.showGeneratedMarkers ?? false}
      onChange={vi.fn()}
      onPatch={onPatch}
    />,
  );
}

describe("ResumeBulletListEditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("replaces repeated visible labels with exact per-bullet aria labels", () => {
    renderList();

    expect(screen.queryByText("Bullet text")).toBeNull();
    const textareas = screen.getAllByRole("textbox");
    expect(
      textareas.map((textarea) => textarea.getAttribute("aria-label")),
    ).toEqual(["Section bullet 1", "Section bullet 2", "Section bullet 3"]);
  });

  it("keeps lock state and move order reachable with exact accessible names", () => {
    renderList();

    const lockButtons = screen.getAllByRole("button", { name: "Lock" });
    expect(lockButtons).toHaveLength(3);
    for (const lock of lockButtons) {
      expect(lock.getAttribute("aria-pressed")).toBe("false");
    }

    expect(
      screen.getByRole("button", { name: "Move bullet 1 up" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Move bullet 3 down" }),
    ).toHaveProperty("disabled", true);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("h-8");
    }
  });

  it("sends typed patches with exact ids when toggling visibility", () => {
    const onPatch = vi.fn();
    renderList({ onPatch });

    fireEvent.click(screen.getByRole("button", { name: "Hide bullet 2" }));

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0]?.[0]).toMatchObject({
      operation: "toggle_include",
      targetBulletId: "bullet_2",
      targetSectionId: "section_summary",
      newIncluded: false,
    });
    expect(onPatch.mock.calls[0]?.[1]).toBe("Hidden bullet");
  });

  it("marks generated lines only when markers are requested", () => {
    const { container } = renderList({
      bullets: [bullet(1), bullet(2, { origin: "ai_generated" })],
    });
    expect(container.textContent).not.toContain("AI-generated");

    const marked = renderList({
      bullets: [
        bullet(1),
        bullet(2, { origin: "ai_generated" }),
        bullet(3, { origin: "assistant_edited" }),
      ],
      showGeneratedMarkers: true,
    });

    expect(marked.container.textContent).toContain("AI-generated");
    expect(
      Array.from(marked.container.querySelectorAll(".h-8")).length,
    ).toBeGreaterThan(0);
  });

  it("keeps content-sizing textareas with a two-line floor class", () => {
    const { container } = renderList({ bullets: [bullet(1)] });
    const textarea = container.querySelector("textarea")!;
    expect(textarea.className).toContain("[field-sizing:content]");
    expect(textarea.className).toContain("min-h-[3.9rem]");
    expect(textarea.getAttribute("rows")).toBe("2");
  });
});
