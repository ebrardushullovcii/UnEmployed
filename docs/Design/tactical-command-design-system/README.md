# Design System Strategy: Tactical Command

## 1. Overview & Creative North Star
**The Creative North Star: "The Orchestrated Ops-Center"**

This design system is not a consumer-grade dashboard; it is a high-utility, supervised automation environment. It breaks from the "friendly SaaS" template by embracing **Instrumental Density**—a philosophy where information is treated as a critical asset rather than something to be hidden behind whitespace. 

The aesthetic is built on **Intentional Rigidity**. By utilizing sharp 0px corners and a strictly monochromatic base, we create an environment of absolute reliability. The "military-grade" feel is achieved through intentional asymmetry: large, authoritative display type balanced against hyper-dense terminal status blocks. This isn't just an app; it's a mission-critical console for the "UnEmployed" operator.

### Implementation Note

This document is strongest as a visual-direction reference, not as a literal shipped product voice guide.

- Keep the density, contrast, hierarchy, and desktop-workspace clarity.
- Soften the more extreme mission-console or military framing when turning these references into the real product UI.
- Treat this system as a way to avoid bland dashboards, not as a requirement to preserve every thematic flourish verbatim.

---

## 2. Colors & Surface Logic

The palette is engineered for low-light, high-focus environments, utilizing a deep `surface` base with precise accentuation.

### Surface Hierarchy & Nesting
We do not use drop shadows to define space. Depth is achieved via **Tonal Stacking**:
*   **Base Layer:** `surface` (#0e0e0e) – The primary canvas.
*   **Secondary Wells:** `surface_container_low` (#131313) – Used for inset grouping and large content blocks.
*   **Active Panels:** `surface_container_high` (#1f2020) – Used for interactive modules or elevated state cards.
*   **Floating/Modal Elements:** `surface_bright` (#2b2c2c) – For elements that require immediate visual prominence.

### The "No-Line" Rule
Prohibit 1px solid borders for standard sectioning. Define boundaries through background shifts (e.g., a `surface_container_low` sidebar against a `surface` main content area). 

### Signature Textures
*   **Functional Glass:** Use `surface_variant` with a 60% opacity and `backdrop-blur: 12px` for floating navigation bars or tooltips. This allows the high-density grid to remain visible beneath, maintaining the "cockpit" feel.
*   **The Status Glow:** For critical status indicators, use a subtle 4px blur on the `primary` or `error` text to mimic the phosphor glow of old-school CRT monitors.

---

## 3. Typography: The Command Voice

The system uses a pairing of **Space Grotesk** for structural authority and **Inter** for data readability.

*   **Display & Headlines (Space Grotesk):** Set in uppercase with `letter-spacing: 0.05em`. This is the "Command Voice"—used for section titles and high-level status (e.g., `TACTICAL_CONTROL`).
*   **Body & Labels (Inter):** The "Operator Readout." Highly legible, even at small scales. Use `font-weight: 500` for standard body to ensure it stands out against the dark `surface`.
*   **The Monospaced Effect:** While Inter is the primary typeface, all numerical data and system IDs should utilize a monospaced stylistic set or a fallback to JetBrains Mono to reinforce the "terminal" aesthetic.

---

## 4. Elevation & Depth

We eschew traditional material depth in favor of **Tonal Layering**.

*   **The Layering Principle:** Stack `surface_container_lowest` (#000000) cards on a `surface_container_low` (#131313) background to create "carved out" UI sections. This feels more industrial and integrated than "raised" cards.
*   **The Ghost Border:** If a boundary is required for accessibility, use `outline_variant` (#484848) at 20% opacity. It should be barely perceptible—a suggestion of a line, not a container.
*   **Ambient Shadows:** For rare floating states (e.g., a context menu), use a "Shadow Tint." Instead of black, use `on_surface` (#e7e5e5) at 4% opacity with a 32px blur. This creates a subtle grey "fog" that lifts the element without breaking the tactical vibe.

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#c6c6c7) with `on_primary` (#3f4041) text. 0px corners. High-contrast.
*   **Secondary (Tactical):** `outline` (#767575) border, transparent background. Text is `on_background`.
*   **Critical Action:** `error` (#ee7d77) background with `on_error` (#490106) text. Reserved for "Kill Switch" or "Unlink" actions.

### Input Fields
*   **Command Inputs:** Use `surface_container_highest` background with a bottom-only `outline` border. 
*   **Focus State:** Shift the border to `primary` (#c6c6c7) and add a 10% opacity `primary` fill to the entire field.

### Status Indicators (Terminal Style)
*   **Active:** `tertiary` (#eff8ff) dot with a pulsing animation.
*   **Alert:** `error` (#ee7d77) background, white text, blinking at 1Hz.

### Data Panels
Forbid the use of divider lines. Separate job application entries or log rows using the **Spacing Scale `1` (0.2rem)** for micro-gaps or **Surface Shifting** (alternating between `surface` and `surface_container_low`).

---

## 6. Do’s and Don’ts

### Do
*   **DO** use underscores instead of spaces for technical labels (e.g., `SYSTEM_ID` vs `System ID`).
*   **DO** maintain high information density. The user is an "operator," not a "consumer."
*   **DO** use `tertiary` (muted blue) for non-critical telemetry and secondary data.
*   **DO** utilize the `0.5` spacing (0.1rem) for tight "cockpit" groupings.

### Don’t
*   **DON’T** use border-radius. Every element must have sharp 0px corners.
*   **DON’T** use standard blue for links. Use `primary` (off-white) with an underline or `tertiary` for a muted functional feel.
*   **DON’T** use drop shadows for hierarchy. Use color shifts.
*   **DON’T** let the exploratory console theme override product clarity or grounded shipped UX.

---

## 7. Spacing & Grid
The layout must follow a **Strict 8px Grid**, but the implementation should be **Asymmetrical**. Align primary controls to a rigid left-heavy column, while allowing data readouts to fill the remaining horizontal space in a "waterfall" of panels. Use `Spacing 16` (3.5rem) for major section breaks to ensure the density doesn't become claustrophobic.
