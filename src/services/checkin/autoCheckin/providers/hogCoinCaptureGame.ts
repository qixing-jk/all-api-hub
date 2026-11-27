import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  buildHogCoinCaptureMovements,
  HOG_COIN_CAPTURE_ENDPOINTS,
  HOG_COIN_CAPTURE_RULES,
  parseHogCoinCaptureEnabled,
  parseHogCoinCaptureView,
  type HogCoinCaptureView,
} from "~/services/apiService/newApiFamily/variants/hogCoinCaptureGame"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  API_DIRECT_REQUEST_REASONS,
  API_OPERATION_SEMANTICS,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
  type ApiTransportRequestObserver,
} from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { AuthTypeEnum } from "~/types"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { getAllTabs } from "~/utils/browser/tabs"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

const HOG_ORIGIN = "https://fapi.leileihog.top"
const START_WAIT_BUFFER_MS = 300

/** The operator reports that this deployment stops during 22:00–09:00 CST. */
export function isHogCoinCaptureOnlineWindow(timestamp: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Shanghai",
    }).format(new Date(timestamp)),
  )
  return hour >= 9 && hour < 22
}

type Envelope<T> = { success: boolean; message?: string; data?: T }
type UserSelf = { id: string; quota: number }
type MutationObservation = { dispatched: boolean; responseReceived: boolean }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseQuota = (value: unknown): number | undefined => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined
}

const parseUserSelf = (value: unknown): UserSelf | undefined => {
  if (!isRecord(value) || value.id === undefined || value.id === null)
    return undefined
  const id = String(value.id).trim()
  const quota = parseQuota(value.quota)
  return id && quota !== undefined ? { id, quota } : undefined
}

const isSiteAccount = (
  account: SiteAccount | { site_url: string },
): account is SiteAccount => "account_info" in account

const createRequest = (
  account: SiteAccount,
  fetchContext: NonNullable<ApiServiceRequest["fetchContext"]>,
  options: {
    signal?: AbortSignal
    observer?: ApiTransportRequestObserver
  } = {},
): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  siteType: account.site_type,
  auth: {
    // Hog game writes explicitly require a same-origin browser session. Never
    // send the saved New API token to these endpoints.
    authType: AuthTypeEnum.Cookie,
    userId: account.account_info.id,
  },
  directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
  fetchContext,
  ...(fetchContext.kind === API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB
    ? { currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid }
    : {}),
  ...(options.signal ? { abortSignal: options.signal } : {}),
  ...(options.observer ? { observer: options.observer } : {}),
})

const findSameOriginContext = async (
  account: SiteAccount,
  request?: ApiServiceRequest,
): Promise<ApiServiceRequest["fetchContext"]> => {
  const origin = new URL(account.site_url).origin
  const retained = request?.fetchContext
  if (
    retained?.kind === API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB &&
    retained.origin === origin
  )
    return retained

  const tabs = await getAllTabs()
  const tab = tabs.find(
    (candidate) =>
      typeof candidate.id === "number" &&
      Boolean(candidate.url) &&
      tryParseHttpUrl(candidate.url!)?.origin === origin,
  )
  if (!tab || typeof tab.id !== "number") return undefined
  return {
    kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
    tabId: tab.id,
    origin,
    ...(tab.incognito === true ? { incognito: true } : {}),
    ...(tab.cookieStoreId ? { cookieStoreId: tab.cookieStoreId } : {}),
  }
}

/** Create a request bound to Hog's matching signed-in browser tab. */
async function createBrowserRequest(
  account: SiteAccount,
  signal?: AbortSignal,
  request?: ApiServiceRequest,
): Promise<ApiServiceRequest> {
  const context = await findSameOriginContext(account, request)
  if (!context)
    throw new ApiError(
      "Open Hog in a browser tab signed in to this account before using Coin Capture.",
      401,
      HOG_COIN_CAPTURE_ENDPOINTS.GameStatus,
      API_ERROR_CODES.HTTP_401,
    )
  return createRequest(account, context, { signal })
}

