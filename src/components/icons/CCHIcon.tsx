import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface CCHIconProps {
  /**
   * Icon size token used across the UI (matches other integration icons).
   */
  size?: IconSize
  /**
   * Optional className for color and additional styling.
   *
   * Tip: the SVG uses `currentColor`, so a Tailwind `text-*` class will control
   * the icon color.
   */
  className?: string
}

/**
 * CCHIcon renders a lightweight inline SVG for Claude Code Hub integration.
 *
 * The icon is based on the Claude Code Hub favicon (https://claude-code-hub.app/favicon-32x32.png)
 * and features a layered cube/box design representing provider management.
 */
export function CCHIcon({ size = "sm", className }: CCHIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(ICON_SIZE_CLASSNAME[size], className)}
      role="img"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M50 5 L95 27.5 L95 72.5 L50 95 L5 72.5 L5 27.5 Z M50 15 L85 32.5 L85 67.5 L50 85 L15 67.5 L15 32.5 Z"
      />
      <path
        fill="currentColor"
        fillOpacity="0.7"
        d="M50 5 L95 27.5 L50 50 L5 27.5 Z M5 27.5 L50 50 L50 95 L5 72.5 Z M95 27.5 L95 72.5 L50 95 L50 50 Z"
      />
      <path
        fill="currentColor"
        d="M50 35 L75 47.5 L50 60 L25 47.5 Z"
      />
    </svg>
  )
}
