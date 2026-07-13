export const TEMP_CONTEXT_MODES = {
  Window: "window",
  Composite: "composite",
  Tab: "tab",
} as const

export type TempContextMode =
  (typeof TEMP_CONTEXT_MODES)[keyof typeof TEMP_CONTEXT_MODES]
