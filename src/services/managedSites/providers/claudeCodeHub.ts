import toast from "react-hot-toast"

import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS,
  isClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import { ensureAccountApiToken } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import * as claudeCodeHubApi from "~/services/apiService/claudeCodeHub"
import type { ApiResponse } from "~/services/apiService/common/type"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteImportDuplicate } from "~/services/managedSites/importDuplicateResolution"
import type { ManagedSiteConfig } from "~/services/managedSites/managedSiteService"
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

const claudeCodeHubImportDuplicateService = {
  siteType: SITE_TYPES.CLAUDE_CODE_HUB,
  searchChannel,
  hydrateComparableChannelKeys,
  fetchChannelSecretKey,
}

/**
 * Checks whether preferences contain a usable Claude Code Hub admin config.
 */
function hasValidClaudeCodeHubConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.claudeCodeHub) return false
  const { baseUrl, adminToken } = prefs.claudeCodeHub
  return Boolean(baseUrl?.trim() && adminToken?.trim())
}

/**
 * Verifies the saved Claude Code Hub config can authenticate successfully.
 */
export async function checkValidClaudeCodeHubConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (!hasValidClaudeCodeHubConfig(prefs) || !prefs.claudeCodeHub) {
      return false
    }
    const config = prefs.claudeCodeHub
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
      return prefs.claudeCodeHub
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
  const numericWeight = Number(weight ?? 1)
  if (!Number.isFinite(numericWeight)) {
    return 1
  }
  return Math.max(1, Math.trunc(numericWeight))
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
 * Searches Claude Code Hub providers through the upstream admin search API.
 */
async function searchClaudeCodeHubChannels(
  config: ClaudeCodeHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData> {
  const providers = await claudeCodeHubApi.searchProviders(config, keyword)
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
 * Resolves a real provider key when list data only contains a masked key.
 */
async function hydrateComparableChannelKey(
  config: ClaudeCodeHubConfig,
  channel: ManagedSiteChannel,
): Promise<ManagedSiteChannel | null> {
  if (hasUsableManagedSiteChannelKey(channel.key)) {
    return channel
  }

  try {
    const key = await claudeCodeHubApi.getUnmaskedProviderKey(
      config,
      channel.id,
    )
    if (!hasUsableManagedSiteChannelKey(key)) {
      throw new Error("Claude Code Hub returned an unusable provider key")
    }
    return {
      ...channel,
      key: key.trim(),
    }
  } catch (error) {
    logger.warn("Failed to hydrate Claude Code Hub provider key", {
      channelId: channel.id,
      error: getErrorMessage(error),
    })
    return null
  }
}

/**
 * Hydrates Claude Code Hub provider keys for shared channel comparison.
 */
export async function hydrateComparableChannelKeys(
  config: ClaudeCodeHubConfig,
  candidates: ManagedSiteChannel[],
): Promise<ManagedSiteChannel[]> {
  const hydratedCandidates: ManagedSiteChannel[] = []

  for (const candidate of candidates) {
    if (hasUsableManagedSiteChannelKey(candidate.key)) {
      hydratedCandidates.push(candidate)
      continue
    }

    const hydratedChannel = await hydrateComparableChannelKey(config, candidate)
    if (hydratedChannel) {
      hydratedCandidates.push(hydratedChannel)
      continue
    }

    throw new MatchResolutionUnresolvedError(
      MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    )
  }

  return hydratedCandidates
}

/**
 * Builds a Claude Code Hub create payload from managed-site form data.
 */
export function buildClaudeCodeHubCreatePayloadFromFormData(
  formData: ChannelFormData,
): ClaudeCodeHubProviderCreatePayload {
  const models = normalizeList(formData.models ?? [])
  if (models.length === 0) {
    throw new Error(t("messages:claudecodehub.modelsMissing"))
  }

  const key = formData.key.trim()
  if (!hasUsableManagedSiteChannelKey(key)) {
    throw new Error(t("messages:claudecodehub.realProviderKeyRequired"))
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
 * Searches Claude Code Hub channels by keyword through the provider search API.
 */
export async function searchChannel(
  config: ClaudeCodeHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    return await searchClaudeCodeHubChannels(config, keyword)
  } catch (error) {
    logger.error("Failed to search Claude Code Hub providers", error)
    return null
  }
}

/**
 * Creates a Claude Code Hub channel from managed-site channel input.
 */
export async function createChannel(
  config: ClaudeCodeHubConfig,
  channelData: CreateChannelPayload,
): Promise<ApiResponse<unknown>> {
  try {
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
        getErrorMessage(error) || t("messages:claudecodehub.importFailed"),
    }
  }
}

/**
 * Updates a Claude Code Hub channel from managed-site channel input.
 */
export async function updateChannel(
  config: ClaudeCodeHubConfig,
  channelData: UpdateChannelPayload & { status?: number },
): Promise<ApiResponse<unknown>> {
  try {
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
        getErrorMessage(error) || t("messages:claudecodehub.updateFailed"),
    }
  }
}

/**
 * Deletes a Claude Code Hub channel by provider id.
 */
export async function deleteChannel(
  config: ClaudeCodeHubConfig,
  channelId: number,
): Promise<ApiResponse<unknown>> {
  try {
    const deleted = await claudeCodeHubApi.deleteProvider(config, channelId)
    return { success: true, data: deleted, message: "success" }
  } catch (error) {
    return {
      success: false,
      data: null,
      message:
        getErrorMessage(error) || t("messages:claudecodehub.deleteFailed"),
    }
  }
}

/**
 * Fetches the real Claude Code Hub provider key for edit, comparison, and export flows.
 */
export async function fetchChannelSecretKey(
  config: ClaudeCodeHubConfig,
  channelId: number,
): Promise<string> {
  return await claudeCodeHubApi.getUnmaskedProviderKey(config, channelId)
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
  const upstreamAccount = normalizeAccountForManagedChannel(account)
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    upstreamAccount,
    token,
  )

  return {
    name: buildChannelName(account, token),
    type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
    key: token.key,
    base_url: upstreamAccount.baseUrl,
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
 * Imports a site account token into Claude Code Hub as a provider channel.
 */
async function importToClaudeCodeHub(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<{ success: boolean; message: string }> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (!hasValidClaudeCodeHubConfig(prefs) || !prefs.claudeCodeHub) {
      return {
        success: false,
        message: t("messages:claudecodehub.configMissing"),
      }
    }
    const config = prefs.claudeCodeHub

    const formData = await prepareChannelFormData(account, token)
    const existingChannel = await resolveManagedSiteImportDuplicate({
      service: claudeCodeHubImportDuplicateService,
      managedConfig: config,
      formData,
    })

    if (existingChannel) {
      return {
        success: false,
        message: t("messages:claudecodehub.channelExists", {
          channelName: existingChannel.name,
        }),
      }
    }

    const result = await createChannel(config, buildChannelPayload(formData))

    return result.success
      ? {
          success: true,
          message: t("messages:claudecodehub.importSuccess", {
            channelName: formData.name,
          }),
        }
      : { success: false, message: result.message }
  } catch (error) {
    return {
      success: false,
      message:
        getErrorMessage(error) || t("messages:claudecodehub.importFailed"),
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
    const prefs = await userPreferences.getPreferences()
    if (!hasValidClaudeCodeHubConfig(prefs) || !prefs.claudeCodeHub) {
      return {
        success: false,
        message: t("messages:claudecodehub.configMissing"),
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
      getErrorMessage(error) || t("messages:claudecodehub.importFailed")
    toast.error(message, { id: toastId })
    return { success: false, message }
  }
}
