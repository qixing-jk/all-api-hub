/** Shared targets for logging settings and settings search. */
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"

export const LOGGING_SETTINGS_TARGET_IDS = {
  section: SETTINGS_ANCHORS.LOGGING,
  enabled: SETTINGS_ANCHORS.LOGGING_ENABLED,
  level: SETTINGS_ANCHORS.LOGGING_LEVEL,
  history: SETTINGS_ANCHORS.LOGGING_HISTORY,
} as const