/** Read and validate the data field from a Hog API envelope. */
async function readEnvelopeData<T>(
  request: ApiServiceRequest,
  endpoint: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await newApiFamilyRequests.envelope<T>(request, {
    endpoint,
    options: {
      method: "GET",
      cache: "no-store",
      ...(signal ? { signal } : {}),
    },
  })
  if (response.success !== true || response.data === undefined)
    throw new ApiError(
      response.message || "Hog returned an invalid Coin Capture response.",
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  return response.data
}

/** Read whether Hog currently exposes the Coin Capture feature. */
async function readFeatureEnabled(
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<boolean> {
  const raw = await readEnvelopeData<unknown>(
    request,
    HOG_COIN_CAPTURE_ENDPOINTS.PublicStatus,
    signal,
  )
  const enabled = parseHogCoinCaptureEnabled(raw)
  if (enabled === undefined)
    throw new ApiError(
      "Hog did not expose the Coin Capture feature flag.",
      undefined,
      HOG_COIN_CAPTURE_ENDPOINTS.PublicStatus,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return enabled
}

/** Confirm the browser session identity and read its native quota. */
async function readUserSelf(
  account: SiteAccount,
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<UserSelf> {
  const raw = await readEnvelopeData<unknown>(
    request,
    HOG_COIN_CAPTURE_ENDPOINTS.UserSelf,
    signal,
  )
  const self = parseUserSelf(raw)
  if (!self)
    throw new ApiError(
      "Hog account identity or quota is unavailable.",
      undefined,
      HOG_COIN_CAPTURE_ENDPOINTS.UserSelf,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  if (self.id !== String(account.account_info.id))
    throw new ApiError(
      "Hog browser session belongs to a different account.",
      undefined,
      HOG_COIN_CAPTURE_ENDPOINTS.UserSelf,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return self
}

/** Read the authoritative current Coin Capture round and game state. */
async function readGameView(
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<HogCoinCaptureView> {
  const raw = await readEnvelopeData<unknown>(
    request,
    HOG_COIN_CAPTURE_ENDPOINTS.GameStatus,
    signal,
  )
  const view = parseHogCoinCaptureView(raw)
  if (!view)
    throw new ApiError(
      "Hog Coin Capture status payload is not recognized.",
      undefined,
      HOG_COIN_CAPTURE_ENDPOINTS.GameStatus,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return view
}

const toMethodStatus = (
  enabled: boolean,
  view: HogCoinCaptureView,
  observedAt: number,
): CheckInMethodStatus => {
  const completed = view.round?.status === 2
  const ready = enabled && !view.round
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability: ready
      ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
      : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    today: completed
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

const readStatus = async (
  context: AutoCheckinProviderReadContext,
): Promise<CheckInMethodStatus | undefined> => {
  const account = context.account
  if (!account) return undefined
  if (!isHogCoinCaptureOnlineWindow(context.observedAt))
    return toMethodStatus(
      false,
      { round: null, server_time: context.observedAt },
      context.observedAt,
    )
  const request = await createBrowserRequest(
    account,
    context.signal,
    context.request,
  )
  await readUserSelf(account, request, context.signal)
  const enabled = await readFeatureEnabled(request, context.signal)
  const view = await readGameView(request, context.signal)
  return toMethodStatus(enabled, view, context.observedAt)
}

const readiness = (account: SiteAccount) =>
  account.account_info?.id
    ? ({ ready: true } as const)
    : ({
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      } as const)

const createDeadline = () => {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error("Hog Coin Capture timed out")),
    HOG_COIN_CAPTURE_RULES.durationMs + 30_000,
  )
  // Retain this MV3 task while the server-enforced round runs for 40 seconds.
  const keepalive = setInterval(() => {
    void getAllTabs().catch(() => undefined)
  }, 20_000)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout)
      clearInterval(keepalive)
    },
  }
}

const waitUntil = async (targetTime: number, signal: AbortSignal) => {
  while (Date.now() < targetTime) {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          signal.removeEventListener("abort", onAbort)
          resolve()
        },
        Math.min(targetTime - Date.now(), 250),
      )
      const onAbort = () => {
        clearTimeout(timeout)
        reject(signal.reason ?? new Error("Hog Coin Capture cancelled"))
      }
      signal.addEventListener("abort", onAbort, { once: true })
    })
  }
  signal.throwIfAborted()
}

const uncertain = (message: string): AutoCheckinProviderOutcome => ({
  status: CHECKIN_RESULT_STATUS.UNCERTAIN,
  reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
  rawMessage: message,
})

