// @vitest-environment jsdom

import { act, createRef, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ProfileCopilotCollapsedBubble,
  ProfileCopilotComposer,
  ProfileCopilotTranscript,
} from "./profile-copilot-rail-sections";

describe("ProfileCopilotComposer", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }

    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
  });

  function renderComposer(
    props: Partial<ComponentProps<typeof ProfileCopilotComposer>> = {},
  ) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const defaultProps: ComponentProps<typeof ProfileCopilotComposer> = {
      busy: false,
      composerId: "profile-copilot-composer",
      input: "Draft next request while Copilot works.",
      isPendingHere: true,
      onInputChange: vi.fn(),
      onKeyDown: vi.fn(),
      onSend: vi.fn(),
      placeholder: "Ask for a structured edit",
      sendDisabledReason: null,
      starterQuestion: null,
    };

    act(() => {
      root?.render(<ProfileCopilotComposer {...defaultProps} {...props} />);
    });
  }

  test("keeps the composer editable while a reply is pending", () => {
    renderComposer();

    const textarea = container?.querySelector("textarea");
    const button = container?.querySelector("button");

    expect(textarea).not.toBeNull();
    expect(textarea?.disabled).toBe(false);
    expect(textarea?.value).toBe("Draft next request while Copilot works.");
    expect(container?.textContent).toContain(
      "Reviewing your request… You can keep editing or draft your next message.",
    );
    expect(button?.textContent).toContain("Preparing...");
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  test("shows an explicit save-first guard reason when sending is blocked", () => {
    renderComposer({
      input: "Please update my preferences.",
      isPendingHere: false,
      sendDisabledReason:
        "Save this page before asking Profile Copilot to edit it so your current profile draft does not get overwritten.",
    });

    const textarea = container?.querySelector("textarea");
    const button = container?.querySelector("button");

    expect(textarea?.disabled).toBe(false);
    expect(container?.textContent).toContain(
      "Save this page before asking Profile Copilot to edit it so your current profile draft does not get overwritten.",
    );
    expect(button?.textContent).toContain("Send request");
    expect(button?.hasAttribute("disabled")).toBe(true);
  });
});

