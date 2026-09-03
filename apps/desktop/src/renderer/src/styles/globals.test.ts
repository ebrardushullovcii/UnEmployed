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

const labelSource = readFileSync(
  new URL("../components/ui/label.tsx", import.meta.url),
  "utf8",
);
const chipSource = readFileSync(
  new URL("../components/ui/chip.tsx", import.meta.url),
  "utf8",
);
const textLinkSource = readFileSync(
  new URL("../components/ui/text-link.tsx", import.meta.url),
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
  canvas: "#e6e8eb",
  toolbar: "#e2e5e9",
  muted: "#e8eaed",
  accent: "#d3dde9",
  panel: "#f6f7f8",
  popover: "#fbfbfc",
};

// Surfaces a focus indicator can sit against, including outer chrome.
const RING_ADJACENT_LIGHT = ["#dfe2e6", ...Object.values(LIGHT_SURFACES)];
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

  it("keeps dark solid-fill foregrounds at AA contrast, including /90 hovers", () => {
    const fills: Array<[string, string]> = [
      ["--primary", "--primary-foreground"],
      ["--active", "--active-foreground"],
      ["--positive", "--positive-foreground"],
      ["--destructive", "--destructive-foreground"],
      ["--critical", "--critical-foreground"],
    ];

    for (const [fillToken, foregroundToken] of fills) {
      const fill = readToken(DARK_THEME, fillToken);
      const foreground = readToken(DARK_THEME, foregroundToken);
      const hovered = alphaBlend(fill, 0.9, "#1b1e21");

      expect(
        contrastRatio(foreground, fill),
        `dark ${foregroundToken} on ${fillToken}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(foreground, hovered),
        `dark ${foregroundToken} on ${fillToken}/90 over card`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the dark filled primary readable as a filled control, not a disabled chip", () => {
    // Dogfood round two: the dark "primary" CTA sat close enough to the
    // panels and to --secondary that reviewers read Approve resume /
    // Prepare application / Finish in the open browser as disabled.
    // The fill itself must therefore clear the AA text floor against the
    // surfaces it renders on, and stay clearly separated from the
    // secondary chip that sits beside it.
    const primary = readToken(DARK_THEME, "--primary");
    const secondary = readToken(DARK_THEME, "--secondary");
    const carrierSurfaces = [
      "#1b1e21", // --card / --surface-panel
      "#151719", // --surface
      "#202429", // --popover
      "#22262b", // --secondary
      "#242a31", // --surface-strong (studio next-step bar)
    ];

    for (const background of carrierSurfaces) {
      expect(
        contrastRatio(primary, background),
        `dark --primary fill on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(
      contrastRatio(primary, secondary),
      "dark --primary must not read as the secondary chip",
    ).toBeGreaterThanOrEqual(4.5);

    // Restrained steel family: keep the blue channel leading without
    // drifting into a saturated neon accent.
    const [red, green, blue] = [1, 3, 5].map((offset) =>
      Number.parseInt(primary.slice(offset, offset + 2), 16),
    ) as [number, number, number];

    expect(blue, "primary stays blue-led").toBeGreaterThan(green);
    expect(green, "primary stays blue-led").toBeGreaterThan(red);
    expect(
      blue - red,
      "primary stays a restrained steel, not neon",
    ).toBeLessThanOrEqual(70);
  });

  it("keeps light status text tokens at AA contrast on interior surfaces and tinted chips", () => {
    const statusTokens: Array<[string, number | null]> = [
      ["--primary", 0.15], // default badge fill is bg-primary/15
      ["--destructive", 0.15],
      ["--critical", 0.15],
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

  it("keeps the selected sidebar destination distinguishable from the rail in both themes", () => {
    // Round-three review measured the light active row at rgb(227,229,233)
    // against a rgb(230,233,235) rail: a ~1% delta, so only a 2px bar told the
    // user which page they were on. The selected fill now owns the state.
    for (const [themeName, scope, canvas] of [
      ["light", LIGHT_THEME, "#e6e8eb"],
      ["dark", DARK_THEME, "#111315"],
    ] as const) {
      const rail = composite(
        readColorToken(scope, "--shell-header-bg"),
        canvas,
      );
      const surface = readColorToken(scope, "--nav-active-surface");
      const foreground = readColorToken(scope, "--nav-active-foreground");
      const bar = readColorToken(scope, "--nav-active-bar");

      expect(
        contrastRatio(surface, rail),
        `${themeName} --nav-active-surface against the sidebar rail`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(foreground, surface),
        `${themeName} --nav-active-foreground on the selected fill`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(bar, surface),
        `${themeName} --nav-active-bar against the selected fill`,
      ).toBeGreaterThanOrEqual(3);
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
        expect(
          fill,
          `${themeName} --positive must not duplicate ${other}`,
        ).not.toBe(other);
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
    expect(readToken(LIGHT_THEME, "--surface-well")).toBe("#eef0f2");
    expect(readToken(LIGHT_THEME, "--surface-well-border")).toBe("#b1b8bf");
  });

  it("keeps the editable field fill while raising its resting boundary", () => {
    expect(readToken(DARK_THEME, "--field")).toBe("#171a1d");
    expect(readToken(LIGHT_THEME, "--field")).toBe("#fcfcfd");
    expect(readToken(DARK_THEME, "--field-border")).toBe("#677480");
    expect(readToken(LIGHT_THEME, "--field-border")).toBe("#8a939c");

    // The stronger resting boundary must stay quieter than the focus
    // indicator so focus remains the strongest field state.
    expect(readToken(DARK_THEME, "--field-focus-border")).toBe("#8aa0bf");
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
    expect(readToken(LIGHT_THEME, "--field-strong")).toBe("#ffffff");
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

describe("cascade layer discipline", () => {
  // An unlayered rule beats every layered rule regardless of specificity, so a
  // bare `h1 { font-size: … }` written outside a layer outranks the
  // `text-(length:--text-page-title-compact)` utility a page title carries.
  // That is what forced an `!` important modifier onto the Resume Studio
  // title. Element defaults must stay inside `@layer base`.
  function stripCssComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
  }

  interface CssBlock {
    prelude: string;
    body: string;
  }

  function readBlocks(source: string): CssBlock[] {
    const blocks: CssBlock[] = [];
    let prelude = "";
    let index = 0;

    while (index < source.length) {
      const character = source[index];

      if (character === ";") {
        prelude = "";
        index += 1;
        continue;
      }

      if (character !== "{") {
        prelude += character;
        index += 1;
        continue;
      }

      let depth = 1;
      let cursor = index + 1;

      while (cursor < source.length && depth > 0) {
        if (source[cursor] === "{") {
          depth += 1;
        } else if (source[cursor] === "}") {
          depth -= 1;
        }
        cursor += 1;
      }

      blocks.push({
        prelude: prelude.trim(),
        body: source.slice(index + 1, cursor - 1),
      });
      prelude = "";
      index = cursor;
    }

    return blocks;
  }

  const skippedAtRules = new Set(["@layer", "@keyframes", "@theme"]);

  function collectUnlayeredSelectors(source: string): string[] {
    const selectors: string[] = [];

    for (const block of readBlocks(source)) {
      if (block.prelude.startsWith("@")) {
        const atRule = block.prelude.split(/[\s(]/)[0] ?? "";

        if (!skippedAtRules.has(atRule)) {
          selectors.push(...collectUnlayeredSelectors(block.body));
        }

        continue;
      }

      if (block.prelude.length === 0) {
        continue;
      }

      selectors.push(
        ...block.prelude
          .split(",")
          .map((selector) => selector.trim())
          .filter((selector) => selector.length > 0),
      );
    }

    return selectors;
  }

  function readBaseLayerBody(source: string): string {
    return readBlocks(source)
      .filter((block) => block.prelude === "@layer base")
      .map((block) => block.body)
      .join("\n");
  }

  it("keeps every bare element rule inside a cascade layer", () => {
    const unlayeredElementSelectors = collectUnlayeredSelectors(
      stripCssComments(globalsCss),
    ).filter((selector) => /^[a-zA-Z]/.test(selector));

    expect(
      unlayeredElementSelectors,
      "element rules outside a layer beat every Tailwind utility; move them into @layer base",
    ).toEqual([]);
  });

  it("keeps the heading and document defaults in @layer base", () => {
    const baseLayer = readBaseLayerBody(stripCssComments(globalsCss));

    for (const selector of ["html,", "body {", "h1 {", "h2 {", "strong {"]) {
      expect(baseLayer, `${selector} must live in @layer base`).toContain(
        selector,
      );
    }
  });

  it("keeps the page-title utilities free of important modifiers", () => {
    const resumeWorkspaceHeaderSource = readFileSync(
      new URL(
        "../features/job-finder/screens/review-queue/resume-workspace-header.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(resumeWorkspaceHeaderSource).toContain(
      "text-(length:--text-page-title-compact)",
    );
    expect(
      resumeWorkspaceHeaderSource,
      "the studio title must not need an important modifier to beat the base layer",
    ).not.toContain("text-(length:--text-page-title-compact)!");
  });
});

/**
 * The published type scale.
 *
 * Before this contract existed only h1 and h2 carried a size, so h3-h6 fell
 * through Tailwind preflight's `font-size: inherit` and rendered at whatever
 * their container happened to be: H2 appeared at 12 distinct sizes and H3 at
 * 9, with confirmed level inversions on Settings, Studio, Safeguards,
 * Shortlisted, Find jobs, Applications and Profile. Fields inherited the same
 * way and rendered at 17-19px against 11px labels.
 */
describe("published type scale", () => {
  function readRem(token: string): number {
    const value = readDeclaration(DARK_THEME, token);
    const rem = value.match(/^([\d.]+)rem$/)?.[1];
    const px = value.match(/^([\d.]+)px$/)?.[1];

    if (rem !== undefined) {
      return Number(rem) * 16;
    }

    if (px !== undefined) {
      return Number(px);
    }

    throw new Error(`${token} is not a plain rem/px length: ${value}`);
  }

  it("keeps the heading levels strictly monotonic", () => {
    const h1 = readRem("--text-heading-1");
    const h2 = readRem("--text-heading-2");
    const h3 = readRem("--text-heading-3");
    const h4 = readRem("--text-heading-4");

    expect(h1).toBeGreaterThan(h2);
    expect(h2).toBeGreaterThan(h3);
    expect(h3).toBeGreaterThan(h4);
    expect([h1, h2, h3, h4]).toEqual([24, 19, 16, 14]);
  });

  it("renders field content at body size", () => {
    expect(readDeclaration(DARK_THEME, "--text-field")).toBe(
      "var(--text-body)",
    );
    expect(readRem("--text-body")).toBeCloseTo(14.72, 5);
  });

  it("gives every heading level an explicit size and weight in @layer base", () => {
    const baseLayer = globalsCss
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("@layer base {")
      .slice(1)
      .join("\n");

    for (const [selector, token] of [
      ["h1", "--text-heading-1"],
      ["h2", "--text-heading-2"],
      ["h3", "--text-heading-3"],
      ["h4,\n  h5,\n  h6", "--text-heading-4"],
    ] as const) {
      const rule = baseLayer.match(
        new RegExp(`(?:^|\\n)  ${selector} \\{([^}]*)\\}`),
      )?.[1];

      expect(rule, `${selector} must be declared in @layer base`).toBeTruthy();
      expect(rule).toContain(`font-size: var(${token})`);
      expect(rule).toContain("font-weight: 600");
    }

    const paragraphRules = [
      ...baseLayer.matchAll(/(?:^|\n) {2}p \{([^}]*)\}/g),
    ].map((match) => match[1] ?? "");

    expect(
      paragraphRules.some((rule) =>
        rule.includes("font-size: var(--text-body)"),
      ),
      "p must carry the body size in @layer base",
    ).toBe(true);
  });

  it("pins field size instead of letting `font: inherit` pull the parent size", () => {
    const fieldRule = globalsCss.match(
      /\n {2}input,\n {2}select,\n {2}textarea \{([^}]*)\}/,
    )?.[1];

    expect(fieldRule, "fields need their own base rule").toBeTruthy();
    expect(fieldRule).toContain("font-size: var(--text-field)");
    expect(
      globalsCss,
      "fields must no longer take their size from the parent",
    ).not.toContain("  input,\n  select,\n  textarea {\n    font: inherit;");
  });

  it("keeps the page title fixed rather than viewport-derived", () => {
    // A vw-derived clamp made the title land on a different size per route
    // (24 vs 24.5), so it visibly shifted while navigating.
    const pageTitle = readDeclaration(DARK_THEME, "--text-page-title-compact");

    expect(pageTitle).toBe("var(--text-heading-1)");
    expect(pageTitle).not.toContain("vw");
  });

  it("holds every label-family token at the 11px floor", () => {
    for (const token of [
      "--text-eyebrow",
      "--text-field-label",
      "--text-label",
      "--text-tiny",
      "--text-label-mono-xs",
      "--text-card-heading-sm",
      "--text-count",
    ]) {
      expect(readRem(token), token).toBeGreaterThanOrEqual(11);
    }
  });

  it("keeps owned primitives off literal font sizes", () => {
    for (const [name, source] of [
      ["label", labelSource],
      ["badge", badgeSource],
      ["chip", chipSource],
    ] as const) {
      expect(source, `${name} must use a scale token`).not.toMatch(
        /text-\[\d+px\]/,
      );
    }

    expect(labelSource).toContain("text-(length:--text-field-label)");
  });

  it("never lets an unlayered rule set a font size", () => {
    // An unlayered rule beats every Tailwind utility, so a bare font-size
    // outside a layer cannot be overridden by the component that owns the
    // element.
    const withoutLayers = globalsCss
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@layer\s+\w+\s*\{[\s\S]*?\n\}/g, "");

    expect(withoutLayers).not.toContain("font-size:");
  });
});

/**
 * Secondary and outline controls have no fill difference from the surface they
 * sit on, so their border is the entire boundary and has to clear the WCAG
 * 2.4.11 3:1 non-text floor. It previously sat at 2.48:1 on a light panel,
 * 2.15:1 on the light canvas and 2.90:1 in dark.
 */
describe("control boundary contrast", () => {
  const DARK_INTERIOR = ["#1b1e21", "#111315", "#22262b", "#202429", "#151719"];
  const LIGHT_INTERIOR = [
    "#f6f7f8",
    "#e6e8eb",
    "#e2e5e9",
    "#fbfbfc",
    "#eceef1",
  ];

  it("clears 3:1 for the control boundary on every interior surface", () => {
    for (const [theme, surfaces] of [
      [DARK_THEME, DARK_INTERIOR],
      [LIGHT_THEME, LIGHT_INTERIOR],
    ] as const) {
      const border = readToken(theme, "--border-strong");

      for (const surface of surfaces) {
        expect(contrastRatio(border, surface), surface).toBeGreaterThanOrEqual(
          3,
        );
      }
    }
  });

  it("publishes the control token as the single alias of that boundary", () => {
    for (const theme of [DARK_THEME, LIGHT_THEME]) {
      expect(readDeclaration(theme, "--control-border")).toBe(
        "var(--border-strong)",
      );
    }
  });

  it("routes outline and secondary buttons through the control token", () => {
    expect(buttonSource).toContain("outline:");
    expect(buttonSource).toMatch(
      /outline:\s*\n?\s*"border border-\(--control-border\)/,
    );
    expect(buttonSource).toMatch(
      /secondary:\s*\n?\s*"border border-\(--control-border\)/,
    );
    expect(
      buttonSource,
      "panel chrome is not a control boundary",
    ).not.toContain("border-(--surface-panel-border)");
  });

  it("keeps inert chrome quieter than the control boundary", () => {
    for (const [theme, surface] of [
      [DARK_THEME, "#1b1e21"],
      [LIGHT_THEME, "#f6f7f8"],
    ] as const) {
      const control = contrastRatio(
        readToken(theme, "--border-strong"),
        surface,
      );

      for (const token of [
        "--surface-panel-border",
        "--surface-well-border",
        "--border-subtle",
      ]) {
        expect(
          contrastRatio(readToken(theme, token), surface),
          token,
        ).toBeLessThan(control);
      }
    }
  });
});

/**
 * A disabled control used to keep the enabled `secondary` fill and differ only
 * by a label colour step to `--muted-foreground` - the app's ordinary
 * secondary text colour - so disabled `Add note` was pixel identical to an
 * enabled `Save` beside it.
 */
describe("disabled control state", () => {
  it("drops the fill instead of reusing an enabled surface", () => {
    for (const theme of [DARK_THEME, LIGHT_THEME]) {
      expect(readDeclaration(theme, "--disabled-surface")).toBe("transparent");
    }
  });

  it("never marks disabled with a body-text colour", () => {
    for (const theme of [DARK_THEME, LIGHT_THEME]) {
      const disabled = readToken(theme, "--disabled-foreground");

      expect(disabled).not.toBe(readToken(theme, "--muted-foreground"));
      expect(disabled).not.toBe(readToken(theme, "--foreground"));
      expect(disabled).not.toBe(readToken(theme, "--foreground-soft"));
    }
  });

  it("keeps the disabled label legible on the surfaces it renders on", () => {
    for (const [theme, surfaces] of [
      [DARK_THEME, ["#1b1e21", "#111315", "#202429"]],
      [LIGHT_THEME, ["#f6f7f8", "#e6e8eb", "#fbfbfc"]],
    ] as const) {
      const disabled = readToken(theme, "--disabled-foreground");

      for (const surface of surfaces) {
        expect(
          contrastRatio(disabled, surface),
          `${disabled} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("binds the button disabled treatment to the disabled tokens", () => {
    for (const state of ["disabled", "aria-disabled"]) {
      expect(buttonSource).toContain(`${state}:bg-(--disabled-surface)`);
      expect(buttonSource).toContain(`${state}:text-(--disabled-foreground)`);
      expect(buttonSource).toContain(`${state}:border-(--disabled-border)`);
    }

    expect(buttonSource).not.toContain("disabled:bg-secondary");
    expect(buttonSource).not.toContain("disabled:text-muted-foreground");
  });
});

/**
 * Text-only controls were links by hue alone at 1.94:1 (light) and 1.32:1
 * (dark) against adjacent body text, and two link idioms coexisted. Hue can
 * never be the sole carrier at those ratios, so the underline is always
 * painted.
 */
describe("link affordance", () => {
  it("always paints the underline rather than revealing it on hover", () => {
    const linkVariant = buttonSource.match(/link: "([^"]*)"/)?.[1];

    expect(linkVariant).toBeTruthy();
    expect(linkVariant).toContain("underline");
    expect(linkVariant).not.toContain("hover:underline");
    expect(textLinkSource).toContain("underline decoration-from-font");
    expect(textLinkSource).not.toContain("hover:underline");
  });

  it("gives links their own token in both themes", () => {
    for (const theme of [DARK_THEME, LIGHT_THEME]) {
      expect(readToken(theme, "--link")).toBeTruthy();
      expect(readToken(theme, "--link-hover")).toBeTruthy();
    }
  });

  it("keeps link text at AA on the surfaces it renders on", () => {
    for (const [theme, surfaces] of [
      [DARK_THEME, ["#1b1e21", "#111315", "#202429"]],
      [LIGHT_THEME, ["#f6f7f8", "#e6e8eb", "#fbfbfc"]],
    ] as const) {
      for (const token of ["--link", "--link-hover"]) {
        const link = readToken(theme, token);

        for (const surface of surfaces) {
          expect(
            contrastRatio(link, surface),
            `${token} ${link} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

/**
 * Scrollbar thumbs were the only "there is more" cue on the screens that clip
 * content, and rendered at 1.61-1.66:1 in dark and 1.24-1.47:1 in light.
 */
describe("scrollbar visibility", () => {
  it("keeps the thumb at 3:1 against the surfaces it scrolls over", () => {
    for (const [theme, surfaces] of [
      [DARK_THEME, ["#111315", "#1b1e21", "#202429"]],
      [LIGHT_THEME, ["#e6e8eb", "#f6f7f8", "#fbfbfc"]],
    ] as const) {
      const thumb = readColorToken(theme, "--scrollbar-thumb");

      for (const surface of surfaces) {
        expect(
          contrastRatio(composite(thumb, surface), surface),
          `${thumb} on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

/**
 * Section dividers were invisible at 1x (light 1.42:1, dark 1.35:1) and are
 * the only separation between named sections.
 */
describe("divider visibility", () => {
  it("raises the divider tokens above the level they were invisible at", () => {
    for (const [theme, surface] of [
      [DARK_THEME, "#1b1e21"],
      [LIGHT_THEME, "#f6f7f8"],
    ] as const) {
      for (const token of ["--border-subtle", "--border"]) {
        expect(
          contrastRatio(readToken(theme, token), surface),
          `${token} on ${surface}`,
        ).toBeGreaterThanOrEqual(1.7);
      }
    }
  });
});
