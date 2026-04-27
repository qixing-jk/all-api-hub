import type { ClaudeCodeHubProviderType } from "~/constants/claudeCodeHub"
import type { NewApiChannel } from "~/types/newApi"

export interface ClaudeCodeHubAllowedModelRule {
  matchType?: string
  pattern?: string
}

export type ClaudeCodeHubAllowedModel = string | ClaudeCodeHubAllowedModelRule

export interface ClaudeCodeHubProviderDisplay {
  id: number
  name: string
  url: string
  maskedKey?: string
  key?: string
  isEnabled?: boolean
  weight?: number
  priority?: number
  groupTag?: string | null
  providerType?: ClaudeCodeHubProviderType | (string & {})
  allowedModels?: ClaudeCodeHubAllowedModel[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface ClaudeCodeHubProviderWritePayload {
  name?: string
  url?: string
  key?: string
  is_enabled?: boolean
  weight?: number
  priority?: number
  group_tag?: string | null
  provider_type?: ClaudeCodeHubProviderType | (string & {})
  allowed_models?: ClaudeCodeHubAllowedModel[]
}

export type ClaudeCodeHubProviderCreatePayload = Required<
  Pick<
    ClaudeCodeHubProviderWritePayload,
    "name" | "url" | "key" | "provider_type" | "allowed_models"
  >
> &
  ClaudeCodeHubProviderWritePayload

export type ClaudeCodeHubProviderUpdatePayload =
  ClaudeCodeHubProviderWritePayload & {
    providerId: number
  }

export type ClaudeCodeHubChannelWithData = NewApiChannel & {
  /** Raw Claude Code Hub provider display data. */
  _claudeCodeHubData: ClaudeCodeHubProviderDisplay
}
