import toast from "react-hot-toast"

import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  DEFAULT_AXON_HUB_CHANNEL_FIELDS,
} from "~/constants/axonHub"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import * as axonHubApi from "~/services/apiService/axonHub"
import type { ApiResponse } from "~/services/apiService/common/type"
import type { ManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { findManagedSiteChannelByComparableInputs } from "~/services/managedSites/utils/channelMatching"
import { fetchManagedSiteAvailableModels } from "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type {
  AccountToken,
  ApiToken,
  DisplaySiteData,
  SiteAccount,
} from "~/types"
import type {
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import {
  CHANNEL_STATUS,
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AxonHubService")

/**
 * Check whether preferences contain a complete AxonHub admin config.
 */
function hasValidAxonHubConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.axonHub) return false
  const { baseUrl, email, password } = prefs.axonHub
  return Boolean(baseUrl?.trim() && email?.trim() && password?.trim())
}

/**
 * Validate the saved AxonHub admin config by signing in.
 */
export async function checkValidAxonHubConfig(): Promise<boolean> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) return false
    await axonHubApi.signIn(config)
    return true
  } catch (error) {
    logger.warn("AxonHub config validation failed", error)
    return false
  }
}

/**
 * Return the AxonHub config in the shared managed-site service shape.
 */
export async function getAxonHubConfig(): Promise<ManagedSiteConfig | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidAxonHubConfig(prefs) && prefs.axonHub) {
      return {
        baseUrl: prefs.axonHub.baseUrl,
        token: prefs.axonHub.password,
        userId: prefs.axonHub.email,
      }
    }
    return null
  } catch (error) {
    logger.error("Error getting AxonHub config", error)
    return null
  }
}

/**
 * Return the full AxonHub credential config used by provider operations.
 */
async function getFullAxonHubConfig(): Promise<AxonHubConfig | null> {
  const prefs = await userPreferences.getPreferences()
  if (hasValidAxonHubConfig(prefs) && prefs.axonHub) {
    return prefs.axonHub
  }
  return null
}

const getFinalModels = (formData: ChannelFormData) =>
  normalizeList(formData.models ?? [])

const toAxonHubStatus = (status?: number) =>
  status === CHANNEL_STATUS.Enable
    ? AXON_HUB_CHANNEL_STATUS.ENABLED
    : AXON_HUB_CHANNEL_STATUS.DISABLED

/**
 * Build an AxonHub create-channel input from normalized dialog form data.
 */
function buildAxonHubInputFromFormData(
  formData: ChannelFormData,
): AxonHubCreateChannelInput {
  const models = getFinalModels(formData)
  if (models.length === 0) {
    throw new Error(t("messages:axonhub.modelsMissing"))
  }

  return {
    type:
      typeof formData.type === "string"
        ? formData.type
        : DEFAULT_AXON_HUB_CHANNEL_FIELDS.type,
    name: formData.name.trim(),
    baseURL: formData.base_url.trim(),
    credentials: {
      apiKeys: [formData.key.trim()].filter(Boolean),
    },
    supportedModels: models,
    manualModels: models,
    defaultTestModel: models[0],
    settings: {},
    orderingWeight: formData.weight,
  }
}

/**
 * Build a sparse AxonHub update-channel input from managed-site payload data.
 */
function buildAxonHubUpdateInputFromPayload(
  channelData: UpdateChannelPayload,
): AxonHubUpdateChannelInput {
  const models = normalizeList(channelData.models?.split(",") ?? [])
  const input: AxonHubUpdateChannelInput = {}

  if (typeof channelData.type === "string") input.type = channelData.type
  if (channelData.name !== undefined) input.name = channelData.name.trim()
  if (channelData.base_url !== undefined) {
    input.baseURL = channelData.base_url.trim()
  }
  if (channelData.key !== undefined) {
    input.credentials = {
      apiKeys: [channelData.key.trim()].filter(Boolean),
    }
  }
  if (models.length > 0) {
    input.supportedModels = models
    input.manualModels = models
    input.defaultTestModel = models[0]
  }
  if (channelData.weight !== undefined) {
    input.orderingWeight = channelData.weight
  }

  return input
}

/**
 * Search AxonHub channels using the current saved admin credentials.
 */
export async function searchChannel(
  _baseUrl: string,
  _accessToken: string,
  _userId: number | string,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) return null

    return await axonHubApi.searchChannels(config, keyword)
  } catch (error) {
    logger.error("Failed to search AxonHub channels", error)
    return null
  }
}

/**
 * Create an AxonHub channel through the managed-site service contract.
 */
export async function createChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelData: CreateChannelPayload,
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) {
      return {
        success: false,
        data: null,
        message: t("messages:axonhub.configMissing"),
      }
    }

    const channel = channelData.channel
    const input = buildAxonHubInputFromFormData({
      name: channel.name ?? "",
      type: channel.type ?? DEFAULT_AXON_HUB_CHANNEL_FIELDS.type,
      key: channel.key ?? "",
      base_url: channel.base_url ?? "",
      models: normalizeList(channel.models?.split(",") ?? []),
      groups: [],
      priority: 0,
      weight: channel.weight ?? 0,
      status: channel.status,
    })

    const created = await axonHubApi.createAxonHubChannel(config, input)

    if (channel.status === CHANNEL_STATUS.Enable) {
      // AxonHub can create channels disabled depending on backend defaults, so
      // apply the requested final enabled state after creation.
      await axonHubApi.updateAxonHubChannelStatus(
        config,
        created.id,
        AXON_HUB_CHANNEL_STATUS.ENABLED,
      )
    }

    return { success: true, data: created, message: "success" }
  } catch (error) {
    return {
      success: false,
      data: null,
      message: getErrorMessage(error) || t("messages:axonhub.importFailed"),
    }
  }
}