const createMutationRequest = (
  baseRequest: ApiServiceRequest,
  parent: AutoCheckinProviderContext["mutationLifecycle"],
  observation: MutationObservation,
): ApiServiceRequest => ({
  ...baseRequest,
  observer: {
    onDispatch() {
      observation.dispatched = true
      parent?.onDispatch()
    },
    onResponse() {
      observation.responseReceived = true
      parent?.onResponse()
    },
    onMutationAccepted() {
      parent?.onMutationAccepted?.()
    },
    onPreHandlerUnauthorized() {
      parent?.onPreHandlerUnauthorized?.()
    },
    onCookieRecovered(cookie, generation) {
      parent?.onCookieRecovered?.(cookie, generation)
    },
  },
})

const postMutation = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  body: unknown,
): Promise<Envelope<T>> =>
  await newApiFamilyRequests.envelope<T>(request, {
    endpoint,
    operationSemantics: API_OPERATION_SEMANTICS.Mutation,
    options: {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "X-Coin-Capture": "1" },
    },
  })

const readback = async (
  account: SiteAccount,
  baseRequest: ApiServiceRequest,
): Promise<{ view: HogCoinCaptureView; self: UserSelf }> => {
  const request = await createBrowserRequest(account, undefined, baseRequest)
  const self = await readUserSelf(account, request)
  const view = await readGameView(request)
  return { view, self }
}

const awardForSettledRound = (input: {
  account: SiteAccount
  round: NonNullable<HogCoinCaptureView["round"]>
  quotaBefore: number
  quotaAfter: number
}): AutoCheckinProviderOutcome => {
  const quotaDelta = input.quotaAfter - input.quotaBefore
  if (
    input.round.status !== 2 ||
    input.round.quota <= 0 ||
    quotaDelta !== input.round.quota
  )
    return uncertain(
      "Hog settled the game but its quota grant could not be confirmed exactly.",
    )

  const amount = newApiFinancialAmount(
    quotaDelta,
    input.account.site_url,
    SITE_TYPES.NEW_API,
  )
  return {
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
    data: {
      roundId: input.round.round_id,
      gameDay: input.round.game_day,
      score: input.round.score,
      rewardCents: input.round.reward_cents,
      quotaBefore: input.quotaBefore,
      quotaAfter: input.quotaAfter,
    },
    awards: [
      accountAward(input.account, {
        id: `hog-coin-capture:${input.round.round_id}:quota`,
        operation: HOG_COIN_CAPTURE_ENDPOINTS.Settle,
        field: "round.quota + user.quota delta",
        asset: amount.asset,
        value: amount.value,
        nativeUnitsPerAsset: amount.nativeUnitsPerAsset,
        amountInputs: amount.amountInputs,
        target: AWARD_TARGETS.Wallet,
        fulfillment: AWARD_FULFILLMENT.Credited,
        event: {
          namespace: "hog-coin-capture-round",
          id: input.round.round_id,
        },
        adapter: "hog-coin-capture-game",
        contractVersion: amount.contractVersion,
        observedAt: Date.now(),
      }),
    ],
  }
}

