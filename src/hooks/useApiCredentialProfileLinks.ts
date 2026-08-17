import { useCallback, useEffect, useRef, useState } from "react"

import { apiCredentialProfileLinks } from "~/services/apiCredentialProfiles/apiCredentialProfileLinks"
import { subscribeToApiCredentialProfilesChanges } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import type { ApiCredentialProfileLink } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ApiCredentialProfileLinksHook")

/** Keeps API credential profile links synchronized with local storage. */
export function useApiCredentialProfileLinks() {
  const [links, setLinks] = useState<ApiCredentialProfileLink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const loadGenerationRef = useRef(0)

  const reload = useCallback(async () => {
    const generation = ++loadGenerationRef.current
    setIsLoading(true)
    setError(null)

    try {
      const loadedLinks = await apiCredentialProfileLinks.list()
      if (generation !== loadGenerationRef.current) return
      setLinks(loadedLinks)
    } catch (loadError) {
      if (generation !== loadGenerationRef.current) return
      logger.error("Failed to load API credential profile links", loadError)
      setError(loadError)
    } finally {
      if (generation === loadGenerationRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(
    () => () => {
      loadGenerationRef.current += 1
    },
    [],
  )

  useEffect(() => {
    return subscribeToApiCredentialProfilesChanges(() => {
      void reload()
    })
  }, [reload])

  return { links, isLoading, error, reload }
}
