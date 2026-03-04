import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface KiloCodeIconProps {
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
 * KiloCodeIcon renders a lightweight inline SVG for the Kilo Code integration.
 *
 * Note: this is intentionally an inline SVG (not an imported asset) so the icon
 * can inherit text color via `currentColor` and fit seamlessly in IconButton
 * toolbars.
 */
export function KiloCodeIcon({ size = "sm", className }: KiloCodeIconProps) {
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
        d="M0,0v100h100V0H0ZM92.5925926,92.5925926H7.4074074V7.4074074h85.1851852v85.1851852ZM61.1111044,71.9096084h9.2592593v7.4074074h-11.6402116l-5.026455-5.026455v-11.6402116h7.4074074v9.2592593ZM77.7777711,71.9096084h-7.4074074v-9.2592593h-9.2592593v-7.4074074h11.6402116l5.026455,5.026455v11.6402116ZM46.2962963,61.1114207h-7.4074074v-7.4074074h7.4074074v7.4074074ZM22.2222222,53.7040133h7.4074074v16.6666667h16.6666667v7.4074074h-19.047619l-5.026455-5.026455v-19.047619ZM77.7777711,38.8888889v7.4074074h-24.0740741v-7.4074074h8.2781918v-9.2592593h-8.2781918v-7.4074074h10.6591442l5.026455,5.026455v11.6402116h8.3884749ZM29.6296296,30.5555556h9.2592593l7.4074074,7.4074074v8.3333333h-7.4074074v-8.3333333h-9.2592593v8.3333333h-7.4074074v-24.0740741h7.4074074v8.3333333ZM46.2962963,30.5555556h-7.4074074v-8.3333333h7.4074074v8.3333333Z"
      />
    </svg>
  )
}
