import type { TFunction } from "i18next"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { getSidePanelSupport } from "~/utils/browser/browserApi"

import { OPTIONS_SEARCH_REGISTRY, resolveSyntheticPageTitle } from "./registry"
import type {
  OptionsSearchContext,
  OptionsSearchItem,
  OptionsSearchItemDefinition,
} from "./types"

const SCORE_EXACT_TITLE = 120
const SCORE_PREFIX_TITLE = 100
const SCORE_CONTAINS_TITLE = 80
const SCORE_KEYWORD = 60
const SCORE_DESCRIPTION = 40
const SCORE_BREADCRUMB = 20

/**
 * Normalizes search text for case-insensitive matching.
 */
function normalize(text: string) {
  return text.trim().toLowerCase()
}

/**
 * Scores how strongly a localized search item matches the current query.
 */
function scoreMatch(query: string, item: OptionsSearchItem) {
  const normalizedTitle = normalize(item.title)
  const normalizedDescription = normalize(item.description ?? "")
  const normalizedBreadcrumbs = item.breadcrumbs.map(normalize)
  const normalizedKeywords = item.keywords.map(normalize)

  if (normalizedTitle === query) {
    return SCORE_EXACT_TITLE
  }

  if (normalizedTitle.startsWith(query)) {
    return SCORE_PREFIX_TITLE
  }

  if (normalizedTitle.includes(query)) {
    return SCORE_CONTAINS_TITLE
  }

  if (normalizedKeywords.some((keyword) => keyword.includes(query))) {
    return SCORE_KEYWORD
  }

  if (normalizedDescription.includes(query)) {
    return SCORE_DESCRIPTION
  }

  if (normalizedBreadcrumbs.some((breadcrumb) => breadcrumb.includes(query))) {
    return SCORE_BREADCRUMB
  }

  return -1
}

/**
 * Converts a registry definition into a localized runtime search item.
 */
function localizeSearchItem(
  item: OptionsSearchItemDefinition,
  t: TFunction,
): OptionsSearchItem {
  return {
    ...item,
    title: resolveSyntheticPageTitle(item.titleKey, t),
    description: item.descriptionKey ? t(item.descriptionKey) : undefined,
    breadcrumbs: item.breadcrumbsKeys.map((key) =>
      resolveSyntheticPageTitle(key, t),
    ),
  }
}

/**
 * Adds runtime capability flags needed by the options search registry.
 */
export function useOptionsSearchContext(
  baseContext: Omit<OptionsSearchContext, "sidePanelSupported">,
): OptionsSearchContext {
  const sidePanelSupported = getSidePanelSupport().supported

  return useMemo(
    () => ({
      ...baseContext,
      sidePanelSupported,
    }),
    [baseContext, sidePanelSupported],
  )
}

/**
 * Returns the localized search registry and filtered results for a query.
 */
export function useOptionsSearch(context: OptionsSearchContext, query: string) {
  const { t } = useTranslation([
    "settings",
    "ui",
    "balanceHistory",
    "usageAnalytics",
    "managedSiteModelSync",
    "modelRedirect",
    "importExport",
    "webAiApiCheck",
    "autoCheckin",
    "redemptionAssist",
  ])

  const items = useMemo(
    () =>
      OPTIONS_SEARCH_REGISTRY.filter(
        (item) => item.isVisible?.(context) ?? true,
      ).map((item) => localizeSearchItem(item, t)),
    [context, t],
  )

  const normalizedQuery = normalize(query)

  const results = useMemo(() => {
    if (!normalizedQuery) {
      return items
    }

    return items
      .map((item) => ({
        item,
        score: scoreMatch(normalizedQuery, item),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        return a.item.order - b.item.order
      })
      .map((entry) => entry.item)
  }, [items, normalizedQuery])

  return {
    items,
    results,
  }
}
