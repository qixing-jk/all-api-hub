import toast from "react-hot-toast"

import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS,
  isClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import * as claudeCodeHubApi from "~/services/apiService/claudeCodeHub"
import type { ApiResponse } from "~/services/apiService/common/type"
import type { ManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { findManagedSiteChannelByComparableInputs } from "~/services/managedSites/utils/channelMatching"
import { fetchManagedSiteAvailableModels } from "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
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
  ClaudeCodeHubAllowedModel,
  ClaudeCodeHubChannelWithData,
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
  ClaudeCodeHubProviderUpdatePayload,
} from "~/types/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import {
  CHANNEL_STATUS,
  type ChannelFormData,
  type ChannelMode,
  type CreateChannelPayload,
  type ManagedSiteChannel,
  type ManagedSiteChannelListData,
  type UpdateChannelPayload,
} from "~/types/managedSite"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeList, parseDelimitedList } from "~/utils/core/string"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ClaudeCodeHubService")
const DEFAULT_GROUP_TAG = "default"

/**
 * Checks whether preferences contain a usable Claude Code Hub admin config.
 */
function hasValidClaudeCodeHubConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.claudeCodeHub) return false
  const { baseUrl, adminToken } = prefs.claudeCodeHub
  return Boolean(baseUrl?.trim() && adminToken?.trim())
}

/**
 * Loads the stored Claude Code Hub admin config when all required fields exist.
 */
async function getFullClaudeCodeHubConfig(): Promise<ClaudeCodeHubConfig | null> {
  const prefs = await userPreferences.getPreferences()
  if (hasValidClaudeCodeHubConfig(prefs) && prefs.claudeCodeHub) {
    return prefs.claudeCodeHub
  }
  return null
}

/**
 * Verifies the saved Claude Code Hub config can authenticate successfully.
 */
export async function checkValidClaudeCodeHubConfig(): Promise<boolean> {
  try {
    const config = await getFullClaudeCodeHubConfig()
    if (!config) return false
    return await claudeCodeHubApi.validateClaudeCodeHubConfig(config)
  } catch (error) {
    logger.warn("Claude Code Hub config validation failed", error)
    return false
  }
}

/**
 * Adapts Claude Code Hub preferences into the managed-site config contract.
 */
export async function getClaudeCodeHubConfig(): Promise<ManagedSiteConfig | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidClaudeCodeHubConfig(prefs) && prefs.claudeCodeHub) {
      return {
        baseUrl: prefs.claudeCodeHub.baseUrl,
        token: prefs.claudeCodeHub.adminToken,
        userId: "admin",
      }
    }
    return null
  } catch (error) {
    logger.error("Error getting Claude Code Hub config", error)
    return null
  }
}

/**
 * Converts an ISO-like timestamp string to Unix seconds.
 */
function toUnixSeconds(value?: string): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0
}

/**
 * Normalizes provider types to the supported Claude Code Hub enum fallback.
 */
function normalizeProviderType(value: unknown) {
  return isClaudeCodeHubProviderType(value)
    ? value
    : CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE
}

/**
 * Preserve legacy backend-owned provider types when editing existing records,
 * while still defaulting missing or invalid values for new payloads.
 */
function preserveProviderType(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value
    : CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE
}

/**
 * Normalizes allowed-model rules into a flat list of exact model identifiers.
 */
function normalizeAllowedModels(
  allowedModels?: ClaudeCodeHubAllowedModel[],
): string[] {
  return normalizeList(
    (allowedModels ?? [])
      .map((item) => {
        if (typeof item === "string") return item
        if (item?.matchType && item.matchType !== "exact") return ""
        return item?.pattern ?? ""
      })
      .filter(Boolean),
  )
}

/**
 * Converts model identifiers into exact-match Claude Code Hub rules.
 */
function toAllowedModelRules(models: string[]): ClaudeCodeHubAllowedModel[] {
  return normalizeList(models).map((model) => ({
    matchType: "exact",
    pattern: model,
  }))
}

/**
 * Resolves the primary provider group tag from channel form data.
 */
