import type { DisplaySiteData } from "~/types"

/**
 * Normalizes a string for search matching
 * - Converts to lowercase
 * - Removes http/https protocol
 * - Removes trailing slashes
 * - Removes query parameters and hash
 * - Normalizes whitespace (trim and collapse multiple spaces)
 * - Converts full-width characters to half-width
 */
function normalizeString(str: string): string {
  if (!str) return ""

  // Convert to lowercase
  let normalized = str.toLowerCase().trim()

  // Convert full-width to half-width characters
  normalized = normalized.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )

  // Remove protocol for URLs
  normalized = normalized.replace(/^https?:\/\//, "")

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "")

  // Remove query parameters and hash
  normalized = normalized.replace(/[?#].*$/, "")

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, " ").trim()

  return normalized
}

/**
 * Extracts domain and path from a normalized URL string
 */
function parseUrl(url: string): { domain: string; path: string } {
  const normalized = normalizeString(url)
  const slashIndex = normalized.indexOf("/")

  if (slashIndex === -1) {
    return { domain: normalized, path: "" }
  }

  return {
    domain: normalized.substring(0, slashIndex),
    path: normalized.substring(slashIndex),
  }
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

  const normalizedQuery = normalizeString(query)
  if (!normalizedQuery) {
    return 0
  }

  let score = 0
  for (const tag of tags) {
    const normalizedTag = normalizeString(tag)
    if (!normalizedTag) continue
    if (normalizedTag === normalizedQuery) {
      score = Math.max(score, 4)
    } else if (normalizedTag.includes(normalizedQuery)) {
      score = Math.max(score, 2)
    }
  }

  return score
}

/**
 * Calculates the score for URL field matching
 */
function scoreUrlMatch(url: string, query: string): number {
  const { domain, path } = parseUrl(url)
  const normalizedQuery = normalizeString(query)

  let score = 0

  // Domain matching
  if (domain === normalizedQuery) {
    score += 6 // Exact domain match
  } else if (domain.includes(normalizedQuery)) {
    score += 3 // Domain contains query
  }

  // Path matching
  if (path && normalizedQuery.length > 0) {
    const pathSegments = path.split("/").filter(Boolean)
    for (const segment of pathSegments) {
      if (segment.includes(normalizedQuery)) {
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
  const normalized = normalizeString(token)
  const normalizedQuery = normalizeString(query)

  if (normalized.includes(normalizedQuery)) {
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

  const normalizedId = normalizeString(accountId)
  const normalizedQuery = normalizeString(query)

  if (normalizedId.includes(normalizedQuery)) {
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
 * Searches accounts based on a query string
 * @param accounts - Array of accounts to search
 * @param query - Search query string (supports multiple keywords separated by space)
 * @returns Array of search results with score and matched fields
 */
export function searchAccounts(
  accounts: DisplaySiteData[],
  query: string,
): SearchResult[] {
  if (!query || !query.trim()) {
    return []
  }

  // Split query into tokens (keywords)
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => normalizeString(token))
    .filter((token) => token.length > 0)

  if (tokens.length === 0) {
    return []
  }

  const results: SearchResult[] = []

  for (const account of accounts) {
    let totalScore = 0
    const matchedFields = new Set<string>()

    // For each token, calculate the best matching score across all fields
    for (const token of tokens) {
      let tokenScore = 0
      const tokenMatchedFields = new Set<string>()

      // Match against name
      const nameScore = scoreNameMatch(normalizeString(account.name), token)
      if (nameScore > 0) {
        tokenScore += nameScore
        tokenMatchedFields.add("name")
      }

      // Match against baseUrl (site_url)
      const baseUrlScore = scoreUrlMatch(account.baseUrl, token)
      if (baseUrlScore > 0) {
        tokenScore += baseUrlScore
        tokenMatchedFields.add("baseUrl")
      }

      // Match against customCheckInUrl
      const customCheckInUrl = account.checkIn?.customCheckInUrl
      if (customCheckInUrl) {
        const checkInScore = scoreUrlMatch(customCheckInUrl, token)
        if (checkInScore > 0) {
          tokenScore += checkInScore
          tokenMatchedFields.add("customCheckInUrl")
        }
      }

      // Match against customRedeemUrl
      const customRedeemUrl = account.checkIn?.customRedeemUrl
      if (customRedeemUrl) {
        const redeemScore = scoreUrlMatch(customRedeemUrl, token)
        if (redeemScore > 0) {
          tokenScore += redeemScore
          tokenMatchedFields.add("customRedeemUrl")
        }
      }

      // Match against username
      const usernameScore = scoreNameMatch(
        normalizeString(account.username),
        token,
      )
      if (usernameScore > 0) {
        tokenScore += usernameScore
        tokenMatchedFields.add("username")
      }

      const accountIdScore = scoreAccountIdMatch(account.id, token)
      if (accountIdScore > 0) {
        tokenScore += accountIdScore
        // accountId is internal-only, no highlight needed
      }

      // Match against tags
      const tagScore = scoreTagMatch(account.tags, token)
      if (tagScore > 0) {
        tokenScore += tagScore
        tokenMatchedFields.add("tags")
      }

      // Match against accessToken (lowest weight, not added to matchedFields for UI)
      const accessTokenScore = scoreTokenMatch(account.token, token)
      if (accessTokenScore > 0) {
        tokenScore += accessTokenScore
        // Note: We don't add "accessToken" to matchedFields as it should not be displayed/highlighted
      }

      // Only consider this token matched if it scored anything
      if (tokenScore > 0) {
        totalScore += tokenScore
        tokenMatchedFields.forEach((field) => matchedFields.add(field))
      } else {
        // If any token doesn't match, this account doesn't match the composite query
        totalScore = 0
        matchedFields.clear()
        break
      }
    }

    // Only include accounts that matched all tokens
    if (totalScore > 0) {
      results.push({
        account,
        score: totalScore,
        matchedFields: Array.from(matchedFields),
      })
    }
  }

  return results
}
