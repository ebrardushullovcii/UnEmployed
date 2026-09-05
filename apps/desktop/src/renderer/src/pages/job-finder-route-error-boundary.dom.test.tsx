// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { JobFinderRouteErrorBoundary } from "./job-finder-route-error-boundary";

// jsdom's AbortController produces cross-realm signals that Node's Request
// rejects, and react-router builds one Request per navigation. Strip the
// signal before construction; these tests never abort a navigation.
const NavigableRequest = globalThis.Request;

if (NavigableRequest) {
  class TestRequest extends NavigableRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (!init) {
        super(input);
        return;
      }

      const stripped: RequestInit = { ...init };
      delete stripped.signal;
      super(input, stripped);
    }
  }

  globalThis.Request = TestRequest as typeof Request;
}

function ThrowInRender({ error }: { error: unknown }): ReactNode {
  throw error;
}

function renderBoundaryError(error: unknown) {
  const router = createMemoryRouter(
    [
      {
        element: <ThrowInRender error={error} />,
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        path: "/job-finder/discovery",
      },
    ],
    { initialEntries: ["/job-finder/discovery"] },
  );

  render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("JobFinderRouteErrorBoundary stale bundle recovery", () => {
  it("routes dynamic-import fetch failures to the app-updated recovery state", () => {
    renderBoundaryError(
      new TypeError(
        "Failed to fetch dynamically imported module: http://localhost/assets/job-finder-discovery-DXf12a.js",
      ),
    );

    expect(screen.getByText("App updated")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "The app was updated while it was open",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Reload to continue with the latest version."));
    expect(screen.getByRole("button", { name: "Reload app" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open profile" })).toBeTruthy();
    expect(screen.queryByText("This screen stopped responding")).toBeNull();
    expect(screen.queryByText("Technical details")).toBeNull();
  });

  it("keeps the generic screen error state for unrelated exceptions", () => {
    renderBoundaryError(new Error("Something broke in render"));

    expect(screen.getByText("Screen error")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "This screen stopped responding",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload app" })).toBeTruthy();

    const details = screen.getByText("Technical details").closest("details");
    expect(details?.querySelector("pre")?.textContent).toContain(
      "Something broke in render",
    );
  });

  it("does not treat other chunk failures as an app update", () => {
    renderBoundaryError(new Error("Loading chunk 42 failed"));

    expect(screen.queryByText("App updated")).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "This screen stopped responding",
      }),
    ).toBeTruthy();
  });
});
