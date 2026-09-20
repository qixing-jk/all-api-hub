/**
 * Pure derivation of the development-only build identity.
 *
 * The identity answers "which directory's code is this build?" for locally
 * loaded builds. The path itself is baked at build time (see `wxt.config.ts`)
 * because no extension API can read the directory it was loaded from; everything
 * here turns that path into the values every surface shares, so the toolbar, the
 * pages and the panel agree without any cross-context messaging.
 */

/** Palette slots; each slot gets its own hue and lightness pair. */
const DEV_IDENTITY_PALETTE_SIZE = 12

/** Keep the tail and drop the middle: the tail is what tells checkouts apart. */
const DEV_IDENTITY_PATH_TAIL_SEGMENTS = 2

/** Toolbar badge text used when no build information is available. */
const DEV_IDENTITY_FALLBACK_BADGE_TEXT = "DEV"

/**
 * Chrome renders at most four badge characters, and three are usually enough to
 * read a directory name such as `temp` at toolbar size.
 */
const BADGE_TEXT_LENGTH = 3

const HUE_START_DEGREES = 15
const HUE_STEP_DEGREES = 30
const SATURATION_PERCENT = 65
/** Alternating lightness keeps neighbouring hues apart at badge size. */
const LIGHTNESS_PERCENT = [44, 58] as const

const BASE26_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/** Marker that a build is local; shared by the dev manifest name and its titles. */
export const DEV_BUILD_MARKER = "(dev)"

/**
 * Channel order per hue sector of the standard HSL to RGB conversion, indexing
 * into `[chroma, secondComponent, 0]`.
 */
const HUE_SECTOR_CHANNELS = [
  [0, 1, 2],
  [1, 0, 2],
  [2, 0, 1],
  [2, 1, 0],
  [1, 2, 0],
  [0, 2, 1],
] as const

/** Hue, saturation and lightness of a palette slot, in CSS units. */
type HslComponents = readonly [
  hue: number,
  saturation: number,
  lightness: number,
]

/** One hue/lightness slot of the palette, kept in HSL because hues are generated. */
function getDevIdentityColorComponents(colorIndex: number): HslComponents {
  const slot =
    ((colorIndex % DEV_IDENTITY_PALETTE_SIZE) + DEV_IDENTITY_PALETTE_SIZE) %
    DEV_IDENTITY_PALETTE_SIZE

  return [
    HUE_START_DEGREES + HUE_STEP_DEGREES * slot,
    SATURATION_PERCENT,
    LIGHTNESS_PERCENT[slot % LIGHTNESS_PERCENT.length],
  ]
}

/** Scale one HSL channel into the 0-255 range the badge API reads back. */
function toColorChannel(component: number, offset: number): number {
  return Math.round((component + offset) * 255)
}

/**
 * Standard HSL to RGB, used because the toolbar badge API rejects the modern
 * space-separated `hsl(15 65% 44%)` syntax with "could not be parsed" while the
 * pages accept it. One string has to serve both, and both accept `rgb(r, g, b)`,
 * which also survives a round trip through the API unchanged.
 */
function hslToRgb([hue, saturation, lightness]: HslComponents): string {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hueSection = (hue % 360) / 60
  const secondComponent = chroma * (1 - Math.abs((hueSection % 2) - 1))
  const offset = l - chroma / 2
  const channels = [chroma, secondComponent, 0]
  const [red, green, blue] =
    HUE_SECTOR_CHANNELS[Math.floor(hueSection) % HUE_SECTOR_CHANNELS.length]

  return `rgb(${toColorChannel(channels[red], offset)}, ${toColorChannel(
    channels[green],
    offset,
  )}, ${toColorChannel(channels[blue], offset)})`
}

/** Where the identity got its path, or its seed when no path exists. */
export type DevIdentitySource = "build" | "runtime-id" | "none"

/**
 * Build-time facts a development build bakes into `__AAH_DEV_IDENTITY__`.
 *
 * The type lives here rather than beside the runtime reader so `wxt.config.ts`,
 * which can only import modules free of the `~/` aliases, checks what it bakes
 * against the contract the extension reads back.
 */
export interface BakedDevIdentity {
  /** Absolute project root the build was produced from. */
  projectPath: string
  /** Build output directory the browser loads. */
  outputPath: string
  /** ISO timestamp of the build that baked this identity. */
  builtAt: string
  /** Browser target of the build. */
  browserTarget: string
}

/** Everything the extension surfaces need to identify a local build. */
export interface DevIdentity {
  /** Absolute source directory of this build, when the build baked one. */
  path: string | null
  /** Shortened path for narrow surfaces, e.g. `G:…\all-api-hub\temp`. */
  pathTail: string | null
  /**
   * Build output directory the browser loads. Derived from the project root at
   * build time, not observed at runtime: the extension cannot read it.
   */
  outputPath: string | null
  /** Toolbar badge text derived from the last path segment. */
  badgeText: string
  /** Palette color of this instance; null outside development mode. */
  color: string | null
  /** Palette slot behind `color`; null outside development mode. */
  colorIndex: number | null
  /** When the build that baked this identity started. */
  builtAt: string | null
  /** Browser the build targets, when baked. */
  browserTarget: string | null
  /**
   * Origin of the path/seed. `runtime-id` means only the extension id was
   * available, so callers can say that instead of implying the build was read.
   */
  source: DevIdentitySource
}

