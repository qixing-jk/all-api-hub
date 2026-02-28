import { t } from "i18next"
import toast from "react-hot-toast"

import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { DONE_HUB } from "~/constants/siteType"
import { AccountToken } from "~/entrypoints/options/pages/KeyManagement/type"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { getApiService } from "~/services/apiService"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import { UserPreferences, userPreferences } from "~/services/userPreferences"
import { ApiToken, AuthTypeEnum, DisplaySiteData, SiteAccount } from "~/types"
import type { DoneHubConfig } from "~/types/doneHubConfig"
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
import { isArraysEqual } from "~/utils"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import { normalizeList, parseDelimitedList } from "~/utils/string"

/**
 * Unified logger scoped to the Done Hub integration and auto-config flows.
 */
const logger = createLogger("DoneHubService")

/**
 * Searches channels matching the keyword.
 */
export async function searchChannel(
  baseUrl: string,
  accessToken: string,
  userId: number | string,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  return await getApiService(DONE_HUB).searchChannel(
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
  return await getApiService(DONE_HUB).createChannel(
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
  return await getApiService(DONE_HUB).updateChannel(
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
  return await getApiService(DONE_HUB).deleteChannel(
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
 * Checks whether the given user preferences contain a complete Done Hub config.
 */
export function hasValidDoneHubConfig(
  prefs: UserPreferences | null,
): prefs is UserPreferences & { doneHub: DoneHubConfig } {
  if (!prefs) {
    return false
  }

  const { doneHub } = prefs

  if (!doneHub) {
    return false
  }

  return Boolean(doneHub.baseUrl && doneHub.adminToken && doneHub.userId)
}

/**
 * Validates Done Hub configuration stored in user preferences.
 */
export async function checkValidDoneHubConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    return hasValidDoneHubConfig(prefs)
  } catch (error) {
    logger.error("Error checking config", error)
    return false
  }
}

/**
 * Gets Done Hub configuration from user preferences.
 */
export async function getDoneHubConfig(): Promise<{
  baseUrl: string
  token: string
  userId: string
} | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidDoneHubConfig(prefs)) {
      const { doneHub } = prefs
      return {
        baseUrl: doneHub.baseUrl,
        token: doneHub.adminToken,
        userId: doneHub.userId,
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

  try {
    const upstreamModels = await fetchOpenAICompatibleModelIds({
      baseUrl: account.baseUrl,
      apiKey: token.key,
    })
    if (upstreamModels && upstreamModels.length > 0) {
      candidateSources.push(upstreamModels)
    }
  } catch (error) {
    logger.warn("Failed to fetch upstream models", error)
  }

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
 * Builds channel form defaults.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const availableModels = await fetchOpenAICompatibleModelIds({
    baseUrl: account.baseUrl,
    apiKey: token.key,
  })

  if (!availableModels.length) {
    throw new Error(t("messages:donehub.noAnyModels"))
  }

  const resolvedGroups = token.group
    ? [token.group]
    : [...DEFAULT_CHANNEL_FIELDS.groups]

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
 * Builds channel create payload.
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
 * Finds an existing matching channel.
 *
 * Matches by base_url + models by default; when key is provided, it further
 * requires an exact key match to avoid false positives.
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

  const normalizedDesiredKey = (key ?? "").trim()
  const shouldMatchKey = normalizedDesiredKey.length > 0

  return (
    searchResults.items.find((channel: ManagedSiteChannel) => {
      if (channel.base_url !== accountBaseUrl) return false
      if (!isArraysEqual(parseDelimitedList(channel.models), models)) {
        return false
      }

      if (!shouldMatchKey) return true

      const candidates = (channel.key ?? "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)

      return candidates.includes(normalizedDesiredKey)
    }) ?? null
  )
}

/**
 * Imports an account as a channel into Done Hub.
 */
export async function importToDoneHub(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<ServiceResponse<void>> {
  try {
    const prefs = await userPreferences.getPreferences()

    if (!hasValidDoneHubConfig(prefs)) {
      return {
        success: false,
        message: t("messages:donehub.configMissing"),
      }
    }

    const { doneHub } = prefs
    const {
      baseUrl: doneHubBaseUrl,
      adminToken: doneHubAdminToken,
      userId: doneHubUserId,
    } = doneHub

    const formData = await prepareChannelFormData(account, token)

    const existingChannel = await findMatchingChannel(
      doneHubBaseUrl!,
      doneHubAdminToken!,
      doneHubUserId!,
      account.baseUrl,
      formData.models,
      formData.key,
    )

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:donehub.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const payload = buildChannelPayload(formData)

    const createdChannelResponse = await createChannel(
      doneHubBaseUrl!,
      doneHubAdminToken!,
      doneHubUserId!,
      payload,
    )

    if (createdChannelResponse.success) {
      return {
        success: true,
        message: t("messages:donehub.importSuccess", {
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
      message: getErrorMessage(error) || t("messages:donehub.importFailed"),
    }
  }
}

/**
 * Validates Done Hub configuration and collects error messages.
 */
async function validateDoneHubConfig(): Promise<{
  valid: boolean
  errors: string[]
}> {
  const prefs = await userPreferences.getPreferences()
  const errors: string[] = []

  const baseUrl = prefs.doneHub?.baseUrl
  const adminToken = prefs.doneHub?.adminToken
  const userId = prefs.doneHub?.userId

  if (!baseUrl) {
    errors.push(t("messages:errors.validation.doneHubBaseUrlRequired"))
  }
  if (!adminToken) {
    errors.push(t("messages:errors.validation.doneHubAdminTokenRequired"))
  }
  if (!userId) {
    errors.push(t("messages:errors.validation.doneHubUserIdRequired"))
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Auto-imports into Done Hub and reports progress via toast.
 */
export async function autoConfigToDoneHub(
  account: SiteAccount,
  toastId?: string,
): Promise<AutoConfigToNewApiResponse<{ token?: ApiToken }>> {
  const configValidation = await validateDoneHubConfig()
  if (!configValidation.valid) {
    return { success: false, message: configValidation.errors.join(", ") }
  }

  const displaySiteData = accountStorage.convertToDisplayData(
    account,
  ) as DisplaySiteData

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const apiToken = await ensureAccountApiToken(
        account,
        displaySiteData,
        toastId,
      )

      toast.loading(t("messages:accountOperations.importingToDoneHub"), {
        id: toastId,
      })

      const importResult = await importToDoneHub(displaySiteData, apiToken)

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
