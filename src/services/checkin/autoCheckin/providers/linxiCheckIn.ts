import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  fetchLinxiStatus,
  performLinxiClaim,
} from "~/services/apiService/sub2api/checkin/linxiCheckIn"
import { LINXI_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/linxiCheckInProtocol"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { ApiError } from "~/services/apiTransport/errors"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { isCheckInObservationCurrent } from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "./contracts"
import { detectWithStatusReadback } from "./detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS as messages } from "./shared"
import { withSub2ApiCheckInExecution } from "./sub2apiExecution"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  readUsdAwards,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const toLinxiMethodStatus = (
  status: Awaited<ReturnType<typeof fetchLinxiStatus>>,
) => ({
  ...toSub2ApiCheckInStatus(status, status.observedAt),
  requiresManualVerification: status.requiresManualVerification,
  resetTimeZone: status.resetTimeZone,
})

const readStatus = async (
  context: AutoCheckinProviderReadContext,
  auth: Sub2ApiCheckInStatusAuth = {},
) =>
  toLinxiMethodStatus(
    await fetchLinxiStatus(createSub2ApiCheckInReadRequest(context), auth),
  )
const manualVerification = (account: SiteAccount) => ({
  status: CHECKIN_RESULT_STATUS.FAILED,
  reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
  messageKey: messages.nativePageVerificationRequired,
  messageParams: { checkInUrl: new URL("/check-in", account.site_url).href },
})

const accountUnavailable = (account: SiteAccount) =>
  withCheckInConfirmation(
    account,
    failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE),
    { kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable },
  )

const rewardSource = {
  operation: LINXI_CHECK_IN_ENDPOINT,
  field: "reward_amount",
}

export const linxiProvider: AutoCheckinProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  detect: (context, auth) =>
    detectWithStatusReadback(context, (input) => readStatus(input, auth)),
  getStatus: readStatus,
  async checkIn(account, context, attempt) {
    const status = context.statusProof
    const checkedInToday =
      status?.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      (!checkedInToday &&
        status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked) ||
      typeof status.requiresManualVerification !== "boolean" ||
      !status.resetTimeZone ||
      !("observedAt" in status.evidence)
    )
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    const site = account as SiteAccount
    try {
      if (
        isCheckInObservationCurrent(
          status.evidence.observedAt,
          status.resetTimeZone,
        )
      ) {
        if (checkedInToday)
          return failedSub2ApiCheckIn(
            AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
          )
        if (status.requiresManualVerification) return manualVerification(site)
      }
      if (
        context.beforeRecoveredMutation &&
        !(await context.beforeRecoveredMutation())
      )
        return accountUnavailable(site)
      const result = await performLinxiClaim(
        attempt?.request ?? createSub2ApiCheckInMutationRequest(site, context),
        {
          enabled: true,
          checkedInToday,
          requiresManualVerification: status.requiresManualVerification,
          observedAt: status.evidence.observedAt,
          resetTimeZone: status.resetTimeZone,
        },
        {
          revalidateAccount: context.beforeRecoveredMutation,
          onAdmitted: (mutation) => {
            if (context.mutationLifecycle)
              context.mutationLifecycle.admittedMutation = mutation
          },
        },
      )
      if (result.kind === "observed") {
        const observed = result.status
        const outcome = observed.checkedInToday
          ? {
              status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
              messageKey: messages.alreadyCheckedToday,
            }
          : observed.enabled
            ? manualVerification(site)
            : failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED)
        return withCheckInConfirmation(site, outcome, {
          kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
          status: toLinxiMethodStatus(observed),
        })
      }
      const confirmation = {
        kind: CHECK_IN_CONFIRMATION_KINDS.Response,
        completedAt: result.completedAt,
        resetTimeZone: result.resetTimeZone,
      } as const
      if (result.kind === "already")
        return withCheckInConfirmation(
          site,
          {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey: messages.alreadyCheckedToday,
          },
          confirmation,
        )
      return withCheckInConfirmation(
        site,
        {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey: messages.checkinSuccessful,
          data: result,
          awards:
            result.pool === "free"
              ? [
                  accountAward(site, {
                    ...rewardSource,
                    id: "linxi-free-pool",
                    asset: {
                      kind: ASSET_KINDS.Quota,
                      id: "linxi-free-pool",
                      label: "Linxi free pool",
                      displayLabel: "Linxi free pool",
                      displayScale: 1,
                    },
                    value: result.amount,
                    target: AWARD_TARGETS.Entitlement,
                    fulfillment: AWARD_FULFILLMENT.Credited,
                  }),
                ]
              : result.pool === "paid"
                ? readUsdAwards(site, result.amount, rewardSource)
                : undefined,
        },
        confirmation,
      )
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.statusCode === 400 || error.statusCode === 403) &&
        !error.unattributedMessage &&
        /turnstile/i.test(`${error.upstreamCode ?? ""} ${error.message}`)
      )
        return manualVerification(site)
      const outcome = mapSub2ApiCheckInMutationError(error, context, site)
      return outcome.reasonCode === AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE
        ? accountUnavailable(site)
        : outcome
    }
  },
})
