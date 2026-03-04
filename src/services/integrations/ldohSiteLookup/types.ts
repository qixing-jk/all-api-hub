export type LdohSiteApiItem = {
  id: string
  name?: string
  apiBaseUrl?: string
  // Other fields exist but are intentionally ignored by this extension feature.
  [key: string]: unknown
}

export type LdohSitesApiResponse = {
  sites: LdohSiteApiItem[]
  tags?: string[]
}

export type LdohSiteSummary = {
  id: string
  name?: string
  apiBaseUrl: string
}

export type LdohSiteListCache = {
  version: 1
  fetchedAt: number
  expiresAt: number
  items: LdohSiteSummary[]
}
