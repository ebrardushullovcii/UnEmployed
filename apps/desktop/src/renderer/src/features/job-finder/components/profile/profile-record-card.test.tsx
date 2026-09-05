// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ProfileRecordCard } from "./profile-record-card";

function getDetailsCard(title: string): HTMLDetailsElement {
  const heading = screen.getByText(title);
  const details = heading.closest("details");
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error(`No details card found for ${title}`);
  }
  return details;
}

function TogglingHarness() {
  const [currentRole, setCurrentRole] = useState(true);

  return (
    <div>
      <button onClick={() => setCurrentRole(false)} type="button">
        Unset current role
      </button>
      {/* Simulates a card whose defaultOpen expression flips while the user is
          editing: the open state must not follow it after mount. */}
      <ProfileRecordCard defaultOpen={currentRole} title="Role 1">
        Card body
      </ProfileRecordCard>
    </div>
  );
}

afterEach(cleanup);

describe("ProfileRecordCard", () => {
  it("keeps a card open when its defaultOpen expression flips while editing", () => {
    render(<TogglingHarness />);

    expect(getDetailsCard("Role 1").open).toBe(true);

    act(() => {
      fireEvent.click(screen.getByText("Unset current role"));
    });

    // The Current-role toggle must never collapse the card the user opened.
    expect(getDetailsCard("Role 1").open).toBe(true);
  });

  it("opens an existing card exactly once when a new forceOpenSignal arrives", () => {
    const view = render(
      <ProfileRecordCard forceOpenSignal={null} title="Role 1">
        Card body
      </ProfileRecordCard>,
    );

    expect(getDetailsCard("Role 1").open).toBe(false);

    view.rerender(
      <ProfileRecordCard forceOpenSignal="experience_1:1" title="Role 1">
        Card body
      </ProfileRecordCard>,
    );

    expect(getDetailsCard("Role 1").open).toBe(true);

    // A repeated identical signal does not flip anything; the user can still
    // close the card afterwards.
    view.rerender(
      <ProfileRecordCard forceOpenSignal={null} title="Role 1">
        Card body
      </ProfileRecordCard>,
    );
    fireEvent.click(getDetailsCard("Role 1").querySelector("summary")!);
    expect(getDetailsCard("Role 1").open).toBe(false);
  });

  it("applies defaultOpen on mount only and keeps user toggles authoritative", () => {
    const view = render(
      <ProfileRecordCard defaultOpen={false} title="Role 1">
        Inside field
      </ProfileRecordCard>,
    );

    expect(getDetailsCard("Role 1").open).toBe(false);

    // A later defaultOpen change does not retroactively open the card.
    view.rerender(
      <ProfileRecordCard defaultOpen title="Role 1">
        Inside field
      </ProfileRecordCard>,
    );
    expect(getDetailsCard("Role 1").open).toBe(false);

    // The user opens the card manually; later prop changes keep it open.
    fireEvent.click(getDetailsCard("Role 1").querySelector("summary")!);
    expect(getDetailsCard("Role 1").open).toBe(true);

    view.rerender(
      <ProfileRecordCard defaultOpen={false} title="Role 1">
        Inside field
      </ProfileRecordCard>,
    );
    expect(getDetailsCard("Role 1").open).toBe(true);
  });

  it("keeps the Expand/Collapse chip out of the summary accessible name", async () => {
    render(
      <ProfileRecordCard
        defaultOpen={false}
        summary="Senior Engineer - Acme. Lisbon | 2020 to Present"
        title="Role 1"
      >
        Card body
      </ProfileRecordCard>,
    );

    const details = getDetailsCard("Role 1");
    const summaryElement = details.querySelector("summary");
    if (!(summaryElement instanceof HTMLElement)) {
      throw new Error("summary element missing");
    }

    // The visual affordance stays rendered but is hidden from the
    // accessibility tree; the native <details> expanded state carries the
    // semantics instead of an unstable "Expand"/"Collapse" label.
    const chip = screen.getByText("Expand").parentElement;
    expect(chip?.getAttribute("aria-hidden")).toBe("true");

    // The announced content is the useful, stable text only: title and
    // summary stay outside any aria-hidden subtree.
    expect(summaryElement.textContent).toContain("Expand");
    for (const stableText of [
      "Role 1",
      "Senior Engineer - Acme. Lisbon | 2020 to Present",
    ]) {
      const owner = [...summaryElement.querySelectorAll("span")].find(
        (element) => element.textContent === stableText,
      );
      expect(owner).toBeTruthy();
      expect(owner?.closest('[aria-hidden="true"]')).toBeNull();
    }

    // jsdom queues the details toggle event, so wait for the state flip.
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(true);
    const collapsedChip = await screen
      .findByText("Collapse")
      .then((collapsedLabel) => collapsedLabel.parentElement);

    // Toggling must not move any newly announced label into the tree: the
    // flipped word stays confined to the same hidden chip.
    expect(collapsedChip).toBe(chip);
    expect(collapsedChip?.getAttribute("aria-hidden")).toBe("true");
    for (const unstableWord of ["Expand", "Collapse"]) {
      for (const owner of [...summaryElement.querySelectorAll("span")].filter(
        (element) => element.textContent === unstableWord,
      )) {
        expect(owner.closest('[aria-hidden="true"]')).toBe(chip ?? null);
      }
    }
  });
});
