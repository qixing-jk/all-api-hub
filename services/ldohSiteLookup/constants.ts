export const LDOH_ORIGIN = "https://ldoh.105117.xyz" as const

export const LDOH_SITES_ENDPOINT = "/api/sites" as const

export const LDOH_SITE_SEARCH_QUERY_PARAM = "q" as const

// Chosen to be long enough to stay quiet, short enough to avoid stale results.
export const LDOH_SITE_LIST_CACHE_TTL_MS = 12 * 60 * 60 * 1000
