import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  searchAccounts,
  type SearchResult
} from "~/services/search/accountSearch"
import type { DisplaySiteData } from "~/types"

export interface HighlightFragment {
  text: string
  highlighted: boolean
}

export interface SearchResultWithHighlight extends SearchResult {
  highlights: {
    name?: HighlightFragment[]
    baseUrl?: HighlightFragment[]
    customCheckInUrl?: HighlightFragment[]
    customRedeemUrl?: HighlightFragment[]
    username?: HighlightFragment[]
    tags?: HighlightFragment[]
  }
}

interface TokenInfo {
  original: string
  normalized: string
}

function normalizeForMatching(value: string): string {
  if (!value) {
    return ""
  }

  let normalized = value.toLowerCase().trim()

  // Convert full-width characters to half-width
  normalized = normalized.replace(/[\uff01-\uff5e]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  )

  // Remove http/https protocol
  normalized = normalized.replace(/^https?:\/\//, "")

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "")

  // Remove query string and hash
  normalized = normalized.replace(/[?#].*$/, "")

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, " ").trim()

  return normalized
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function createHighlightFragments(
  text: string,
  tokens: TokenInfo[]
): HighlightFragment[] {
  if (!text || tokens.length === 0) {
    return [{ text: text || "", highlighted: false }]
  }

  const uniqueTokens = Array.from(
    new Set(tokens.map((token) => token.original).filter(Boolean))
  )

  if (uniqueTokens.length === 0) {
    return [{ text, highlighted: false }]
  }

  const pattern = uniqueTokens.map(escapeRegex).join("|")
  const regex = new RegExp(`(${pattern})`, "gi")

  const fragments: HighlightFragment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      fragments.push({
        text: text.substring(lastIndex, match.index),
        highlighted: false
      })
    }

    fragments.push({
      text: match[0],
      highlighted: true
    })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    fragments.push({
      text: text.substring(lastIndex),
      highlighted: false
    })
  }

  return fragments.length > 0 ? fragments : [{ text, highlighted: false }]
}

function generateHighlights(
  results: SearchResult[],
  query: string
): SearchResultWithHighlight[] {
  const tokenInfos: TokenInfo[] = query
    .trim()
    .split(/\s+/)
    .map((token) => ({
      original: token,
      normalized: normalizeForMatching(token)
    }))
    .filter((token) => token.normalized.length > 0)

  return results.map((result) => {
    const highlights: SearchResultWithHighlight["highlights"] = {}

    if (result.matchedFields.includes("name")) {
      const normalizedName = normalizeForMatching(result.account.name)
      const nameTokens = tokenInfos.filter((token) =>
        normalizedName.includes(token.normalized)
      )

      if (nameTokens.length > 0) {
        highlights.name = createHighlightFragments(
          result.account.name,
          nameTokens
        )
      }
    }

    if (result.matchedFields.includes("baseUrl")) {
      const normalizedUrl = normalizeForMatching(result.account.baseUrl)
      const urlTokens = tokenInfos.filter((token) =>
        normalizedUrl.includes(token.normalized)
      )

      if (urlTokens.length > 0) {
        highlights.baseUrl = createHighlightFragments(
          result.account.baseUrl,
          urlTokens
        )
      }
    }

    if (result.matchedFields.includes("customCheckInUrl")) {
      const customCheckInUrl = result.account.checkIn?.customCheckInUrl
      if (customCheckInUrl) {
        const normalizedCheckIn = normalizeForMatching(customCheckInUrl)
        const checkInTokens = tokenInfos.filter((token) =>
          normalizedCheckIn.includes(token.normalized)
        )

        if (checkInTokens.length > 0) {
          highlights.customCheckInUrl = createHighlightFragments(
            customCheckInUrl,
            checkInTokens
          )
        }
      }
    }

    if (result.matchedFields.includes("customRedeemUrl")) {
      const customRedeemUrl = result.account.checkIn?.customRedeemUrl
      if (customRedeemUrl) {
        const normalizedRedeem = normalizeForMatching(customRedeemUrl)
        const redeemTokens = tokenInfos.filter((token) =>
          normalizedRedeem.includes(token.normalized)
        )

        if (redeemTokens.length > 0) {
          highlights.customRedeemUrl = createHighlightFragments(
            customRedeemUrl,
            redeemTokens
          )
        }
      }
    }

    if (result.matchedFields.includes("username")) {
      const { username } = result.account
      if (username) {
        const normalizedRedeem = normalizeForMatching(username)
        const redeemTokens = tokenInfos.filter((token) =>
          normalizedRedeem.includes(token.normalized)
        )

        if (redeemTokens.length > 0) {
          highlights.username = createHighlightFragments(username, redeemTokens)
        }
      }
    }

    if (result.matchedFields.includes("tags")) {
      const tags = result.account.tags || []
      if (tags.length > 0) {
        const joined = tags.join(", ")
        const normalizedTags = normalizeForMatching(joined)
        const tagTokens = tokenInfos.filter((token) =>
          normalizedTags.includes(token.normalized)
        )

        if (tagTokens.length > 0) {
          highlights.tags = createHighlightFragments(joined, tagTokens)
        }
      }
    }

    return {
      ...result,
      highlights
    }
  })
}

export function useAccountSearch(
  accounts: DisplaySiteData[],
  initialQuery?: string
) {
  const normalizedInitialQuery = initialQuery ?? ""
  const [query, setQuery] = useState(() => normalizedInitialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(
    () => normalizedInitialQuery
  )
  const lastAppliedInitialQuery = useRef(normalizedInitialQuery)

  useEffect(() => {
    if (lastAppliedInitialQuery.current !== normalizedInitialQuery) {
      setQuery(normalizedInitialQuery)
      setDebouncedQuery(normalizedInitialQuery)
      lastAppliedInitialQuery.current = normalizedInitialQuery
    }
  }, [normalizedInitialQuery])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 150)

    return () => clearTimeout(timer)
  }, [query])

  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return []
    }

    const results = searchAccounts(accounts, debouncedQuery)

    return results.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score
      }

      const aTime = a.account.last_sync_time ?? 0
      const bTime = b.account.last_sync_time ?? 0
      if (aTime !== bTime) {
        return bTime - aTime
      }

      return a.account.name.localeCompare(b.account.name)
    })
  }, [accounts, debouncedQuery])

  const resultsWithHighlights = useMemo(() => {
    if (searchResults.length === 0 || !debouncedQuery.trim()) {
      return []
    }

    return generateHighlights(searchResults, debouncedQuery)
  }, [searchResults, debouncedQuery])

  const clearSearch = useCallback(() => {
    setQuery("")
    setDebouncedQuery("")
    lastAppliedInitialQuery.current = ""
  }, [])

  return {
    query,
    setQuery,
    debouncedQuery,
    searchResults: resultsWithHighlights,
    clearSearch,
    inSearchMode: query.trim().length > 0
  }
}
