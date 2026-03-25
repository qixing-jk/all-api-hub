import toast from "react-hot-toast"

import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { VELOERA } from "~/constants/siteType"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { getApiService } from "~/services/apiService"
import { fetchChannel as fetchVeloeraChannel } from "~/services/apiService/veloera"
import { findManagedSiteChannelByComparableInputs } from "~/services/managedSites/utils/channelMatching"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import { ApiToken, AuthTypeEnum, DisplaySiteData, SiteAccount } from "~/types"
import type { AccountToken } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import type {
  AutoConfigToNewApiResponse,
  ServiceResponse,
} from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList, parseDelimitedList } from "~/utils/core/string"
import { t } from "~/utils/i18n/core"

import {
  UserPreferences,
  userPreferences,
} from "../../preferences/userPreferences"
import { resolveDefaultChannelGroups } from "./defaultChannelGroups"

/**
 * Unified logger scoped to the Veloera integration and auto-config flows.
 */
const logger = createLogger("VeloeraService")

/**
 * Searches channels matching the keyword.
 */
export async function searchChannel(
  baseUrl: string,
  accessToken: string,
  userId: number | string,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return await getApiService(VELOERA).searchChannel(
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken,
        userId,
      },
    },
    keyword,
  )
}

/**
 * Creates a channel.
 */
export async function createChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  channelData: CreateChannelPayload,
) {
  return await getApiService(VELOERA).createChannel(
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: adminToken,
        userId,
      },
    },
    channelData,
  )
}

/**
 * Updates a channel.
 */
export async function updateChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  channelData: UpdateChannelPayload,
) {
  return await getApiService(VELOERA).updateChannel(
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: adminToken,
        userId,
      },
    },
    channelData,
  )
}

/**
 * Deletes a channel.
 */
export async function deleteChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  channelId: number,
) {
  return await getApiService(VELOERA).deleteChannel(
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: adminToken,
        userId,
      },
    },
    channelId,
  )
}

/**
 * Fetches the full secret key for a Veloera channel from its detail payload.
 */
export async function fetchChannelSecretKey(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  channelId: number,
): Promise<string> {
  const channel = await fetchVeloeraChannel(
    {
      baseUrl,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: adminToken,
        userId,
      },
    },
    channelId,
  )

  const key = channel.key?.trim()
  if (!key) {
    throw new Error("veloera_channel_key_missing")
  }

  return key
}

/**
 * Checks whether the given user preferences contain a complete Veloera config.
 */
export function hasValidVeloeraConfig(prefs: UserPreferences | null): boolean {
  if (!prefs) {
    return false
  }

  const { veloera } = prefs

  if (!veloera) {
    return false
  }

  return Boolean(veloera.baseUrl && veloera.adminToken && veloera.userId)
}

/**
 * Validates Veloera configuration stored in user preferences.
 */
export async function checkValidVeloeraConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    return hasValidVeloeraConfig(prefs)
  } catch (error) {
    logger.error("Error checking config", error)
    return false
  }
}

/**
 * Gets Veloera configuration from user preferences.
 */
export async function getVeloeraConfig(): Promise<{
  baseUrl: string
  token: string
  userId: string
} | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidVeloeraConfig(prefs)) {
      const { veloera } = prefs
      return {
        baseUrl: veloera.baseUrl,
        token: veloera.adminToken,
        userId: veloera.userId,
      }
    }
    return null
  } catch (error) {
    logger.error("Error getting config", error)
    return null
  }
}

/**
 * Gets the models available for the given account.
 */