const checkIn = async (
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderOutcome> => {
  if (!isHogCoinCaptureOnlineWindow(Date.now()))
    return {
      status: CHECKIN_RESULT_STATUS.SKIPPED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE,
      rawMessage:
        "Hog Coin Capture is outside the site's reported online window.",
    }
  const deadline = createDeadline()
  try {
    const request = await createBrowserRequest(account, deadline.signal)
    const selfBefore = await readUserSelf(account, request, deadline.signal)
    if (!(await readFeatureEnabled(request, deadline.signal)))
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
        rawMessage: "Hog has disabled the Coin Capture game.",
      }

    const before = await readGameView(request, deadline.signal)
    if (before.round?.status === 2)
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      }
    if (before.round?.status === 1)
      return uncertain(
        "A Hog Coin Capture round is already in progress; it was not restarted or taken over.",
      )
    if (
      context.beforeRecoveredMutation &&
      !(await context.beforeRecoveredMutation())
    )
      return {
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
        rawMessage: "The selected account changed before the game could start.",
      }

    const startObservation: MutationObservation = {
      dispatched: false,
      responseReceived: false,
    }
    const startRequest = createMutationRequest(
      request,
      context.mutationLifecycle,
      startObservation,
    )
    let startedView: HogCoinCaptureView | undefined
    try {
      const response = await postMutation<unknown>(
        startRequest,
        HOG_COIN_CAPTURE_ENDPOINTS.Start,
        {},
      )
      if (response.success === true)
        startedView = parseHogCoinCaptureView(response.data)
      else if (startObservation.responseReceived)
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
          rawMessage: response.message || "Hog refused to start the game.",
        }
    } catch (error) {
      if (!startObservation.dispatched)
        return resolveProviderErrorResult({ error, mutationDispatched: false })
    }

    if (!startedView?.round?.round_id || startedView.round.status !== 1) {
      if (!startObservation.dispatched)
        return uncertain("Hog did not confirm the start of a new game.")
      try {
        const recovered = await readback(account, request)
        if (recovered.view.round?.status === 2)
          return {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          }
        return uncertain(
          recovered.view.round?.status === 1
            ? "The start request may have reserved today's game, but the response was lost; the existing round was not taken over."
            : "The start request was sent but no running round was confirmed; the start was not replayed.",
        )
      } catch {
        return uncertain(
          "The start request may have been accepted, but its status could not be read back.",
        )
      }
    }

    const round = startedView.round
    const game = startedView.game
    if (!round || !game)
      return uncertain(
        "Hog started a round but did not provide the server game state needed to finish it.",
      )
    if (Math.abs(round.started_at - startedView.server_time) > 5_000)
      return uncertain(
        "The returned round did not match this start attempt closely enough to take over.",
      )

    const movements = buildHogCoinCaptureMovements(game)
    const finishAt =
      Date.now() +
      Math.max(
        0,
        round.started_at +
          HOG_COIN_CAPTURE_RULES.durationMs +
          START_WAIT_BUFFER_MS -
          startedView.server_time,
      )
    await waitUntil(finishAt, deadline.signal)

    // Confirm the same browser session still owns this round before the settle
    // mutation. If the tab switched accounts, do not submit the saved path.
    const selfAtSettle = await readUserSelf(account, request, deadline.signal)
    if (selfAtSettle.id !== selfBefore.id)
      return uncertain("The Hog browser session changed during the game.")

    const settleObservation: MutationObservation = {
      dispatched: false,
      responseReceived: false,
    }
    const settleRequest = createMutationRequest(
      request,
      context.mutationLifecycle,
      settleObservation,
    )
    try {
      const response = await postMutation<unknown>(
        settleRequest,
        HOG_COIN_CAPTURE_ENDPOINTS.Settle,
        { round_id: round.round_id, movements },
      )
      if (response.success !== true && settleObservation.responseReceived)
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
          rawMessage: response.message || "Hog refused to settle the game.",
        }
    } catch (error) {
      if (!settleObservation.dispatched)
        return resolveProviderErrorResult({ error, mutationDispatched: false })
    }

    if (!settleObservation.dispatched)
      return uncertain("Hog did not confirm the game settlement.")
    let finalReadback: { view: HogCoinCaptureView; self: UserSelf }
    try {
      finalReadback = await readback(account, request)
    } catch (error) {
      return uncertain(
        error instanceof Error
          ? error.message
          : "The final Hog quota could not be confirmed.",
      )
    }
    const finalRound = finalReadback.view.round
    if (
      finalReadback.self.id !== selfBefore.id ||
      finalRound?.round_id !== round.round_id
    )
      return uncertain("The final Hog account or game result changed.")
    if (finalRound.status !== 2)
      return uncertain(
        "The settle request was sent but the round remains unconfirmed; settlement was not replayed.",
      )
    if (finalRound.quota <= 0)
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        rawMessage: "The game settled without a quota reward.",
      }
    return awardForSettledRound({
      account,
      round: finalRound,
      quotaBefore: selfBefore.quota,
      quotaAfter: finalReadback.self.quota,
    })
  } catch (error) {
    return context.mutationLifecycle?.dispatched
      ? uncertain(
          error instanceof Error
            ? error.message
            : "Hog Coin Capture stopped with an unconfirmed request.",
        )
      : resolveProviderErrorResult({ error, mutationDispatched: false })
  } finally {
    deadline.dispose()
  }
}

export const hogCoinCaptureGameProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  classifyStatusError: getCheckInMethodUnknownReason,
  getReadiness: readiness,
  detect: (context) =>
    detectWithStatusReadback(
      context,
      readStatus,
      getCheckInMethodUnknownReason,
    ),
  getStatus: readStatus,
  async checkIn(account, context): Promise<AutoCheckinProviderOutcome> {
    if (!isSiteAccount(account))
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
        rawMessage: "Hog Coin Capture requires a saved New API account.",
      }
    if (new URL(account.site_url).origin !== HOG_ORIGIN)
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
        rawMessage:
          "This Hog Coin Capture method is restricted to its verified deployment.",
      }
    return await checkIn(account, context)
  },
}
