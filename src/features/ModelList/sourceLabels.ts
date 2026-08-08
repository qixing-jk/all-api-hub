import {
  MODEL_LIST_SOURCE_IDENTITY_KINDS,
  MODEL_MANAGEMENT_SOURCE_KINDS,
} from "~/features/ModelList/modelManagementSources"
import type {
  ModelListSourceIdentity,
  ModelManagementItemSource,
} from "~/features/ModelList/modelManagementSources"
import { tryParseUrl } from "~/utils/core/urlParsing"

type ModelListSourceLabel = {
  label: string
  title?: string
}

type FormatModelListSourceLabelOptions = {
  formatProfileLabel: (params: { name: string; host?: string }) => string
  formatProviderCatalogLabel: (params: {
    provider: Extract<
      ModelListSourceIdentity,
      { kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.PROVIDER_CATALOG }
    >["provider"]
    providerName: string
  }) => string
  formatPersonalizedCatalogLabel: (params: { accountName: string }) => string
}

/** Returns the display-safe name for token- or runtime-key-scoped account rows. */
function formatScopedSourceIdentityName(
  sourceIdentity: ModelListSourceIdentity,
) {
  switch (sourceIdentity.kind) {
    case MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN:
      return sourceIdentity.tokenName?.trim() || `#${sourceIdentity.tokenId}`
    case MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY:
      return (
        sourceIdentity.runtimeKeyName?.trim() || sourceIdentity.runtimeKeyId
      )
    default:
      return null
  }
}

/**
 * Formats the model-row source so multi-account views expose both the account
 * name and the site host without repeating URL parsing in every row surface.
 */
export function formatModelListSourceLabel(
  source: ModelManagementItemSource,
  options: FormatModelListSourceLabelOptions,
  sourceIdentity?: ModelListSourceIdentity,
): ModelListSourceLabel {
  if (
    sourceIdentity?.kind === MODEL_LIST_SOURCE_IDENTITY_KINDS.PROVIDER_CATALOG
  ) {
    return {
      label: options.formatProviderCatalogLabel({
        provider: sourceIdentity.provider,
        providerName: sourceIdentity.providerName,
      }),
    }
  }

  if (
    sourceIdentity?.kind ===
      MODEL_LIST_SOURCE_IDENTITY_KINDS.PERSONALIZED_CATALOG &&
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
  ) {
    const baseUrl = source.account.baseUrl?.trim() ?? ""
    return {
      label: options.formatPersonalizedCatalogLabel({
        accountName: source.account.name,
      }),
      title: baseUrl || undefined,
    }
  }

  if (source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE) {
    const baseUrl = source.profile.baseUrl.trim()
    const host = tryParseUrl(baseUrl)?.host || baseUrl || undefined

    return {
      label: options.formatProfileLabel({
        name: source.profile.name,
        host,
      }),
      title: baseUrl || undefined,
    }
  }

  const baseUrl = source.account.baseUrl?.trim() ?? ""
  const host = tryParseUrl(baseUrl)?.host || baseUrl || undefined
  const scopedSourceName = sourceIdentity
    ? formatScopedSourceIdentityName(sourceIdentity)
    : null
  const accountLabel = scopedSourceName
    ? `${source.account.name} / ${scopedSourceName}`
    : source.account.name

  return {
    label: host ? `${accountLabel} · ${host}` : accountLabel,
    title: baseUrl || undefined,
  }
}
