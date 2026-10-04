import gptLoadLogo from "~/assets/gpt-load-logo.svg"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface GptLoadIconProps {
  size?: IconSize
}

/**
 * GptLoadIcon renders the gpt-load brand mark at a chosen size.
 *
 * The mark is the gateway's own favicon, vendored from the MIT-licensed
 * upstream repository: https://github.com/tbphp/gpt-load/blob/main/web/public/favicon.svg
 */
export function GptLoadIcon({ size = "sm" }: GptLoadIconProps) {
  return (
    <img
      src={gptLoadLogo}
      alt="gpt-load logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
