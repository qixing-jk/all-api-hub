import { getHomepage } from "~/utils/packageMeta"
import { joinUrl } from "~/utils/url"

const normalizeVersion = (version: string) => version.trim().replace(/^v/i, "")

export const getChangelogAnchorId = (version: string) => {
  const normalized = normalizeVersion(version)
  const dashed = normalized.replace(/\./g, "-")
  return `_${dashed}`
}

export const getDocsChangelogUrl = (version?: string) => {
  const base = getHomepage()
  const url = joinUrl(base, "changelog.html")

  if (!version) return url

  const anchorId = getChangelogAnchorId(version)
  return `${url}#${anchorId}`
}
