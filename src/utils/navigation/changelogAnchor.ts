const normalizeVersion = (version: string) => version.trim().replace(/^v/i, "")

export const getChangelogAnchorId = (version: string) => {
  const normalized = normalizeVersion(version)
  const dashed = normalized.replace(/\./g, "-")
  return `_${dashed}`
}
