import {
  EMPTY_DEV_IDENTITY,
  getDevBadgeText,
  getDevIdentityColor,
  getDevIdentityColorIndex,
  getDevPathTail,
  type BakedDevIdentity,
  type DevIdentity,
} from "~/utils/core/devIdentity"

/**
 * Path fixtures for the development build identity.
 *
 * Paths here are deliberately synthetic and cover the shapes the identity has to
 * survive on any machine: Windows drives, POSIX roots, UNC shares, shallow
 * checkouts, a trailing separator, and directory names with spaces or no ASCII
 * letters at all. Tests must not depend on where this repository happens to live.
 */
export const DEV_PATH_FIXTURES = {
  windowsWorktree: "C:\\dev\\all-api-hub\\temp",
  windowsWorktreeWithTrailingSeparator: "C:\\dev\\all-api-hub\\temp\\",
  windowsSiblingWorktree: "C:\\dev\\all-api-hub\\main",
  windowsShallow: "C:\\project",
  windowsSpacedName: "C:\\dev\\my repo (copy 2)",
  windowsNonAsciiName: "C:\\dev\\工具目录",
  posixWorktree: "/home/dev/all-api-hub/feature-login",
  posixNameWithBackslash: "/home/dev/tool\\kit",
  posixShallow: "/home",
  uncShare: "\\\\server\\share\\repo",
  empty: "",
} as const

/** Absolute path baked into dev builds' identity by default in tests. */
export const DEV_IDENTITY_FIXTURE_PATH = DEV_PATH_FIXTURES.windowsWorktree

/**
 * The values a real dev build derives from {@link DEV_IDENTITY_FIXTURE_PATH}.
 * They are derived here rather than hand-written so a fixture can never describe
 * an identity the extension itself would not produce; the derivation rules
 * themselves are pinned in `tests/utils/devIdentity.test.ts`.
 */
export const DEV_IDENTITY_FIXTURE_PATH_TAIL = getDevPathTail(
  DEV_IDENTITY_FIXTURE_PATH,
) as string

export const DEV_IDENTITY_FIXTURE_BADGE_TEXT = getDevBadgeText(
  DEV_IDENTITY_FIXTURE_PATH,
  DEV_IDENTITY_FIXTURE_PATH,
)

const DEV_IDENTITY_FIXTURE_COLOR_INDEX = getDevIdentityColorIndex(
  DEV_IDENTITY_FIXTURE_PATH,
)

export const DEV_IDENTITY_FIXTURE_COLOR = getDevIdentityColor(
  DEV_IDENTITY_FIXTURE_COLOR_INDEX,
)

/** Build output directory that pairs with {@link DEV_IDENTITY_FIXTURE_PATH}. */
const DEV_IDENTITY_FIXTURE_OUTPUT_PATH = `${DEV_IDENTITY_FIXTURE_PATH}\\.output\\chrome-mv3-dev`

/**
 * A complete development identity. Every field has a value a real dev build could
 * produce, so tests only override what they are actually about.
 */
export function buildDevIdentity(
  overrides: Partial<DevIdentity> = {},
): DevIdentity {
  return {
    ...EMPTY_DEV_IDENTITY,
    path: DEV_IDENTITY_FIXTURE_PATH,
    pathTail: DEV_IDENTITY_FIXTURE_PATH_TAIL,
    outputPath: DEV_IDENTITY_FIXTURE_OUTPUT_PATH,
    badgeText: DEV_IDENTITY_FIXTURE_BADGE_TEXT,
    color: DEV_IDENTITY_FIXTURE_COLOR,
    colorIndex: DEV_IDENTITY_FIXTURE_COLOR_INDEX,
    builtAt: "2026-01-02T03:04:05.000Z",
    browserTarget: "chrome",
    source: "build",
    ...overrides,
  }
}

/** The same identity as it is baked into a development build's global constant. */
export function buildBakedDevIdentity(
  overrides: Partial<BakedDevIdentity> = {},
): BakedDevIdentity {
  return {
    projectPath: DEV_IDENTITY_FIXTURE_PATH,
    outputPath: DEV_IDENTITY_FIXTURE_OUTPUT_PATH,
    builtAt: "2026-01-02T03:04:05.000Z",
    browserTarget: "chrome",
    ...overrides,
  }
}
