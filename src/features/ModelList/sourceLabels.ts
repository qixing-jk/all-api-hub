import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import type { ModelManagementItemSource } from "~/features/ModelList/modelManagementSources"
import { tryParseUrl } from "~/utils/core/urlParsing"

type ModelListSourceLabel = {
  label: string
  title?: string
}

type FormatModelListSourceLabelOptions = {
  formatProfileLabel: (params: { name: string; host?: string }) => string
}

/**
 * Formats the model-row source so multi-account views expose both the account
 * name and the site host without repeating URL parsing in every row surface.
 */
export function formatModelListSourceLabel(
  source: ModelManagementItemSource,
  options: FormatModelListSourceLabelOptions,
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

  return {
    label: host ? `${source.account.name} · ${host}` : source.account.name,
    title: baseUrl || undefined,
  }
}
