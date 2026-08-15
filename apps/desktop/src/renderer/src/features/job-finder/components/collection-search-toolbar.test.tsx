import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollectionNoMatches,
  CollectionColumnPicker,
  CollectionSavedViews,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "./collection-search-toolbar";

afterEach(cleanup);

describe("CollectionSearchToolbar", () => {
  it("reports filtered counts and keeps clear and density actions accessible", () => {
    const onQueryChange = vi.fn();
    const onDensityChange = vi.fn();
    render(
      <CollectionSearchToolbar
        density="comfortable"
        label="Find a job"
        onDensityChange={onDensityChange}
        onQueryChange={onQueryChange}
        placeholder="Search jobs"
        query="platform"
        totalCount={1000}
        visibleCount={12}
      />,
    );

    expect(screen.getByText("12 of 1000 results")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(onDensityChange).toHaveBeenCalledWith("compact");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("matches normalized text across multiple fields", () => {
    expect(
      matchesCollectionSearch(" typescript ", ["Engineer", "TypeScript"]),
    ).toBe(true);
    expect(matchesCollectionSearch("sales", ["Engineer", "TypeScript"])).toBe(
      false,
    );
  });

  it("explains a no-match state without implying filters changed", () => {
    const onClear = vi.fn();
    render(<CollectionNoMatches noun="jobs" onClear={onClear} query="sales" />);
    expect(
      screen.getByText(/other filters and selections have not changed/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("supports reusable saved views and explicit column choices", () => {
    const onApply = vi.fn();
    const onDelete = vi.fn();
    const onSave = vi.fn();
    const onColumnChange = vi.fn();
    render(
      <>
        <CollectionSavedViews
          onApply={onApply}
          onDelete={onDelete}
          onSave={onSave}
          views={[
            {
              density: "compact",
              id: "remote",
              name: "Remote",
              query: "remote",
            },
          ]}
        />
        <CollectionColumnPicker
          columns={[
            { id: "role", label: "Role", required: true, visible: true },
            { id: "salary", label: "Salary", visible: false },
          ]}
          onChange={onColumnChange}
        />
      </>,
    );

    fireEvent.click(screen.getByText("Saved views (1)"));
    fireEvent.click(screen.getByRole("button", { name: "Remote" }));
    expect(onApply).toHaveBeenCalledWith("remote");
    fireEvent.change(screen.getByLabelText("Saved view name"), {
      target: { value: "Strong fits" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Strong fits");

    fireEvent.click(screen.getByText("Columns"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Salary" }));
    expect(onColumnChange).toHaveBeenCalledWith("salary", true);
    expect(screen.getByRole("checkbox", { name: "Role" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete saved view Remote" }),
    );
    expect(onDelete).toHaveBeenCalledWith("remote");
  });
});
// @vitest-environment jsdom
