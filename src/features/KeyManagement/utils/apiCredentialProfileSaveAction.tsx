import type { TFunction } from "i18next"
import toast from "react-hot-toast"

import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { buildApiCredentialProfileName } from "~/features/KeyManagement/utils/apiCredentialProfileName"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiToken, DisplaySiteData } from "~/types"
import type { AccountToken } from "~/types/accountToken"
import { openApiCredentialProfilesPage } from "~/utils/navigation"

type OneTimeApiKeySaveAction = {
  onSave: () => Promise<void>
  label?: string
}

type OneTimeKeySaveLogger = {
  error: (message: string, details?: unknown) => void
}

type ApiCredentialProfileBatchSaveItem = {
  account: Pick<
    DisplaySiteData,
    | "authType"
    | "baseUrl"
    | "cookieAuthSessionCookie"
    | "id"
    | "name"
    | "siteType"
    | "tagIds"
    | "token"
    | "userId"
  >
  token: AccountToken
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

interface SaveApiTokensToApiCredentialProfilesParams {
  items: ApiCredentialProfileBatchSaveItem[]
  t: TFunction
  logger: OneTimeKeySaveLogger
  source: string
  resolveTokenForSecret?: (
    account: ApiCredentialProfileBatchSaveItem["account"],
    token: AccountToken,
  ) => Promise<AccountToken>
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
    return await createApiCredentialProfileFromToken({
      accountName,
      fallbackAccountName,
      baseUrl,
      siteType,
      tagIds,
      token,
    })
  } catch (error) {
    logger.error(`Failed to save one-time key to API profiles from ${source}`, {
      message: toSanitizedErrorSummary(error, [token.key]),
    })
    toast.error(t("keyManagement:messages.saveToApiProfilesFailed"))
    throw error
  }
}

/**
 * Persists selected account tokens into the API credential profile library.
 */
export async function saveApiTokensToApiCredentialProfiles({
  items,
  t,
  logger,
  source,
  resolveTokenForSecret = resolveDisplayAccountTokenForSecret,
}: SaveApiTokensToApiCredentialProfilesParams): Promise<{
  savedCount: number
}> {
  let savedCount = 0

  try {
    for (const { account, token } of items) {
      const resolvedToken = await resolveTokenForSecret(account, token)
      await createApiCredentialProfileFromToken({
        accountName: account.name,
        fallbackAccountName: token.accountName,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
        tagIds: account.tagIds ?? [],
        token: {
          ...token,
          key: resolvedToken.key,
        },
      })
      savedCount += 1
    }

    toast.success(
      (toastInstance) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">
            {t("keyManagement:messages.batchSavedToApiProfiles")}
          </span>
          <button
            type="button"
            data-testid={KEY_MANAGEMENT_TEST_IDS.openApiProfilesToastButton}
            className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            onClick={() => {
              openApiCredentialProfilesPage()
              toast.dismiss(toastInstance.id)
            }}
          >
            {t("keyManagement:actions.openApiProfiles")}
          </button>
        </div>
      ),
      {
        duration: 8000,
      },
    )

    return { savedCount: items.length }
  } catch (error) {
    const totalCount = items.length
    const failedCount = totalCount - savedCount
    const isPartialFailure = savedCount > 0

    logger.error(
      `${
        isPartialFailure ? "Partially saved" : "Failed to save"
      } selected keys to API profiles from ${source}`,
      {
        ...(isPartialFailure
          ? {
              failedCount,
              savedCount,
              totalCount,
            }
          : {}),
        message: toSanitizedErrorSummary(
          error,
          items.flatMap(({ account, token }) =>
            [token.key, account.token, account.cookieAuthSessionCookie].filter(
              Boolean,
            ),
          ) as string[],
        ),
      },
    )
    toast.error(
      isPartialFailure
        ? t("keyManagement:messages.batchSaveToApiProfilesPartialFailed", {
            failedCount,
            savedCount,
            totalCount,
          })
        : t("keyManagement:messages.batchSaveToApiProfilesFailed"),
    )
    throw error
  }
}

/**
 * Creates one API credential profile from already-resolved token data.
 */
async function createApiCredentialProfileFromToken({
  accountName,
  fallbackAccountName,
  baseUrl,
  siteType,
  tagIds,
  token,
}: Omit<BuildOneTimeApiKeyProfileSaveActionParams, "t" | "logger" | "source">) {
  return apiCredentialProfilesStorage.createProfile({
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
}
