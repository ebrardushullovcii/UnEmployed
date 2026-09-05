import { describe, expect, it } from "vitest";
import { normalizeTechnologyTokenSpacing } from "./tailoring";

/**
 * A keyword-matching ATS reads "ASP .NET Core" and "ASP.NET Core" as
 * different tokens, and the exported PDF carried both — the bullets one way,
 * the SKILLS block the other. This repair is typographic only: the grounding
 * comparison collapses every non-alphanumeric run to a single space, so the
 * repaired text stays exactly as supported by saved evidence as the text it
 * replaces.
 */
describe("normalizeTechnologyTokenSpacing", () => {
  it("closes a stray space before a dotted technology suffix", () => {
    expect(
      normalizeTechnologyTokenSpacing("Built services in ASP .NET Core."),
    ).toBe("Built services in ASP.NET Core.");
    expect(normalizeTechnologyTokenSpacing("Wrote Node .js tooling")).toBe(
      "Wrote Node.js tooling",
    );
  });

  it("opens a missing space after a comma in a technology list", () => {
    expect(normalizeTechnologyTokenSpacing("C#,.NET, and SQL")).toBe(
      "C#, .NET, and SQL",
    );
  });

  it("leaves ordinary prose and sentence-ending periods alone", () => {
    for (const value of [
      "Led a team of four engineers.",
      "Cut p95 latency by 38% across three services.",
      "Shipped features weekly. Reviewed every pull request.",
    ]) {
      expect(normalizeTechnologyTokenSpacing(value)).toBe(value);
    }
  });

  it("changes no word, only spacing, so the claim is untouched", () => {
    const before = "Migrated ASP .NET Core APIs to Azure,Kubernetes";
    const after = normalizeTechnologyTokenSpacing(before);

    expect(after).toBe("Migrated ASP.NET Core APIs to Azure, Kubernetes");
    expect(after.replace(/[^a-z0-9]+/gi, " ").trim()).toBe(
      before.replace(/[^a-z0-9]+/gi, " ").trim(),
    );
  });
});
