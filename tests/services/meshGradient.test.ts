import { describe, expect, it } from "vitest"

import {
  createMeshGradientPlan,
  MESH_GRADIENT_PALETTES,
} from "~/services/shareSnapshots/meshGradient"

describe("meshGradient", () => {
  it("is deterministic for the same seed", () => {
    const plan1 = createMeshGradientPlan({
      seed: 123,
      width: 1200,
      height: 630,
    })
    const plan2 = createMeshGradientPlan({
      seed: 123,
      width: 1200,
      height: 630,
    })
    expect(plan2).toEqual(plan1)
  })

  it("supports palette/layout overrides", () => {
    const width = 1200
    const height = 630
    const paletteIndex = 0

    const plan = createMeshGradientPlan({
      seed: 123,
      width,
      height,
      paletteIndex,
      layoutIndex: 0,
    })

    const signature = plan.blobs
      .filter((blob) => blob.role === "main")
      .map((blob) => blob.color.toLowerCase())
      .join("|")

    expect(signature).toBe(
      MESH_GRADIENT_PALETTES[paletteIndex]!.colors.map((color) =>
        color.toLowerCase(),
      ).join("|"),
    )

    const planOtherLayout = createMeshGradientPlan({
      seed: 123,
      width,
      height,
      paletteIndex,
      layoutIndex: 1,
    })

    expect(planOtherLayout).not.toEqual(plan)
  })

  it("keeps blobs within canvas bounds", () => {
    const width = 1200
    const height = 630
    const plan = createMeshGradientPlan({ seed: 42, width, height })

    expect(plan.base.start).toMatch(/^#[0-9a-f]{6}$/i)
    expect(plan.base.end).toMatch(/^#[0-9a-f]{6}$/i)
    expect(Number.isFinite(plan.baseAngle)).toBe(true)
    expect(plan.saturation).toBeGreaterThan(1)
    expect(plan.saturation).toBeLessThanOrEqual(1.4)

    for (const blob of [...plan.blobs, ...plan.highlights]) {
      expect(blob.x).toBeGreaterThanOrEqual(0)
      expect(blob.x).toBeLessThanOrEqual(width)
      expect(blob.y).toBeGreaterThanOrEqual(0)
      expect(blob.y).toBeLessThanOrEqual(height)
      expect(blob.radius).toBeGreaterThan(0)
      expect(blob.alpha).toBeGreaterThan(0)
      expect(blob.alpha).toBeLessThanOrEqual(1)
      expect(blob.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(blob.scaleX).toBeGreaterThan(0)
      expect(blob.scaleY).toBeGreaterThan(0)
      expect(Number.isFinite(blob.rotation)).toBe(true)
    }
  })

  it("keeps noise settings subtle", () => {
    const plan = createMeshGradientPlan({ seed: 999, width: 1200, height: 630 })

    expect(plan.noise.tileSize).toBeGreaterThanOrEqual(16)
    expect(plan.noise.alpha).toBeGreaterThanOrEqual(0)
    expect(plan.noise.alpha).toBeLessThanOrEqual(0.12)
  })
})
