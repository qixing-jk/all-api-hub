import type { ApiResponse } from "~/services/apiTransport/type"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type {
  ManagedUpstreamResourceDetail,
  ManagedUpstreamResourceDraftValidationResult,
  ManagedUpstreamResourceFieldContext,
  ManagedUpstreamResourceFieldDescriptor,
  ManagedUpstreamResourceRef,
  ManagedUpstreamResourceSecretResult,
  ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"

export type ManagedUpstreamResourceRequestOptions = {
  signal?: AbortSignal
  bypassSiteRequestLimit?: boolean
}

export type ManagedUpstreamResourceListData = {
  items: ManagedUpstreamResourceSummary[]
  total: number
}

export type ManagedUpstreamResourceImportInput = {
  resource?: ManagedUpstreamResourceSummary
  source?: unknown
}

export type ManagedUpstreamResourceMutationResponse<TData = unknown> =
  ApiResponse<TData>

export type ManagedUpstreamResourceItemsCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
  TNative = unknown,
  TDraft = unknown,
> = {
  list(
    config: TConfig,
    options?: ManagedUpstreamResourceRequestOptions,
  ): Promise<ManagedUpstreamResourceListData>
  search(
    config: TConfig,
    keyword: string,
  ): Promise<ManagedUpstreamResourceListData | null>
  getDetail(
    config: TConfig,
    ref: ManagedUpstreamResourceRef,
  ): Promise<ManagedUpstreamResourceDetail<TNative>>
  create(
    config: TConfig,
    draft: TDraft,
  ): Promise<
    ManagedUpstreamResourceMutationResponse<ManagedUpstreamResourceSummary | null>
  >
  update(
    config: TConfig,
    detail: ManagedUpstreamResourceDetail<TNative>,
    draft: TDraft,
  ): Promise<
    ManagedUpstreamResourceMutationResponse<ManagedUpstreamResourceSummary | null>
  >
  delete(
    config: TConfig,
    ref: ManagedUpstreamResourceRef,
  ): Promise<ManagedUpstreamResourceMutationResponse<unknown>>
}

export type ManagedUpstreamResourceDraftsCapability<
  TNative = unknown,
  TDraft = unknown,
> = {
  prepareImportDraft(input: ManagedUpstreamResourceImportInput): Promise<TDraft>
  prepareEditDraft(detail: ManagedUpstreamResourceDetail<TNative>): TDraft
  describeFields(
    context: ManagedUpstreamResourceFieldContext<TNative>,
  ): ManagedUpstreamResourceFieldDescriptor[]
  validateDraft(draft: TDraft): ManagedUpstreamResourceDraftValidationResult
}

export type ManagedUpstreamResourceSecretCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  revealSecret(
    config: TConfig,
    ref: ManagedUpstreamResourceRef,
  ): Promise<ManagedUpstreamResourceSecretResult>
}

export type ManagedUpstreamResourcesCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
  TNative = unknown,
  TDraft = unknown,
> = {
  items: ManagedUpstreamResourceItemsCapability<TConfig, TNative, TDraft>
  drafts: ManagedUpstreamResourceDraftsCapability<TNative, TDraft>
  secrets?: ManagedUpstreamResourceSecretCapability<TConfig>
}
