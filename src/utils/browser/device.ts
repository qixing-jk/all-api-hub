type DeviceType = "mobile" | "tablet" | "desktop"

interface DeviceTypeInfo {
  type: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isTouchDevice: boolean
}

interface DeviceDetectionOptions {
  userAgent?: string
  userAgentDataMobile?: boolean | null
  maxTouchPoints?: number
  screenWidth?: number
  screenHeight?: number
  matchMedia?: ((query: string) => { matches: boolean }) | undefined
}

const PHONE_USER_AGENT_PATTERN =
  /android.+mobile|iphone|ipod|blackberry|iemobile|opera mini|webos/i
const TABLET_USER_AGENT_PATTERN = /ipad|tablet|playbook|silk/i

/**
 * Reads `navigator.userAgentData.mobile` when available so Chromium-based
 * runtimes can report mobile shells without relying on UA parsing.
 */
function getNavigatorUserAgentDataMobile(): boolean | null {
  if (typeof navigator === "undefined") {
    return null
  }

  return (navigator as any).userAgentData?.mobile ?? null
}

/**
 * Returns the active `matchMedia` implementation when a window context exists.
 */
function getDefaultMatchMedia() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return undefined
  }

  return window.matchMedia.bind(window)
}

/**
 * Evaluates a media query defensively because some extension runtimes expose a
 * partial `matchMedia` implementation that can throw.
 */
function matchesMedia(
  query: string,
  matchMediaImpl?: (query: string) => { matches: boolean },
): boolean {
  if (!matchMediaImpl) {
    return false
  }

  try {
    return !!matchMediaImpl(query)?.matches
  } catch {
    return false
  }
}

/**
 * Reads the requested screen dimension and falls back when the screen object is
 * unavailable, such as during SSR or isolated tests.
 */
function getScreenDimension(
  dimension: "width" | "height",
  fallback: number,
): number {
  if (typeof screen === "undefined") {
    return fallback
  }

  return typeof screen[dimension] === "number" ? screen[dimension] : fallback
}

/**
 * Detects coarse device form factors using user-agent client hints when
 * available, then pointer/touch/screen heuristics, and finally UA fallback.
 * The screen-size heuristic uses the short side so portrait and landscape
 * tablet layouts classify consistently.
 */
export function getDeviceTypeInfo(
  options?: DeviceDetectionOptions,
): DeviceTypeInfo {
  const userAgent =
    options?.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "")
  const normalizedUserAgent = userAgent.toLowerCase()

  const userAgentDataMobile =
    typeof options?.userAgentDataMobile !== "undefined"
      ? options.userAgentDataMobile
      : getNavigatorUserAgentDataMobile()

  const matchMediaImpl = options?.matchMedia ?? getDefaultMatchMedia()
  const hasCoarsePointer =
    matchesMedia("(any-pointer: coarse)", matchMediaImpl) ||
    matchesMedia("(pointer: coarse)", matchMediaImpl)
  const maxTouchPoints =
    options?.maxTouchPoints ??
    (typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0)
  const isTouchDevice = hasCoarsePointer || maxTouchPoints > 0

  const screenWidth =
    options?.screenWidth ??
    getScreenDimension("width", Number.POSITIVE_INFINITY)
  const screenHeight =
    options?.screenHeight ??
    getScreenDimension("height", Number.POSITIVE_INFINITY)
  const shortSide = Math.min(screenWidth, screenHeight)

  const isPhoneByUA = PHONE_USER_AGENT_PATTERN.test(normalizedUserAgent)
  const isTabletByUA =
    TABLET_USER_AGENT_PATTERN.test(normalizedUserAgent) ||
    (/android/i.test(normalizedUserAgent) &&
      !/mobile/i.test(normalizedUserAgent))

  let type: DeviceType = "desktop"

  if (
    userAgentDataMobile === true ||
    isPhoneByUA ||
    (isTouchDevice && shortSide <= 767)
  ) {
    type = "mobile"
  } else if (isTabletByUA || (isTouchDevice && shortSide <= 1024)) {
    type = "tablet"
  }

  return {
    type,
    isMobile: type === "mobile",
    isTablet: type === "tablet",
    isDesktop: type === "desktop",
    isTouchDevice,
  }
}

/**
 * Convenience wrapper for callers that only need a mobile/non-mobile branch.
 */
export function isMobileDevice(options?: DeviceDetectionOptions): boolean {
  return getDeviceTypeInfo(options).isMobile
}

/**
 * Convenience wrapper for desktop-only flows such as popup-specific warnings.
 */
export function isTabletDevice(options?: DeviceDetectionOptions): boolean {
  return getDeviceTypeInfo(options).isTablet
}

/**
 * Convenience wrapper for desktop-only flows such as popup-specific warnings.
 */
export function isDesktopDevice(options?: DeviceDetectionOptions): boolean {
  return getDeviceTypeInfo(options).isDesktop
}
