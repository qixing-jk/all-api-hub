import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  createZifeiyuBrowserSessionRequest,
  readZifeiyuAccountQuota,
  readZifeiyuGameRewards,
  readZifeiyuGameStatus,
  sendZifeiyuGameInputs,
  startZifeiyuGame,
  ZIFEIYU_GAME_ORIGIN,
  type ZifeiyuGameRewards,
  type ZifeiyuGameRun,
} from "~/services/apiService/newApiFamily/zifeiyuGame"
import {
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import {
  type ApiServiceRequest,
  type ApiTransportRequestObserver,
} from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"

import {
  planZifeiyuGameInputs,
  ZIFEIYU_GAME_CLOCK_LIMIT_TICKS,
  ZIFEIYU_GAME_DURATION_TICKS,
  ZIFEIYU_GAME_MAX_INPUT_BATCH,
} from "./zifeiyuGamePlanner"

const GAME_RUNTIME_LIMIT_MS = 100_000
const GAME_SYNC_INTERVAL_MS = 2_000

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

/** Converts safe game-reward settings into passive method availability. */
function toRewardsStatus(
  status: ZifeiyuGameRewards,
  observedAt: number,
): CheckInMethodStatus {
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability:
      status.enabled && status.rewards_enabled
        ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
        : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

/** Tracks only the current game's mutation dispatch and forwards its lifecycle. */
function createMutationObserver(
  lifecycle: AutoCheckinProviderContext["mutationLifecycle"],
): { observer?: ApiTransportRequestObserver; wasDispatched: () => boolean } {
  let dispatched = false
  if (!lifecycle) return { wasDispatched: () => false }
  return {
    observer: {
      onDispatch() {
        dispatched = true
        lifecycle.onDispatch()
      },
      onResponse() {
        lifecycle.onResponse()
      },
      onMutationAccepted() {
        lifecycle.onMutationAccepted?.()
      },
      onCookieRecovered(cookie, generation) {
        lifecycle.onCookieRecovered?.(cookie, generation)
      },
      onPreHandlerUnauthorized() {
        lifecycle.onPreHandlerUnauthorized?.()
      },
    },
    wasDispatched: () => dispatched,
  }
}

/** Builds a cookie-authenticated request without copying profile credentials. */
function createGameRequest(
  account: SiteAccount,
  observer?: ApiTransportRequestObserver,
): ApiServiceRequest {
  return {
    ...createZifeiyuBrowserSessionRequest(account),
    ...(observer ? { observer } : {}),
  }
}

/** Discovers the method through the endpoint that never advances a game run. */
async function readStatus(
  context: AutoCheckinProviderReadContext,
): Promise<CheckInMethodStatus | undefined> {
  if (!context.account) return undefined
  // This read-only endpoint avoids GET /api/user/game, which can advance and
  // settle a stale run as part of the site's recovery behavior.
  return toRewardsStatus(
    await readZifeiyuGameRewards(context.account, context.signal),
    context.observedAt,
  )
}

/** Reports whether the server has finalized the run. */
function isFinal(run: ZifeiyuGameRun): boolean {
  return run.status !== "running"
}

/** Keeps a previously completed game's historical reward out of fresh results. */
function resultForPreviouslyFinishedRun(run: ZifeiyuGameRun) {
  return {
    status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    rawMessage:
      "ZIFEIYU reports that today's game was already completed; no fresh grant is attributed.",
    data: run,
  }
}

/** Reports a fresh grant only after the account quota readback matches the run. */
async function resultForFinishedRun(
  account: SiteAccount,
  run: ZifeiyuGameRun,
  quotaBefore: number,
) {
  const quota = run.quota_awarded
  if (quota <= 0) return resultForPreviouslyFinishedRun(run)

  let quotaAfter: number
  try {
    quotaAfter = await readZifeiyuAccountQuota(account)
  } catch {
    return {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      rawMessage:
        "ZIFEIYU ended the game, but the credited account quota could not be read back.",
      data: run,
    } as const
  }
  const quotaDelta = quotaAfter - quotaBefore
  if (quotaDelta !== quota) {
    return {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      rawMessage:
        "ZIFEIYU ended the game, but account quota did not confirm the reported reward.",
      data: run,
    } as const
  }

  const awards =
    quotaDelta > 0
      ? [
          accountAward(account, {
            id: `game:${run.id}:quota`,
            operation: "/api/user/self:quota",
            field: "quota",
            asset: {
              kind: ASSET_KINDS.Quota,
              id: `${new URL(account.site_url).origin}:zifeiyu-game-quota`,
              label: "game quota",
              displayScale: 1,
              displayLabel: "game quota",
            },
            value: quotaDelta,
            target: AWARD_TARGETS.Wallet,
            fulfillment: AWARD_FULFILLMENT.Credited,
            event: { namespace: "zifeiyu-game-run", id: run.id },
            adapter: "zifeiyu-game-center",
            contractVersion: String(run.reward_version),
          }),
        ]
      : []
  return {
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    rawMessage:
      "ZIFEIYU daily game completed and the account quota readback confirmed its reward.",
    awards,
    data: run,
  } as const
}

/** Identifies a missing or rejected dashboard session. */
function isAuthFailure(error: unknown): boolean {
  return (
    isAuthenticationRequiredError(error) ||
    (error instanceof ApiError &&
      (error.statusCode === 401 || error.statusCode === 403))
  )
}

/** Maps an unstarted game failure without treating it as a grant. */
function failure(error: unknown) {
  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: isAuthFailure(error)
      ? AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
      : AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
    rawMessage: error instanceof Error ? error.message : undefined,
  } as const
}

/** Reads the authoritative run after a possibly dispatched mutation. */
async function reconcileUncertainMutation(
  account: SiteAccount,
  runId: string | undefined,
): Promise<ZifeiyuGameRun | null> {
  try {
    const status = await readZifeiyuGameStatus(account)
    if (!status.run || (runId && status.run.id !== runId)) return null
    return status.run
  } catch {
    return null
  }
}

/** Plays one existing server run using bounded input batches and readback. */
async function playRun(
  account: SiteAccount,
  initialRun: ZifeiyuGameRun,
  quotaBefore: number,
  context: AutoCheckinProviderContext,
) {
  const startedAt = Date.now()
  let run = initialRun
  let serverOffset = run.server_time - Date.now()
  let nextSyncAt = Date.now()

  while (!isFinal(run)) {
    if (Date.now() - startedAt >= GAME_RUNTIME_LIMIT_MS) {
      return {
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
        rawMessage:
          "ZIFEIYU game is still running after the bounded background play window; do not retry this daily attempt.",
        data: run,
      } as const
    }

    const state = run.state
    const clockCursor = state.clock_tick ?? state.tick
    if (state.hp <= 0 || state.tick >= ZIFEIYU_GAME_DURATION_TICKS) {
      return {
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
        rawMessage:
          "ZIFEIYU game state reached its limit without a final server result.",
        data: run,
      } as const
    }

    const elapsedTicks = Math.floor(
      (Date.now() + serverOffset - run.started_at) / 100,
    )
    const allowedCursor = Math.min(
      ZIFEIYU_GAME_CLOCK_LIMIT_TICKS,
      Math.max(0, elapsedTicks),
    )
    const availableTicks = Math.min(
      ZIFEIYU_GAME_MAX_INPUT_BATCH,
      allowedCursor - clockCursor,
    )
    if (availableTicks <= 0) {
      await sleep(100)
      continue
    }

    const inputs = planZifeiyuGameInputs(state, availableTicks)
    const observer = createMutationObserver(context.mutationLifecycle)
    try {
      run = await sendZifeiyuGameInputs(
        createGameRequest(account, observer.observer),
        { id: run.id, from: clockCursor, inputs },
      )
      serverOffset = run.server_time - Date.now()
    } catch (error) {
      if (!observer.wasDispatched()) return failure(error)
      // Read the site's authoritative cursor after a lost response; never replay
      // a possibly accepted input batch.
      const recovered = await reconcileUncertainMutation(account, run.id)
      if (!recovered) {
        return {
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
          rawMessage:
            "ZIFEIYU input response was lost and game state could not be confirmed.",
          data: run,
        } as const
      }
      run = recovered
      serverOffset = run.server_time - Date.now()
    }

    nextSyncAt += GAME_SYNC_INTERVAL_MS
    const waitMs = nextSyncAt - Date.now()
    if (waitMs > 0) await sleep(waitMs)
    else nextSyncAt = Date.now()
  }

  return resultForFinishedRun(account, run, quotaBefore)
}

export const zifeiyuGameProvider: AutoCheckinProvider = {
  getReadiness(account) {
    if (!account.account_info?.id) {
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      }
    }
    let origin: string
    try {
      origin = new URL(account.site_url).origin
    } catch {
      origin = ""
    }
    if (
      account.site_type !== SITE_TYPES.NEW_API ||
      origin !== ZIFEIYU_GAME_ORIGIN
    ) {
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
      }
    }
    // Browser-session presence is checked without copying it on the first safe GET.
    return { ready: true }
  },
  detect: (context) => detectWithStatusReadback(context, readStatus),
  async checkIn(account, context) {
    const siteAccount = account as SiteAccount
    try {
      const status = await readZifeiyuGameStatus(siteAccount)
      if (!status.settings.enabled || !status.settings.rewards_enabled) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
        }
      }
      if (status.run?.day === status.day && isFinal(status.run)) {
        return resultForPreviouslyFinishedRun(status.run)
      }
      if (status.run?.status === "running") {
        const quotaBefore = await readZifeiyuAccountQuota(siteAccount)
        return await playRun(siteAccount, status.run, quotaBefore, context)
      }
      if (!status.budgets.can_start || status.budgets.daily_remaining <= 0) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE,
          rawMessage: "ZIFEIYU reports that its daily game cannot be started.",
        }
      }

      const quotaBefore = await readZifeiyuAccountQuota(siteAccount)
      const observer = createMutationObserver(context.mutationLifecycle)
      let run: ZifeiyuGameRun
      try {
        run = await startZifeiyuGame(
          siteAccount,
          createGameRequest(siteAccount, observer.observer),
        )
      } catch (error) {
        if (!observer.wasDispatched()) return failure(error)
        const recovered = await reconcileUncertainMutation(
          siteAccount,
          undefined,
        )
        if (!recovered) {
          return {
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
            rawMessage:
              "ZIFEIYU start response was lost; the daily start was not repeated.",
          }
        }
        run = recovered
      }
      return await playRun(siteAccount, run, quotaBefore, context)
    } catch (error) {
      return failure(error)
    }
  },
}
