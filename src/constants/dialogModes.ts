/**
 * Dialog mode constants for type-safe mode handling
 */
export const DIALOG_MODES = {
  ADD: "add",
  EDIT: "edit",
  VIEW: "view",
} as const

/**
 * Type representing all valid dialog modes
 */
export type DialogMode = (typeof DIALOG_MODES)[keyof typeof DIALOG_MODES]
