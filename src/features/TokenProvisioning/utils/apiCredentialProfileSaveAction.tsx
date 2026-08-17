import type { TFunction } from "i18next"
import toast from "react-hot-toast"

import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import {
  collectAccountRuntimeKeySecrets,
  getAccountRuntimeKeyLocator,
  type AccountRuntimeKey,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import {
  getCreatedRuntimeSecretLocator,
  type CreatedRuntimeSecret,
} from "~/services/accounts/createdRuntimeSecret"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import {
  captureProfileFromAccountToken,
  type ApiCredentialProfileLinkedBy,
} from "~/services/apiCredentialProfiles/accountTokenImport"
import { API_CREDENTIAL_PROFILE_CAPTURE_STATUSES } from "~/services/apiCredentialProfiles/apiCredentialProfileLinkContracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiToken, DisplaySiteData } from "~/types"
import { API_CREDENTIAL_PROFILE_LINK_SOURCES } from "~/types/apiCredentialProfiles"
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
  const resolvedRuntimeKey = await resolveRuntimeKeySecret(
    runtimeKey.account,
    runtimeKey,
  )

  return {
    account: runtimeKey.account,
    fallbackAccountName: runtimeKey.accountName,
    baseUrl: resolvedRuntimeKey.baseUrl,
    locator: getAccountRuntimeKeyLocator(runtimeKey),
    token: {
      name: resolvedRuntimeKey.label,
      key: resolvedRuntimeKey.secret,
    },
  }
}

type OneTimeSecretProfileInput = {
  accountName: string
  fallbackAccountName?: string
  baseUrl: string
  siteType?: string
  tagIds?: string[]
  token: Pick<ApiToken, "key" | "name">
  apiType?: CreatedRuntimeSecret["credential"]["apiType"]
  locator?: AccountRuntimeKeyLocator
  linkedBy?: ApiCredentialProfileLinkedBy
}

type BuildOneTimeApiKeyProfileSaveActionParams =
  | (OneTimeSecretProfileInput & {
      t: TFunction
      logger: OneTimeKeySaveLogger
      source: string
    })
  | {
      result: CreatedRuntimeSecret
      t: TFunction
      logger: OneTimeKeySaveLogger
      source: string
    }

type OneTimeSecretProfileSaveParams = OneTimeSecretProfileInput & {
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
export function buildOneTimeApiKeyProfileSaveAction(
  params: BuildOneTimeApiKeyProfileSaveActionParams,
): OneTimeApiKeySaveAction {
  const { t, logger, source } = params
  const oneTimeResult =
    "result" in params
      ? {
          accountName: params.result.credential.accountName,
          fallbackAccountName: params.result.credential.fallbackAccountName,
          baseUrl: params.result.credential.baseUrl,
          siteType: params.result.credential.siteType,
          tagIds: [...params.result.credential.tagIds],
          apiType: params.result.credential.apiType,
          locator: getCreatedRuntimeSecretLocator(params.result),
          linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.CreationResponse,
          token: { name: params.result.displayName, key: params.result.secret },
        }
      : {
          ...params,
          linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.CreationResponse,
        }

  return {
    onSave: async () => {
      const result = await saveOneTimeApiKeyToProfile({
        ...oneTimeResult,
        t,
        logger,
        source,
      })

      toast.success(
        result.status ===
          API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
          ? t("keyManagement:messages.savedToApiProfilesNeedsConfirmation")
          : t("keyManagement:messages.savedToApiProfiles", {
              name: result.profile.name,
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
  apiType,
  locator,
  linkedBy,
  t,
  logger,
  source,
}: OneTimeSecretProfileSaveParams) {
  try {
    return await captureApiCredentialProfileFromToken({
      accountName,
      fallbackAccountName,
      baseUrl,
      siteType,
      tagIds,
      token,
      apiType,
      locator,
      linkedBy,
    })
  } catch (error) {
    const sanitizedMessage = toSanitizedErrorSummary(error, [token.key])
    logger.error(`Failed to save one-time key to API profiles from ${source}`, {
      message: sanitizedMessage,
    })
    toast.error(t("keyManagement:messages.saveToApiProfilesFailed"))
    throw new Error(sanitizedMessage)
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
  let associationConflictCount = 0

  try {
    for (const item of items) {
      const { account, fallbackAccountName, baseUrl, locator, token } =
        await normalizeBatchSaveItem(item, resolveRuntimeKeySecret)
      const result = await captureApiCredentialProfileFromToken({
        accountName: account.name,
        fallbackAccountName,
        baseUrl,
        siteType: account.siteType,
        tagIds: account.tagIds ?? [],
        token,
        locator,
        linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.ResolvedRuntimeKey,
      })
      if (
        result.status ===
        API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
      ) {
        associationConflictCount += 1
      }
      savedCount += 1
    }

    toast.success(
      (toastInstance) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">
            {t(
              associationConflictCount > 0
                ? "keyManagement:messages.batchSavedToApiProfilesNeedsConfirmation"
                : "keyManagement:messages.batchSavedToApiProfiles",
            )}
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
async function captureApiCredentialProfileFromToken({
  accountName,
  fallbackAccountName,
  baseUrl,
  siteType,
  tagIds,
  token,
  apiType,
  locator,
  linkedBy,
}: OneTimeSecretProfileInput) {
  return captureProfileFromAccountToken({
    accountName,
    fallbackAccountName,
    baseUrl,
    siteType,
    tagIds,
    token,
    apiType,
    locator,
    linkedBy,
  })
}