function getProviderGroupTag(formData: Pick<ChannelFormData, "groups">) {
  return normalizeList(formData.groups)[0] ?? DEFAULT_GROUP_TAG
}

/**
 * Clamps provider weights to Claude Code Hub's expected positive integer shape.
 */
function toSafeWeight(weight?: number): number {
  return Math.max(1, Math.trunc(weight ?? 1))
}

/**
 * Maps a Claude Code Hub provider record into the managed-site channel shape.
 */
export function providerToManagedSiteChannel(
  provider: ClaudeCodeHubProviderDisplay,
): ClaudeCodeHubChannelWithData {
  const models = normalizeAllowedModels(provider.allowedModels)
  const groupTag = provider.groupTag?.trim() || DEFAULT_GROUP_TAG
  const createdTime = toUnixSeconds(provider.createdAt)

  return {
    id: provider.id,
    type: preserveProviderType(provider.providerType),
    key: provider.maskedKey ?? provider.key ?? "",
    name: provider.name || `Provider ${provider.id}`,
    base_url: provider.url ?? "",
    models: models.join(","),
    status:
      provider.isEnabled === false
        ? CHANNEL_STATUS.ManuallyDisabled
        : CHANNEL_STATUS.Enable,
    weight: toSafeWeight(provider.weight),
    priority: provider.priority ?? 0,
    openai_organization: null,
    test_model: models[0] ?? null,
    created_time: createdTime,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: groupTag,
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 0,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 1,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
    _claudeCodeHubData: provider,
  }
}

/**
 * Filters provider channels with a case-insensitive keyword match.
 */
function providerMatchesKeyword(
  channel: ManagedSiteChannel,
  keyword: string,
): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return true

  const searchable = [
    channel.name,
    String(channel.type),
    channel.base_url,
    channel.models,
    channel.group,
  ]
    .join(" ")
    .toLowerCase()

  return searchable.includes(normalizedKeyword)
}

/**
 * Lists Claude Code Hub providers and derives managed-site type counts.
 */
