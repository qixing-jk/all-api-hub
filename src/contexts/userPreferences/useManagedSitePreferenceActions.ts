import { useCallback } from "react"

import { type ManagedSiteType } from "~/constants/siteType"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { type AxonHubConfig } from "~/types/axonHubConfig"
import { type ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import {
  DEFAULT_GPT_LOAD_CONFIG,
  type GptLoadConfig,
} from "~/types/gptLoadConfig"
import {
  DEFAULT_OMNIROUTE_CONFIG,
  type OmniRouteConfig,
} from "~/types/omnirouteConfig"
import {
  DEFAULT_SUB2API_MANAGED_SITE_CONFIG,
  type Sub2ApiManagedSiteConfig,
} from "~/types/sub2apiManagedSiteConfig"

import type {
  PreferenceMutationSession,
  PreferenceSaveOptions,
} from "./preferenceContextTypes"

/** Groups feature writes and resets while the context owns the live snapshot. */
export function useManagedSitePreferenceActions({
  loadPreferences,
  reloadPreferencesAndTrackSnapshots,
  applySuccessfulPreferenceWrite,
  persistPreferenceUpdates,
}: Pick<
  PreferenceMutationSession,
  | "loadPreferences"
  | "reloadPreferencesAndTrackSnapshots"
  | "applySuccessfulPreferenceWrite"
  | "persistPreferenceUpdates"
>) {
  const resetClaudeCodeRouterConfig = useCallback(async () => {
    const result = await userPreferences.resetClaudeCodeRouterConfig()
    if (result.ok) {
      await loadPreferences()
    }
    return result
  }, [loadPreferences])

  /**
   * Update the CLI proxy base URL and merge it into the preference tree so
   * dependent features read the latest endpoint.
   */
  const updateCliProxyApiBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          cliProxyApi: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  /**
   * Persist the CLI proxy management key token used for authenticated calls.
   * @param managementKey - User-provided secret for the CLI proxy service.
   */
  const updateCliProxyApiManagementKey = useCallback(
    async (managementKey: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          cliProxyApi: { adminToken: managementKey },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeRouterBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeRouter: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeRouterApiKey = useCallback(
    async (apiKey: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeRouter: { apiKey },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiUserId = useCallback(
    async (userId: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { userId },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiUsername = useCallback(
    async (username: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { username },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiPassword = useCallback(
    async (password: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { password },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateNewApiTotpSecret = useCallback(
    async (totpSecret: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          newApi: { totpSecret },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateDoneHubBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          doneHub: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateDoneHubAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          doneHub: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateDoneHubUserId = useCallback(
    async (userId: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          doneHub: { userId },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateVeloeraBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          veloera: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateVeloeraAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          veloera: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateVeloeraUserId = useCallback(
    async (userId: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          veloera: { userId },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          octopus: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusUsername = useCallback(
    async (username: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          octopus: { username },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusPassword = useCallback(
    async (password: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          octopus: { password },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateOctopusConfig = useCallback(
    async (
      updates: Partial<NonNullable<UserPreferences["octopus"]>>,
      options?: PreferenceSaveOptions,
    ) => {
      return persistPreferenceUpdates(
        {
          octopus: updates,
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          axonHub: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubEmail = useCallback(
    async (email: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          axonHub: { email },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubPassword = useCallback(
    async (password: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          axonHub: { password },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateAxonHubConfig = useCallback(
    async (
      updates: Partial<AxonHubConfig>,
      options?: PreferenceSaveOptions,
    ) => {
      return persistPreferenceUpdates(
        {
          axonHub: updates,
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeHubBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeHub: { baseUrl },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeHubAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) => {
      return persistPreferenceUpdates(
        {
          claudeCodeHub: { adminToken },
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateClaudeCodeHubConfig = useCallback(
    async (
      updates: Partial<ClaudeCodeHubConfig>,
      options?: PreferenceSaveOptions,
    ) => {
      return persistPreferenceUpdates(
        {
          claudeCodeHub: updates,
        },
        options,
      )
    },
    [persistPreferenceUpdates],
  )

  const updateSub2ApiManagedSiteBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) =>
      persistPreferenceUpdates({ sub2apiManagedSite: { baseUrl } }, options),
    [persistPreferenceUpdates],
  )

  const updateSub2ApiManagedSiteAdminToken = useCallback(
    async (adminToken: string, options?: PreferenceSaveOptions) =>
      persistPreferenceUpdates({ sub2apiManagedSite: { adminToken } }, options),
    [persistPreferenceUpdates],
  )

  const updateSub2ApiManagedSiteConfig = useCallback(
    async (
      updates: Partial<Sub2ApiManagedSiteConfig>,
      options?: PreferenceSaveOptions,
    ) => persistPreferenceUpdates({ sub2apiManagedSite: updates }, options),
    [persistPreferenceUpdates],
  )

  const updateOmniRouteBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) =>
      persistPreferenceUpdates({ omniroute: { baseUrl } }, options),
    [persistPreferenceUpdates],
  )

  const updateOmniRouteToken = useCallback(
    async (token: string, options?: PreferenceSaveOptions) =>
      persistPreferenceUpdates({ omniroute: { token } }, options),
    [persistPreferenceUpdates],
  )

  const updateOmniRouteConfig = useCallback(
    async (
      updates: Partial<OmniRouteConfig>,
      options?: PreferenceSaveOptions,
    ) => persistPreferenceUpdates({ omniroute: updates }, options),
    [persistPreferenceUpdates],
  )

  const updateGptLoadBaseUrl = useCallback(
    async (baseUrl: string, options?: PreferenceSaveOptions) =>
      persistPreferenceUpdates({ gptLoad: { baseUrl } }, options),
    [persistPreferenceUpdates],
  )

  const updateGptLoadManagementKey = useCallback(
    async (managementKey: string, options?: PreferenceSaveOptions) =>
      persistPreferenceUpdates({ gptLoad: { managementKey } }, options),
    [persistPreferenceUpdates],
  )

  const updateGptLoadConfig = useCallback(
    async (updates: Partial<GptLoadConfig>, options?: PreferenceSaveOptions) =>
      persistPreferenceUpdates({ gptLoad: updates }, options),
    [persistPreferenceUpdates],
  )

  const updateManagedSiteType = useCallback(
    async (siteType: ManagedSiteType) => {
      const result = await userPreferences.updateManagedSiteType(siteType)
      applySuccessfulPreferenceWrite(result, { managedSiteType: siteType })
      return result
    },
    [applySuccessfulPreferenceWrite],
  )

  const resetNewApiConfig = useCallback(async () => {
    const result = await userPreferences.resetNewApiConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        newApi: DEFAULT_PREFERENCES.newApi,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetDoneHubConfig = useCallback(async () => {
    const result = await userPreferences.resetDoneHubConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        doneHub: DEFAULT_PREFERENCES.doneHub,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetVeloeraConfig = useCallback(async () => {
    const result = await userPreferences.resetVeloeraConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        veloera: DEFAULT_PREFERENCES.veloera,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetOctopusConfig = useCallback(async () => {
    const result = await userPreferences.resetOctopusConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        octopus: DEFAULT_PREFERENCES.octopus,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetAxonHubConfig = useCallback(async () => {
    const result = await userPreferences.resetAxonHubConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        axonHub: DEFAULT_PREFERENCES.axonHub,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetClaudeCodeHubConfig = useCallback(async () => {
    const result = await userPreferences.resetClaudeCodeHubConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        claudeCodeHub: DEFAULT_PREFERENCES.claudeCodeHub,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetSub2ApiManagedSiteConfig = useCallback(async () => {
    const result = await userPreferences.resetSub2ApiManagedSiteConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        sub2apiManagedSite: DEFAULT_SUB2API_MANAGED_SITE_CONFIG,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetOmniRouteConfig = useCallback(async () => {
    const result = await userPreferences.resetOmniRouteConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        omniroute: DEFAULT_OMNIROUTE_CONFIG,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetGptLoadConfig = useCallback(async () => {
    const result = await userPreferences.resetGptLoadConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        gptLoad: DEFAULT_GPT_LOAD_CONFIG,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])

  const resetCliProxyApiConfig = useCallback(async () => {
    const result = await userPreferences.resetCliProxyApiConfig()
    if (result.ok) {
      await reloadPreferencesAndTrackSnapshots({
        cliProxyApi: DEFAULT_PREFERENCES.cliProxyApi,
      })
    }
    return result
  }, [reloadPreferencesAndTrackSnapshots])
  return {
    resetClaudeCodeRouterConfig,
    updateCliProxyApiBaseUrl,
    updateCliProxyApiManagementKey,
    updateClaudeCodeRouterBaseUrl,
    updateClaudeCodeRouterApiKey,
    updateNewApiBaseUrl,
    updateNewApiAdminToken,
    updateNewApiUserId,
    updateNewApiUsername,
    updateNewApiPassword,
    updateNewApiTotpSecret,
    updateDoneHubBaseUrl,
    updateDoneHubAdminToken,
    updateDoneHubUserId,
    updateVeloeraBaseUrl,
    updateVeloeraAdminToken,
    updateVeloeraUserId,
    updateOctopusBaseUrl,
    updateOctopusUsername,
    updateOctopusPassword,
    updateOctopusConfig,
    updateAxonHubBaseUrl,
    updateAxonHubEmail,
    updateAxonHubPassword,
    updateAxonHubConfig,
    updateClaudeCodeHubBaseUrl,
    updateClaudeCodeHubAdminToken,
    updateClaudeCodeHubConfig,
    updateSub2ApiManagedSiteBaseUrl,
    updateSub2ApiManagedSiteAdminToken,
    updateSub2ApiManagedSiteConfig,
    updateOmniRouteBaseUrl,
    updateOmniRouteToken,
    updateOmniRouteConfig,
    updateGptLoadBaseUrl,
    updateGptLoadManagementKey,
    updateGptLoadConfig,
    updateManagedSiteType,
    resetNewApiConfig,
    resetDoneHubConfig,
    resetVeloeraConfig,
    resetOctopusConfig,
    resetAxonHubConfig,
    resetClaudeCodeHubConfig,
    resetSub2ApiManagedSiteConfig,
    resetOmniRouteConfig,
    resetGptLoadConfig,
    resetCliProxyApiConfig,
  }
}