/**
 * Update an AxonHub channel through the managed-site service contract.
 */
export async function updateChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelData: UpdateChannelPayload & { status?: number },
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) {
      return {
        success: false,
        data: null,
        message: t("messages:axonhub.configMissing"),
      }
    }

    const graphqlId = axonHubApi.resolveAxonHubGraphqlId(channelData.id)
    const updated = await axonHubApi.updateAxonHubChannel(
      config,
      graphqlId,
      buildAxonHubUpdateInputFromPayload(channelData),
    )

    if (channelData.status !== undefined) {
      await axonHubApi.updateAxonHubChannelStatus(
        config,
        graphqlId,
        toAxonHubStatus(channelData.status),
      )
    }

    return { success: true, data: updated, message: "success" }
  } catch (error) {
    return {
      success: false,
      data: null,
      message: getErrorMessage(error) || "Failed to update AxonHub channel",
    }
  }
}

/**
 * Delete an AxonHub channel through the managed-site service contract.
 */
export async function deleteChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelId: number,
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) {
      return {
        success: false,
        data: null,
        message: t("messages:axonhub.configMissing"),
      }
    }

    const deleted = await axonHubApi.deleteAxonHubChannel(
      config,
      axonHubApi.resolveAxonHubGraphqlId(channelId),
    )
    return {
      success: deleted,
      data: deleted,
      message: deleted ? "success" : t("messages:axonhub.deleteFailed"),
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      message: getErrorMessage(error) || "Failed to delete AxonHub channel",
    }
  }
}

/**
 * Fetch models available to the source account token for AxonHub imports.
 */
export async function fetchAvailableModels(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<string[]> {
  return await fetchManagedSiteAvailableModels(account, token)
}

/**
 * Build the default AxonHub imported-channel name.
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
 * Prepare AxonHub channel form data from an account/token pair.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    account,
    token,
  )

  return {
    name: buildChannelName(account, token),
    type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    key: token.key,
    base_url: account.baseUrl,
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: [],
    priority: 0,
    weight: 0,
    status: CHANNEL_STATUS.Enable,
  }
}

/**
 * Build a managed-site create payload from AxonHub form data.
 */
export function buildChannelPayload(
  formData: ChannelFormData,
  mode: ChannelMode = "single",
): CreateChannelPayload {
  const input = buildAxonHubInputFromFormData(formData)
  return {
    mode,
    channel: {
      name: input.name,
      type: input.type,
      key: input.credentials.apiKeys?.[0] ?? "",
      base_url: input.baseURL,
      models: input.supportedModels.join(","),
      groups: [],
      priority: 0,
      weight: input.orderingWeight ?? 0,
      status: formData.status,
    },
  }
}

/**
 * Find an existing AxonHub channel matching source account attributes.
 */
export async function findMatchingChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  accountBaseUrl: string,
  models: string[],
  key?: string,
): Promise<ManagedSiteChannel | null> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) return null

    const channels = await axonHubApi.listChannels(config)
    return findManagedSiteChannelByComparableInputs({
      channels: channels.items,
      accountBaseUrl,
      models,
      key,
    })
  } catch (error) {
    logger.error("Failed to find matching AxonHub channel", error)
    return null
  }
}

/**
 * Import a single account token into AxonHub as an OpenAI-compatible channel.
 */
export async function importToAxonHub(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) {
      return { success: false, message: t("messages:axonhub.configMissing") }
    }

    const formData = await prepareChannelFormData(account, token)
    const existingChannel = await findMatchingChannel(
      config.baseUrl,
      config.password,
      config.email,
      account.baseUrl,
      formData.models,
      formData.key,
    )

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:axonhub.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const result = await createChannel(
      config.baseUrl,
      config.password,
      config.email,
      buildChannelPayload(formData),
    )

    return result.success
      ? {
          success: true,
          message: t("messages:axonhub.importSuccess", {
            channelName: formData.name,
          }),
        }
      : { success: false, message: result.message }
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error) || t("messages:axonhub.importFailed"),
    }
  }
}

/**
 * Auto-provision an account token and import it into AxonHub.
 */
export async function autoConfigToAxonHub(
  account: SiteAccount,
  toastId?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getFullAxonHubConfig()
    if (!config) {
      return { success: false, message: t("messages:axonhub.configMissing") }
    }

    const displaySiteData = accountStorage.convertToDisplayData(account)
    const apiToken = await ensureAccountApiToken(
      account,
      displaySiteData,
      toastId,
    )

    toast.loading(t("messages:accountOperations.importingToAxonHub"), {
      id: toastId,
    })

    const result = await importToAxonHub(displaySiteData, apiToken)
    if (result.success) {
      toast.success(result.message, { id: toastId })
    } else {
      toast.error(result.message, { id: toastId })
    }
    return result
  } catch (error) {
    const message = getErrorMessage(error) || t("messages:axonhub.importFailed")
    toast.error(message, { id: toastId })
    return { success: false, message }
  }
}
