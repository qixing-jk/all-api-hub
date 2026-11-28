/** Editor projection IDs shared with native field presentation. */
export const PMPLAN_KEY_EDITOR_FIELDS = {
  Expiry: "expiry",
  ExpiresAt: "expiresAt",
  Models: "models",
} as const

export const PMPLAN_KEY_EXPIRY_PRESETS = {
  SevenDays: "7",
  ThirtyDays: "30",
  NinetyDays: "90",
  Never: "never",
  Custom: "custom",
} as const

/** The native update route accepts at most 200 model restrictions. */
export const PMPLAN_KEY_MODEL_UPDATE_LIMIT = 200
