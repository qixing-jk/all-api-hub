import {
  clamp,
  clampByte,
  mulberry32,
  relativeLuminanceFromRgb,
  type Rgb,
} from "~/services/shareSnapshots/utils"

export const MESH_GRADIENT_NOISE_TILE_SIZE = 128

export type MeshGradientBlobRole = "main" | "echo" | "highlight"

export interface MeshGradientBlob {
  role: MeshGradientBlobRole
  x: number
  y: number
  radius: number
  color: string
  alpha: number
  scaleX: number
  scaleY: number
  rotation: number
}

export interface MeshGradientPlan {
  base: {
    start: string
    end: string
  }
  baseAngle: number
  saturation: number
  rotation: number
  scale: number
  blurPx: number
  blobs: MeshGradientBlob[]
  highlights: MeshGradientBlob[]
  noise: {
    tileSize: number
    alpha: number
  }
}

type MeshGradientPalette = {
  colors: readonly [string, string, string, string]
}

/**
 * Curated palettes inspired by Apple-like mesh gradients (see: mikhailmogilnikov/mesh-gradient).
 * @link https://github.com/mikhailmogilnikov/mesh-gradient/blob/0ae08e02f872d5936a6618f7ad8bca57c99bda77/apps/docs/src/features/mesh/model/colors.tsx#L3
 */
export const MESH_GRADIENT_PALETTES: readonly MeshGradientPalette[] = [
  {
    colors: ["#0a3d4a", "#0e5963", "#1b7c7a", "#3fafa0"],
  },
  {
    colors: ["#ff6b6b", "#ff8e72", "#ffb199", "#ffd6cc"],
  },
  {
    colors: ["#bfe3ff", "#7bc5f6", "#a8b9ff", "#d6d4ff"],
  },
  {
    colors: ["#b46cff", "#8c5be8", "#5a3bb5", "#2a185f"],
  },
  {
    colors: ["#cdaa7d", "#e2c29a", "#f0d8bd", "#f7e9d7"],
  },
  {
    colors: ["#2e6b5c", "#3f8f76", "#6fc3a6", "#b9ebd8"],
  },
  {
    colors: ["#e24a8d", "#f07daa", "#f6afcb", "#fbe0ee"],
  },
  {
    colors: ["#0b3c74", "#1a57a8", "#3b7dd8", "#7eb3ff"],
  },
  {
    colors: ["#0f172a", "#1e293b", "#273c6b", "#3e5baa"],
  },
  {
    colors: ["#0b2c3a", "#124e66", "#1f7a8c", "#64b6ac"],
  },
  {
    colors: ["#7a1f3d", "#a02f5f", "#c94886", "#e58fb2"],
  },
  {
    colors: ["#ff7e5f", "#ff9a8b", "#ff6a88", "#ff99ac"],
  },
  {
    colors: ["#0f2d52", "#1b3f78", "#2c56a6", "#5a86d9"],
  },
  {
    colors: ["#c3aed6", "#a28fd0", "#8668c7", "#654ba5"],
  },
  {
    colors: ["#1f5e53", "#2a7f6f", "#43a18c", "#7acbb4"],
  },
  {
    colors: ["#141e30", "#243b55", "#302b63", "#0f0c29"],
  },
  {
    colors: ["#1b3a57", "#24618a", "#2a88bf", "#6fc7ff"],
  },
  {
    colors: ["#ff6f91", "#ff8a88", "#ffa7a2", "#ffd1d0"],
  },
  {
    colors: ["#006d77", "#2a9d8f", "#5bc0be", "#a8e6e6"],
  },
  {
    colors: ["#ff7e5f", "#fd3a69", "#ff6a88", "#ff99ac"],
  },
  {
    colors: ["#00b4db", "#0083b0", "#00c6ff", "#0072ff"],
  },
  {
    colors: ["#5d3fd3", "#7a5be0", "#a389d4", "#d9b3ff"],
  },
  {
    colors: ["#1b512d", "#3a7a57", "#77b1a9", "#e3fdfd"],
  },
  {
    colors: ["#0b5d5d", "#128277", "#1aa89c", "#5cd6c8"],
  },
  {
    colors: ["#ff8a65", "#ffab91", "#ffccbc", "#fff3e0"],
  },
  {
    colors: ["#0f2027", "#203a43", "#2c5364", "#4ca1af"],
  },
  {
    colors: ["#ff512f", "#dd2476", "#ff6a88", "#ff99ac"],
  },
] as const

const MESH_GRADIENT_LAYOUTS: ReadonlyArray<
  readonly (readonly [number, number])[]
