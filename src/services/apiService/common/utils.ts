import { resolveLegacyAccountAwareRequest } from "~/services/accounts/utils/legacyAccountAwareRequest"
import type {
  ApiResponse,
  FetchApiOptions,
  LogItem,
  TodayUsageData,
} from "~/services/apiService/common/type"
import {
  extractDataFromApiResponseBody,
  isHttpUrl,
  fetchApi as transportFetchApi,
  fetchApiData as transportFetchApiData,
} from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export { extractDataFromApiResponseBody, isHttpUrl }

/**
 * Fetch account-site API data after applying account-aware fallback metadata.
 * @param request Account-site request DTO.
 * @param options Fetch options.
 * @returns Extracted response data.
 */
export async function fetchApiData<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
): Promise<T> {
  return await transportFetchApiData(
    await resolveLegacyAccountAwareRequest(request, {
      endpoint: options.endpoint,
    }),
    options,
  )
}

/**
 * Fetch account-site API responses after applying account-aware fallback metadata.
 * @param request Account-site request DTO.
 * @param options Fetch options.
 * @param _normalResponseType Whether to unwrap normal response envelopes.
 * @returns API response envelope or unwrapped payload.
 */
export function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType: true,
): Promise<T>
export function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType?: false,
): Promise<ApiResponse<T>>
export async function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType?: boolean,
): Promise<T | ApiResponse<T>> {
  return await transportFetchApi(
    await resolveLegacyAccountAwareRequest(request, {
      endpoint: options.endpoint,
    }),
    options,
    _normalResponseType as true,
  )
}

/**
 * Compute today's start/end unix timestamps (seconds).
 * @returns Object with start and end seconds for the current day.
 */
export const getTodayTimestampRange = (): { start: number; end: number } => {
  const today = new Date()

  today.setHours(0, 0, 0, 0)
  const start = Math.floor(today.getTime() / 1000)

  today.setHours(23, 59, 59, 999)
  const end = Math.floor(today.getTime() / 1000)

  return { start, end }
}

/**
 * Aggregate usage data over log items (quota + tokens).
 * @param items Log records to sum.
 * @returns Totals for quota and token counts.
 */
export const aggregateUsageData = (
  items: LogItem[],
): Omit<TodayUsageData, "today_requests_count"> => {
  return items.reduce(
    (acc, item) => ({
      today_quota_consumption: acc.today_quota_consumption + (item.quota || 0),
      today_prompt_tokens: acc.today_prompt_tokens + (item.prompt_tokens || 0),
      today_completion_tokens:
        acc.today_completion_tokens + (item.completion_tokens || 0),
    }),
    {
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
    },
  )
}

/**
 * Extract currency symbol and numeric amount from a free-form string.
 * @param text Input text containing currency and amount.
 * @param exchangeRate CNY per USD exchange rate for ¥ normalization.
 * @returns Symbol and USD amount when detected; otherwise null.
 */
export function extractAmount(
  text: string,
  exchangeRate: number,
): { currencySymbol: string; amount: number } | null {
  const regex = /([\p{Sc}])\s*([\d,]+(?:\.\d+)?)/u
  const match = text.match(regex)

  if (!match) return null

  const currencySymbol = match[1]
  let amount = parseFloat(match[2].replace(/,/g, ""))

  if (currencySymbol === "¥") {
    amount = amount / exchangeRate
  }

  return { currencySymbol, amount }
}
