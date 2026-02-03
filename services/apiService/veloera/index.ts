import i18next from "i18next"

import {
  determineHealthStatus,
  fetchAccountQuota,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/common"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import { fetchAllItems } from "~/services/apiService/common/pagination"
import type {
  AccountData,
  ApiServiceAccountRequest,
  ApiServiceRequest,
  RefreshAccountResult,
} from "~/services/apiService/common/type"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import { CheckInConfig, SiteHealthStatus } from "~/types"
import type {
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to Veloera API service calls.
 */
const logger = createLogger("ApiService.Veloera")

const VELOERA_CHANNEL_ENDPOINT = "/api/channel"

type VeloeraChannelInfo = {
  is_multi_key?: boolean
  multi_key_size?: number
  multi_key_status_list?: unknown[] | null
  multi_key_polling_index?: number
  multi_key_mode?: string
}

type VeloeraChannelRaw = Partial<
  Omit<ManagedSiteChannel, "channel_info"> & {
    channel_info?: VeloeraChannelInfo
  }
>

/**
 * Create an empty channel_info object when upstream omits it.
 */
const createDefaultChannelInfo = (): ManagedSiteChannel["channel_info"] => ({
  is_multi_key: false,
  multi_key_size: 0,
  multi_key_status_list: null,
  multi_key_polling_index: 0,
  multi_key_mode: "",
})

/**
 * Best-effort conversion for numeric fields.
 */
const toNumberOrZero = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Normalize Veloera channel payloads to match New API's `ManagedSiteChannel`.
 */
const normalizeChannel = (raw: VeloeraChannelRaw): ManagedSiteChannel => {
  const rawInfo = raw.channel_info
  const channelInfo = rawInfo
    ? {
        is_multi_key: Boolean(rawInfo.is_multi_key),
        multi_key_size: toNumberOrZero(rawInfo.multi_key_size),
        multi_key_status_list: rawInfo.multi_key_status_list ?? null,
        multi_key_polling_index: toNumberOrZero(
          rawInfo.multi_key_polling_index,
        ),
        multi_key_mode: rawInfo.multi_key_mode ?? "",
      }
    : createDefaultChannelInfo()

  return {
    id: toNumberOrZero(raw.id),
    type: raw.type as ManagedSiteChannel["type"],
    key: raw.key ?? "",
    name: raw.name ?? "",
    base_url: raw.base_url ?? "",
    models: raw.models ?? "",
    status: toNumberOrZero(raw.status) as ManagedSiteChannel["status"],
    weight: toNumberOrZero(raw.weight),
    priority: toNumberOrZero(raw.priority),
    openai_organization: raw.openai_organization ?? null,
    test_model: raw.test_model ?? null,
    created_time: toNumberOrZero(raw.created_time),
    test_time: toNumberOrZero(raw.test_time),
    response_time: toNumberOrZero(raw.response_time),
    other: raw.other ?? "",
    balance: toNumberOrZero(raw.balance),
    balance_updated_time: toNumberOrZero(raw.balance_updated_time),
    group: raw.group ?? "default",
    used_quota: toNumberOrZero(raw.used_quota),
    model_mapping: raw.model_mapping ?? "",
    status_code_mapping: raw.status_code_mapping ?? "",
    auto_ban: toNumberOrZero(raw.auto_ban),
    other_info: raw.other_info ?? "",
    tag: raw.tag ?? null,
    param_override: raw.param_override ?? null,
    header_override: raw.header_override ?? null,
    remark: raw.remark ?? null,
    channel_info: channelInfo,
    setting: raw.setting ?? "",
    settings: raw.settings ?? raw.setting ?? "",
  }
}

/**
 * Create a channel for a Veloera-managed site.
 *
 * Veloera expects a flat channel payload (not wrapped by `{ mode, channel }`).
 * We convert `CreateChannelPayload` into a Veloera-compatible request body.
 */
export async function createChannel(
  request: ApiServiceRequest,
  channelData: CreateChannelPayload,
): Promise<any> {
  try {
    const { groups, ...channel } = channelData.channel
    const payload = {
      ...channel,
      group: (groups ?? []).join(","),
    }

    return await fetchApi<void>(request, {
      endpoint: VELOERA_CHANNEL_ENDPOINT,
      options: {
        method: "POST",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    logger.error("Failed to create channel", error)
    throw new Error("创建渠道失败，请检查网络或 Veloera 配置")
  }
}

/**
 * Update a channel for a Veloera-managed site.
 *
 * Veloera expects the update payload to be flat and typically uses `group` instead
 * of `groups`. We ensure `group` is populated and omit the `groups` array.
 */
export async function updateChannel(
  request: ApiServiceRequest,
  channelData: UpdateChannelPayload,
): Promise<any> {
  try {
    const { groups, ...rest } = channelData
    const payload = {
      ...rest,
      group: rest.group ?? (groups ?? []).join(","),
    }

    return await fetchApi<void>(request, {
      endpoint: VELOERA_CHANNEL_ENDPOINT,
      options: {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    })
  } catch (error) {
    logger.error("Failed to update channel", error)
    throw new Error("更新渠道失败，请检查网络或 Veloera 配置")
  }
}

/**
 * List all channels from a Veloera-managed site.
 *
 * Veloera returns a bare channel array inside `data` for `/api/channel/`.
 * This implementation paginates from `p=0` and adapts the response into the
 * same `ManagedSiteChannelListData` structure used by the New API implementation.
 */
export async function listAllChannels(
  request: ApiServiceRequest,
  options?: {
    pageSize?: number
    beforeRequest?: () => Promise<void>
  },
): Promise<ManagedSiteChannelListData> {
  const pageSize = options?.pageSize ?? REQUEST_CONFIG.DEFAULT_PAGE_SIZE
  const beforeRequest = options?.beforeRequest

  const allItems = await fetchAllItems<ManagedSiteChannel>(
    async (page) => {
      await beforeRequest?.()

      const endpoint = `/api/channel/?p=${page}&page_size=${pageSize}`
      const data = await fetchApiData<unknown>(request, { endpoint })

      if (!Array.isArray(data)) {
        throw new ApiError("Failed to fetch channels", undefined, endpoint)
      }

      const normalized = (data as VeloeraChannelRaw[]).map(normalizeChannel)
      return {
        items: normalized,
        hasMore: normalized.length >= pageSize,
      }
    },
    {
      pageSize,
      startPage: 0,
      maxPages: REQUEST_CONFIG.MAX_PAGES,
    },
  )

  const typeCounts: Record<string, number> = {}
  for (const channel of allItems) {
    const key = String(channel.type)
    typeCounts[key] = (typeCounts[key] || 0) + 1
  }

  return {
    items: allItems,
    total: allItems.length,
    type_counts: typeCounts,
  } as ManagedSiteChannelListData
}

/**
 * Search channels by keyword for a Veloera-managed site.
 *
 * Veloera implementations often return a bare array (no `total`/`type_counts`).
 * This adapter normalizes that payload to New API compatible `ManagedSiteChannelListData`.
 */
export async function searchChannel(
  request: ApiServiceRequest,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    const endpoint = `/api/channel/search?keyword=${encodeURIComponent(keyword)}`
    const data = await fetchApiData<unknown>(request, { endpoint })

    const rawItems: VeloeraChannelRaw[] | null = Array.isArray(data)
      ? (data as VeloeraChannelRaw[])
      : Array.isArray((data as { items?: unknown } | null)?.items)
        ? (((data as { items: unknown[] }).items ?? []) as VeloeraChannelRaw[])
        : null

    if (!rawItems) {
      throw new ApiError("Failed to search channels", undefined, endpoint)
    }

    const items = rawItems.map(normalizeChannel)
    const typeCounts: Record<string, number> = {}
    for (const channel of items) {
      const key = String(channel.type)
      typeCounts[key] = (typeCounts[key] || 0) + 1
    }

    return {
      items,
      total: items.length,
      type_counts: typeCounts,
    } as ManagedSiteChannelListData
  } catch (error) {
    logger.error("Failed to search channels", error)
    return null
  }
}

/**
 * Fetch check-in capability for the user.
 * @param request ApiServiceRequest.
 * @returns True/false when available; undefined if unsupported or errors.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  try {
    const checkInData = await fetchApiData<{ can_check_in?: boolean }>(
      request,
      {
        endpoint: "/api/user/check_in_status",
      },
    )
    // 仅当 can_check_in 明确为 true 或 false 时才返回，否则返回 undefined
    if (typeof checkInData.can_check_in === "boolean") {
      return checkInData.can_check_in
    }
    return undefined
  } catch (error) {
    // 如果接口不存在或返回错误（如 404 Not Found），则认为不支持签到功能
    if (
      error instanceof ApiError &&
      (error.statusCode === 404 || error.statusCode === 500)
    ) {
      return undefined
    }
    logger.warn("获取签到状态失败:", error)
    return undefined // 其他错误也视为不支持
  }
}

/**
 * Refresh a single account's data and return health status.
 * @param request ApiServiceRequest (use `request.checkIn` for check-in config).
 * @returns Success flag, data (when success), and health status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchAccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: i18next.t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    logger.error("刷新账号数据失败", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}

/**
 * Fetch and aggregate all account data for Veloera.
 * @param request ApiServiceAccountRequest (use `request.checkIn` for check-in config).
 * @returns Aggregated account data.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const resolvedCheckIn: CheckInConfig = request.checkIn

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request)
  const todayIncomePromise = fetchTodayIncome(request)
  const checkInPromise = resolvedCheckIn?.enableDetection
    ? fetchCheckInStatus(request)
    : Promise.resolve<boolean | undefined>(undefined)

  const [quota, todayUsage, todayIncome, canCheckIn] = await Promise.all([
    quotaPromise,
    todayUsagePromise,
    todayIncomePromise,
    checkInPromise,
  ])

  const didDetectCheckInStatus = resolvedCheckIn?.enableDetection === true
  const checkInDetectedAt = didDetectCheckInStatus
    ? Date.now()
    : resolvedCheckIn.siteStatus?.lastDetectedAt

  return {
    quota,
    ...todayUsage,
    ...todayIncome,
    checkIn: {
      ...resolvedCheckIn,
      siteStatus: {
        ...(resolvedCheckIn.siteStatus ?? {}),
        // `canCheckIn` means "can check in today" (i.e. NOT checked-in yet).
        // Map it into the UI-facing `isCheckedInToday` flag and keep `undefined`
        // when upstream does not provide a reliable status.
        isCheckedInToday: didDetectCheckInStatus
          ? canCheckIn === undefined
            ? undefined
            : !canCheckIn
          : resolvedCheckIn.siteStatus?.isCheckedInToday,
        lastDetectedAt: checkInDetectedAt,
      },
    },
  }
}
