import type { ManagedSiteType } from "~/constants/siteType"
import type { InventoryReadOptions } from "~/services/apiTransport/inventoryReads"
import type { ScheduledReadOptions } from "~/services/apiTransport/requestScheduling"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/configuration/runtimeConfig"
import type { ManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"

import type { ManagedResourceMatchingCapability } from "./managedResourceMatching"
import type { ManagedResourceModelsCapability } from "./managedResourceModels"

export const MANAGED_SITE_CHANNEL_DRAFT_PURPOSES = {
  IMPORT: "import",
  MATCHING: "matching",
  NATIVE_EDITOR: "native-editor",
} as const

export type ManagedSiteChannelRequestOptions = ScheduledReadOptions & {
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

export type ManagedSiteChannelSecretReadOptions = InventoryReadOptions & {
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

export type ManagedSiteChannelDraftRequestOptions = ScheduledReadOptions & {
  /** Native editors own group loading; matching also needs no draft groups. */
  purpose?: (typeof MANAGED_SITE_CHANNEL_DRAFT_PURPOSES)[keyof typeof MANAGED_SITE_CHANNEL_DRAFT_PURPOSES]
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
