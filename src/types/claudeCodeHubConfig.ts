/**
 * Claude Code Hub managed-site admin configuration.
 */
export interface ClaudeCodeHubConfig {
  /** Claude Code Hub site base URL. */
  baseUrl: string
  /** Admin token or API key accepted by the action API. */
  adminToken: string
}

export const DEFAULT_CLAUDE_CODE_HUB_CONFIG: ClaudeCodeHubConfig = {
  baseUrl: "",
  adminToken: "",
}