/** Identity reported when nothing about the running build can be discovered. */
export const EMPTY_DEV_IDENTITY: DevIdentity = {
  path: null,
  pathTail: null,
  outputPath: null,
  badgeText: DEV_IDENTITY_FALLBACK_BADGE_TEXT,
  color: null,
  colorIndex: null,
  builtAt: null,
  browserTarget: null,
  source: "none",
}

/**
 * FNV-1a over the seed, so checkouts with nearly identical paths (siblings in
 * one parent directory) still land on distant palette slots.
 */
export function hashDevIdentitySeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Palette slot for a seed; stable for as long as the seed is. */
export function getDevIdentityColorIndex(seed: string): number {
  return hashDevIdentitySeed(seed) % DEV_IDENTITY_PALETTE_SIZE
}

/** Instance color for a palette slot, usable by both CSS and the badge API. */
export function getDevIdentityColor(colorIndex: number): string {
  return hslToRgb(getDevIdentityColorComponents(colorIndex))
}

/**
 * Paths in Windows syntax: a drive prefix or a UNC share. Everything else is
 * treated as POSIX, where a backslash is a legal character inside a directory
 * name and must not be read as a separator.
 */
function isWindowsStylePath(path: string): boolean {
  return /^[a-z]:/iu.test(path) || path.startsWith("\\\\")
}

/**
 * Segments of a path, split on the separators its own syntax uses: both
 * separators for Windows paths, only `/` for POSIX paths.
 */
function splitPathSegments(path: string): string[] {
  const separatorPattern = isWindowsStylePath(path) ? /[\\/]+/u : /\/+/u

  return path.split(separatorPattern).filter(Boolean)
}

/** Keep a path's own separator style so shortened paths still read naturally. */
function getPathSeparator(path: string): string {
  if (!isWindowsStylePath(path)) return "/"

  return path.includes("\\") ? "\\" : "/"
}

/**
 * Shorten a path for narrow surfaces while keeping what identifies the checkout:
 * the last segments, plus the drive letter when the path has one.
 */
export function getDevPathTail(
  path: string,
  segmentCount = DEV_IDENTITY_PATH_TAIL_SEGMENTS,
): string | null {
  const segments = splitPathSegments(path)
  if (segments.length === 0) return null

  const separator = getPathSeparator(path)
  if (segments.length <= segmentCount) {
    return segments.join(separator)
  }

  const tail = segments.slice(-segmentCount).join(separator)
  const driveLetter = /^[a-z]:/iu.exec(path)?.[0]

  return `${driveLetter ?? ""}…${separator}${tail}`
}

/** Head-truncate a label so the informative end of a path survives. */
export function truncateDevLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 1) return value.slice(-maxLength)

  return `…${value.slice(-(maxLength - 1))}`
}

/**
 * Development manifest name. Every local build would otherwise share one display
 * name across the extension list, context menu entries, notifications and window
 * titles, so the shortened project path goes into the name itself.
 *
 * The app name is passed in rather than imported because `wxt.config.ts` loads
 * this module through jiti, which cannot resolve the extension source aliases.
 */
export function formatDevManifestName(
  appName: string,
  path?: string | null,
): string {
  const pathTail = path?.trim() ? getDevPathTail(path) : null

  return pathTail
    ? `${appName} ${DEV_BUILD_MARKER} ${pathTail}`
    : `${appName} ${DEV_BUILD_MARKER}`
}

/** Letters and digits only, so a directory name survives a badge-sized slot. */
function toAlphanumeric(value: string): string {
  return value.replace(/[^a-z0-9]/giu, "")
}

/** Letters derived from a hash, used to pad a too-short directory name. */
function hashToLetters(seed: string, length: number): string {
  let value = hashDevIdentitySeed(seed)
  let letters = ""
  for (let index = 0; index < length; index += 1) {
    letters += BASE26_ALPHABET[value % BASE26_ALPHABET.length]
    value = Math.floor(value / BASE26_ALPHABET.length)
  }

  return letters
}

/**
 * Toolbar badge text: the start of the last path segment, so the badge itself
 * points at the directory. Shorter directory names are padded from the seed to
 * keep the badge unique rather than leaving it ambiguous.
 */
export function getDevBadgeText(
  path: string | null,
  seed: string | null,
): string {
  const lastSegment = path ? splitPathSegments(path).at(-1) : undefined
  const fromPath = toAlphanumeric(lastSegment ?? "").toUpperCase()

  if (fromPath.length >= BADGE_TEXT_LENGTH) {
    return fromPath.slice(0, BADGE_TEXT_LENGTH)
  }
  if (!seed) {
    return fromPath || DEV_IDENTITY_FALLBACK_BADGE_TEXT
  }

  return `${fromPath}${hashToLetters(seed, BADGE_TEXT_LENGTH)}`.slice(
    0,
    BADGE_TEXT_LENGTH,
  )
}