async function listClaudeCodeHubChannels(
  config: ClaudeCodeHubConfig,
): Promise<ManagedSiteChannelListData> {
  const providers = await claudeCodeHubApi.listProviders(config)
  const items = providers.map(providerToManagedSiteChannel)
  const typeCounts = items.reduce<Record<string, number>>((acc, item) => {
    const type = String(item.type)
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  return {
    items,
    total: items.length,
    type_counts: typeCounts,
  }
}

/**
 * Builds a Claude Code Hub create payload from managed-site form data.
 */
export function buildClaudeCodeHubCreatePayloadFromFormData(
  formData: ChannelFormData,
): ClaudeCodeHubProviderCreatePayload {
  const models = normalizeList(formData.models ?? [])
  if (models.length === 0) {
    throw new Error(t("messages:claudeCodeHub.modelsMissing"))
  }

  const key = formData.key.trim()
  if (!hasUsableManagedSiteChannelKey(key)) {
    throw new Error(t("messages:claudeCodeHub.realProviderKeyRequired"))
  }

  return {
    name: formData.name.trim(),
    url: formData.base_url.trim(),
    key,
    provider_type: normalizeProviderType(formData.type),
    allowed_models: toAllowedModelRules(models),
    is_enabled: formData.status === CHANNEL_STATUS.Enable,
    weight: toSafeWeight(formData.weight),
    priority: formData.priority,
    group_tag: getProviderGroupTag(formData),
  }
}

/**
 * Builds a Claude Code Hub update payload from managed-site channel data.
 */
export function buildClaudeCodeHubUpdatePayloadFromChannelData(
  channelData: UpdateChannelPayload & { status?: number },
): ClaudeCodeHubProviderUpdatePayload {
  const models = normalizeList(parseDelimitedList(channelData.models ?? ""))
  const payload: ClaudeCodeHubProviderUpdatePayload = {
    providerId: channelData.id,
  }

  if (channelData.name !== undefined) payload.name = channelData.name.trim()
  if (channelData.base_url !== undefined)
    payload.url = channelData.base_url.trim()
  if (channelData.type !== undefined) {
    payload.provider_type = preserveProviderType(channelData.type)
  }
  if (models.length > 0) payload.allowed_models = toAllowedModelRules(models)
  if (channelData.status !== undefined) {
    payload.is_enabled = channelData.status === CHANNEL_STATUS.Enable
  }
  if (channelData.weight !== undefined)
    payload.weight = toSafeWeight(channelData.weight)
  if (channelData.priority !== undefined)
    payload.priority = channelData.priority
  if (channelData.groups !== undefined || channelData.group !== undefined) {
    payload.group_tag =
      normalizeList(
        channelData.groups ?? parseDelimitedList(channelData.group ?? ""),
      )[0] ?? DEFAULT_GROUP_TAG
  }

  // Claude Code Hub only returns masked provider keys in list responses. Sending
  // that placeholder back would overwrite the real credential, so only include
  // a key when the user supplied comparable key material.
  if (hasUsableManagedSiteChannelKey(channelData.key)) {
    payload.key = channelData.key?.trim()
  }

  return payload
}

/**
 * Searches Claude Code Hub channels by keyword within the local provider cache.
 */
export async function searchChannel(
  _baseUrl: string,
  _accessToken: string,
  _userId: number | string,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    const config = await getFullClaudeCodeHubConfig()
    if (!config) return null

    const allChannels = await listClaudeCodeHubChannels(config)
    const items = allChannels.items.filter((channel) =>
      providerMatchesKeyword(channel, keyword),
    )

    return {
      items,
      total: items.length,
      type_counts: allChannels.type_counts,
    }
  } catch (error) {
    logger.error("Failed to search Claude Code Hub providers", error)
    return null
  }
}

/**
 * Creates a Claude Code Hub channel from managed-site channel input.
 */
export async function createChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelData: CreateChannelPayload,
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullClaudeCodeHubConfig()
    if (!config) {
      return {
        success: false,
        data: null,
        message: t("messages:claudeCodeHub.configMissing"),
      }
    }

    const created = await claudeCodeHubApi.createProvider(
      config,
      buildClaudeCodeHubCreatePayloadFromFormData({
        name: channelData.channel.name ?? "",
        type:
          channelData.channel.type ??
          DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.type,
        key: channelData.channel.key ?? "",
        base_url: channelData.channel.base_url ?? "",
        models: parseDelimitedList(channelData.channel.models ?? ""),
        groups:
          channelData.channel.groups ??
          parseDelimitedList(channelData.channel.group ?? DEFAULT_GROUP_TAG),
        priority: channelData.channel.priority ?? 0,
        weight: channelData.channel.weight ?? 1,
        status: channelData.channel.status,
      }),
    )

    return { success: true, data: created, message: "success" }
  } catch (error) {
    return {
      success: false,
      data: null,
      message:
        getErrorMessage(error) || t("messages:claudeCodeHub.importFailed"),
    }
  }
}

/**
 * Updates a Claude Code Hub channel from managed-site channel input.
 */
export async function updateChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelData: UpdateChannelPayload & { status?: number },
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullClaudeCodeHubConfig()
    if (!config) {
      return {
        success: false,
        data: null,
        message: t("messages:claudeCodeHub.configMissing"),
      }
    }

    const updated = await claudeCodeHubApi.updateProvider(
      config,
      buildClaudeCodeHubUpdatePayloadFromChannelData(channelData),
    )

    return { success: true, data: updated, message: "success" }
  } catch (error) {
    return {
      success: false,
      data: null,
      message:
        getErrorMessage(error) || t("messages:claudeCodeHub.updateFailed"),
    }
  }
}

/**
 * Deletes a Claude Code Hub channel by provider id.
 */
export async function deleteChannel(
  _baseUrl: string,
  _adminToken: string,
  _userId: number | string,
  channelId: number,
): Promise<ApiResponse<unknown>> {
  try {
    const config = await getFullClaudeCodeHubConfig()
    if (!config) {
      return {
        success: false,
        data: null,
        message: t("messages:claudeCodeHub.configMissing"),
      }
    }

    const deleted = await claudeCodeHubApi.deleteProvider(config, channelId)
    return { success: true, data: deleted, message: "success" }
  } catch (error) {
    return {
      success: false,
      data: null,
      message:
        getErrorMessage(error) || t("messages:claudeCodeHub.deleteFailed"),
    }
  }
}

