/**
 * Cross-platform keyboard modifier helpers.
 *
 * Notes:
 * - On macOS, users expect "Cmd" (`metaKey`) to behave like "Ctrl" on Windows/Linux.
 * - For bulk actions we typically treat (Ctrl OR Cmd) as a single "primary modifier".
 */

export type ModifierState = {
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

/**
 * Returns `true` when the platform's primary modifier is pressed.
 * - Windows/Linux: Ctrl
 * - macOS: Cmd (Meta)
 */
export function isPrimaryModifierPressed(modifiers: ModifierState): boolean {
  return Boolean(modifiers.ctrlKey || modifiers.metaKey)
}

/**
 * Bulk-open options for external check-in links derived from a mouse/keyboard event.
 * - Primary modifier (Ctrl/Cmd): open all configured check-ins.
 * - Shift: open in a new browser window.
 *
 * Both modifiers can be combined (Ctrl/Cmd + Shift).
 */
export function getExternalCheckInOpenOptions(modifiers: ModifierState): {
  openAll: boolean
  openInNewWindow: boolean
} {
  return {
    openAll: isPrimaryModifierPressed(modifiers),
    openInNewWindow: Boolean(modifiers.shiftKey),
  }
}
