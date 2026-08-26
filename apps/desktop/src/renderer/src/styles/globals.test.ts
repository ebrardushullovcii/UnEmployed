import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

const buttonSource = readFileSync(
  new URL("../components/ui/button.tsx", import.meta.url),
  "utf8",
);
const badgeSource = readFileSync(
  new URL("../components/ui/badge.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL(
    "../features/job-finder/components/job-finder-shell.tsx",
    import.meta.url,
  ),
  "utf8",
);

function readToken(scope: string, token: string): string {
  const value = scope.match(
    new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})`, "i"),
  )?.[1];

  if (!value) {
    throw new Error(`Missing ${token} in theme scope`);
  }

  return value;
}

function readColorToken(scope: string, token: string): string {
  const hex = scope.match(
    new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})`, "i"),
  )?.[1];
  const rgba = scope.match(
    new RegExp(`${token}\\s*:\\s*(rgba?\\([^)]+\\))`, "i"),
  )?.[1];

  const value = hex ?? rgba;

  if (!value) {
    throw new Error(`Missing ${token} in theme scope`);
  }

  return value;
}

function readDeclaration(scope: string, property: string): string {
  const value = scope.match(new RegExp(`${property}\\s*:\\s*([^;]+)`))?.[1];

  if (!value) {
    throw new Error(`Missing ${property} declaration`);
  }

  return value.trim();
}

