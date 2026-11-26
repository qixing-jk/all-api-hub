import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  API_DIRECT_REQUEST_REASONS,
  API_OPERATION_SEMANTICS,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
  type ApiTransportRequestObserver,
} from "~/services/apiTransport/type"
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
import { AuthTypeEnum, type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { getAllTabs } from "~/utils/browser/tabs"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import {
  buildUltraRouterGameInputBatch,
  createUltraRouterGameAward,
  isCompletedUltraRouterGame,
  parseUltraRouterGameRun,
  parseUltraRouterGameSnapshot,
  readUltraRouterGameClock,
  ULTRAROUTER_GAME_ENDPOINTS,
  ULTRAROUTER_GAME_RULES,
  type UltraRouterGameRun,
  type UltraRouterGameSnapshot,
} from "./ultrarouterGameProtocol"

const ULTRAROUTER_ORIGIN = "https://ultrarouter.org"
const USER_IDENTITY_MISMATCH = "UltraRouter account identity mismatch"

type UserSelf = {
  id: string
  quota: number
}

type GameApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

type RequestObservation = {
  dispatched: boolean
  responseReceived: boolean
}

const isSiteAccount = (
  account: SiteAccount | { site_url: string },
): account is SiteAccount => "account_info" in account

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
  if (!value || typeof value !== "object") return undefined
  const self = value as Record<string, unknown>
  if (
    self.id === undefined ||
    self.id === null ||
    String(self.id).trim() === ""
  )
    return undefined
  const quota = parseQuota(self.quota)
  if (quota === undefined) return undefined
  return { id: String(self.id), quota }
}

const createRequest = (
  account: SiteAccount,
  options: {
    signal?: AbortSignal
    contextRequest?: Pick<ApiServiceRequest, "baseUrl" | "fetchContext">
    observer?: ApiTransportRequestObserver
  } = {},
): ApiServiceRequest => {
  const origin = new URL(account.site_url).origin
  const context = options.contextRequest?.fetchContext
  const fetchContext =
    context &&
    ((context.kind === API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB &&
      context.origin === origin) ||
      context.kind === API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT)
      ? context
      : undefined
  return {
    baseUrl: account.site_url,
    accountId: account.id,
    siteType: account.site_type,
    auth: {
      // UltraRouter's game routes are dashboard-session routes; the saved
      // New API token is deliberately ignored. credentials=include uses the
      // browser's ordinary same-origin login session without exporting it.
      authType: AuthTypeEnum.Cookie,
      userId: account.account_info.id,
    },
    directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
    ...(fetchContext
      ? {
          fetchContext,
          ...(fetchContext.kind ===
          API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB
            ? {
                currentTabFallback:
                  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
              }
            : {}),
        }
      : {}),
    ...(options.signal ? { abortSignal: options.signal } : {}),
    ...(options.observer ? { observer: options.observer } : {}),
  }
}

const findSameOriginContext = async (
  account: SiteAccount,
): Promise<ApiServiceRequest["fetchContext"]> => {
  try {
    const expectedOrigin = new URL(account.site_url).origin
    const tabs = await getAllTabs()
    const matchingTab = tabs.find((tab) => {
      if (typeof tab.id !== "number" || !tab.url) return false
      return tryParseHttpUrl(tab.url)?.origin === expectedOrigin
    })
    if (!matchingTab || typeof matchingTab.id !== "number") return undefined
    return {
      kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: matchingTab.id,
      origin: expectedOrigin,
      ...(matchingTab.incognito === true ? { incognito: true } : {}),
      ...(matchingTab.cookieStoreId
        ? { cookieStoreId: matchingTab.cookieStoreId }
        : {}),
    }
  } catch {
    return undefined
  }
}

