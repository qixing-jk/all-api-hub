import claudeCodeRouterLogo from "~/assets/claude-code-router-logo.png"

type ClaudeCodeRouterIconSize = "sm" | "md" | "lg"

const SIZE_MAP: Record<ClaudeCodeRouterIconSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
}

interface ClaudeCodeRouterIconProps {
  size?: ClaudeCodeRouterIconSize
}

/**
 * ClaudeCodeRouterIcon renders the Claude Code Router logo at a chosen size.
 */
export function ClaudeCodeRouterIcon({
  size = "sm",
}: ClaudeCodeRouterIconProps) {
  const dimension = SIZE_MAP[size]

  return (
    <img
      src={claudeCodeRouterLogo}
      alt="Claude Code Router logo"
      width={dimension}
      height={dimension}
      loading="lazy"
      decoding="async"
    />
  )
}