describe("ProfileCopilotTranscript", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }

    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
  });

  function renderTranscript(
    props: Partial<ComponentProps<typeof ProfileCopilotTranscript>> = {},
  ) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const defaultProps: ComponentProps<typeof ProfileCopilotTranscript> = {
      busy: false,
      actionsDisabledReason: null,
      emptyStateDescription: "No transcript yet.",
      emptyStateTitle: "Ask Profile Copilot",
      isPendingHere: false,
      messages: [
        {
          id: "assistant_message_1",
          role: "assistant",
          content: [
            "## Suggested updates",
            "",
            "- Prefer **remote-first** targets",
            "- Add `LinkedIn Jobs`",
            "",
            "> Review the broader rewrite before applying it.",
            "",
            "```json",
            "{",
            '  "applyMode": "needs_review"',
            "}",
            "```",
          ].join("\n"),
          context: { surface: "profile", section: "preferences" },
          patchGroups: [],
          createdAt: "2026-04-15T16:00:00.000Z",
        },
      ],
      onApplyPatchGroup: vi.fn(),
      onRejectPatchGroup: vi.fn(),
      onUsePrompt: vi.fn(),
      suggestedPrompts: [],
      starterQuestion: null,
      transcriptRef: createRef<HTMLDivElement>(),
    };

    act(() => {
      root?.render(<ProfileCopilotTranscript {...defaultProps} {...props} />);
    });
  }

  test("renders assistant markdown-like content as structured transcript UI", () => {
    renderTranscript();

    const markdownRoot = container?.querySelector(
      '[data-profile-copilot-markdown="true"]',
    );
    const heading = markdownRoot?.querySelector("h3");
    const listItems = [...(markdownRoot?.querySelectorAll("ul li") ?? [])].map(
      (element) => element.textContent?.trim(),
    );
    const blockquote = markdownRoot?.querySelector("blockquote");
    const strong = markdownRoot?.querySelector("strong");
    const inlineCode = markdownRoot?.querySelector("code");
    const codeBlock = markdownRoot?.querySelector("pre code");

    expect(heading?.textContent).toBe("Suggested updates");
    expect(listItems).toEqual([
      "Prefer remote-first targets",
      "Add LinkedIn Jobs",
    ]);
    expect(strong?.textContent).toBe("remote-first");
    expect(blockquote?.textContent).toContain(
      "Review the broader rewrite before applying it.",
    );
    expect(inlineCode?.textContent).toBe("LinkedIn Jobs");
    expect(codeBlock?.textContent).toContain('"applyMode": "needs_review"');
  });

  test("explains that a pending request cannot change the saved profile without acceptance", () => {
    renderTranscript({ isPendingHere: true });

    expect(container?.textContent).toContain(
      "Your saved profile stays unchanged unless you accept a proposed change.",
    );
  });

  test("shows exact proposed scalar, list, and compensation values before approval", () => {
    renderTranscript({
      messages: [
        {
          id: "assistant_message_proposal",
          role: "assistant",
          content:
            "I prepared these changes for your review. Nothing changed yet.",
          context: { surface: "profile", section: "preferences" },
          patchGroups: [
            {
              id: "patch_group_proposal",
              summary: "Update job preferences",
              applyMode: "needs_review",
              operations: [
                {
                  operation: "replace_identity_fields",
                  value: { headline: "Senior Product Engineer" },
                },
                {
                  operation: "replace_profile_list_fields",
                  value: { locations: ["New York"] },
                },
                {
                  operation: "replace_compensation_preferences_fields",
                  value: {
                    minimum: 3000,
                    maximum: 4000,
                    interval: "month",
                    currency: null,
                    currencyStatus: "needs_clarification",
                  },
                },
              ],
              createdAt: "2026-04-15T16:00:00.000Z",
            },
          ],
          createdAt: "2026-04-15T16:00:00.000Z",
        },
      ],
    });

    expect(container?.textContent).toContain(
      "Set headline to “Senior Product Engineer”",
    );
    expect(container?.textContent).toContain("Set locations to New York");
    expect(container?.textContent).toContain(
      "Set compensation to 3,000–4,000 / month (currency not set — confirmation needed)",
    );
    expect(container?.textContent).toContain("Nothing changed yet.");
    expect(container?.textContent).toContain("Apply changes");
  });

  test.each([
    {
      applyMode: "applied" as const,
      expectedStatus: "Current status: This change is applied to your profile.",
    },
    {
      applyMode: "rejected" as const,
      expectedStatus:
        "Current status: This proposal was rejected. Your profile was not changed.",
    },
  ])(
    "replaces stale pending-only wording after a proposal is $applyMode",
    ({ applyMode, expectedStatus }) => {
      renderTranscript({
        messages: [
          {
            id: `assistant_message_${applyMode}`,
            role: "assistant",
            content:
              "I prepared this change for your review. Nothing changed yet.",
            context: { surface: "profile", section: "basics" },
            patchGroups: [
              {
                id: `patch_group_${applyMode}`,
                summary: "Update headline",
                applyMode,
                operations: [
                  {
                    operation: "replace_identity_fields",
                    value: { headline: "Senior Product Engineer" },
                  },
                ],
                createdAt: "2026-04-15T16:00:00.000Z",
              },
            ],
            createdAt: "2026-04-15T16:00:00.000Z",
          },
        ],
      });

      expect(container?.textContent).not.toContain("Nothing changed yet");
      expect(container?.textContent).toContain(expectedStatus);
      expect(container?.textContent).not.toContain("Apply changes");
    },
  );

  test("reports partial progress when one proposal is applied and another still needs review", () => {
    renderTranscript({
      messages: [
        {
          id: "assistant_message_partial",
          role: "assistant",
          content: "I prepared 2 changes for your review. Nothing changed yet.",
          context: { surface: "profile", section: "preferences" },
          patchGroups: [
            {
              id: "patch_group_applied",
              summary: "Update headline",
              applyMode: "applied",
              operations: [
                {
                  operation: "replace_identity_fields",
                  value: { headline: "Senior Product Engineer" },
                },
              ],
              createdAt: "2026-04-15T16:00:00.000Z",
            },
            {
              id: "patch_group_pending",
              summary: "Update locations",
              applyMode: "needs_review",
              operations: [
                {
                  operation: "replace_profile_list_fields",
                  value: { locations: ["New York"] },
                },
              ],
              createdAt: "2026-04-15T16:00:00.000Z",
            },
          ],
          createdAt: "2026-04-15T16:00:00.000Z",
        },
      ],
    });

    expect(container?.textContent).not.toContain("Nothing changed yet");
    expect(container?.textContent).toContain(
      "Current status: 1 applied, 1 awaiting review.",
    );
    expect(container?.textContent).toContain("Apply changes");
  });

  test("does not claim applied after revision undo — transcript shows undone status", () => {
    renderTranscript({
      messages: [
        {
          id: "assistant_message_applied",
          role: "assistant",
          content: "I prepared this change for your review. Nothing changed yet.",
          context: { surface: "profile", section: "basics" },
          patchGroups: [
            {
              id: "patch_group_applied",
              summary: "Update headline",
              applyMode: "applied",
              operations: [
                {
                  operation: "replace_identity_fields",
                  value: { headline: "Senior Product Engineer" },
                },
              ],
              createdAt: "2026-04-15T16:00:00.000Z",
            },
          ],
          createdAt: "2026-04-15T16:00:00.000Z",
        },
      ],
      revisions: [
        {
          id: "profile_revision_applied",
          createdAt: "2026-04-15T16:00:10.000Z",
          reason: "Assistant patch: Update headline",
          trigger: "assistant_patch",
          messageId: "assistant_message_applied",
          patchGroupId: "patch_group_applied",
          restoredFromRevisionId: null,
        },
        {
          id: "profile_revision_undo",
          createdAt: "2026-04-15T16:01:00.000Z",
          reason: "Undo: Assistant patch: Update headline",
          trigger: "undo",
          messageId: null,
          patchGroupId: null,
          restoredFromRevisionId: "profile_revision_applied",
        },
      ] as never,
    })

    expect(container?.textContent).not.toContain("This change is applied")
    expect(container?.textContent).not.toContain("These changes are applied")
    expect(container?.textContent).toContain("undone")
    expect(container?.textContent).toContain("no longer applied")
  });
});

