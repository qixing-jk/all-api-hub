import { CHECK_IN_METHOD_STATUS_OUTCOMES } from "~/constants/checkIn"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { reconcileCheckInResult } from "~/services/checkin/autoCheckin/resultReconciliation"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
  type CheckInReward,
} from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { parseOptionalDate } from "~/utils/core/date"
import { formatLocalDayKey, parseDayKey } from "~/utils/core/dayKey"

export const CHECK_IN_CONFIRMATION_KINDS = {
  Response: "response",
  Observed: "observed",
  Unavailable: "unavailable",
  Unsupported: "unsupported",
  NotRequired: "not_required",
} as const

type ConfirmationScope = {
  accountId: string
  siteUrl: string
  userId: string
  observedAt: number
}

const getConfirmationScope = (account: SiteAccount): ConfirmationScope => ({
  accountId: account.id,
  siteUrl: account.site_url,
  userId: String(account.account_info.id),
  observedAt: Date.now(),
})

/** Only observations obtained during this execution can confirm its outcome. */
function isCurrentStatus(
  status: CheckInMethodStatus,
  startedAt: number,
): boolean {
  if (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
    return (
      "observedAt" in status.evidence &&
      status.evidence.observedAt >= startedAt &&
      status.evidence.observedAt <= Date.now()
    )
  }
  return status.attemptedAt >= startedAt && status.attemptedAt <= Date.now()
}

/** Process-local evidence; it is removed before an execution result is persisted. */
type ConfirmationEvidence =
  | {
      kind: typeof CHECK_IN_CONFIRMATION_KINDS.Observed
      status: CheckInMethodStatus
      reward?: CheckInReward
    }
  | {
      kind: typeof CHECK_IN_CONFIRMATION_KINDS.Response
      /** Protocol date attribution, independent of when the response arrived. */
      completedAt?: number
    }
  | {
      kind:
        | typeof CHECK_IN_CONFIRMATION_KINDS.Unavailable
        | typeof CHECK_IN_CONFIRMATION_KINDS.Unsupported
        | typeof CHECK_IN_CONFIRMATION_KINDS.NotRequired
    }

export type CheckInConfirmation = ConfirmationScope & ConfirmationEvidence

export type AutoCheckinProviderExecution = AutoCheckinProviderOutcome & {
  confirmation: CheckInConfirmation
}

/** Attach account-scoped, process-local evidence to a provider outcome. */
export function withCheckInConfirmation<T extends AutoCheckinProviderOutcome>(
  account: SiteAccount,
  result: T,
  evidence: ConfirmationEvidence,
): T & { confirmation: CheckInConfirmation } {
  return {
    ...result,
    confirmation: {
      ...evidence,
      ...getConfirmationScope(account),
      ...(evidence.kind === CHECK_IN_CONFIRMATION_KINDS.Observed
        ? {
            observedAt:
              evidence.status.outcome ===
                CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
              "observedAt" in evidence.status.evidence
                ? evidence.status.evidence.observedAt
                : evidence.status.outcome ===
                    CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
                  ? evidence.status.attemptedAt
                  : Date.now(),
          }
        : {}),
    },
  }
}

/** Preserve uncertainty after a provider's final status read is unavailable. */
export function createUnconfirmedCheckInResult(
  account: SiteAccount,
  details: Pick<AutoCheckinProviderOutcome, "data"> = {},
): AutoCheckinProviderExecution {
  return withCheckInConfirmation(
    account,
    {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      messageKey: getAutoCheckinSkipReasonTranslationKey(
        AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      ),
      ...details,
    },
    { kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable },
  )
}

/** Attribute a dated grant independently of response receipt and session cleanup. */
export function withCheckInResponseConfirmation<
  T extends AutoCheckinProviderOutcome,
>(
  account: SiteAccount,
  result: T,
  completion: { day?: string; timestamp?: string } = {},
): T & { confirmation: CheckInConfirmation } {
  const observedAt = Date.now()
  const timestamp = parseOptionalDate(completion.timestamp)
  const day = completion.day
  const date = day ? parseDayKey(day) : null
  const completedAt =
    typeof timestamp === "number" &&
    timestamp <= observedAt &&
    completion.timestamp &&
    parseDayKey(completion.timestamp.slice(0, 10))
      ? timestamp
      : date && day && day <= formatLocalDayKey(new Date(observedAt))
        ? Math.min(
            observedAt,
            new Date(date.year, date.month - 1, date.day + 1).getTime() - 1,
          )
        : undefined
  return withCheckInConfirmation(account, result, {
    kind: CHECK_IN_CONFIRMATION_KINDS.Response,
    ...(completedAt === undefined ? {} : { completedAt }),
  })
}

