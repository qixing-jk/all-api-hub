import type { TFunction } from "i18next"
import toast from "react-hot-toast"

import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { buildApiCredentialProfileName } from "~/features/KeyManagement/utils/apiCredentialProfileName"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiToken } from "~/types"

type OneTimeApiKeySaveAction = {
  onSave: () => Promise<void>
  label?: string
}

type OneTimeKeySaveLogger = {
  error: (message: string, details?: unknown) => void
}

interface BuildOneTimeApiKeyProfileSaveActionParams {
  accountName: string
  fallbackAccountName?: string
  baseUrl: string
  siteType?: string
  tagIds?: string[]
  token: Pick<ApiToken, "key" | "name">
  t: TFunction
  logger: OneTimeKeySaveLogger
  source: string
}

/**
 * Builds a dialog save action that persists a one-time key as an API profile.
 */
export function buildOneTimeApiKeyProfileSaveAction({
  accountName,
  fallbackAccountName,
  baseUrl,
  siteType,
  tagIds,
  token,
  t,
  logger,
  source,
}: BuildOneTimeApiKeyProfileSaveActionParams): OneTimeApiKeySaveAction {
  return {
    onSave: async () => {
      const profile = await saveOneTimeApiKeyToProfile({
        accountName,
        fallbackAccountName,
        baseUrl,
        siteType,
        tagIds,
        token,
        t,
        logger,
        source,
      })

      toast.success(
        t("keyManagement:messages.savedToApiProfiles", {
          name: profile.name,
        }),
      )
    },
  }
}

/**
 * Persists a one-time key secret with shared profile naming and error handling.
 */
async function saveOneTimeApiKeyToProfile({
  accountName,
  fallbackAccountName,
  baseUrl,
  siteType,
  tagIds,
  token,
  t,
  logger,
  source,
}: BuildOneTimeApiKeyProfileSaveActionParams) {
  try {
    return await apiCredentialProfilesStorage.createProfile({
      name: buildApiCredentialProfileName({
        accountName,
        fallbackAccountName,
        tokenName: token.name ?? "",
      }),
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: siteType === SITE_TYPES.AIHUBMIX ? AIHUBMIX_API_ORIGIN : baseUrl,
      apiKey: token.key,
      tagIds: tagIds ?? [],
    })
  } catch (error) {
    logger.error(`Failed to save one-time key to API profiles from ${source}`, {
      message: toSanitizedErrorSummary(error, [token.key]),
    })
    toast.error(t("keyManagement:messages.saveToApiProfilesFailed"))
    throw error
  }
}
