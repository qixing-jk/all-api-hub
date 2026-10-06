import {
  TEMP_CONTEXT_MODES,
  TEMP_CONTEXT_PREFERENCE_MODES,
  type TempContextMode,
  type TempContextPreferenceMode,
} from "~/constants/tempContextMode"
import {
  BROWSER_FOCUS_STATES,
  type BrowserFocusState,
} from "~/utils/browser/browserFocus"

/** Resolves the concrete context mode for a single open request. */
export function resolveTempContextOpenMode(params: {
  preferredMode: TempContextPreferenceMode
  incognito: boolean
  sharedWindowAvailable: boolean
  focusState: BrowserFocusState
}): TempContextMode {
  if (params.incognito) {
    return TEMP_CONTEXT_MODES.Window
  }

  if (params.preferredMode !== TEMP_CONTEXT_PREFERENCE_MODES.Auto) {
    return params.preferredMode
  }

  if (params.sharedWindowAvailable) {
    return TEMP_CONTEXT_MODES.Composite
  }

  return params.focusState === BROWSER_FOCUS_STATES.Focused
    ? TEMP_CONTEXT_MODES.Composite
    : TEMP_CONTEXT_MODES.Tab
}
