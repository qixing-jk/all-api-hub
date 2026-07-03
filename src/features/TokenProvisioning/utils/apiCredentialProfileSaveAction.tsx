import type { TFunction } from "i18next"
import toast from "react-hot-toast"

import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import {
  collectAccountRuntimeKeySecrets,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { createProfileFromAccountToken } from "~/services/apiCredentialProfiles/accountTokenImport"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiToken, DisplaySiteData } from "~/types"
import { openApiCredentialProfilesPage } from "~/utils/navigation"

type OneTimeApiKeySaveAction = {
  onSave: () => Promise<void>
  label?: string
}

type OneTimeKeySaveLogger = {
  error: (message: string, details?: unknown) => void
}

type ApiCredentialProfileBatchSaveAccount = Pick<
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

type ApiCredentialProfileBatchSaveItem = {
  runtimeKey: AccountRuntimeKey
}

type ResolveRuntimeKeySecret = NonNullable<
  SaveAccountRuntimeKeysToApiCredentialProfilesParams["resolveRuntimeKeySecret"]
>

const normalizeBatchSaveItem = async (
  item: ApiCredentialProfileBatchSaveItem,
  resolveRuntimeKeySecret: ResolveRuntimeKeySecret,
) => {
  const { runtimeKey } = item
  const resolvedRuntimeKey = isAccountTokenRuntimeKey(runtimeKey)
    ? await resolveRuntimeKeySecret(runtimeKey.account, runtimeKey)
    : runtimeKey

  return {
    account: runtimeKey.account,
    fallbackAccountName: runtimeKey.accountName,
    baseUrl: resolvedRuntimeKey.baseUrl,
    token: {
      name: resolvedRuntimeKey.label,
      key: resolvedRuntimeKey.secret,
    },
  }
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

interface SaveAccountRuntimeKeysToApiCredentialProfilesParams {
  items: ApiCredentialProfileBatchSaveItem[]
  t: TFunction
  logger: OneTimeKeySaveLogger
  source: string
  resolveRuntimeKeySecret?: (
    account: ApiCredentialProfileBatchSaveAccount,
    runtimeKey: AccountRuntimeKey,
  ) => Promise<AccountRuntimeKey>
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
 * Persists selected account runtime keys into the API credential profile library.
 */
export async function saveAccountRuntimeKeysToApiCredentialProfiles({
  items,
  t,
  logger,
  source,
  resolveRuntimeKeySecret = resolveDisplayAccountRuntimeKeySecret,
}: SaveAccountRuntimeKeysToApiCredentialProfilesParams): Promise<{
  savedCount: number
}> {
  let savedCount = 0

  try {
    for (const item of items) {
      const { account, fallbackAccountName, baseUrl, token } =
        await normalizeBatchSaveItem(item, resolveRuntimeKeySecret)
      await createApiCredentialProfileFromToken({
        accountName: account.name,
        fallbackAccountName,
        baseUrl,
        siteType: account.siteType,
        tagIds: account.tagIds ?? [],
        token,
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
            data-testid={TOKEN_PROVISIONING_TEST_IDS.openApiProfilesToastButton}
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
          collectAccountRuntimeKeySecrets(items.map((item) => item.runtimeKey)),
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
  return createProfileFromAccountToken({
    accountName,
    fallbackAccountName,
    baseUrl,
    siteType,
    tagIds,
    token,
  })
}
