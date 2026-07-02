import type { TFunction } from "i18next"
import toast from "react-hot-toast"

import { KEY_MANAGEMENT_ENTRY_KINDS } from "~/features/KeyManagement/types"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { createProfileFromAccountToken } from "~/services/apiCredentialProfiles/accountTokenImport"
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

type ApiCredentialProfileBatchSaveItem =
  | {
      kind?: typeof KEY_MANAGEMENT_ENTRY_KINDS.AccountToken
      account: ApiCredentialProfileBatchSaveAccount
      token: AccountToken
    }
  | {
      kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential
      account: ApiCredentialProfileBatchSaveAccount
      credential: AccountServiceCredential
    }

type ApiCredentialProfileBatchTokenItem = Extract<
  ApiCredentialProfileBatchSaveItem,
  { token: AccountToken }
>

type ApiCredentialProfileBatchServiceCredentialItem = Extract<
  ApiCredentialProfileBatchSaveItem,
  { kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential }
>

type ResolveTokenForSecret = NonNullable<
  SaveApiTokensToApiCredentialProfilesParams["resolveTokenForSecret"]
>

const isServiceCredentialBatchItem = (
  item: ApiCredentialProfileBatchSaveItem,
): item is ApiCredentialProfileBatchServiceCredentialItem =>
  item.kind === KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential

const isAccountTokenBatchItem = (
  item: ApiCredentialProfileBatchSaveItem,
): item is ApiCredentialProfileBatchTokenItem =>
  !isServiceCredentialBatchItem(item)

const normalizeBatchSaveItem = async (
  item: ApiCredentialProfileBatchSaveItem,
  resolveTokenForSecret: ResolveTokenForSecret,
) => {
  const { account } = item

  if (isServiceCredentialBatchItem(item)) {
    return {
      account,
      fallbackAccountName: account.name,
      baseUrl: item.credential.baseUrl || account.baseUrl,
      token: {
        name: item.credential.label,
        key: item.credential.key,
      },
    }
  }

  const resolvedToken = await resolveTokenForSecret(account, item.token)

  return {
    account,
    fallbackAccountName: item.token.accountName,
    baseUrl: account.baseUrl,
    token: {
      ...item.token,
      key: resolvedToken.key,
    },
  }
}

const collectBatchSaveSecrets = (items: ApiCredentialProfileBatchSaveItem[]) =>
  items
    .flatMap((item) => [
      isAccountTokenBatchItem(item) ? item.token.key : item.credential.key,
      item.account.token,
      item.account.cookieAuthSessionCookie,
    ])
    .filter(Boolean) as string[]

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
    for (const item of items) {
      const { account, fallbackAccountName, baseUrl, token } =
        await normalizeBatchSaveItem(item, resolveTokenForSecret)
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
        message: toSanitizedErrorSummary(error, collectBatchSaveSecrets(items)),
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
