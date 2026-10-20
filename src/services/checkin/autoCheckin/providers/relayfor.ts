import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { formatRelayForBenefit } from "~/services/apiAdapters/relayfor/benefits"
import {
  claimRelayForCheckIn,
  fetchRelayForCheckInCampaigns,
} from "~/services/apiService/relayfor"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type {
  AnyrouterCheckInParams,
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
  AutoCheckinProviderReadiness,
} from "~/services/checkin/autoCheckin/providers/contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  readQuotaReward,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { t } from "~/utils/i18n/core"

const createServiceRequest = (
  account: SiteAccount,
  signal?: AbortSignal,
): ApiServiceRequest => {
  const accessToken =
    typeof account.account_info?.access_token === "string"
      ? account.account_info.access_token.trim()
      : ""

  return {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken,
      userId: account.account_info?.id,
    },
    ...(signal ? { abortSignal: signal } : {}),
  }
}

export const relayForProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness(account: SiteAccount): AutoCheckinProviderReadiness {
    const token = account.account_info?.access_token?.trim()
    if (!token) {
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
      }
    }
    return { ready: true }
  },

  async getStatus(
    context: AutoCheckinProviderReadContext,
  ): Promise<CheckInMethodStatus | undefined> {
    const account = context.account
    if (!account) return undefined

    try {
      const request = createServiceRequest(account, context.signal)
      const campaigns = await fetchRelayForCheckInCampaigns(request)

      if (!campaigns.length) {
        return {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
          today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
          evidence: {
            source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
            observedAt: context.observedAt,
          },
        }
      }

      const hasClaimableDay = campaigns.some((c) =>
        (c.days || []).some((d) => d.can_claim),
      )

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(context.observedAt)
      const todayDays = campaigns
        .flatMap((campaign) => campaign.days || [])
        .filter((day) => day.date === today)
      if (
        !hasClaimableDay &&
        (!todayDays.length || todayDays.some((day) => !day.claimed))
      )
        return undefined

      return {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: hasClaimableDay
          ? CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
          : CHECK_IN_METHOD_TODAY_STATUSES.Checked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: context.observedAt,
        },
      }
    } catch {
      return undefined
    }
  },

  async checkIn(
    account: SiteAccount | AnyrouterCheckInParams,
    context: AutoCheckinProviderContext,
  ): Promise<AutoCheckinProviderOutcome> {
    try {
      const siteAccount = account as SiteAccount
      const request = createServiceRequest(siteAccount)
      const campaigns = await fetchRelayForCheckInCampaigns(request)

      const targets = campaigns.flatMap((campaign) =>
        (campaign.days || [])
          .filter((day) => day.can_claim)
          .map((day) => ({ campaign, day })),
      )
      const makeupUrl = new URL("/console/#overview", siteAccount.site_url).href
      if (!targets.length) {
        return {
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          ...(campaigns.some((campaign) =>
            (campaign.days ?? []).some((day) => day.can_makeup),
          )
            ? {
                rawMessage: t("autoCheckin:providerFallback.relayForMakeup", {
                  url: makeupUrl,
                }),
              }
            : {}),
        }
      }
      const names: string[] = []
      let quota = 0
      let hasQuota = false
      for (const [index, { campaign, day }] of targets.entries()) {
        try {
          if (context.mutationLifecycle) {
            context.mutationLifecycle.dispatched = false
            context.mutationLifecycle.responseReceived = false
          }
          const claimResult = await claimRelayForCheckIn(
            {
              ...request,
              protectionBypassExecution: context.protectionBypassExecution,
              observer: context.mutationLifecycle,
            },
            campaign.id,
            day.date,
          )
          if (
            typeof claimResult.quota_awarded === "number" &&
            Number.isFinite(claimResult.quota_awarded) &&
            claimResult.quota_awarded > 0
          ) {
            quota += claimResult.quota_awarded
            hasQuota = true
          }
          const benefits = [
            ...(Array.isArray(claimResult.benefits)
              ? claimResult.benefits
              : []),
            ...(claimResult.subscription ? [claimResult.subscription] : []),
          ]
          names.push(...benefits.map(formatRelayForBenefit).filter(Boolean))
        } catch (error) {
          const failure = resolveProviderErrorResult({
            error,
            mutationDispatched: context.mutationLifecycle?.dispatched,
          })
          const failureDetail =
            failure.rawMessage ??
            (failure.messageKey
              ? t(failure.messageKey, failure.messageParams ?? {})
              : "")
          const confirmedBenefits = [
            ...(hasQuota
              ? [formatRelayForBenefit({ type: "quota", quota })]
              : []),
            ...names,
          ]
          return {
            ...failure,
            rawMessage: [
              t("autoCheckin:providerFallback.relayForPartial", {
                completed: index,
                total: targets.length,
                error: failureDetail,
              }),
              ...(confirmedBenefits.length
                ? [
                    t("autoCheckin:providerFallback.relayForBenefits", {
                      details: confirmedBenefits.join(" · "),
                    }),
                  ]
                : []),
            ].join("\n"),
          }
        }
      }
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        reward: hasQuota ? readQuotaReward(quota) : undefined,
        ...(names.length
          ? {
              rawMessage: t("autoCheckin:providerFallback.relayForBenefits", {
                details: names.join(" · "),
              }),
            }
          : {}),
      }
    } catch (error) {
      return resolveProviderErrorResult({ error })
    }
  },
}
