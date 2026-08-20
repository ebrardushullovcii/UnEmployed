import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function readToken(scope: string, token: string): string {
  const value = scope.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})`, "i"))?.[1];

  if (!value) {
    throw new Error(`Missing ${token} in theme scope`);
  }

  return value;
}

function relativeLuminance(color: string): number {
  const channels = [0, 1, 2].map((index) => Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16) / 255);
  const weights = [0.2126, 0.7152, 0.0722] as const;

  return channels.reduce((sum, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    const weight = weights[index];

    return sum + (weight === undefined ? 0 : linear * weight);
  }, 0);
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);

  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function themeScope(selector: string): string {
  const start = globalsCss.indexOf(selector);
  const end = globalsCss.indexOf("\n}", start);

  if (start < 0 || end < 0) {
    throw new Error(`Missing ${selector} theme scope`);
  }

  return globalsCss.slice(start, end);
}

describe("global color tokens", () => {
  it("keeps dark muted text at AA contrast on every shared solid surface", () => {
    const darkTheme = themeScope(':root,\n:root[data-theme="dark"]');
    const mutedForeground = readToken(darkTheme, "--muted-foreground");
    const sharedDarkSurfaces = [
      "#0a0a0b", // --surface-panel
      "#0d0d0e", // --surface-panel-raised / --field
      "#0e0e0e", // --background / --surface
      "#131313", // --card
      "#141414", // --muted / --surface-raised
      "#151515", // --secondary
      "#161616", // --popover
      "#191919", // --surface-strong
      "#1a1a1a", // --accent
    ];

    for (const background of sharedDarkSurfaces) {
      expect(contrastRatio(mutedForeground, background), `${mutedForeground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the light muted text token at AA contrast on shared light surfaces", () => {
    const lightTheme = themeScope(':root[data-theme="light"]');
    const mutedForeground = readToken(lightTheme, "--muted-foreground");
    const sharedLightSurfaces = ["#ffffff", "#f5f5f2", "#efede8", "#f5f3ee", "#e6e2d8"];

    for (const background of sharedLightSurfaces) {
      expect(contrastRatio(mutedForeground, background), `${mutedForeground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
