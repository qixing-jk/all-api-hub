import {
  getAccountRuntimeKeyExportId,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { KILO_CODE_PROVIDER_PROTOCOLS } from "~/services/integrations/kiloCodeExport"
import type { DisplaySiteData } from "~/types"

export const KILO_CODE_INVENTORY_STATUSES = {
  Idle: "idle",
  Loading: "loading",
  Loaded: "loaded",
  Error: "error",
} as const

type TokenLoadStatus =
  (typeof KILO_CODE_INVENTORY_STATUSES)[keyof typeof KILO_CODE_INVENTORY_STATUSES]

export interface TokenInventoryState {
  status: TokenLoadStatus
  tokens: AccountRuntimeKey[]
  errorMessage?: string
}

export type DefaultTokenCreateContext = {
  siteId: string
  account: DisplaySiteData
}

export const KILO_CODE_PROTOCOL_OPTIONS = [
  {
    value: KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible,
    label: "ui:dialog.kiloCode.protocols.openAICompatible",
  },
  {
    value: KILO_CODE_PROVIDER_PROTOCOLS.OpenAIResponses,
    label: "ui:dialog.kiloCode.protocols.openAIResponses",
  },
  {
    value: KILO_CODE_PROVIDER_PROTOCOLS.AnthropicMessages,
    label: "ui:dialog.kiloCode.protocols.anthropicMessages",
  },
] as const

/**
 * Build a safe, human-readable token label for selection UI (never reveals the key).
 */
export function getTokenLabel(
  token: AccountRuntimeKey,
  fallbackPrefix: string,
) {
  const trimmedName = (token.label ?? "").trim()
  if (trimmedName) return trimmedName
  return `${fallbackPrefix} #${getAccountRuntimeKeyExportId(token)}`
}

/**
 * Build a compact label for displaying a site in dense UI (prefers name, falls back to hostname).
 */
export function getSiteDisplayName(site: DisplaySiteData) {
  const trimmedName = (site.name ?? "").trim()
  if (trimmedName) return trimmedName
  try {
    return new URL(site.baseUrl).host
  } catch {
    return site.baseUrl.trim()
  }
}

/**
 * Unique key for state maps tracking (siteId, tokenId) combinations in this dialog.
 */
export function getTokenSelectionKey(siteId: string, tokenId: string) {
  return `${siteId}:${tokenId}`
}
