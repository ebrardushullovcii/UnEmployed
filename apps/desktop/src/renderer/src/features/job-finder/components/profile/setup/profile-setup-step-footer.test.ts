import { describe, expect, it, vi } from "vitest";
import {
  formatProfileSetupFinishReadiness,
  getProfileSetupStepFooterPrimary,
} from "./profile-setup-step-footer";

describe("getProfileSetupStepFooterPrimary", () => {
  it("keeps Save and continue as the primary action on Essentials", () => {
    const onSaveAndGoToStep = vi.fn();
    const primary = getProfileSetupStepFooterPrimary({
      canFinishSetup: false,
      currentStep: "essentials",
      onSaveAndFinish: vi.fn(),
      onSaveAndGoToStep,
    });

    expect(primary).toMatchObject({
      disabled: false,
      label: "Save and continue to Work history",
    });
    primary.onPrimary?.();
    expect(onSaveAndGoToStep).toHaveBeenCalledWith("background");
  });

  it("gates Finish until setup is materially complete", () => {
    const onSaveAndFinish = vi.fn();
    const blocked = getProfileSetupStepFooterPrimary({
      canFinishSetup: false,
      currentStep: "extras",
      onSaveAndFinish,
      onSaveAndGoToStep: vi.fn(),
    });
    expect(blocked).toMatchObject({
      disabled: true,
      label: "Finish setup and find jobs",
      onPrimary: null,
    });

    const ready = getProfileSetupStepFooterPrimary({
      canFinishSetup: true,
      currentStep: "extras",
      onSaveAndFinish,
      onSaveAndGoToStep: vi.fn(),
    });
    expect(ready.disabled).toBe(false);
    expect(ready.label).toBe("Finish setup and find jobs");
    ready.onPrimary?.();
    expect(onSaveAndFinish).toHaveBeenCalledTimes(1);
  });

  it("offers Finish from Job targets, the last required step", () => {
    const onSaveAndFinish = vi.fn();
    const primary = getProfileSetupStepFooterPrimary({
      canFinishSetup: true,
      currentStep: "targeting",
      onSaveAndFinish,
      onSaveAndGoToStep: vi.fn(),
    });

    expect(primary.label).toBe("Finish setup and find jobs");
    primary.onPrimary?.();
    expect(onSaveAndFinish).toHaveBeenCalledTimes(1);
  });

  it("resolves a retired stored step onto the step that owns its content", () => {
    const onSaveAndFinish = vi.fn();

    expect(
      getProfileSetupStepFooterPrimary({
        canFinishSetup: true,
        currentStep: "ready_check",
        onSaveAndFinish,
        onSaveAndGoToStep: vi.fn(),
      }).label,
    ).toBe("Finish setup and find jobs");
    expect(
      getProfileSetupStepFooterPrimary({
        canFinishSetup: false,
        currentStep: "narrative",
        onSaveAndFinish,
        onSaveAndGoToStep: vi.fn(),
      }).label,
    ).toBe("Finish setup and find jobs");
  });
});

describe("formatProfileSetupFinishReadiness", () => {
  it("names what is missing instead of publishing a second count", () => {
    expect(
      formatProfileSetupFinishReadiness({
        canFinishSetup: false,
        remainingBlockerLabels: ["Add work history"],
      }),
    ).toBe("Still needed to finish: Add work history.");
    expect(
      formatProfileSetupFinishReadiness({
        canFinishSetup: true,
        remainingBlockerLabels: [],
      }),
    ).toBe("Everything required is in. You can finish setup.");
  });
});
