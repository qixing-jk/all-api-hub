import {
  isTempWindowRequestSource,
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import {
  isExtensionBackground,
  isExtensionOptions,
  isExtensionPopup,
  isExtensionSidePanel,
} from "~/utils/browser"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"

type TempWindowRequestBlockedReason = "firefox_popup_unsupported" | null

/** Normalizes an untrusted request source to the safe background default. */
export function normalizeTempWindowRequestSource(
  value: unknown,
): TempWindowRequestSource {
  return isTempWindowRequestSource(value)
    ? value
    : TEMP_WINDOW_REQUEST_SOURCES.Background
}

/** Detects the current extension surface in semantic-priority order. */
export function getCurrentTempWindowRequestSource(): TempWindowRequestSource {
  if (isExtensionPopup()) {
    return TEMP_WINDOW_REQUEST_SOURCES.Popup
  }
  if (isExtensionOptions()) {
    return TEMP_WINDOW_REQUEST_SOURCES.Options
  }
  if (isExtensionSidePanel()) {
    return TEMP_WINDOW_REQUEST_SOURCES.Sidepanel
  }
  if (isExtensionBackground()) {
    return TEMP_WINDOW_REQUEST_SOURCES.Background
  }
  return TEMP_WINDOW_REQUEST_SOURCES.Background
}

/** Resolves source-aware minimization and browser compatibility policy. */
export function resolveTempWindowRequestPolicy({
  tempWindowRequestSource,
  suppressMinimize,
}: {
  tempWindowRequestSource?: unknown
  suppressMinimize?: unknown
}) {
  const resolvedSource =
    tempWindowRequestSource === undefined
      ? getCurrentTempWindowRequestSource()
      : normalizeTempWindowRequestSource(tempWindowRequestSource)
  const resolvedSuppressMinimize =
    typeof suppressMinimize === "boolean"
      ? suppressMinimize
      : resolvedSource === TEMP_WINDOW_REQUEST_SOURCES.Popup
  const blockedReason: TempWindowRequestBlockedReason =
    resolvedSource === TEMP_WINDOW_REQUEST_SOURCES.Popup &&
    isProtectionBypassFirefoxEnv()
      ? "firefox_popup_unsupported"
      : null

  return {
    tempWindowRequestSource: resolvedSource,
    suppressMinimize: resolvedSuppressMinimize,
    blockedReason,
  }
}
