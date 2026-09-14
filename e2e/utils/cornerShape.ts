import { expect, type Locator } from "@playwright/test"

/**
 * Check native corner shaping or the unsupported-property fallback. Callers
 * also assert border radii so fallback browsers still verify the geometry.
 */
export async function expectCornerShape(
  locator: Locator,
  shape: "round" | "superellipse(1.5)",
) {
  const supported = await locator
    .page()
    .evaluate((value) => CSS.supports("corner-shape", value), shape)
  // Chromium 153 serializes the round keyword as its equivalent superellipse.
  const expected = !supported
    ? ""
    : shape === "round"
      ? /^(?:round|superellipse\(1\))$/
      : shape

  await expect(locator).toHaveCSS("corner-shape", expected)
}
