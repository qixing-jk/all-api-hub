import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  API_OPERATION_SEMANTICS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import type { TempWindowFallbackAllowlist } from "~/types/tempWindowFetch"
import { isRecord } from "~/utils/core/object"

import {
  getHogLotteryPeriodKey,
  HOG_LOTTERY_ENDPOINTS,
} from "./hogDailyLotteryProtocol"

const integerAtLeast = (value: unknown, minimum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

export interface HogLotteryDraw {
  prizeName: string
  prizeLabel: string
  quotaAmount: number
  createdAt: string
}

export interface HogLotteryStatus {
  remaining: 0 | 1
  daily_limit: 1
  my_draw: HogLotteryDraw | null
  rank: number | null
}

export interface HogLotteryResult {
  prizeCode: string
  prizeName: string
  prizeLabel: string
  quotaAmount: number
}

const invalid = () => new Error("Invalid Hog daily lottery response")

/** Only the current Shanghai day's own record can confirm a completed draw. */
export function parseHogLotteryStatus(
  data: unknown,
  now = Date.now(),
): HogLotteryStatus {
  if (
    !isRecord(data) ||
    data.daily_limit !== 1 ||
    (data.remaining !== 0 && data.remaining !== 1) ||
    !(data.rank === null || integerAtLeast(data.rank, 1))
  )
    throw invalid()
  const draw = data.my_draw
  if (data.remaining === 1) {
    if (draw !== null || data.rank !== null) throw invalid()
  } else {
    if (
      !isRecord(draw) ||
      !text(draw.prizeName) ||
      !text(draw.prizeLabel) ||
      !integerAtLeast(draw.quotaAmount, 0) ||
      typeof draw.createdAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        draw.createdAt,
      )
    )
      throw invalid()
    const timestamp = Date.parse(draw.createdAt)
    if (
      !Number.isFinite(timestamp) ||
      timestamp > now ||
      getHogLotteryPeriodKey(timestamp) !== getHogLotteryPeriodKey(now)
    )
      throw invalid()
  }
  return data as unknown as HogLotteryStatus
}

/** The declared free protocol only returns nonnegative raw quota prizes. */
export function parseHogLotteryResult(data: unknown): HogLotteryResult {
  if (
    !isRecord(data) ||
    !text(data.prizeCode) ||
    !text(data.prizeName) ||
    !text(data.prizeLabel) ||
    !integerAtLeast(data.quotaAmount, 0) ||
    !integerAtLeast(data.boardIndex, 0) ||
    typeof data.prizeIcon !== "string" ||
    typeof data.prizeTone !== "string"
  )
    throw invalid()
  return data as unknown as HogLotteryResult
}

const noFallback: TempWindowFallbackAllowlist = { codes: [], statusCodes: [] }
const readOptions = {
  currentTabTransport: "disabled" as const,
  tempWindowFallback: noFallback,
  options: { method: "GET" as const, cache: "no-store" as const },
}

const noRecovery = (request: ApiServiceRequest): ApiServiceRequest => ({
  ...request,
  allowAccountCredentialRecovery: false,
})

/** Read and validate the authenticated lottery status for the current day. */
export async function fetchHogLotteryStatus(request: ApiServiceRequest) {
  const period = getHogLotteryPeriodKey(Date.now())
  const response = await newApiFamilyRequests.envelope<unknown>(
    noRecovery(request),
    {
      ...readOptions,
      endpoint: HOG_LOTTERY_ENDPOINTS.Status,
    },
  )
  if (response.success !== true) throw invalid()
  if (period !== getHogLotteryPeriodKey(Date.now())) throw invalid()
  return parseHogLotteryStatus(response.data)
}

/** Check whether the lottery has a valid prize configuration. */
export async function fetchHogLotteryConfigured(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<unknown>(
    noRecovery(request),
    {
      ...readOptions,
      endpoint: HOG_LOTTERY_ENDPOINTS.Config,
    },
  )
  if (
    response.success !== true ||
    !Array.isArray(response.data) ||
    !response.data.every(
      (prize) =>
        isRecord(prize) &&
        text(prize.code) &&
        integerAtLeast(prize.quotaAmount, 0),
    )
  )
    throw invalid()
  return response.data.length > 0
}

/** No credential recovery, page fallback or POST replay, even after a timeout. */
export async function performHogLotteryDraw(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<unknown>(
    noRecovery(request),
    {
      currentTabTransport: "disabled",
      tempWindowFallback: { codes: [], statusCodes: [] },
      endpoint: HOG_LOTTERY_ENDPOINTS.Draw,
      operationSemantics: API_OPERATION_SEMANTICS.Mutation,
      options: { method: "POST", cache: "no-store", body: "{}" },
    },
  )
  if (response.success !== true) throw invalid()
  return parseHogLotteryResult(response.data)
}

/** Inspect a declared upstream URL as data; never follow or execute notice text. */
export function declaresHogLotterySource(notice: unknown): boolean {
  if (typeof notice !== "string") return false
  const urls = notice.match(/https:\/\/github\.com\/[^\s<>[\]()"']+/gi) ?? []
  return urls.some((value) => {
    try {
      const url = new URL(value)
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.origin.toLowerCase() === "https://github.com" &&
        url.pathname.replace(/\/$/, "").toLowerCase() ===
          "/mr-groundhog/hog-api-gateway"
      )
    } catch {
      return false
    }
  })
}

/** Detect this protocol from its public, same-origin notice. */
export async function fetchHogLotteryPublicMarker(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<unknown>(
    noRecovery(request),
    {
      ...readOptions,
      endpoint: "/api/notice",
    },
  )
  return response.success === true && declaresHogLotterySource(response.data)
}
