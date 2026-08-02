export const TEMP_CONTEXT_MODES = {
  Window: "window",
  Composite: "composite",
  Tab: "tab",
} as const

export type TempContextMode =
  (typeof TEMP_CONTEXT_MODES)[keyof typeof TEMP_CONTEXT_MODES]

export const TEMP_CONTEXT_PREFERENCE_MODES = {
  Auto: "auto",
  ...TEMP_CONTEXT_MODES,
} as const

export type TempContextPreferenceMode =
  (typeof TEMP_CONTEXT_PREFERENCE_MODES)[keyof typeof TEMP_CONTEXT_PREFERENCE_MODES]
