import { getChangelogAnchorId } from "~/utils/changelogAnchor"
import { getHomepage } from "~/utils/packageMeta"
import { joinUrl } from "~/utils/url"

export const getDocsChangelogUrl = (version?: string) => {
  const base = getHomepage()
  const url = joinUrl(base, "changelog.html")

  if (!version) return url

  const anchorId = getChangelogAnchorId(version)
  return `${url}#${anchorId}`
}