function relativeLuminance(color: string): number {
  const channels = [0, 1, 2].map(
    (index) =>
      Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16) / 255,
  );
  const weights = [0.2126, 0.7152, 0.0722] as const;

  return channels.reduce((sum, channel, index) => {
    const linear =
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
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

/** Composite a translucent rgb(a) color over an opaque hex surface. */
function composite(translucent: string, background: string): string {
  const match = translucent.match(
    /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/,
  );

  if (!match) {
    return translucent;
  }

  const alpha = Number(match[4] ?? 1);
  const mix = (foreground: number, backing: number) =>
    Math.round(alpha * foreground + (1 - alpha) * backing);

  return `#${[
    mix(Number(match[1]), Number.parseInt(background.slice(1, 3), 16)),
    mix(Number(match[2]), Number.parseInt(background.slice(3, 5), 16)),
    mix(Number(match[3]), Number.parseInt(background.slice(5, 7), 16)),
  ]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Blend an opaque hex color at `alpha` over an opaque hex surface. */
function alphaBlend(hex: string, alpha: number, background: string): string {
  return composite(
    `rgba(${Number.parseInt(hex.slice(1, 3), 16)}, ${Number.parseInt(
      hex.slice(3, 5),
      16,
    )}, ${Number.parseInt(hex.slice(5, 7), 16)}, ${alpha})`,
    background,
  );
}

function themeScope(selector: string): string {
  const normalizedCss = globalsCss.replace(/\r\n/g, "\n");
  const normalizedSelector = selector.replace(/\r\n/g, "\n");
  const start = normalizedCss.indexOf(normalizedSelector);
  const end = normalizedCss.indexOf("\n}", start);

  if (start < 0 || end < 0) {
    throw new Error(`Missing ${selector} theme scope`);
  }

  return normalizedCss.slice(start, end);
}

const LIGHT_THEME = themeScope(':root[data-theme="light"]');
const DARK_THEME = themeScope(':root,\n:root[data-theme="dark"]');
const ROOT_SCOPE = themeScope(":root {");

// Interior surfaces where status text, badges, and chips actually render.
const LIGHT_SURFACES = {
  canvas: "#d4d7da",
  toolbar: "#d5d9dc",
  muted: "#d8dbde",
  accent: "#c8d4e0",
  panel: "#e0e2e3",
  popover: "#e4e5e5",
};

// Surfaces a focus indicator can sit against, including outer chrome.
const RING_ADJACENT_LIGHT = ["#c9cdd1", ...Object.values(LIGHT_SURFACES)];
const RING_ADJACENT_DARK = [
  "#111315",
  "#151719",
  "#1b1e21",
  "#202429",
  "#22262b",
  "#29313a",
];

describe("global color tokens", () => {
  it("keeps dark muted text at AA contrast on every shared solid surface", () => {
    const mutedForeground = readToken(DARK_THEME, "--muted-foreground");
    const sharedDarkSurfaces = [
      "#111315", // --background
      "#151719", // --surface / shell
      "#171a1d", // --surface-muted / field
      "#1b1e21", // --card / panel
      "#202429", // --popover / muted
      "#22262b", // --secondary
      "#242a31", // --surface-strong
      "#29313a", // --accent
    ];

    for (const background of sharedDarkSurfaces) {
      expect(
        contrastRatio(mutedForeground, background),
        `${mutedForeground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the light muted text token at AA contrast on shared light surfaces", () => {
    const mutedForeground = readToken(LIGHT_THEME, "--muted-foreground");

    for (const background of Object.values(LIGHT_SURFACES)) {
      expect(
        contrastRatio(mutedForeground, background),
        `${mutedForeground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps light solid-fill foregrounds at AA contrast, including /90 hovers", () => {
    const fills: Array<[string, string]> = [
      ["--primary", "--primary-foreground"],
      ["--active", "--active-foreground"],
      ["--positive", "--positive-foreground"],
      ["--destructive", "--destructive-foreground"],
      ["--critical", "--critical-foreground"],
    ];

    for (const [fillToken, foregroundToken] of fills) {
      const fill = readToken(LIGHT_THEME, fillToken);
      const foreground = readToken(LIGHT_THEME, foregroundToken);
      const hovered = alphaBlend(fill, 0.9, LIGHT_SURFACES.popover);

      expect(
        contrastRatio(foreground, fill),
        `${foregroundToken} on ${fillToken}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(foreground, hovered),
        `${foregroundToken} on ${fillToken}/90 over popover`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps light status text tokens at AA contrast on interior surfaces and tinted chips", () => {
    const statusTokens: Array<[string, number | null]> = [
      ["--primary", 0.1], // default badge fill is bg-primary/10
      ["--destructive", 0.1],
      ["--critical", 0.1],
      ["--warning-text", 0.09],
      ["--success-text", 0.1],
      ["--info-text", 0.1],
      ["--positive", null],
    ];

    for (const [token, tintAlpha] of statusTokens) {
      const foreground = readToken(LIGHT_THEME, token);

      for (const [surfaceName, surface] of Object.entries(LIGHT_SURFACES)) {
        expect(
          contrastRatio(foreground, surface),
          `${token} on ${surfaceName}`,
        ).toBeGreaterThanOrEqual(4.5);

        if (tintAlpha !== null) {
          const tintedFill =
            token === "--warning-text"
              ? composite(
                  readColorToken(LIGHT_THEME, "--warning-surface"),
                  surface,
                )
              : token === "--success-text"
                ? composite(
                    readColorToken(LIGHT_THEME, "--success-surface"),
                    surface,
                  )
                : token === "--info-text"
                  ? composite(
                      readColorToken(LIGHT_THEME, "--info-surface"),
                      surface,
                    )
                  : alphaBlend(foreground, tintAlpha, surface);

          expect(
            contrastRatio(foreground, tintedFill),
            `${token} on tinted fill over ${surfaceName}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps the focus ring at 3:1 non-text contrast against adjacent surfaces in both themes", () => {
    const lightRing = readColorToken(LIGHT_THEME, "--ring");
    const darkRing = readColorToken(DARK_THEME, "--ring");

    for (const background of RING_ADJACENT_LIGHT) {
      expect(
        contrastRatio(composite(lightRing, background), background),
        `light ${lightRing} next to ${background}`,
      ).toBeGreaterThanOrEqual(3);
    }

    for (const background of RING_ADJACENT_DARK) {
      expect(
        contrastRatio(composite(darkRing, background), background),
        `dark ${darkRing} next to ${background}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("renders owned primitives with a full-strength focus ring", () => {
    for (const [name, source] of [
      ["button.tsx", buttonSource],
      ["badge.tsx", badgeSource],
    ] as const) {
      expect(
        source,
        `${name} should use focus-visible:ring-2 focus-visible:ring-ring`,
      ).toContain("focus-visible:ring-2 focus-visible:ring-ring");
      expect(
        source,
        `${name} should not dilute the ring with opacity`,
      ).not.toMatch(/focus-visible:ring-(?:ring|destructive)\/\d/);
    }
  });

  it("keeps dark status tokens at AA contrast so light fixes never regress dark", () => {
    const darkSurfaces = Object.values({
      background: "#111315",
      surface: "#151719",
      field: "#171a1d",
      card: "#1b1e21",
      popover: "#202429",
      secondary: "#22262b",
      strong: "#242a31",
      accent: "#29313a",
    });
    const statusScopes: Array<[string, ReadonlySet<string>]> = [
      ["--muted-foreground", new Set()],
      ["--destructive", new Set()],
      ["--critical", new Set()],
      ["--positive", new Set()],
      // Accent and surface-strong are transient hover fills; static
      // text-primary never renders on them.
      ["--primary", new Set(["#29313a", "#242a31"])],
    ];

    for (const [token, excluded] of statusScopes) {
      const foreground = readToken(DARK_THEME, token);

      for (const background of darkSurfaces) {
        if (excluded.has(background)) {
          continue;
        }

        expect(
          contrastRatio(foreground, background),
          `dark ${token} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    const softTextOnTint: Array<[string, string]> = [
      ["--warning-text", "--warning-surface"],
      ["--success-text", "--success-surface"],
      ["--info-text", "--info-surface"],
    ];

    for (const [textToken, surfaceToken] of softTextOnTint) {
      const foreground = readToken(DARK_THEME, textToken);
      const tintedSurface = readColorToken(DARK_THEME, surfaceToken);

      for (const background of ["#1b1e21", "#202429"]) {
        expect(
          contrastRatio(foreground, composite(tintedSurface, background)),
          `dark ${textToken} on ${surfaceToken} over ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("semantic status token separation", () => {
  // Success and info were byte-identical in both themes (one steel-blue
  // family), collapsing ready/success callouts into informational ones.
  // These pins keep every status family on its own hue with AA-readable
  // text, matching the contract documented in globals.css.
  function channelTriplet(hex: string): [number, number, number] {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
  }

  function assertHueDominance(
    themeName: string,
    token: string,
    hex: string,
    dominant: "red" | "green" | "blue",
  ): void {
    const [red, green, blue] = channelTriplet(hex);
    const channels = { red, green, blue };

    for (const [channel, value] of Object.entries(channels)) {
      if (channel === dominant) {
        continue;
      }

      expect(
        channels[dominant] - value,
        `${themeName} ${token} (${hex}) must stay ${dominant}-dominant`,
      ).toBeGreaterThanOrEqual(12);
    }
  }

  const STATUS_SURFACES_DARK = [
    "#111315",
    "#151719",
    "#171a1d",
    "#1b1e21",
    "#202429",
    "#22262b",
    "#242a31",
    "#29313a",
  ];

  it("never lets success duplicate the info family in either theme", () => {
    for (const [themeName, scope] of [
      ["dark", DARK_THEME],
      ["light", LIGHT_THEME],
    ] as const) {
      for (const part of ["border", "surface", "text"] as const) {
        expect(
          readColorToken(scope, `--success-${part}`),
          `${themeName} --success-${part} must not duplicate --info-${part}`,
        ).not.toBe(readColorToken(scope, `--info-${part}`));
      }
    }

    // Exact pins guard the agreed restrained palette (sage green, no neon).
    expect(readToken(DARK_THEME, "--success-text")).toBe("#96c4a0");
    expect(readColorToken(DARK_THEME, "--success-surface")).toBe(
      "rgba(150, 196, 160, 0.12)",
    );
    expect(readColorToken(DARK_THEME, "--success-border")).toBe(
      "rgba(150, 196, 160, 0.4)",
    );
    expect(readToken(LIGHT_THEME, "--success-text")).toBe("#28563a");
    expect(readColorToken(LIGHT_THEME, "--success-surface")).toBe(
      "rgba(40, 86, 58, 0.1)",
    );
    expect(readColorToken(LIGHT_THEME, "--success-border")).toBe(
      "rgba(40, 86, 58, 0.34)",
    );
  });

  it("keeps each status family on its own hue channel", () => {
    const hueRoles: Array<[string, "red" | "green" | "blue"]> = [
      ["--success-text", "green"],
      ["--positive", "green"],
      ["--info-text", "blue"],
      ["--warning-text", "red"],
      ["--destructive", "red"],
      ["--critical", "red"],
    ];

    for (const [themeName, scope] of [
      ["dark", DARK_THEME],
      ["light", LIGHT_THEME],
    ] as const) {
      for (const [token, dominant] of hueRoles) {
        assertHueDominance(themeName, token, readToken(scope, token), dominant);
      }
    }
  });

  it("keeps the five status text tokens mutually distinct in both themes", () => {
    const statusTokens = [
      "--success-text",
      "--info-text",
      "--warning-text",
      "--destructive",
      "--critical",
    ];

    for (const [themeName, scope] of [
      ["dark", DARK_THEME],
      ["light", LIGHT_THEME],
    ] as const) {
      const values = statusTokens.map((token) => readToken(scope, token));

      expect(
        new Set(values).size,
        `${themeName} status tokens must not collapse into one value`,
      ).toBe(statusTokens.length);
    }
  });

  it("keeps success callout text at AA contrast on shared surfaces and its own tint in both themes", () => {
    const cases: Array<[string, string, readonly string[], number]> = [
      ["dark", DARK_THEME, STATUS_SURFACES_DARK, 0.12],
      ["light", LIGHT_THEME, Object.values(LIGHT_SURFACES), 0.1],
    ];

    for (const [themeName, scope, surfaces, tintAlpha] of cases) {
      const text = readToken(scope, "--success-text");
      const [red, green, blue] = channelTriplet(text);
      const tint = `rgba(${red}, ${green}, ${blue}, ${tintAlpha})`;

      for (const background of surfaces) {
        expect(
          contrastRatio(text, background),
          `${themeName} --success-text on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(text, composite(tint, background)),
          `${themeName} --success-text on success tint over ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("aligns the ready/positive accent with the success family at AA fill contrast", () => {
    // Every --positive consumer expresses success/ready semantics
    // (submitted/interview/offer/ready badges, safeguard-clear callouts,
    // positive timeline events); selected/active styling stays on
    // --primary/--active. The accent therefore shares the success sage
    // family instead of duplicating the primary blue one.
    expect(readToken(DARK_THEME, "--positive")).toBe("#96c4a0");
    expect(readToken(LIGHT_THEME, "--positive")).toBe("#28563a");

    for (const [themeName, scope] of [
      ["dark", DARK_THEME],
      ["light", LIGHT_THEME],
    ] as const) {
      const fill = readToken(scope, "--positive");
      const foreground = readToken(scope, "--positive-foreground");
      const hovered = alphaBlend(fill, 0.9, LIGHT_SURFACES.popover);

      for (const other of [
        readToken(scope, "--info-text"),
        readToken(scope, "--warning-text"),
        readToken(scope, "--destructive"),
        readToken(scope, "--critical"),
      ]) {
        expect(fill, `${themeName} --positive must not duplicate ${other}`).not
          .toBe(other);
      }

      expect(
        contrastRatio(foreground, fill),
        `${themeName} --positive-foreground on --positive`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(foreground, hovered),
        `${themeName} --positive-foreground on --positive/90 over popover`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("keyboard focus ring discipline", () => {
  // Tailwind compiles ring-ring/30 and ring-ring/40 to
  // `--tw-ring-color: color-mix(in oklab, var(--ring) 30%, transparent)`
  // inside the utilities layer; those composite to ~1.5-1.9:1 against the
  // interior surfaces. The unlayered rule below re-asserts the established
  // token at full strength at focus time (that token is pinned above 3:1
  // by "keeps the focus ring at 3:1 non-text contrast...").
  function focusRingEnforcement(): RegExpMatchArray | null {
    return globalsCss.match(
      /\[class\*="ring-ring"\]\)\s*:\s*is\(:focus-visible,\s*:focus-within\)\s*\{(?<body>[^}]*)\}/,
    );
  }

  it("keeps ring-ring focus states bound to the full-strength ring token", () => {
    expect(
      focusRingEnforcement(),
      "globals.css must force ring-ring focus states to var(--ring)",
    ).not.toBeNull();
  });

  it("enforces the ring color without diluting it again", () => {
    const body = focusRingEnforcement()?.groups?.body ?? "";

    expect(body).toMatch(/^\s*--tw-ring-color:\s*var\(--ring\);\s*$/);
    expect(
      body,
      "the override must stay layer-beating, not !important",
    ).not.toMatch(/!important/);
    expect(
      body,
      "the override must not re-introduce an alpha-diluted ring color",
    ).not.toMatch(/color-mix|rgba?\(|\/\d+/);
  });
});

describe("editable field versus read-only well tokens", () => {
  it("preserves the read-only well colors exactly in both themes", () => {
    expect(readToken(DARK_THEME, "--surface-well")).toBe("#171a1d");
    expect(readToken(DARK_THEME, "--surface-well-border")).toBe("#3a4148");
    expect(readToken(LIGHT_THEME, "--surface-well")).toBe("#d9dcde");
    expect(readToken(LIGHT_THEME, "--surface-well-border")).toBe("#afb6bc");
  });

  it("keeps the editable field fill while raising its resting boundary", () => {
    expect(readToken(DARK_THEME, "--field")).toBe("#171a1d");
    expect(readToken(LIGHT_THEME, "--field")).toBe("#d9dcde");
    expect(readToken(DARK_THEME, "--field-border")).toBe("#515a64");
    expect(readToken(LIGHT_THEME, "--field-border")).toBe("#8b939c");

    // The stronger resting boundary must stay quieter than the focus
    // indicator so focus remains the strongest field state.
    expect(readToken(DARK_THEME, "--field-focus-border")).toBe("#7d91ad");
    expect(readToken(LIGHT_THEME, "--field-focus-border")).toBe("#3a5274");
  });

  it("decouples the focused field fill from card and popover surfaces", () => {
    for (const theme of [DARK_THEME, LIGHT_THEME]) {
      const focusedFill = readToken(theme, "--field-strong");

      expect(focusedFill).not.toBe(readToken(theme, "--card"));
      expect(focusedFill).not.toBe(readToken(theme, "--popover"));
      expect(
        contrastRatio(readToken(theme, "--foreground"), focusedFill),
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(readToken(DARK_THEME, "--field-strong")).toBe("#242a31");
    expect(readToken(LIGHT_THEME, "--field-strong")).toBe("#e9ebec");
  });
});

describe("global typography sources", () => {
  it("ships zero remote font imports so the renderer makes no font network requests", () => {
    expect(globalsCss).not.toMatch(/@import\s+url\(/i);
    expect(globalsCss).not.toMatch(/https?:\/\//i);
    expect(globalsCss).toMatch(/@import\s+"tailwindcss"/);
  });

  it("resolves body and headline through native sans stacks with platform fallbacks", () => {
    for (const token of ["--font-body", "--font-headline"]) {
      const stack = readDeclaration(ROOT_SCOPE, token);

      expect(stack, `${token} needs a macOS native face`).toContain(
        "-apple-system",
      );
      expect(stack, `${token} needs the Chromium native face`).toContain(
        "BlinkMacSystemFont",
      );
      expect(stack, `${token} needs a Windows native face`).toContain(
        '"Segoe UI"',
      );
      expect(stack, `${token} must end in the sans generic`).toMatch(
        /sans-serif$/,
      );
      expect(stack, `${token} must not reference remote families`).not.toMatch(
        /IBM Plex|Inter|\bArial\b/i,
      );
    }

    expect(readDeclaration(ROOT_SCOPE, "--font-body")).toBe(
      readDeclaration(ROOT_SCOPE, "--font-headline"),
    );
  });

  it("resolves mono through a native monospace stack covering macOS, Windows, and Linux", () => {
    const stack = readDeclaration(ROOT_SCOPE, "--font-mono");

    expect(stack).toContain('"SFMono-Regular"');
    expect(stack).toContain("Menlo");
    expect(stack).toContain("Consolas");
    expect(stack).toContain('"Liberation Mono"');
    expect(stack.endsWith("monospace")).toBe(true);
    expect(stack).not.toMatch(/IBM Plex/i);
    expect(stack).not.toBe(readDeclaration(ROOT_SCOPE, "--font-body"));
  });

  it("keeps body, headline, and mono consumers bound to the shared variables", () => {
    expect(globalsCss).toMatch(
      /body\s*\{[^}]*font-family:\s*var\(--font-body\)/,
    );
    expect(globalsCss).toMatch(
      /\bh1\s*\{[^}]*font-family:\s*var\(--font-headline\)/,
    );
    expect(globalsCss).toMatch(
      /\bh2\s*\{[^}]*font-family:\s*var\(--font-headline\)/,
    );
    expect(globalsCss).toMatch(
      /\.label-mono-xs\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
    );
    expect(globalsCss).toMatch(
      /\.card-heading-sm\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
    );
    expect(globalsCss).toMatch(/--font-sans:\s*var\(--font-body\)/);
    expect(globalsCss).toMatch(/--font-display:\s*var\(--font-headline\)/);
    expect(globalsCss).toMatch(/--font-mono:\s*var\(--font-mono\)/);
  });
});

describe("page header grammar tokens", () => {
  it("defines the shared header stack spacing contract once", () => {
    expect(readDeclaration(DARK_THEME, "--gap-page-header-aux")).toBe("0.5rem");
    expect(readDeclaration(DARK_THEME, "--gap-page-header-body")).toBe(
      "0.75rem",
    );
  });

  it("binds the page title and description type to existing tokens", () => {
    for (const token of [
      "--text-page-title-compact",
      "--text-page-description-compact",
      "--tracking-page-title-compact",
    ]) {
      expect(readDeclaration(DARK_THEME, token), token).toBeTruthy();
    }
  });
});

describe("shell grid breakpoint contract", () => {
  // The shell component hides the compact route strip and shows the sidebar
  // through min-[1440px] Tailwind variants, while the grid itself switches
  // through these media queries. The stale [1120,1440) regime (grid wide at
  // 1120, variants wide at 1440) collapsed the compact route strip to ~8px
  // at native 125% zoom (physical 1440 -> CSS 1152); these pins keep the
  // two sides from drifting apart again.
  function shellGridMediaQueries(): string[] {
    return Array.from(
      globalsCss.matchAll(/@media([^{]+)\{\s*\.job-finder-shell-grid/g),
    )
      .map((match) => match[1]?.trim())
      .filter((query): query is string => query !== undefined);
  }

  it("keeps exactly two shell-grid bands partitioned at the 1440/1439 CSS px bound", () => {
    expect(shellGridMediaQueries()).toEqual([
      "(min-width: 1440px)",
      "(min-width: 640px) and (max-width: 1439px)",
    ]);
  });

  it("keeps every desktop shell breakpoint variant on the same 1440px bound", () => {
    const desktopVariants = [
      ...new Set(
        Array.from(shellSource.matchAll(/min-\[(\d+)px\]:/g)).map((match) =>
          Number(match[1]),
        ),
      ),
    ].filter((pixels) => pixels >= 1024);

    expect(desktopVariants).toEqual([1440]);
  });

  it("never resurrects the stale 1120/1119px shell-grid bounds", () => {
    expect(globalsCss).not.toMatch(/(?:min-width|max-width):\s*11(?:20|19)px/);
  });
});
