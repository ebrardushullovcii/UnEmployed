// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Button } from "./button";

describe("Button", () => {
  const globalScope = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const originalActEnvironment = globalScope.IS_REACT_ACT_ENVIRONMENT;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeAll(() => {
    globalScope.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    if (originalActEnvironment === undefined) {
      delete globalScope.IS_REACT_ACT_ENVIRONMENT;
      return;
    }

    globalScope.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }

    root = null;
    container?.remove();
    container = null;
  });

  function render(ui: ReactElement) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(ui);
    });
  }

  function rerender(ui: ReactElement) {
    act(() => {
      root?.render(ui);
    });
  }

  function dispatchClick(element: Element) {
    return element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  }

  function dispatchKeyDown(element: Element, key: string) {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
    });
    element.dispatchEvent(event);
    return event;
  }

  it("marks pending buttons as busy and disabled with the activity rail without native disabled", () => {
    render(
      <Button pending type="button">
        Save changes
      </Button>,
    );

    const button = container?.querySelector("button");
    expect(button?.getAttribute("aria-busy")).toBe("true");
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    // Pending keeps the control out of native disabled so focus can stay put.
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(button?.getAttribute("data-pending")).toBe("true");
    expect(button?.getAttribute("tabindex")).toBeNull();
    expect(container?.querySelector(".button-pending-rail")).not.toBeNull();
  });

  it("does not render pending attributes when idle", () => {
    render(<Button type="button">Save changes</Button>);

    const button = container?.querySelector("button");
    expect(button?.hasAttribute("aria-busy")).toBe(false);
    expect(button?.hasAttribute("aria-disabled")).toBe(false);
    expect(button?.hasAttribute("data-pending")).toBe(false);
    expect(container?.querySelector(".button-pending-rail")).toBeNull();
  });

  it("keeps primary funnel CTAs full-border weighted without diluted chrome", () => {
    render(
      <Button type="button" variant="primary">
        Prepare application
      </Button>,
    );

    const button = container?.querySelector("button");
    expect(button?.className).toMatch(/\bborder-primary\b/);
    expect(button?.className).not.toMatch(/border-primary\/\d/);
    expect(button?.className).toMatch(
      /shadow-\[inset_0_1px_0_var\(--focus-inset-highlight\)/,
    );
    expect(button?.className).toMatch(
      /0_0_0_1px_color-mix\(in_oklab,var\(--primary\)_45%,transparent\)/,
    );
    expect(button?.className).not.toMatch(/ring-primary\/\d/);
  });

  it("retains focus and blocks pointer and keyboard activation across the pending transition", () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} type="button">
        Save changes
      </Button>,
    );

    const button = container?.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.focus();
    });
    expect(document.activeElement).toBe(button);

    rerender(
      <Button onClick={handleClick} pending type="button">
        Save changes
      </Button>,
    );

    // The transition must not throw focus back to <body>.
    expect(document.activeElement).toBe(button);
    expect(handleClick).not.toHaveBeenCalled();

    expect(dispatchClick(button)).toBe(false);
    expect(handleClick).not.toHaveBeenCalled();
    expect(dispatchKeyDown(button, "Enter").defaultPrevented).toBe(true);
    expect(dispatchKeyDown(button, " ").defaultPrevented).toBe(true);
    expect(handleClick).not.toHaveBeenCalled();

    rerender(
      <Button onClick={handleClick} type="button">
        Save changes
      </Button>,
    );

    // Pending -> ready restores activation and clears the busy state.
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    act(() => {
      button.click();
    });
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("keeps native disabled semantics for truly disabled buttons and stays untabbable", () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick} type="button">
        Save changes
      </Button>,
    );

    const button = container?.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
    // Native disabled removes the control from the tab order on its own.
    expect(button.getAttribute("tabindex")).toBeNull();

    act(() => {
      button.click();
    });
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("supports asChild while pending", () => {
    const clickHandler = vi.fn();

    render(
      <Button asChild pending>
        <a href="/job-finder/review-queue" onClick={clickHandler}>
          Review queue
        </a>
      </Button>,
    );

    const link = container?.querySelector("a");
    expect(link?.getAttribute("aria-busy")).toBe("true");
    expect(link?.getAttribute("aria-disabled")).toBe("true");
    expect(link?.getAttribute("data-pending")).toBe("true");
    // Behaviorally consistent with the native path: pending stays tabbable.
    expect(link?.getAttribute("tabindex")).toBeNull();
    expect(container?.querySelector(".button-pending-rail")).not.toBeNull();

    expect(dispatchClick(link as Element)).toBe(false);
    expect(clickHandler).not.toHaveBeenCalled();
    expect(dispatchKeyDown(link as Element, "Enter").defaultPrevented).toBe(
      true,
    );
    expect(clickHandler).not.toHaveBeenCalled();
  });

  it("keeps asChild truly disabled children untabbable with aria-disabled convention", () => {
    const clickHandler = vi.fn();

    render(
      <Button asChild disabled>
        <a href="/job-finder/review-queue" onClick={clickHandler}>
          Review queue
        </a>
      </Button>,
    );

    const link = container?.querySelector("a");
    expect(link?.getAttribute("aria-disabled")).toBe("true");
    expect(link?.getAttribute("aria-busy")).toBeNull();
    expect(link?.getAttribute("tabindex")).toBe("-1");
    expect(dispatchClick(link as Element)).toBe(false);
    expect(clickHandler).not.toHaveBeenCalled();
  });

  it("passes describedby through on both native and asChild paths", () => {
    render(
      <div>
        <p id="reason-native">Why this is unavailable.</p>
        <Button aria-describedby="reason-native" disabled type="button">
          Native
        </Button>
        <p id="reason-child">Why the link is unavailable.</p>
        <Button asChild aria-describedby="reason-child">
          <a href="/somewhere">Child</a>
        </Button>
      </div>,
    );

    const buttons = [...(container?.querySelectorAll("button") ?? [])];
    const links = [...(container?.querySelectorAll("a") ?? [])];
    expect(buttons[0]?.getAttribute("aria-describedby")).toBe("reason-native");
    expect(links[0]?.getAttribute("aria-describedby")).toBe("reason-child");
  });
});
