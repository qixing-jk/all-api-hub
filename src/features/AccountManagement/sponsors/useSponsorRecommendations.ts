import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { selectSponsorRecommendations } from "./catalog"
import type { SponsorRecommendationSurface } from "./constants"
import {
  loadSponsorRecommendations,
  refreshSponsorRecommendations,
  type LoadSponsorRecommendationsResult,
} from "./loader"

interface UseSponsorRecommendationsOptions {
  surface: SponsorRecommendationSurface
  enabled?: boolean
}

/**
 * Loads sponsor recommendations for the current language and selected surface.
 */
export function useSponsorRecommendations({
  surface,
  enabled = true,
}: UseSponsorRecommendationsOptions): {
  items: LoadSponsorRecommendationsResult["items"]
  isLoading: boolean
} {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language
  const [result, setResult] = useState<LoadSponsorRecommendationsResult | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(enabled)

  useEffect(() => {
    let cancelled = false

    if (!enabled) {
      setIsLoading(false)
      setResult(null)
      return () => {
        cancelled = true
      }
    }

    setIsLoading(true)
    setResult(null)

    void loadSponsorRecommendations({ locale }).then((loaded) => {
      if (cancelled) return

      setResult(loaded)
      setIsLoading(false)

      void refreshSponsorRecommendations({ locale }).then((refreshed) => {
        if (!cancelled && refreshed) {
          setResult(refreshed)
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [enabled, locale])

  const items = useMemo(() => {
    if (!enabled || isLoading || !result) return []
    return selectSponsorRecommendations(result.items, surface)
  }, [enabled, isLoading, result, surface])

  return { items, isLoading }
}