describe("describePatchOperation compensation clear truth", () => {
  test.each([
    {
      name: "clear minimum only",
      value: { minimum: null, interval: "year", currency: "USD", currencyStatus: "explicit" as const },
      expected: "Clear compensation minimum",
      notExpected: "Set compensation to range",
    },
    {
      name: "clear maximum only",
      value: { maximum: null, interval: "year", currency: "USD", currencyStatus: "explicit" as const },
      expected: "Clear compensation maximum",
      notExpected: "Set compensation to range",
    },
    {
      name: "clear range (both bounds)",
      value: { minimum: null, maximum: null, interval: "year", currency: "USD", currencyStatus: "explicit" as const },
      expected: "Clear compensation range",
      notExpected: "Set compensation to range",
    },
    {
      name: "clear minimum with maximum set",
      value: { minimum: null, maximum: 4000, interval: "month", currency: null, currencyStatus: "needs_clarification" as const },
      expected: "Clear compensation minimum",
      notExpected: "Set compensation to range",
    },
  ])("renders explicit clear wording for $name", async ({ value, expected, notExpected }) => {
    const { describePatchOperation } = await import("./profile-copilot-rail.shared")
    const operation = {
      operation: "replace_compensation_preferences_fields" as const,
      value,
    }
    const description = describePatchOperation(operation as never)
    expect(description).toContain(expected)
    expect(description).not.toContain(notExpected)
    expect(description).toContain("Clear")
  })

  test("still renders range correctly for non-clear values", async () => {
    const { describePatchOperation } = await import("./profile-copilot-rail.shared")
    const description = describePatchOperation({
      operation: "replace_compensation_preferences_fields",
      value: { minimum: 3000, maximum: 4000, interval: "month", currency: null, currencyStatus: "needs_clarification" },
    } as never)
    expect(description).toContain("Set compensation to 3,000–4,000")
  })
})

