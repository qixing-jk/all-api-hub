import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { CURRENCIES } from "~/constants/money"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import type { ConfirmedAward } from "~/services/amounts/awards"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  formatRelayForBenefit,
  relayForBenefitAward,
} from "~/services/apiAdapters/relayfor/benefits"
import {
  claimRelayForCheckIn,
  fetchRelayForCheckInCampaigns,
} from "~/services/apiService/relayfor"
import { RELAYFOR_ENDPOINTS } from "~/services/apiService/relayfor/constants"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import type {
  AnyrouterCheckInParams,
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
  AutoCheckinProviderReadiness,
} from "~/services/checkin/autoCheckin/providers/contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
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
    directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
    protectionBypassExecution: undefined,
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
      const awards: ConfirmedAward[] = []
      let quota = 0
      let hasQuota = false
      for (const [index, { campaign, day }] of targets.entries()) {
        try {
          if (context.mutationLifecycle) {
            context.mutationLifecycle.dispatched = false
            context.mutationLifecycle.responseReceived = false
          }
          const claimResult = await claimRelayForCheckIn(
            bindApiTransportRequest(
              {
                ...request,
                protectionBypassExecution: context.protectionBypassExecution,
                observer: context.mutationLifecycle,
              },
              API_DIRECT_REQUEST_REASONS.CallerManaged,
            ),
            campaign.id,
            day.date,
          )
          if (claimResult.reward_type === "quota") {
            awards.push(
              accountAward(siteAccount, {
                id: "quota",
                operation: RELAYFOR_ENDPOINTS.checkinClaim(campaign.id),
                field: "quota_awarded",
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                value: claimResult.quota_awarded,
                nativeUnitsPerAsset: 500000,
                target: AWARD_TARGETS.Wallet,
                fulfillment: AWARD_FULFILLMENT.Credited,
                event: {
                  namespace: "relayfor-checkin-campaign",
                  id: `${campaign.id}:${day.date}`,
                },
              }),
            )
          }
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
          for (const [benefitIndex, benefit] of benefits.entries()) {
            const isSubscription =
              benefitIndex === benefits.length - 1 && !!claimResult.subscription
            awards.push(
              relayForBenefitAward(
                isSubscription
                  ? { type: "subscription", subscription: benefit }
                  : benefit,
                {
                  scope: accountBalanceScope(request),
                  operation: RELAYFOR_ENDPOINTS.checkinClaim(campaign.id),
                  field: isSubscription
                    ? "subscription"
                    : `benefits[${benefitIndex}]`,
                  id: `${campaign.id}:${day.date}:${isSubscription ? "subscription" : `benefit:${benefitIndex}`}`,
                  observedAt: Date.now(),
                },
              ),
            )
          }
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
            awards,
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
        awards,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
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
