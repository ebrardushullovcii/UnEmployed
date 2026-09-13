// @vitest-environment jsdom

import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { JobFinderPageContext } from "./job-finder-page-context";
import { JobFinderCampaignsRoute } from "./job-finder-page-routes";
import { campaignPlanEditorHref } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";

vi.mock(
  "@renderer/features/job-finder/screens/campaigns/campaigns-screen",
  () => ({
    CampaignsScreen: (props: Record<string, unknown>) => (
      <>
        <button
          data-testid="campaigns-screen-delete"
          onClick={() => {
            void (
              props.onDeleteCampaign as
                | ((campaignId: string) => Promise<boolean>)
                | undefined
            )?.("campaign_requested");
          }}
          type="button"
        >
          delete
        </button>
        <span data-testid="campaigns-screen-edit-campaign-id">
          {typeof props.editCampaignId === "string"
            ? props.editCampaignId
            : ""}
        </span>
      </>
    ),
  }),
);

function createContext(
  overrides: Partial<JobFinderPageContext> = {},
): JobFinderPageContext {
  return {
    isPending: vi.fn(() => false),
    onDeleteCampaign: vi.fn(() => Promise.resolve(true)),
    workspace: {
      activeCampaignId: "campaign_1",
      campaigns: [],
      hydration: { phase: "ready", deferredCollections: [] },
    } as unknown as JobFinderWorkspaceSnapshot,
    ...overrides,
  } as unknown as JobFinderPageContext;
}

afterEach(cleanup);

describe("JobFinderCampaignsRoute", () => {
  it("selects the exact valid campaign requested by global search", async () => {
    const context = createContext({
      onSelectCampaign: vi.fn(() => Promise.resolve(true)),
      workspace: {
        activeCampaignId: "campaign_1",
        campaigns: [{ id: "campaign_1" }, { id: "campaign_2" }],
        hydration: { phase: "ready", deferredCollections: [] },
      } as unknown as JobFinderWorkspaceSnapshot,
    });
    render(
      <MemoryRouter
        initialEntries={["/job-finder/campaigns?campaignId=campaign_2"]}
      >
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route
              path="/job-finder/campaigns"
              element={
                <Suspense fallback={null}>
                  <JobFinderCampaignsRoute />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(context.onSelectCampaign).toHaveBeenCalledWith("campaign_2"),
    );
  });

  it("asks the campaigns screen to open the plan editor a Find jobs link named", async () => {
    const context = createContext({
      onSelectCampaign: vi.fn(() => Promise.resolve(true)),
      workspace: {
        activeCampaignId: "campaign_1",
        campaigns: [{ id: "campaign_1" }, { id: "campaign_2" }],
        hydration: { phase: "ready", deferredCollections: [] },
      } as unknown as JobFinderWorkspaceSnapshot,
    });
    render(
      <MemoryRouter initialEntries={[campaignPlanEditorHref("campaign_2")]}>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route
              path="/job-finder/campaigns"
              element={
                <Suspense fallback={null}>
                  <JobFinderCampaignsRoute />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      (await screen.findByTestId("campaigns-screen-edit-campaign-id"))
        .textContent,
    ).toBe("campaign_2");
  });

  it("leaves the plan editor closed for a plain plan link", async () => {
    const context = createContext();
    render(
      <MemoryRouter initialEntries={["/job-finder/campaigns"]}>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route
              path="/job-finder/campaigns"
              element={
                <Suspense fallback={null}>
                  <JobFinderCampaignsRoute />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      (await screen.findByTestId("campaigns-screen-edit-campaign-id"))
        .textContent,
    ).toBe("");
  });

  it("passes the delete-campaign handler through to the campaigns screen", async () => {
    const context = createContext();
    render(
      <MemoryRouter initialEntries={["/job-finder/campaigns"]}>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route
              path="/job-finder/campaigns"
              element={
                <Suspense fallback={null}>
                  <JobFinderCampaignsRoute />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId("campaigns-screen-delete"));

    expect(context.onDeleteCampaign).toHaveBeenCalledTimes(1);
    expect(context.onDeleteCampaign).toHaveBeenCalledWith("campaign_requested");
  });
});