const createBrowserRequest = async (
  account: SiteAccount,
  signal?: AbortSignal,
  contextRequest?: Pick<ApiServiceRequest, "baseUrl" | "fetchContext">,
) => {
  const fetchContext =
    contextRequest?.fetchContext ?? (await findSameOriginContext(account))
  return createRequest(account, {
    signal,
    ...(contextRequest
      ? { contextRequest }
      : fetchContext
        ? { contextRequest: { baseUrl: account.site_url, fetchContext } }
        : {}),
  })
}

const readEnvelopeData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  signal?: AbortSignal,
): Promise<T> => {
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
      response.message || "UltraRouter returned an invalid response",
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  return response.data
}

const readUserSelf = async (
  account: SiteAccount,
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<UserSelf> => {
  const raw = await readEnvelopeData<unknown>(
    request,
    ULTRAROUTER_GAME_ENDPOINTS.Self,
    signal,
  )
  const self = parseUserSelf(raw)
  if (!self)
    throw new ApiError(
      "UltraRouter user identity or quota is unavailable",
      undefined,
      ULTRAROUTER_GAME_ENDPOINTS.Self,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  if (self.id !== String(account.account_info.id))
    throw new ApiError(
      USER_IDENTITY_MISMATCH,
      undefined,
      ULTRAROUTER_GAME_ENDPOINTS.Self,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return self
}

const readGameSnapshot = async (
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<UltraRouterGameSnapshot> => {
  const [game, rewards] = await Promise.all([
    readEnvelopeData<unknown>(
      request,
      ULTRAROUTER_GAME_ENDPOINTS.Status,
      signal,
    ),
    readEnvelopeData<unknown>(
      request,
      ULTRAROUTER_GAME_ENDPOINTS.Rewards,
      signal,
    ),
  ])
  const snapshot = parseUltraRouterGameSnapshot(game, rewards)
  if (!snapshot)
    throw new ApiError(
      "UltraRouter game status payload is not recognized",
      undefined,
      ULTRAROUTER_GAME_ENDPOINTS.Status,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return snapshot
}

const toMethodStatus = (
  snapshot: UltraRouterGameSnapshot,
  observedAt: number,
) => {
  const completed = snapshot.run?.status === "survived"
  const canStart =
    snapshot.settings.enabled && snapshot.budgets.can_start && !snapshot.run
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability: canStart
      ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
      : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    today: completed
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  } as const
}

const getStatus = async (context: AutoCheckinProviderReadContext) => {
  const account = context.account
  if (!account) return undefined
  const request = await createBrowserRequest(
    account,
    context.signal,
    context.request,
  )
  await readUserSelf(account, request, context.signal)
  const snapshot = await readGameSnapshot(request, context.signal)
  return toMethodStatus(snapshot, context.observedAt)
}

const readiness = (account: SiteAccount) =>
  account.account_info?.id
    ? ({ ready: true } as const)
    : ({
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      } as const)

const createObservedMutationRequest = (
  account: SiteAccount,
  signal: AbortSignal,
  contextRequest: Pick<ApiServiceRequest, "baseUrl" | "fetchContext">,
  parent: AutoCheckinProviderContext["mutationLifecycle"],
  observation: RequestObservation,
) =>
  createRequest(account, {
    signal,
    contextRequest,
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

const postGameMutation = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  body?: unknown,
): Promise<GameApiResponse<T>> =>
  await newApiFamilyRequests.envelope<T>(request, {
    endpoint,
    operationSemantics: API_OPERATION_SEMANTICS.Mutation,
    options: {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  })

const createDeadline = () => {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error("UltraRouter daily game timed out")),
    ULTRAROUTER_GAME_RULES.maximumRunMs,
  )
  // Match the repository's bounded browser-login keepalive: query tab state
  // every 20 seconds so MV3 does not discard this 90-second provider promise.
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
        reject(signal.reason ?? new Error("UltraRouter game cancelled"))
      }
      signal.addEventListener("abort", onAbort, { once: true })
    })
  }
  signal.throwIfAborted()
}

