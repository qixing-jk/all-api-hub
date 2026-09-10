import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"

import type { ManagedResourceMatchingCapability } from "./managedResourceMatching"
import type { ManagedResourceModelsCapability } from "./managedResourceModels"

export type ManagedSiteChannelRequestOptions = {
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  bypassSiteRequestLimit?: boolean
  /** Fail instead of returning a pagination-capped partial inventory. */
  requireCompleteInventory?: boolean
}

export type ManagedSitePaginatedChannelRequestOptions =
  ManagedSiteChannelRequestOptions & {
    pageSize?: number
    beforeRequest?: () => Promise<void>
    endpoint?: string
    pageStart?: number
  }

export type ManagedSiteChannelSecretReadOptions = {
  protectionBypassExecution: ProtectionBypassExecution
  signal?: AbortSignal
}

/** Provider-neutral connection values for probing an unsaved managed channel. */
export type ManagedSiteChannelModelProbe = {
  channelType: string | number
  baseUrl: string
  credential: string
}

export type ManagedSiteConfigCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  checkValid(): Promise<boolean>
  get(): Promise<TConfig | null>
}

export type ManagedSiteQueriesCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  siteUserGroups?: {
    fetch(
      config: TConfig,
      options?: ManagedSiteChannelRequestOptions,
    ): Promise<string[]>
  }
  accountAvailableModels?: {
    fetch(config: TConfig): Promise<string[]>
  }
}

export type ManagedSiteChannelDraftRequestOptions = {
  operationContext?: ManagedSiteOperationContext
}

export type ManagedSiteChannelDraftsCapability = {
  prepareFormData(
    source: ManagedSiteChannelDraftSource,
    options?: ManagedSiteChannelDraftRequestOptions,
  ): Promise<ManagedSiteChannelDraft>
}

/** Registered managed-site behavior; native resource workspaces own CRUD. */
export interface ManagedSiteCapabilities<
  TConfig = ManagedSiteRuntimeConfigValue,
  TSiteType extends ManagedSiteType = ManagedSiteType,
> {
  siteType: TSiteType
  matching: ManagedResourceMatchingCapability<TConfig>
  config: ManagedSiteConfigCapability<TConfig>
  queries?: ManagedSiteQueriesCapability<TConfig>
  channelDrafts: ManagedSiteChannelDraftsCapability
  models?: ManagedResourceModelsCapability<TConfig>
}
