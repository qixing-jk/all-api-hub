import { createMeshGradientPlan, type MeshGradientBlob } from "./meshGradient"
import { clamp, mulberry32 } from "./utils"

export type DrawMeshGradientBackgroundOptions = {
  seed: number
  width: number
  height: number
  paletteIndex?: number
  layoutIndex?: number
}

const withAlpha = (hex: string, alpha: number): string => {
  const safeAlpha = clamp(alpha, 0, 1)
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
}

const clampByte = (value: number): number => clamp(Math.round(value), 0, 255)

const createNoiseTileCanvas = (
  random: () => number,
  size: number,
): HTMLCanvasElement | null => {
  if (typeof document === "undefined") return null

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const noiseCtx = canvas.getContext("2d")
  if (!noiseCtx) return null

  const imageData = noiseCtx.createImageData(size, size)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    // Soft film grain: keep noise centered near mid-gray so blending doesn't
    // introduce muddy/dirty color shifts on colorful mesh gradients.
    const value = clampByte(128 + (random() - 0.5) * 70)
    const alpha = Math.floor(random() * 24)
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = alpha
  }

  noiseCtx.putImageData(imageData, 0, 0)
  return canvas
}

export const drawMeshGradientBackground = (
  ctx: CanvasRenderingContext2D,
  {
    seed,
    width,
    height,
    paletteIndex,
    layoutIndex,
  }: DrawMeshGradientBackgroundOptions,
) => {
  const plan = createMeshGradientPlan({
    seed,
    width,
    height,
    paletteIndex,
    layoutIndex,
  })
  const maxDim = Math.max(width, height)

  const diagonal = Math.hypot(width, height)
  const centerX = width * 0.5
  const centerY = height * 0.5
  const dx = Math.cos(plan.baseAngle) * diagonal
  const dy = Math.sin(plan.baseAngle) * diagonal

  // Base linear gradient: sets the overall dark tone + palette tint before
  // adding "mesh" blobs on top.
  const baseGradient = ctx.createLinearGradient(
    centerX - dx,
    centerY - dy,
    centerX + dx,
    centerY + dy,
  )
  baseGradient.addColorStop(0, plan.base.start)
  baseGradient.addColorStop(1, plan.base.end)
  ctx.fillStyle = baseGradient
  ctx.fillRect(0, 0, width, height)

  const drawBlob = (
    blob: MeshGradientBlob,
    midStop: number,
    midAlphaScale: number,
  ) => {
    ctx.save()
    // Each blob is drawn in its own local coordinate space (translate/rotate/scale)
    // so the same radial gradient can create varied organic shapes.
    ctx.translate(blob.x, blob.y)
    ctx.rotate(blob.rotation)
    ctx.scale(blob.scaleX, blob.scaleY)

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, blob.radius)
    gradient.addColorStop(0, withAlpha(blob.color, blob.alpha))
    // A middle stop helps control how fast the blob falls off; lowering
    // midAlphaScale makes the "core" less intense without changing the edge.
    gradient.addColorStop(
      midStop,
      withAlpha(blob.color, blob.alpha * midAlphaScale),
    )
    gradient.addColorStop(1, withAlpha(blob.color, 0))
    ctx.fillStyle = gradient
    // Draw a large rect because the gradient is used as a fill; the transform
    // above means the rect must be big enough to cover the full canvas.
    ctx.fillRect(-maxDim * 2, -maxDim * 2, maxDim * 4, maxDim * 4)

    ctx.restore()
  }

  // Apple-like mesh gradients look better with slightly structured placement.
  // We still keep them seedable for "shuffle" behavior.
  ctx.save()
  ctx.translate(width * 0.5, height * 0.5)
  ctx.rotate(plan.rotation)
  ctx.scale(plan.scale, plan.scale)
  ctx.translate(-width * 0.5, -height * 0.5)

  // "Screen" blending makes overlaps brighter (additive-like), which is the core
  // of the Apple-like mesh gradient look.
  ctx.globalCompositeOperation = "screen"
  const saturation = Math.min(plan.saturation, 1.4)
  ctx.filter = `blur(${plan.blurPx}px) saturate(${saturation})`
  for (const blob of plan.blobs) {
    drawBlob(blob, 0.55, 0.28)
  }

  ctx.filter = `blur(${Math.round(plan.blurPx * 0.75)}px) saturate(${Math.min(
    saturation * 1.06,
    1.6,
  )})`
  for (const blob of plan.highlights) {
    // Highlights are smaller accents with lower alpha (see meshGradient.ts).
    drawBlob(blob, 0.5, 0.22)
  }

  ctx.restore()

  // Subtle lighting sweep to add depth.
  ctx.save()
  ctx.globalCompositeOperation = "soft-light"
  const sweep = ctx.createLinearGradient(0, 0, width, height)
  sweep.addColorStop(0, "rgba(255, 255, 255, 0.14)")
  sweep.addColorStop(0.45, "rgba(255, 255, 255, 0)")
  sweep.addColorStop(1, "rgba(0, 0, 0, 0.1)")
  ctx.fillStyle = sweep
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  // Soft white haze to reduce color intensity and add a "glass" feel.
  ctx.save()
  ctx.globalCompositeOperation = "screen"
  ctx.filter = `blur(${Math.round(maxDim * 0.09)}px)`
  ctx.globalAlpha = 0.14
  ctx.fillStyle = "rgba(255, 255, 255, 1)"
  ctx.beginPath()
  ctx.arc(width * 0.22, height * 0.18, maxDim * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.1
  ctx.beginPath()
  ctx.arc(width * 0.86, height * 0.55, maxDim * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Subtle grain (inspired by modern mesh gradient aesthetics).
  try {
    const noiseSeed = (seed ^ 0x9e3779b9) >>> 0
    const noiseCanvas = createNoiseTileCanvas(
      mulberry32(noiseSeed),
      plan.noise.tileSize,
    )
    if (noiseCanvas) {
      const pattern = ctx.createPattern(noiseCanvas, "repeat")
      if (pattern) {
        ctx.save()
        ctx.globalCompositeOperation = "soft-light"
        ctx.globalAlpha = clamp(plan.noise.alpha * 0.6, 0, 0.04)
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, width, height)
        ctx.restore()
      }
    }
  } catch {
    // Ignore grain failures (e.g., if canvas APIs are restricted).
  }

  // Gentle vignette for contrast.
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.35,
    Math.min(width, height) * 0.2,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.8,
  )
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)")
  vignette.addColorStop(0.84, "rgba(0, 0, 0, 0.08)")
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.12)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
}