> = [
  [
    [0.16, 0.18],
    [0.84, 0.16],
    [0.82, 0.86],
    [0.18, 0.84],
  ],
  [
    [0.12, 0.35],
    [0.78, 0.14],
    [0.9, 0.64],
    [0.34, 0.9],
  ],
  [
    [0.1, 0.24],
    [0.92, 0.3],
    [0.75, 0.92],
    [0.22, 0.78],
  ],
  [
    [0.18, 0.14],
    [0.88, 0.42],
    [0.64, 0.92],
    [0.12, 0.68],
  ],
  [
    [0.12, 0.52],
    [0.86, 0.22],
    [0.84, 0.84],
    [0.28, 0.92],
  ],
  [
    [0.08, 0.16],
    [0.62, 0.08],
    [0.92, 0.62],
    [0.24, 0.88],
  ],
  [
    [0.12, 0.22],
    [0.88, 0.18],
    [0.78, 0.92],
    [0.18, 0.72],
  ],
  [
    [0.18, 0.12],
    [0.9, 0.32],
    [0.58, 0.92],
    [0.12, 0.58],
  ],
  [
    [0.06, 0.62],
    [0.46, 0.12],
    [0.94, 0.44],
    [0.62, 0.94],
  ],
  [
    [0.16, 0.28],
    [0.82, 0.1],
    [0.92, 0.82],
    [0.28, 0.92],
  ],
  [
    [0.22, 0.08],
    [0.92, 0.24],
    [0.74, 0.9],
    [0.08, 0.76],
  ],
  [
    [0.08, 0.28],
    [0.92, 0.16],
    [0.86, 0.74],
    [0.18, 0.92],
  ],
  [
    [0.08, 0.18],
    [0.92, 0.44],
    [0.58, 0.92],
    [0.18, 0.78],
  ],
  [
    [0.12, 0.42],
    [0.84, 0.12],
    [0.94, 0.9],
    [0.32, 0.94],
  ],
  [
    [0.18, 0.2],
    [0.74, 0.08],
    [0.9, 0.68],
    [0.34, 0.92],
  ],
] as const

export const MESH_GRADIENT_LAYOUT_COUNT = MESH_GRADIENT_LAYOUTS.length

const parseHexRgb = (hex: string): Rgb | null => {
  const normalized = hex.trim().startsWith("#")
    ? hex.trim().slice(1)
    : hex.trim()
  if (normalized.length !== 6) return null
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b))
    return null
  return { r, g, b }
}

const toHex = (value: number): string =>
  clampByte(value).toString(16).padStart(2, "0")

const rgbToHex = (rgb: Rgb): string =>
  `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`

const mixHex = (a: string, b: string, t: number): string => {
  const rgbA = parseHexRgb(a)
  const rgbB = parseHexRgb(b)
  if (!rgbA || !rgbB) return a

  const tt = clamp(t, 0, 1)
  return rgbToHex({
    r: rgbA.r + (rgbB.r - rgbA.r) * tt,
    g: rgbA.g + (rgbB.g - rgbA.g) * tt,
    b: rgbA.b + (rgbB.b - rgbA.b) * tt,
  })
}

// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
const relativeLuminance = (hex: string): number => {
  const rgb = parseHexRgb(hex)
  return rgb ? relativeLuminanceFromRgb(rgb) : 0
}

/**
 * Creates a deterministic "mesh gradient" plan for 2D Canvas drawing.
 *
 * The plan focuses on Apple-like aesthetics (balanced placement, curated palettes,
 * soft blending) rather than fully-unconstrained randomness.
 */
