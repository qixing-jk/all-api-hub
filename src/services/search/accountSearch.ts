import { normalizeAccountDisplayNamePart } from "~/services/accounts/utils/accountDisplayName"
import type { DisplaySiteData } from "~/types"

/**
 * Normalizes general text fields for search matching using the shared
 * account-display normalization pipeline.
 */
export function normalizeSearchText(str: string): string {
  if (!str) return ""
  return normalizeAccountDisplayNamePart(str)
}

/**
 * Normalizes URL-like search text while preserving literal matching for
 * non-URL fields such as names and usernames.
 */
export function normalizeSearchUrl(str: string): string {
  if (!str) return ""

  let normalized = str.trim()

  // Remove protocol for URLs
  normalized = normalized.replace(/^https?:\/\//i, "")

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "")

  // Remove query parameters and hash
  normalized = normalized.replace(/[?#].*$/, "")

  return normalizeSearchText(normalized)
}

/**
 * Extracts domain and path from a normalized URL string
 */
function parseUrl(url: string): { domain: string; path: string } {
  const normalized = normalizeSearchUrl(url)
  const slashIndex = normalized.indexOf("/")

  if (slashIndex === -1) {
    return { domain: normalized, path: "" }
  }

  return {
    domain: normalized.substring(0, slashIndex),
    path: normalized.substring(slashIndex),
  }
}

interface IndexedUrlField {
  domain: string
  path: string
}

interface IndexedAccountSearchEntry {
  account: DisplaySiteData
  normalizedName: string
  normalizedUsername: string
  normalizedTags: string[]
  normalizedToken: string
  normalizedAccountId: string
  baseUrl: IndexedUrlField
  customCheckInUrl: IndexedUrlField | null
  customRedeemUrl: IndexedUrlField | null
}

interface SearchToken {
  text: string
  url: string
  parsedUrl: IndexedUrlField | null
}

/**
 * Builds a reusable search index so repeated queries can avoid re-normalizing
 * every account field on each pass.
 */
export function buildAccountSearchIndex(
  accounts: DisplaySiteData[],
): IndexedAccountSearchEntry[] {
  return accounts.map((account) => ({
    account,
    normalizedName: normalizeSearchText(account.name),
    normalizedUsername: normalizeSearchText(account.username),
    normalizedTags: (account.tags ?? [])
      .map((tag) => normalizeSearchText(tag))
      .filter(Boolean),
    normalizedToken: normalizeSearchText(account.token),
    normalizedAccountId: normalizeSearchText(account.id),
    baseUrl: parseUrl(account.baseUrl),
    customCheckInUrl: account.checkIn?.customCheckIn?.url
      ? parseUrl(account.checkIn.customCheckIn.url)
      : null,
    customRedeemUrl: account.checkIn?.customCheckIn?.redeemUrl
      ? parseUrl(account.checkIn.customCheckIn.redeemUrl)
      : null,
  }))
}

/**
 * Calculates the score for name field matching
 */
function scoreNameMatch(normalized: string, query: string): number {
  if (normalized === query) return 8 // Exact match
  if (normalized.startsWith(query)) return 5 // Prefix match
  if (normalized.includes(query)) return 3 // Substring match
  return 0
}

/**
 * Calculates a relevance score based on matching query tokens against account tags.
 */
function scoreTagMatch(tags: string[] | undefined, query: string): number {
  if (!tags || tags.length === 0) {
    return 0
  }

  if (!query) {
    return 0
  }

  let score = 0
  for (const tag of tags) {
    if (!tag) continue
    if (tag === query) {
      score = Math.max(score, 4)
    } else if (tag.includes(query)) {
      score = Math.max(score, 2)
    }
  }

  return score
}

/**
 * Calculates the score for URL field matching
 */
function scoreParsedUrlMatch(
  parsedUrl: IndexedUrlField,
  queryUrl: IndexedUrlField,
): number {
  if (!queryUrl.domain && !queryUrl.path) {
    return 0
  }

  let score = 0

  // Domain matching
  if (parsedUrl.domain === queryUrl.domain) {
    score += 6 // Exact domain match
  } else if (
    parsedUrl.domain.includes(queryUrl.domain) ||
    queryUrl.domain.includes(parsedUrl.domain)
  ) {
    score += 3 // Domain contains query
  }

  // Path matching
  if (parsedUrl.path) {
    const pathSegments = parsedUrl.path.split("/").filter(Boolean)
    const queryPathSegments =
      queryUrl.path.length > 0
        ? queryUrl.path.split("/").filter(Boolean)
        : queryUrl.domain
          ? [queryUrl.domain]
          : []
    for (const querySegment of queryPathSegments) {
      if (!querySegment) continue
      if (
        pathSegments.some(
          (segment) =>
            segment.includes(querySegment) || querySegment.includes(segment),
        )
      ) {
        score += 2 // Path segment contains query
        break
      }
    }
  }

  return score
}

/**
 * Calculates the score for access token matching
 */
function scoreTokenMatch(token: string, query: string): number {
  if (token.includes(query)) {
    return 1 // Lowest weight for token matching
  }

  return 0
}

/**
 * Calculates a low-weight score when the query matches part of the internal account id.
 */
function scoreAccountIdMatch(accountId: string, query: string): number {
  if (!accountId) {
    return 0
  }

  if (accountId.includes(query)) {
    return 1 // Lowest priority, same as token matching
  }

  return 0
}

export interface SearchResult {
  account: DisplaySiteData
  score: number
  matchedFields: string[]
}

/**
 * Normalizes a search query into reusable token metadata.
 */
function buildSearchTokens(query: string): SearchToken[] {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => ({
      text: normalizeSearchText(token),
      url: normalizeSearchUrl(token),
      parsedUrl: null,
    }))
    .map((token) => ({
      ...token,
      parsedUrl: token.url ? parseUrl(token.url) : null,
    }))
    .filter((token) => token.text.length > 0 || token.url.length > 0)
}

/**
 * Searches a pre-built account index.
 */
export function searchAccountSearchIndex(
  indexedAccounts: IndexedAccountSearchEntry[],
  query: string,
): SearchResult[] {
  if (!query || !query.trim()) {
    return []
  }

  const tokens = buildSearchTokens(query)
  if (tokens.length === 0) {
    return []
  }

  const results: SearchResult[] = []

  for (const indexedAccount of indexedAccounts) {
    let totalScore = 0
    const matchedFields = new Set<string>()

    for (const token of tokens) {
      let tokenScore = 0
      const tokenMatchedFields = new Set<string>()

      const nameScore = scoreNameMatch(
        indexedAccount.normalizedName,
        token.text,
      )
      if (nameScore > 0) {
        tokenScore += nameScore
        tokenMatchedFields.add("name")
      }

      const baseUrlScore = token.parsedUrl
        ? scoreParsedUrlMatch(indexedAccount.baseUrl, token.parsedUrl)
        : 0
      if (baseUrlScore > 0) {
        tokenScore += baseUrlScore
        tokenMatchedFields.add("baseUrl")
      }

      if (indexedAccount.customCheckInUrl) {
        const checkInScore = token.parsedUrl
          ? scoreParsedUrlMatch(
              indexedAccount.customCheckInUrl,
              token.parsedUrl,
            )
          : 0
        if (checkInScore > 0) {
          tokenScore += checkInScore
          tokenMatchedFields.add("customCheckInUrl")
        }
      }

      if (indexedAccount.customRedeemUrl) {
        const redeemScore = token.parsedUrl
          ? scoreParsedUrlMatch(indexedAccount.customRedeemUrl, token.parsedUrl)
          : 0
        if (redeemScore > 0) {
          tokenScore += redeemScore
          tokenMatchedFields.add("customRedeemUrl")
        }
      }

      const usernameScore = scoreNameMatch(
        indexedAccount.normalizedUsername,
        token.text,
      )
      if (usernameScore > 0) {
        tokenScore += usernameScore
        tokenMatchedFields.add("username")
      }

      const accountIdScore = scoreAccountIdMatch(
        indexedAccount.normalizedAccountId,
        token.text,
      )
      if (accountIdScore > 0) {
        tokenScore += accountIdScore
      }

      const tagScore = scoreTagMatch(indexedAccount.normalizedTags, token.text)
      if (tagScore > 0) {
        tokenScore += tagScore
        tokenMatchedFields.add("tags")
      }

      const accessTokenScore = scoreTokenMatch(
        indexedAccount.normalizedToken,
        token.text,
      )
      if (accessTokenScore > 0) {
        tokenScore += accessTokenScore
      }

      if (tokenScore > 0) {
        totalScore += tokenScore
        tokenMatchedFields.forEach((field) => matchedFields.add(field))
      } else {
        totalScore = 0
        matchedFields.clear()
        break
      }
    }

    if (totalScore > 0) {
      results.push({
        account: indexedAccount.account,
        score: totalScore,
        matchedFields: Array.from(matchedFields),
      })
    }
  }

  return results
}

/**
 * Searches accounts based on a query string
 * @param accounts - Array of accounts to search
 * @param query - Search query string (supports multiple keywords separated by space)
 * @returns Array of search results with score and matched fields
 */
export function searchAccounts(
  accounts: DisplaySiteData[],
  query: string,
): SearchResult[] {
  return searchAccountSearchIndex(buildAccountSearchIndex(accounts), query)
}
