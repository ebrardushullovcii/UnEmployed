import { describe, expect, test } from "vitest";

import { stripScrapedGlyphs } from "./scraped-glyphs";

const PIN = String.fromCodePoint(0x1f4cd);
const SPARKLE = String.fromCodePoint(0x2728);
const FLAG = String.fromCodePoint(0x1f1e9) + String.fromCodePoint(0x1f1ea);
const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f);

describe("stripScrapedGlyphs", () => {
  test("removes a colour pin and the space it leaves", () => {
    expect(stripScrapedGlyphs(PIN + " Location: Berlin")).toBe(
      "Location: Berlin",
    );
    expect(
      stripScrapedGlyphs("Open the saved " + SPARKLE + " Jobs tab yourself."),
    ).toBe("Open the saved Jobs tab yourself.");
    expect(stripScrapedGlyphs("Remote " + FLAG + VARIATION_SELECTOR)).toBe(
      "Remote",
    );
  });

  test("keeps names written in any script", () => {
    // Cyrillic and Arabic employer names must survive untouched.
    expect(stripScrapedGlyphs("Научно-исследовательский институт")).toBe(
      "Научно-исследовательский институт",
    );
    expect(stripScrapedGlyphs("شركة الاتصالات السعودية")).toBe(
      "شركة الاتصالات السعودية",
    );
    expect(stripScrapedGlyphs("株式会社デンソー")).toBe("株式会社デンソー");
    expect(stripScrapedGlyphs("Αθήνα, Ελλάδα")).toBe("Αθήνα, Ελλάδα");
  });

  test("keeps a line that is nothing but glyphs rather than emptying it", () => {
    expect(stripScrapedGlyphs(PIN)).toBe(PIN);
  });
});