describe("getProfileCopilotDisplayContent undone truth", () => {
  test("does not claim applied after revision undo — shows undone status", async () => {
    const { getProfileCopilotDisplayContent } = await import("./profile-copilot-rail.shared")
    const message = {
      id: "assistant_message_applied",
      role: "assistant" as const,
      content: "I prepared this change for your review. Nothing changed yet.",
      context: { surface: "profile" as const, section: "basics" as const },
      patchGroups: [
        {
          id: "patch_group_applied",
          summary: "Update headline",
          applyMode: "applied" as const,
          operations: [{ operation: "replace_identity_fields" as const, value: { headline: "Senior Product Engineer" } }],
          createdAt: "2026-04-15T16:00:00.000Z",
        },
      ],
      createdAt: "2026-04-15T16:00:00.000Z",
    }
    const revisions: Array<{
      id: string
      createdAt: string
      reason: string | null
      trigger: "assistant_patch" | "undo"
      messageId: string | null
      patchGroupId: string | null
      restoredFromRevisionId: string | null
    }> = [
      {
        id: "profile_revision_applied",
        createdAt: "2026-04-15T16:00:10.000Z",
        reason: "Assistant patch: Update headline",
        trigger: "assistant_patch",
        messageId: message.id,
        patchGroupId: "patch_group_applied",
        restoredFromRevisionId: null,
      },
      {
        id: "profile_revision_undo",
        createdAt: "2026-04-15T16:01:00.000Z",
        reason: "Undo: Assistant patch: Update headline",
        trigger: "undo",
        messageId: null,
        patchGroupId: null,
        restoredFromRevisionId: "profile_revision_applied",
      },
    ]

    const withoutRevisions = getProfileCopilotDisplayContent(message as never)
    expect(withoutRevisions).toContain("This change is applied")

    const withUndo = getProfileCopilotDisplayContent(message as never, revisions as never)
    expect(withUndo).not.toContain("This change is applied")
    expect(withUndo).not.toContain("These changes are applied")
    expect(withUndo).toContain("undone")
    expect(withUndo).toContain("no longer applied")
  })

  test("handles indirect undo via timestamp — later patches reverted when undo targets earlier snapshot", async () => {
    const { getUndonePatchGroupIds } = await import("./profile-copilot-rail.shared")
    const revisions = [
      {
        id: "rev_a",
        createdAt: "2026-04-15T16:00:00.000Z",
        reason: "Assistant patch A",
        trigger: "assistant_patch" as const,
        messageId: "msg_a",
        patchGroupId: "patch_a",
        restoredFromRevisionId: null,
      },
      {
        id: "rev_b",
        createdAt: "2026-04-15T16:00:10.000Z",
        reason: "Assistant patch B",
        trigger: "assistant_patch" as const,
        messageId: "msg_b",
        patchGroupId: "patch_b",
        restoredFromRevisionId: null,
      },
      {
        id: "rev_undo_to_a",
        createdAt: "2026-04-15T16:00:20.000Z",
        reason: "Undo to A",
        trigger: "undo" as const,
        messageId: null,
        patchGroupId: null,
        restoredFromRevisionId: "rev_a",
      },
    ]
    const undone = getUndonePatchGroupIds(revisions as never)
    // rev_a is direct target, rev_b is after rev_a but before undo, so both should be undone
    expect(undone.has("patch_a")).toBe(true)
    expect(undone.has("patch_b")).toBe(true)
  })
})

describe("ProfileCopilotCollapsedBubble", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }

    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
  });

  test("uses native button activation semantics on the floating bubble", () => {
    const onClick = vi.fn();
    const onPointerCancel = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileCopilotCollapsedBubble
          collapsedPreviewTitle="Continue this thread"
          isOpen={false}
          isPendingHere={false}
          messageCount={1}
          onClick={onClick}
          onPointerCancel={onPointerCancel}
          onPointerDown={vi.fn()}
          onPointerMove={vi.fn()}
          onPointerUp={vi.fn()}
        />,
      );
    });

    const button = container?.querySelector("button");
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    act(() => {
      button?.dispatchEvent(new Event("pointercancel", { bubbles: true }));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onPointerCancel).toHaveBeenCalledTimes(1);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button?.getAttribute("aria-label")).toBe(
      "Profile Copilot: Continue this thread",
    );
    expect(button?.className).toContain("size-12");
    expect(button?.getAttribute("title")).toBe(
      "Profile Copilot: Continue this thread",
    );
  });
});
