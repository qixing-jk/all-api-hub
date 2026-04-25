/**
 * Claude Code Hub API types and interfaces.
 *
 * CCH uses a provider model where:
 * - Providers represent upstream API vendors with name, url, and key
 */

/**
 * CCH Provider representation
 */
export interface CCHProvider {
  id: number
  name: string
  url: string
  providerType: string
  isEnabled: boolean
  weight: number
  priority: number
  createdAt?: string
  updatedAt?: string
}

/**
 * Response from adding a provider
 */
export interface CCHAddProviderResponse {
  ok: boolean
  data?: {
    id: number
    name: string
    url: string
    providerType: string
  }
}

/**
 * Request payload for adding a provider
 */
export interface CCHAddProviderRequest {
  name: string
  url: string
  key: string
  is_enabled?: boolean
  weight?: number
  priority?: number
  provider_type?: "claude" | "claude-auth" | "codex" | "gemini" | "gemini-cli" | "openai-compatible"
  group_tag?: string
  allowed_clients?: string[]
  blocked_clients?: string[]
  limit_daily_usd?: number
  proxy_url?: string
}

/**
 * CCH configuration stored in user preferences
 */
export interface CCHConfig {
  baseUrl: string
  authToken: string
}

/**
 * Export selection for batch operations
 */
export interface CCHExportSelection {
  account: import("~/types").DisplaySiteData
  token: import("~/types").ApiToken
}

/**
 * Result of a single export operation
 */
export interface CCHExportResult {
  success: boolean
  accountBaseUrl: string
  tokenName: string
  message?: string
  providerId?: number
}

/**
 * Batch export result summary
 */
export interface CCHBatchExportResult {
  total: number
  success: number
  failed: number
  results: CCHExportResult[]
}
