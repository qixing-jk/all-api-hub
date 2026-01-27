/**
 * 连接 base URL 和 path URL
 * - 将 base URL 和 path URL 连接起来，并将多个 / 字符合并成一个
 * - 如果 base URL 结尾是 /，或者 path URL 开头是 /，那么将其删除
 * @param base - 基础 URL
 * @param path - 需要连接的 URL 路径
 * @returns 连接后的 URL
 */
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to URL utility helpers.
 */
const logger = createLogger("UrlUtils")

/**
 *
 */
export function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}

/**
 * Parse tab/anchor information from URL hash and search parameters.
 * Supports both ?tab=xxx and hash patterns like #tab=xxx or #basic?tab=xxx.
 * Also supports direct heading anchors like #heading-id.
 * @param options Options for ignoring anchors or forcing a default hash page.
 * @param options.ignoreAnchors Anchors to skip when parsing headings.
 * @param options.defaultHashPage Hash page treated as the default context.
 * @returns Object containing tab and anchor information.
 */
export function parseTabFromUrl(
  options: {
    ignoreAnchors?: string[]
    defaultHashPage?: string
  } = {},
): {
  tab: string | null
  anchor: string | null
  isHeadingAnchor: boolean
} {
  const { ignoreAnchors = [], defaultHashPage } = options
  const rawHash = window.location.hash.slice(1)
  const search = new URLSearchParams(window.location.search)

  let tab: string | null = null
  let anchor: string | null = null
  let isHeadingAnchor = false

  if (search.has("tab")) {
    tab = search.get("tab")
  }

  if (rawHash) {
    const [hashPath, hashQuery] = rawHash.split("?")

    // If hash starts with tab=xxx, use it directly
    if (!tab && hashPath?.startsWith("tab=")) {
      tab = hashPath.split("tab=")[1] || null
    }

    if (!tab && hashQuery) {
      const params = new URLSearchParams(hashQuery)
      tab = params.get("tab")
    }

    const normalizedPath = hashPath?.trim() ?? ""

    if (
      normalizedPath &&
      normalizedPath !== defaultHashPage &&
      !normalizedPath.includes("=") &&
      !ignoreAnchors.includes(normalizedPath)
    ) {
      anchor = normalizedPath
      isHeadingAnchor = true
    }
  }

  return { tab, anchor, isHeadingAnchor }
}

/**
 * Update URL with tab parameter while preserving hash structure.
 * @param tab Tab ID to set in URL.
 * @param options Options controlling history replacement and hash root (supports `replaceHistory` and `hashPage`).
 * @param options.replaceHistory Whether to replace the current history entry (default true).
 * @param options.hashPage Optional hash root (e.g., "#basic") to enforce while updating.
 */
export function updateUrlWithTab(
  tab: string,
  options: {
    replaceHistory?: boolean
    hashPage?: string
  } = {},
) {
  const { replaceHistory = true, hashPage } = options
  const url = new URL(window.location.href)
  url.searchParams.set("tab", tab)

  if (hashPage) {
    url.hash = hashPage.startsWith("#") ? hashPage : `#${hashPage}`
  }

  if (replaceHistory) {
    window.history.replaceState(null, "", url.toString())
  } else {
    window.history.pushState(null, "", url.toString())
  }
}

/**
 * Navigate to a heading anchor within a specific tab.
 * @param anchor Heading ID to scroll to.
 * @param tab Tab containing the heading. Omit to keep current tab.
 * @param options Additional navigation options (supports `hashPage` and `delay`).
 * @param options.hashPage Optional hash page override applied before scrolling.
 * @param options.delay Delay (ms) before scrolling after the next animation frame.
 */
export function navigateToAnchor(
  anchor: string,
  tab?: string,
  options: {
    hashPage?: string
    delay?: number
  } = {},
) {
  const { hashPage, delay = 100 } = options

  if (tab) {
    updateUrlWithTab(tab, { hashPage })
  }

  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      const element = document.getElementById(anchor)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, delay)
  })
}

/**
 * Normalize user-provided URL strings into a valid HTTP(S) URL without a trailing slash.
 *
 * - Adds an implicit `https://` prefix when the scheme is missing.
 * - Returns `null` when the URL is invalid or uses a non-HTTP(S) scheme.
 */
export function normalizeHttpUrl(
  url: string | undefined | null,
): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // Reject non-http schemes early
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null
  }

  const prefixed = /^(https?:)?\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const parsed = new URL(prefixed)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString().replace(/\/$/, "")
  } catch (e) {
    logger.warn("normalizeHttpUrl: Invalid URL", e)
    return null
  }
}

/**
 * Strip a trailing `/v1` from a user-supplied OpenAI-compatible base URL.
 *
 * This is needed for APIs like `fetchOpenAICompatibleModelIds` that already append
 * `/v1/models` internally — passing a base URL ending with `/v1` would otherwise
 * yield `/v1/v1/models`.
 */
export function stripTrailingOpenAIV1(baseUrl: string): string {
  const trimmed = (baseUrl || "").trim()
  if (!trimmed) return ""

  try {
    const url = new URL(trimmed)
    const pathname = url.pathname.replace(/\/+$/, "")
    if (!pathname.endsWith("/v1")) {
      return url.toString().replace(/\/+$/, "")
    }

    url.pathname = pathname.replace(/\/v1$/, "") || "/"
    return url.toString().replace(/\/+$/, "")
  } catch (e) {
    logger.warn("stripTrailingOpenAIV1: Invalid URL", e)
    return trimmed.replace(/\/v1\/?$/, "").replace(/\/+$/, "")
  }
}

/**
 * Ensure a URL's path ends with a given suffix.
 *
 * This is useful for provider base URLs that must include a specific prefix such as
 * `/v1` (OpenAI/Anthropic) or `/v1beta` (Google/Gemini).
 *
 * - When the input is a valid URL, the suffix is appended to the pathname if missing.
 * - When the input is not a valid URL, returns the trimmed string without trailing slashes.
 */
export function coerceBaseUrlToPathSuffix(
  baseUrl: string,
  suffix: string,
): string {
  const trimmed = (baseUrl || "").trim()
  if (!trimmed) return trimmed

  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`

  try {
    const url = new URL(trimmed)
    const pathname = url.pathname.replace(/\/+$/, "")
    if (pathname.endsWith(normalizedSuffix)) {
      url.pathname = pathname
      return url.toString().replace(/\/+$/, "")
    }

    url.pathname = `${pathname}${normalizedSuffix}`.replace(/\/{2,}/g, "/")
    return url.toString().replace(/\/+$/, "")
  } catch (e) {
    logger.warn("coerceBaseUrlToPathSuffix: Invalid URL", e)
    return trimmed.replace(/\/+$/, "")
  }
}
