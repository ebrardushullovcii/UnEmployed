// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useState } from "react";
import { CollectionPagination } from "./collection-pagination";

function StatefulPagination({ initialPage = 1 }: { initialPage?: number }) {
  const [page, setPage] = useState(initialPage);

  return (
    <CollectionPagination
      itemLabel="jobs"
      onPageChange={setPage}
      page={page}
      pageSize={50}
      totalCount={120}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("CollectionPagination focus ownership", () => {
  test("does not steal focus when it mounts", () => {
    render(
      <>
        <button type="button">Before pagination</button>
        <StatefulPagination />
      </>,
    );

    expect(document.activeElement).toBe(document.body);
  });

  test("keeps focus on a valid pagination action after changing page", () => {
    render(<StatefulPagination />);
    const nextButton = screen.getByRole("button", { name: "Next page" });

    nextButton.focus();
    fireEvent.click(nextButton);

    expect(screen.getByText("Showing 51–100 of 120 jobs")).toBeTruthy();
    expect(document.activeElement).toBe(nextButton);
  });

  test("moves focus to Previous when Next becomes disabled on the last page", () => {
    render(<StatefulPagination initialPage={2} />);
    const nextButton = screen.getByRole("button", { name: "Next page" });
    const previousButton = screen.getByRole("button", {
      name: "Previous page",
    });

    nextButton.focus();
    fireEvent.click(nextButton);

    expect(screen.getByText("Showing 101–120 of 120 jobs")).toBeTruthy();
    expect(nextButton).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(previousButton);
  });

  test("does not prevent Tab or Shift+Tab from leaving the controls", () => {
    render(<StatefulPagination />);
    const previousButton = screen.getByRole("button", {
      name: "Previous page",
    });
    const nextButton = screen.getByRole("button", { name: "Next page" });

    expect(fireEvent.keyDown(nextButton, { key: "Tab" })).toBe(true);
    expect(
      fireEvent.keyDown(previousButton, { key: "Tab", shiftKey: true }),
    ).toBe(true);
  });
});
