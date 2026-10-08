import {
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type ManagedSiteMutationResult } from "~/services/managedSites/mutations"
import type {
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
  ClaudeCodeHubProviderUpdatePayload,
} from "~/types/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"

export type ClaudeCodeHubNativeConfig = {
  config: ClaudeCodeHubConfig
  scopeKey: string
}

export type ClaudeCodeHubNativeUpdateCommand = Omit<
  ClaudeCodeHubProviderUpdatePayload,
  "providerId"
>

export type ClaudeCodeHubNativeResourceOperations = {
  scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: ClaudeCodeHubProviderDisplay[]; total: number }>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ClaudeCodeHubProviderDisplay>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    command: ClaudeCodeHubProviderCreatePayload,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay>>
  update(
    detail: ClaudeCodeHubProviderDisplay,
    command: ClaudeCodeHubNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay>>
  delete(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}