/** A closed session cannot hand a live reader to the outer executor. */
export function completeSessionCheckIn(
  account: SiteAccount,
  result: AutoCheckinProviderOutcome,
): AutoCheckinProviderExecution {
  if (result.confirmation)
    return { ...result, confirmation: result.confirmation }
  return withCheckInConfirmation(account, result, {
    kind:
      result.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
        ? CHECK_IN_CONFIRMATION_KINDS.Response
        : result.status === CHECKIN_RESULT_STATUS.SKIPPED
          ? CHECK_IN_CONFIRMATION_KINDS.NotRequired
          : CHECK_IN_CONFIRMATION_KINDS.Unavailable,
  })
}

/** Read while a provider-owned session is alive, or reuse evidence it already obtained. */
export async function confirmCheckInAttempt(input: {
  account: SiteAccount
  result: AutoCheckinProviderOutcome
  startedAt: number
  readStatus?: () => Promise<
    { status: CheckInMethodStatus; reward?: CheckInReward } | undefined
  >
}): Promise<{
  result: AutoCheckinProviderOutcome
  confirmation: CheckInConfirmation
}> {
  const { confirmation: supplied, ...attempt } = input.result
  let result: AutoCheckinProviderOutcome = attempt
  const fresh =
    supplied?.accountId === input.account.id &&
    supplied.siteUrl === input.account.site_url &&
    supplied.userId === String(input.account.account_info.id) &&
    supplied.observedAt >= input.startedAt &&
    supplied.observedAt <= Date.now() &&
    (supplied.kind !== CHECK_IN_CONFIRMATION_KINDS.Observed ||
      isCurrentStatus(supplied.status, input.startedAt))
  if (
    supplied?.kind === CHECK_IN_CONFIRMATION_KINDS.Observed &&
    !fresh &&
    (result.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED)
  ) {
    // A discarded observation cannot be relabelled as a granted protocol response.
    result = {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      messageKey: getAutoCheckinSkipReasonTranslationKey(
        AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      ),
      data: result.data,
    }
  }
  const confirmedResponse =
    result.status === CHECKIN_RESULT_STATUS.SUCCESS ||
    result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
  let confirmation = fresh ? supplied : undefined
  if (
    confirmation?.kind === CHECK_IN_CONFIRMATION_KINDS.Response &&
    !confirmedResponse
  )
    confirmation = undefined
  if (
    confirmation?.kind === CHECK_IN_CONFIRMATION_KINDS.NotRequired &&
    result.status !== CHECKIN_RESULT_STATUS.SKIPPED
  )
    confirmation = undefined
  if (!confirmation) {
    const scope = getConfirmationScope(input.account)
    if (confirmedResponse) {
      confirmation = { ...scope, kind: CHECK_IN_CONFIRMATION_KINDS.Response }
    } else if (result.status === CHECKIN_RESULT_STATUS.SKIPPED) {
      confirmation = { ...scope, kind: CHECK_IN_CONFIRMATION_KINDS.NotRequired }
    } else if (!input.readStatus) {
      confirmation = { ...scope, kind: CHECK_IN_CONFIRMATION_KINDS.Unsupported }
    } else {
      try {
        const stable = await readDayStableCheckInObservation(input.readStatus)
        const observation = stable?.observation
        confirmation = observation
          ? {
              ...scope,
              observedAt: stable!.observedAt,
              kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
              ...observation,
            }
          : {
              ...scope,
              observedAt: Date.now(),
              kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable,
            }
      } catch {
        confirmation = {
          ...scope,
          observedAt: Date.now(),
          kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable,
        }
      }
    }
  }
  return {
    result: reconcileCheckInResult({
      result,
      status:
        confirmation.kind === CHECK_IN_CONFIRMATION_KINDS.Observed
          ? confirmation.status
          : undefined,
      reward:
        confirmation.kind === CHECK_IN_CONFIRMATION_KINDS.Observed
          ? confirmation.reward
          : undefined,
    }),
    confirmation,
  }
}