export const createMeshGradientPlan = ({
  seed,
  width,
  height,
  paletteIndex,
  layoutIndex,
}: {
  seed: number
  width: number
  height: number
  paletteIndex?: number
  layoutIndex?: number
}): MeshGradientPlan => {
  const random = mulberry32(seed)
  const wrapIndex = (value: number, size: number): number => {
    if (!Number.isFinite(value) || size <= 0) return 0
    const mod = value % size
    return mod < 0 ? mod + size : mod
  }

  const palettePool = MESH_GRADIENT_PALETTES
  const paletteRandom = random()
  const palette =
    typeof paletteIndex === "number"
      ? palettePool[wrapIndex(paletteIndex, palettePool.length)]!
      : palettePool[Math.floor(paletteRandom * palettePool.length)]!

  const layoutRandom = random()
  const layout =
    typeof layoutIndex === "number"
      ? MESH_GRADIENT_LAYOUTS[
          wrapIndex(layoutIndex, MESH_GRADIENT_LAYOUTS.length)
        ]!
      : MESH_GRADIENT_LAYOUTS[
          Math.floor(layoutRandom * MESH_GRADIENT_LAYOUTS.length)
        ]!
  const maxDim = Math.max(width, height)

  const blurPx = Math.round(maxDim * (0.05 + random() * 0.03))
  // A small global rotation/scale helps avoid a too-grid-like feel even with
  // structured layouts.
  const rotation = (random() - 0.5) * 0.6
  const scale = 1.03 + random() * 0.1
  // Direction for the base linear gradient.
  const baseAngle = random() * Math.PI * 2
  // Saturation is applied via canvas filter during drawing (see meshGradientBackground).
  const saturation = 1.08 + random() * 0.18

  // Keep centers roughly structured; allow subtle variation per seed.
  const jitter = 0.14

  const baseA = "#050814"
  const baseB = "#0b1220"
  // Mix a dark base with the palette so the overall brightness can vary by seed
  // without drifting too far away from a "dark, glassy" background.
  const baseTintA = 0.1 + random() * 0.12
  const baseTintB = 0.1 + random() * 0.14
  const baseStart = mixHex(baseA, palette.colors[0], baseTintA)
  const baseEnd = mixHex(baseB, palette.colors[1], baseTintB)

  const makeBlob = ({
    role,
    x,
    y,
    radius,
    color,
    alpha,
  }: {
    role: MeshGradientBlobRole
    x: number
    y: number
    radius: number
    color: string
    alpha: number
  }): MeshGradientBlob => {
    const lum = relativeLuminance(color)
    // Brighter colors get less alpha so highlights don't blow out after "screen"
    // blending.
    const alphaScale = clamp(1.05 - lum * 0.6, 0.65, 1.15)
    const baseScale = role === "highlight" ? 1 : 1.02
    const scaleX = baseScale * (0.78 + random() * 0.72)
    const scaleY = baseScale * (0.78 + random() * 0.72)
    const rotationLocal = (random() - 0.5) * 1.8

    return {
      role,
      x,
      y,
      radius,
      color,
      alpha: clamp(alpha * alphaScale, 0, 1),
      scaleX,
      scaleY,
      rotation: rotationLocal,
    }
  }

  const blobs: MeshGradientBlob[] = []
  for (const [index, color] of palette.colors.entries()) {
    const [ax, ay] = layout[index] ?? layout[0]!
    // Place each main blob near its layout anchor, then add a small seedable
    // jitter so different seeds don't look identical.
    const x = clamp((ax + (random() - 0.5) * jitter) * width, 0, width)
    const y = clamp((ay + (random() - 0.5) * jitter) * height, 0, height)

    // Main blobs are large and soft; they form the "mesh" base.
    const radius = maxDim * (0.72 + random() * 0.42)
    // Alpha is the primary "brightness" control per blob.
    const alpha = 0.48 + random() * 0.2

    const main = makeBlob({ role: "main", x, y, radius, color, alpha })
    blobs.push(main)

    // Echo blob: adds more "mesh-like" richness without fully random chaos.
    const echoOffsetX = (random() - 0.5) * width * 0.22
    const echoOffsetY = (random() - 0.5) * height * 0.22
    const echo = makeBlob({
      role: "echo",
      x: clamp(main.x + echoOffsetX, 0, width),
      y: clamp(main.y + echoOffsetY, 0, height),
      radius: main.radius * (0.46 + random() * 0.18),
      color,
      alpha: main.alpha * (0.28 + random() * 0.12),
    })
    blobs.push(echo)
  }

  // Add a couple of smaller accents to avoid a "flat" look while staying tasteful.
  const highlights: MeshGradientBlob[] = Array.from({ length: 2 }, () => {
    const color = palette.colors[Math.floor(random() * palette.colors.length)]!
    // Highlights are smaller, centrally-biased accents that brighten local areas
    // once blended with "screen".
    const x = (0.34 + random() * 0.34) * width
    const y = (0.22 + random() * 0.58) * height
    const radius = maxDim * (0.26 + random() * 0.24)
    const alpha = 0.14 + random() * 0.18
    return makeBlob({ role: "highlight", x, y, radius, color, alpha })
  })

  const noiseAlpha = 0.05 + random() * 0.05

  return {
    base: {
      start: baseStart,
      end: baseEnd,
    },
    baseAngle,
    saturation,
    rotation,
    scale,
    blurPx,
    blobs,
    highlights,
    noise: {
      tileSize: MESH_GRADIENT_NOISE_TILE_SIZE,
      alpha: noiseAlpha,
    },
  }
}