const readBackRun = async (
  account: SiteAccount,
  baseRequest: ApiServiceRequest,
  runId: string,
): Promise<UltraRouterGameRun | undefined> => {
  const request = createRequest(account, {
    contextRequest: baseRequest,
    // A readback remains possible after the game deadline or a lost write.
  })
  const snapshot = await readGameSnapshot(request)
  return snapshot.run?.id === runId ? snapshot.run : undefined
}

const uncertain = (message?: string): AutoCheckinProviderOutcome => ({
  status: CHECKIN_RESULT_STATUS.UNCERTAIN,
  reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
  ...(message ? { rawMessage: message } : {}),
})

const finishRun = async (
  account: SiteAccount,
  request: ApiServiceRequest,
  beforeQuota: number,
  run: UltraRouterGameRun,
): Promise<AutoCheckinProviderOutcome> => {
  if (!isCompletedUltraRouterGame(run)) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
      rawMessage:
        run.status === "survived"
          ? "The game ended without any server-confirmed token pickups."
          : "The daily game ended before the server confirmed a completed run.",
    }
  }

  try {
    const [snapshot, self] = await Promise.all([
      readGameSnapshot(request),
      readUserSelf(account, request),
    ])
    const confirmedRun = snapshot.run
    if (
      confirmedRun?.id !== run.id ||
      !isCompletedUltraRouterGame(confirmedRun) ||
      self.quota <= beforeQuota
    )
      return uncertain(
        "The server ended the run, but the new quota grant was not confirmed.",
      )

    const quotaDelta = self.quota - beforeQuota
    const amount = newApiFinancialAmount(
      quotaDelta,
      account.site_url,
      account.site_type,
    )
    return {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
      data: {
        runId: confirmedRun.id,
        status: confirmedRun.status,
        gameTick: confirmedRun.state.tick,
        pickedTokens: confirmedRun.state.picked_tokens,
        quotaBefore: beforeQuota,
        quotaAfter: self.quota,
      },
      awards: [
        createUltraRouterGameAward({
          account,
          quotaDelta,
          observedAt: Date.now(),
          runId: confirmedRun.id,
          amount,
        }),
      ],
    }
  } catch (error) {
    return uncertain(
      error instanceof Error ? error.message : "Final reward readback failed.",
    )
  }
}

