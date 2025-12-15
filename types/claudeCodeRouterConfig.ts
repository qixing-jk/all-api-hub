/**
 * Claude Code Router connection settings.
 * - `baseUrl`: router server base URL (e.g. http://localhost:3000)
 * - `apiKey`: optional APIKEY used to authenticate admin calls like `/api/config`
 */
export interface ClaudeCodeRouterConfig {
  baseUrl: string
  apiKey?: string
}

/**
 * Default (empty) Claude Code Router connection settings.
 */
export const DEFAULT_CLAUDE_CODE_ROUTER_CONFIG: ClaudeCodeRouterConfig = {
  baseUrl: "",
  apiKey: "",
}