/**
 * Fetches available models for a managed-site account token pair.
 */
export async function fetchAvailableModels(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<string[]> {
  return await fetchManagedSiteAvailableModels(account, token)
}

/**
 * Builds the default Claude Code Hub channel name for imported tokens.
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
 * Prefills channel form data from an account and its scoped token models.
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
    type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
    key: token.key,
    base_url: account.baseUrl,
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: [DEFAULT_GROUP_TAG],
    priority: 0,
    weight: 1,
    status: CHANNEL_STATUS.Enable,
  }
}

/**
 * Builds a managed-site channel payload for Claude Code Hub creation flows.
 */
export function buildChannelPayload(
  formData: ChannelFormData,
  mode: ChannelMode = "single",
): CreateChannelPayload {
  const payload = buildClaudeCodeHubCreatePayloadFromFormData(formData)
  return {
    mode,
    channel: {
      name: payload.name,
      type: payload.provider_type,
      key: payload.key,
      base_url: payload.url,
      models: normalizeList(formData.models ?? []).join(","),
      groups: [payload.group_tag ?? DEFAULT_GROUP_TAG],
      group: payload.group_tag ?? DEFAULT_GROUP_TAG,
      priority: payload.priority ?? 0,
      weight: payload.weight ?? 1,
      status: formData.status,
    },
  }
}

/**
 * Finds an existing Claude Code Hub channel matching comparable account inputs.
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
    const config = await getFullClaudeCodeHubConfig()
    if (!config || !hasUsableManagedSiteChannelKey(key)) return null

    const channels = await listClaudeCodeHubChannels(config)
    const comparableChannels = channels.items.filter((channel) =>
      hasUsableManagedSiteChannelKey(channel.key),
    )
    return findManagedSiteChannelByComparableInputs({
      channels: comparableChannels,
      accountBaseUrl,
      models,
      key,
    })
  } catch (error) {
    logger.error("Failed to find matching Claude Code Hub provider", error)
    return null
  }
}

/**
 * Imports a site account token into Claude Code Hub as a provider channel.
 */
async function importToClaudeCodeHub(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getFullClaudeCodeHubConfig()
    if (!config) {
      return {
        success: false,
        message: t("messages:claudeCodeHub.configMissing"),
      }
    }

    const formData = await prepareChannelFormData(account, token)
    const existingChannel = await findMatchingChannel(
      config.baseUrl,
      config.adminToken,
      "admin",
      account.baseUrl,
      formData.models,
      formData.key,
    )

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:claudeCodeHub.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const result = await createChannel(
      config.baseUrl,
      config.adminToken,
      "admin",
      buildChannelPayload(formData),
    )

    return result.success
      ? {
          success: true,
          message: t("messages:claudeCodeHub.importSuccess", {
            channelName: formData.name,
          }),
        }
      : { success: false, message: result.message }
  } catch (error) {
    return {
      success: false,
      message:
        getErrorMessage(error) || t("messages:claudeCodeHub.importFailed"),
    }
  }
}

/**
 * Auto-imports a site account into Claude Code Hub with toast feedback.
 */
export async function autoConfigToClaudeCodeHub(
  account: SiteAccount,
  toastId?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getFullClaudeCodeHubConfig()
    if (!config) {
      return {
        success: false,
        message: t("messages:claudeCodeHub.configMissing"),
      }
    }

    const displaySiteData = accountStorage.convertToDisplayData(account)
    const apiToken = await ensureAccountApiToken(
      account,
      displaySiteData,
      toastId,
    )

    toast.loading(t("messages:accountOperations.importingToClaudeCodeHub"), {
      id: toastId,
    })

    const result = await importToClaudeCodeHub(displaySiteData, apiToken)
    if (result.success) {
      toast.success(result.message, { id: toastId })
    } else {
      toast.error(result.message, { id: toastId })
    }
    return result
  } catch (error) {
    const message =
      getErrorMessage(error) || t("messages:claudeCodeHub.importFailed")
    toast.error(message, { id: toastId })
    return { success: false, message }
  }
}
