import { MANAGED_RESOURCE_EXACT_MATCH_BASES } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_SITE_CHANNEL_DRAFT_PURPOSES,
  type ManagedSiteCapabilities,
  type ManagedSiteChannelDraftRequestOptions,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/configuration/runtimeConfig"
import {
  getManagedSiteChannelExactMatch,
  type ManagedSiteChannelMatchUnresolvedReason,
} from "~/services/managedSites/matching/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/matching/channelMatchResolver"
import { createManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"

/** Shared request ordering for existence checks and import previews. */
export async function prepareManagedSiteChannelMatch(
  params: ManagedSiteChannelDraftRequestOptions & {
    source: ManagedSiteChannelDraftSource
    managedSite: ManagedSiteCapabilities
    managedConfig: ManagedSiteRuntimeConfigValue
    verifyExisting?: boolean
    resolvedChannelKeysByResourceKey?: Record<string, string>
    protectionBypassExecution?: ProtectionBypassExecution
    /** Reuse the same operation's model inputs during explicit secret verification. */
    preparedDraft?: ManagedSiteChannelDraft
    hiddenKeyResourceRefs?: readonly ManagedResourceRef[]
    onDraftPrepared?(draft: ManagedSiteChannelDraft): void
  },
) {
  const { managedSite, source } = params
  const operationContext =
    params.operationContext ?? createManagedSiteOperationContext()
  const draftOptions = {
    purpose: params.purpose,
    operationContext,
    signal: params.signal,
    requestScheduling: params.requestScheduling,
  }
  const inspectExisting =
    params.verifyExisting !== false &&
    supportsManagedSiteBaseUrlChannelLookup(managedSite.siteType)
  params.signal?.throwIfAborted()
  let draft =
    params.preparedDraft ??
    (await managedSite.channelDrafts.prepareFormData(source, {
      ...draftOptions,
      ...(inspectExisting ? { modelPrefill: false } : {}),
    }))
  params.signal?.throwIfAborted()
  params.onDraftPrepared?.(draft)
  if (!inspectExisting || !draft.base_url.trim()) {
    return { draft, resolution: null, creationSkipped: false }
  }
  const matchOptions = {
    managedSite,
    managedConfig: params.managedConfig,
    accountBaseUrl: normalizeManagedSiteChannelBaseUrl(draft.base_url),
    key: draft.key,
    resolvedChannelKeysByResourceKey: params.resolvedChannelKeysByResourceKey,
    resolveHiddenKeys: true,
    hiddenKeyResourceRefs: params.hiddenKeyResourceRefs,
    stopAfterExactMatch: true,
    secretReadFailures: new Map<
      string,
      ManagedSiteChannelMatchUnresolvedReason
    >(),
    requestCache: operationContext.channelMatch,
    protectionBypassExecution: params.protectionBypassExecution,
    signal: params.signal,
    requestScheduling: params.requestScheduling,
  }
  let resolution = await resolveManagedSiteChannelMatch({
    ...matchOptions,
    models: params.preparedDraft ? draft.models : [],
  })
  params.signal?.throwIfAborted()
  const needsModelsForMatching =
    resolution.searchCompleted &&
    resolution.url.matched &&
    (!resolution.key.comparable || resolution.key.matched) &&
    managedSite.matching.exactMatchBasis !==
      MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY
  const needsCreationDraft =
    params.purpose !== MANAGED_SITE_CHANNEL_DRAFT_PURPOSES.MATCHING &&
    !(
      managedSite.matching.exactMatchBasis ===
        MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY &&
      getManagedSiteChannelExactMatch(resolution, managedSite.matching)
    )
  if (!params.preparedDraft && (needsModelsForMatching || needsCreationDraft)) {
    draft = await managedSite.channelDrafts.prepareFormData(
      source,
      draftOptions,
    )
    params.signal?.throwIfAborted()
    params.onDraftPrepared?.(draft)
    if (resolution.searchCompleted) {
      resolution = await resolveManagedSiteChannelMatch({
        ...matchOptions,
        accountBaseUrl: normalizeManagedSiteChannelBaseUrl(draft.base_url),
        key: draft.key,
        models: draft.models,
      })
    }
    params.signal?.throwIfAborted()
  }
  return {
    draft,
    resolution,
    creationSkipped:
      params.purpose !== MANAGED_SITE_CHANNEL_DRAFT_PURPOSES.MATCHING &&
      !needsCreationDraft,
  }
}
