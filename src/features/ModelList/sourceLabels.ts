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
}

/** Returns the display-safe token label for token-scoped account rows. */
function formatAccountTokenName(sourceIdentity: ModelListSourceIdentity) {
  if (sourceIdentity.kind !== MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN) {
    return null
  }

  return sourceIdentity.tokenName?.trim() || `#${sourceIdentity.tokenId}`
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
  const tokenName = sourceIdentity
    ? formatAccountTokenName(sourceIdentity)
    : null
  const accountLabel = tokenName
    ? `${source.account.name} / ${tokenName}`
    : source.account.name

  return {
    label: host ? `${accountLabel} · ${host}` : accountLabel,
    title: baseUrl || undefined,
  }
}