const executeGame = async (
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderOutcome> => {
  const deadline = createDeadline()
  try {
    const request = await createBrowserRequest(account, deadline.signal)
    const selfBefore = await readUserSelf(account, request, deadline.signal)
    const preflight = await readGameSnapshot(request, deadline.signal)

    if (preflight.run?.status === "survived")
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      }
    if (
      preflight.run ||
      !preflight.settings.enabled ||
      !preflight.budgets.can_start
    )
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: preflight.settings.enabled
          ? AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED
          : AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
        rawMessage: preflight.run
          ? "A game run already exists; it will not be restarted."
          : "The daily game or its reward budget is unavailable.",
      }

    const startObservation: RequestObservation = {
      dispatched: false,
      responseReceived: false,
    }
    const startRequest = createObservedMutationRequest(
      account,
      deadline.signal,
      request,
      context.mutationLifecycle,
      startObservation,
    )
    let run: UltraRouterGameRun | undefined
    try {
      const started = await postGameMutation<unknown>(
        startRequest,
        ULTRAROUTER_GAME_ENDPOINTS.Start,
      )
      if (started.success === true)
        run = parseUltraRouterGameRun(started.data) ?? undefined
      else if (startObservation.responseReceived)
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
          rawMessage:
            started.message || "The site refused to start today's game.",
        }
    } catch (error) {
      if (!startObservation.dispatched)
        return resolveProviderErrorResult({ error, mutationDispatched: false })
    }

    if (!run) {
      // A lost start response is reconciled by reads. The start route is never
      // replayed, even if readback cannot distinguish accepted from rejected.
      try {
        const recoveryRequest = createRequest(account, {
          contextRequest: request,
        })
        const snapshot = await readGameSnapshot(recoveryRequest)
        if (snapshot.run) run = snapshot.run
        else
          return uncertain("The start response was lost; no run was confirmed.")
      } catch {
        return uncertain(
          "The start response was lost and the game state is unknown.",
        )
      }
    }
    if (!run?.id || run.status !== "running")
      return run?.status === "survived"
        ? await finishRun(account, request, selfBefore.quota, run)
        : uncertain("The server did not confirm a running game.")

    let lastBatchStartedAt = 0
    for (
      let batchNumber = 0;
      batchNumber < ULTRAROUTER_GAME_RULES.maximumBatches;
      batchNumber += 1
    ) {
      deadline.signal.throwIfAborted()
      if (run.status !== "running") break

      const inputs = buildUltraRouterGameInputBatch(run)
      if (!inputs.length) break
      if (lastBatchStartedAt) {
        await waitUntil(
          lastBatchStartedAt + ULTRAROUTER_GAME_RULES.minimumBatchIntervalMs,
          deadline.signal,
        )
      }
      const from = readUltraRouterGameClock(run.state)
      const observation: RequestObservation = {
        dispatched: false,
        responseReceived: false,
      }
      const batchRequest = createObservedMutationRequest(
        account,
        deadline.signal,
        request,
        context.mutationLifecycle,
        observation,
      )
      lastBatchStartedAt = Date.now()
      let responseRun: UltraRouterGameRun | undefined
      try {
        const response: GameApiResponse<unknown> =
          await postGameMutation<unknown>(
            batchRequest,
            ULTRAROUTER_GAME_ENDPOINTS.Input,
            { id: run.id, from, inputs, quit: false },
          )
        if (response.success === true)
          responseRun = parseUltraRouterGameRun(response.data) ?? undefined
        else if (observation.responseReceived)
          return {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
            rawMessage:
              response.message || "The site rejected a game input batch.",
          }
      } catch (error) {
        if (!observation.dispatched)
          return resolveProviderErrorResult({
            error,
            mutationDispatched: false,
          })
      }

      if (
        responseRun?.id === run.id &&
        readUltraRouterGameClock(responseRun.state) > from
      ) {
        run = responseRun
        continue
      }

      // A dispatched batch without an advancing response is read back exactly
      // once. Continue only from the server's confirmed new cursor; never resend
      // the same input range or guess whether it landed.
      if (observation.dispatched) {
        try {
          const current = await readBackRun(account, request, run.id)
          if (
            current &&
            (current.status !== "running" ||
              readUltraRouterGameClock(current.state) > from)
          ) {
            run = current
            continue
          }
        } catch {
          // Retain the uncertain mutation result; it cannot be replayed.
        }
        return uncertain("A game input batch was dispatched but not confirmed.")
      }

      return uncertain("The game input response did not advance the run.")
    }

    if (run.status !== "survived") {
      return run.status === "running"
        ? uncertain("The game did not finish within its execution window.")
        : {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
            rawMessage:
              "The site confirmed that the game ended before completion.",
          }
    }
    return await finishRun(account, request, selfBefore.quota, run)
  } catch (error) {
    return context.mutationLifecycle?.dispatched
      ? uncertain(
          error instanceof Error
            ? error.message
            : "The game stopped with an unconfirmed request.",
        )
      : resolveProviderErrorResult({ error, mutationDispatched: false })
  } finally {
    deadline.dispose()
  }
}

export const ultraRouterGameProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  classifyStatusError: getCheckInMethodUnknownReason,
  getReadiness: readiness,
  detect: (context) =>
    detectWithStatusReadback(context, getStatus, getCheckInMethodUnknownReason),
  getStatus,
  async checkIn(account, context): Promise<AutoCheckinProviderOutcome> {
    if (!isSiteAccount(account))
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
      }
    if (new URL(account.site_url).origin !== ULTRAROUTER_ORIGIN)
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED,
      }
    return await executeGame(account, context)
  },
}