export async function fetchAvailableModels(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<string[]> {
  const candidateSources: string[][] = []

  const tokenModelList = parseDelimitedList(token.models)
  if (tokenModelList.length > 0) {
    candidateSources.push(tokenModelList)
  }

  candidateSources.push(await fetchTokenScopedModels(account, token))

  try {
    const fallbackModels = await getApiService(
      account.siteType,
    ).fetchAccountAvailableModels({
      baseUrl: account.baseUrl,
      accountId: account.id,
      auth: {
        authType: account.authType,
        userId: account.userId,
        accessToken: account.token,
        cookie: account.cookieAuthSessionCookie,
      },
    })
    if (fallbackModels && fallbackModels.length > 0) {
      candidateSources.push(fallbackModels)
    }
  } catch (error) {
    logger.warn("Failed to fetch fallback models", error)
  }

  const merged = candidateSources.flat()
  return normalizeList(merged)
}

/**
 * Builds a default channel name.
 */
export function buildChannelName(
  account: DisplaySiteData,
  token: ApiToken,
): string {
  let channelName = `${account.name} | ${token.name}`.trim()
  if (!channelName.endsWith("(auto)")) {
    channelName += " (auto)"
  }
  return channelName
}

/**
 * Builds default channel form values.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const availableModels = await fetchTokenScopedModels(account, token)

  const resolvedGroups = await resolveDefaultChannelGroups({
    siteType: VELOERA,
    getConfig: getVeloeraConfig,
    onError: (error) => {
      logger.warn("Failed to resolve Veloera default groups", error)
    },
  })

  return {
    name: buildChannelName(account, token),
    type: DEFAULT_CHANNEL_FIELDS.type,
    key: token.key,
    base_url: account.baseUrl,
    models: normalizeList(availableModels),
    groups: normalizeList(resolvedGroups),
    priority: DEFAULT_CHANNEL_FIELDS.priority,
    weight: DEFAULT_CHANNEL_FIELDS.weight,
    status: DEFAULT_CHANNEL_FIELDS.status,
  }
}

/**
 * Builds the create-channel payload from form state.
 */
export function buildChannelPayload(
  formData: ChannelFormData,
  mode: ChannelMode = DEFAULT_CHANNEL_FIELDS.mode,
): CreateChannelPayload {
  const trimmedBaseUrl = formData.base_url.trim()
  const groups = normalizeList(
    formData.groups && formData.groups.length > 0
      ? [...formData.groups]
      : [...DEFAULT_CHANNEL_FIELDS.groups],
  )
  const models = normalizeList(formData.models ?? [])

  return {
    mode,
    channel: {
      name: formData.name.trim(),
      type: formData.type,
      key: formData.key.trim(),
      base_url: trimmedBaseUrl,
      models: models.join(","),
      groups,
      priority: formData.priority,
      weight: formData.weight,
      status: formData.status,
    },
  }
}

/**
 * Finds a channel that matches the account base URL and models.
 *
 * When `key` is provided, the match is refined to include the key to avoid treating
 * different keys as duplicates.
 *
 * Warning: this feature is not supported on Veloera for reliable absence
 * checks. The helper depends on Veloera's keyword search endpoint, which does
 * not reliably support base URL search, so negative results must not be treated
 * as conclusive proof that a channel is absent.
 */
export async function findMatchingChannel(
  baseUrl: string,
  adminToken: string,
  userId: number | string,
  accountBaseUrl: string,
  models: string[],
  key?: string,
): Promise<ManagedSiteChannel | null> {
  const searchResults = await searchChannel(
    baseUrl,
    adminToken,
    userId,
    accountBaseUrl,
  )

  if (!searchResults) {
    return null
  }

  return findManagedSiteChannelByComparableInputs({
    channels: searchResults.items,
    accountBaseUrl,
    models,
    key,
  })
}

/**
 * Imports an account as a channel into Veloera.
 */
async function importToVeloera(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<ServiceResponse<void>> {
  try {
    const prefs = await userPreferences.getPreferences()

    if (!hasValidVeloeraConfig(prefs)) {
      return {
        success: false,
        message: t("messages:veloera.configMissing"),
      }
    }

    const { veloera } = prefs
    const {
      baseUrl: veloeraBaseUrl,
      adminToken: veloeraAdminToken,
      userId: veloeraUserId,
    } = veloera

    const formData = await prepareChannelFormData(account, token)

    const existingChannel = await findMatchingChannel(
      veloeraBaseUrl!,
      veloeraAdminToken!,
      veloeraUserId!,
      account.baseUrl,
      formData.models,
      formData.key,
    )

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:veloera.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const payload = buildChannelPayload(formData)

    const createdChannelResponse = await createChannel(
      veloeraBaseUrl!,
      veloeraAdminToken!,
      veloeraUserId!,
      payload,
    )

    if (createdChannelResponse.success) {
      return {
        success: true,
        message: t("messages:veloera.importSuccess", {
          channelName: formData.name,
        }),
      }
    }

    return {
      success: false,
      message: createdChannelResponse.message,
    }
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error) || t("messages:veloera.importFailed"),
    }
  }
}

/**
 * Validates Veloera configuration and collects error messages.
 */
async function validateVeloeraConfig(): Promise<{
  valid: boolean
  errors: string[]
}> {
  const prefs = await userPreferences.getPreferences()
  const errors: string[] = []

  const baseUrl = prefs.veloera?.baseUrl
  const adminToken = prefs.veloera?.adminToken
  const userId = prefs.veloera?.userId

  if (!baseUrl) {
    errors.push(t("messages:errors.validation.veloeraBaseUrlRequired"))
  }
  if (!adminToken) {
    errors.push(t("messages:errors.validation.veloeraAdminTokenRequired"))
  }
  if (!userId) {
    errors.push(t("messages:errors.validation.veloeraUserIdRequired"))
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Legacy direct-import helper for the managed-site compatibility path.
 * @deprecated Unused by the current runtime flow. Account auto-config now
 * uses `useChannelDialog().openWithAccount()` so users can review generated
 * channel fields before creation. Kept temporarily for compatibility.
 */
export async function autoConfigToVeloera(
  account: SiteAccount,
  toastId?: string,
): Promise<AutoConfigToNewApiResponse<{ token?: ApiToken }>> {
  const configValidation = await validateVeloeraConfig()
  if (!configValidation.valid) {
    return { success: false, message: configValidation.errors.join(", ") }
  }

  const displaySiteData = accountStorage.convertToDisplayData(account)

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const apiToken = await ensureAccountApiToken(
        account,
        displaySiteData,
        toastId,
      )

      toast.loading(t("messages:accountOperations.importingToVeloera"), {
        id: toastId,
      })

      const importResult = await importToVeloera(displaySiteData, apiToken)

      if (importResult.success) {
        toast.success(importResult.message, { id: toastId })
      } else {
        throw new Error(importResult.message)
      }

      return {
        success: importResult.success,
        message: importResult.message,
        data: { token: apiToken },
      }
    } catch (error) {
      lastError = error

      if (
        error instanceof Error &&
        (error.message.includes("network") ||
          error.message.includes("Failed to fetch")) &&
        attempt < 3
      ) {
        toast.error(getErrorMessage(lastError), { id: toastId })
        toast.loading(
          t("messages:accountOperations.retrying", { attempt: attempt + 1 }),
          { id: toastId },
        )
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        continue
      }

      break
    }
  }

  toast.error(getErrorMessage(lastError), { id: toastId })
  return {
    success: false,
    message:
      (lastError as Error | undefined)?.message || t("messages:errors.unknown"),
  }
}
