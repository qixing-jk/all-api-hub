import { useCallback, useEffect, useState } from "react"

import type { ApiVerificationApiType } from "~/services/aiApiVerification"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfilesStorage"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to the API credential profiles hook.
 */
const logger = createLogger("ApiCredentialProfilesHook")

type CreateProfileInput = {
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  tagIds?: string[]
  notes?: string
}

type UpdateProfileInput = Partial<CreateProfileInput>

/**
 * Loads and mutates API credential profiles stored in extension local storage.
 *
 * This hook provides the page with a simple data API and keeps the list fresh
 * after mutations.
 */
export function useApiCredentialProfiles() {
  const [profiles, setProfiles] = useState<ApiCredentialProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await apiCredentialProfilesStorage.listProfiles()
      setProfiles(list)
    } catch (error) {
      logger.error("Failed to load profiles", error)
      setProfiles([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const createProfile = useCallback(
    async (input: CreateProfileInput) => {
      const created = await apiCredentialProfilesStorage.createProfile(input)
      await reload()
      return created
    },
    [reload],
  )

  const updateProfile = useCallback(
    async (id: string, updates: UpdateProfileInput) => {
      const updated = await apiCredentialProfilesStorage.updateProfile(
        id,
        updates,
      )
      await reload()
      return updated
    },
    [reload],
  )

  const deleteProfile = useCallback(
    async (id: string) => {
      const deleted = await apiCredentialProfilesStorage.deleteProfile(id)
      await reload()
      return deleted
    },
    [reload],
  )

  return {
    profiles,
    isLoading,
    reload,
    createProfile,
    updateProfile,
    deleteProfile,
  }
}
