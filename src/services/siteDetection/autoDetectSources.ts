import { autoDetectViaBackground } from "./sources/background"
import { autoDetectFromCurrentTab } from "./sources/currentTab"
import { autoDetectDirect } from "./sources/direct"
import { autoDetectFromExistingTab } from "./sources/existingTab"

/** Source adapters own authentication reads and canonical detection result assembly. */
export const accountDetectionSources = {
  currentTab: autoDetectFromCurrentTab,
  background: autoDetectViaBackground,
  direct: autoDetectDirect,
  existingTab: autoDetectFromExistingTab,
}
