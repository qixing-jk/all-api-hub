import claudeCodeRouterLogo from "~/assets/claude-code-router-logo.png"
import { cn } from "~/lib/utils"

import { ICON_SIZE_CLASSNAME, type IconSize } from "./iconSizes"

interface ClaudeCodeRouterIconProps {
  size?: IconSize
}

/**
 * ClaudeCodeRouterIcon renders the Claude Code Router logo at a chosen size.
 */
export function ClaudeCodeRouterIcon({
  size = "sm",
}: ClaudeCodeRouterIconProps) {
  return (
    <img
      src={claudeCodeRouterLogo}
      alt="Claude Code Router logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
