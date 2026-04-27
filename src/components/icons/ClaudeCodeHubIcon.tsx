import claudeCodeHubLogo from "~/assets/claude-code-hub-logo.png"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface ClaudeCodeHubIconProps {
  size?: IconSize
}

/**
 * ClaudeCodeHubIcon renders the Claude Code Hub brand mark at a chosen size.
 */
export function ClaudeCodeHubIcon({ size = "sm" }: ClaudeCodeHubIconProps) {
  return (
    <img
      src={claudeCodeHubLogo}
      alt="Claude Code Hub logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
