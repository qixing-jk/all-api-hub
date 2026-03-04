/**
 * Shared icon sizing tokens for integration/action icons.
 *
 * Keeps visual density consistent across the UI by providing a single source of
 * truth for icon sizes used in toolbars, lists, and buttons.
 */
export type IconSize = "sm" | "md" | "lg"

/**
 * Tailwind class names for text/emoji icons.
 */
export const ICON_SIZE_CLASSNAME: Record<IconSize, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
}
